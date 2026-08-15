import { requireProofAdmin } from "../_shared/proof/admin-auth.ts";

/** Atomic-enough, server-authorized intake orchestration.
 * Browser callers never receive service-role credentials or direct table write access.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 12;
const ACT_TYPES = new Set([
  "acknowledgment",
  "jurat",
  "signature_witnessing",
  "certified_copy",
  "unsure",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

async function rows(response: Response) {
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

function safeName(value: unknown) {
  return String(value || "document")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";
}

function cleanObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function allowed(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((
      key,
    ) => [key, source[key]]),
  );
}

function validate(body: Record<string, unknown>, adminRequest = false) {
  const customer = cleanObject(body.customer);
  const request = cleanObject(body.request);
  const detail = cleanObject(body.service_detail);
  const participants = Array.isArray(body.participants)
    ? body.participants.map(cleanObject)
    : [];
  const acts = Array.isArray(body.notarial_acts)
    ? body.notarial_acts.map(cleanObject)
    : [];
  const files = Array.isArray(body.files) ? body.files.map(cleanObject) : [];
  const service = String(request.service_type || "");
  const exceptionReason = String(request.document_upload_exception_reason || "")
    .trim();
  if (!["ron", "mobile", "print"].includes(service)) {
    throw new Error("A supported service is required.");
  }
  if (
    !String(customer.first_name || "").trim() ||
    !String(customer.last_name || "").trim() ||
    !String(customer.email || "").includes("@")
  ) throw new Error("Valid customer contact information is required.");
  if (files.length > MAX_FILES) {
    throw new Error(`Select no more than ${MAX_FILES} documents.`);
  }
  if (!adminRequest && !files.length && !exceptionReason) {
    throw new Error(
      "Upload at least one document or select why it cannot be uploaded yet.",
    );
  }
  if (files.length && exceptionReason) {
    throw new Error("Remove the upload exception when documents are selected.");
  }
  if (service === "ron" || (!adminRequest && service === "mobile")) {
    const signers = participants.filter((person) =>
      person.participant_type === "signer"
    );
    if (!signers.length || signers.length > 10) {
      throw new Error("Provide between 1 and 10 structured signers.");
    }
    if (
      signers.some((person) =>
        !String(person.full_legal_name || "").trim() ||
        (service === "ron" && !String(person.email || "").includes("@"))
      )
    ) {
      throw new Error(
        "Every RON signer requires a legal name and individual email address.",
      );
    }
    if (
      !acts.length ||
      acts.some((act) => !ACT_TYPES.has(String(act.act_type || "")))
    ) {
      throw new Error(
        "Provide a supported type for every requested notarial act.",
      );
    }
  }
  return { customer, request, detail, participants, acts, files, service };
}

async function removeStored(paths: string[]) {
  if (!paths.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/service-request-files`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: paths }),
  }).catch(() => undefined);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }
  let requestId = "";
  const storedPaths: string[] = [];
  try {
    const body = cleanObject(await req.json());
    const adminRequest = body.admin_request === true;
    if (adminRequest) await requireProofAdmin(req);
    const input = validate(body, adminRequest);
    const requestPayload = allowed(input.request, [
      "service_type",
      "status",
      "workflow_status",
      "preferred_date",
      "preferred_time_window",
      "notes",
      "estimated_total",
      "request_completeness",
      "document_state",
      "participant_state",
      "fulfillment_state",
      "document_upload_exception_reason",
      "document_upload_exception_detail",
      "detected_pdf_page_count",
      "is_same_day_request",
      "is_next_day_request",
      "appointment_date",
      "appointment_time",
      "appointment_timezone",
      "appointment_location",
      "appointment_link",
      "appointment_platform",
      "appointment_instructions",
    ]);
    requestPayload.request_source = adminRequest ? "admin" : "website";
    const resolution = await rows(
      await api("rpc/aps_create_request_with_customer", {
        method: "POST",
        body: JSON.stringify({
          p_customer: allowed(input.customer, [
            "first_name",
            "last_name",
            "email",
            "phone",
            "preferred_contact",
            ...(adminRequest ? ["customer_id"] : []),
          ]),
          p_request: requestPayload,
        }),
      }),
    );
    const result = Array.isArray(resolution) ? resolution[0] : resolution;
    requestId = String(result?.request_id || "");
    if (!requestId) throw new Error("The request record could not be created.");
    if (adminRequest) {
      await rows(
        await api(`service_requests?id=eq.${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          body: JSON.stringify({ request_source: "admin" }),
        }),
      );
    }

    const detailConfig: Record<string, { table: string; keys: string[] }> = {
      ron: {
        table: "ron_requests",
        keys: [
          "document_type",
          "number_of_signers",
          "number_of_notarizations",
          "ron_platform",
          "tech_ready",
          "valid_id_confirmed",
          "consent_to_recording",
          "witness_need",
          "witness_count",
          "witness_provider",
          "client_witness_count",
          "provided_witness_count",
          "witness_review_required",
        ],
      },
      mobile: {
        table: "mobile_notary_requests",
        keys: [
          "street_address",
          "unit",
          "city",
          "state",
          "zip",
          "number_of_signers",
          "number_of_notarizations",
          "witnesses_needed",
          "witness_need",
          "witness_count",
          "witness_provider",
          "client_witness_count",
          "provided_witness_count",
          "witness_review_required",
          "print_add_on",
          "scan_back_needed",
          "scan_to_pdf_needed",
          "travel_miles",
          "travel_fee",
          "dispatch_payment_required",
        ],
      },
      print: {
        table: "print_scan_requests",
        keys: [
          "fulfillment_type",
          "delivery_address",
          "black_white_pages",
          "color_pages",
          "paper_size",
          "print_sides",
          "paper_type",
          "scan_pages",
          "delivery_fee",
          "print_total",
          "courier_requested",
          "mobile_document_service_requested",
          "courier_fee",
          "mobile_document_service_fee",
          "copy_pages",
        ],
      },
    };
    const config = detailConfig[input.service];
    await rows(
      await api(config.table, {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          ...allowed(input.detail, config.keys),
        }),
      }),
    );

    if (input.participants.length) {
      await rows(
        await api("request_participants", {
          method: "POST",
          body: JSON.stringify(input.participants.map((person, index) => ({
            service_request_id: requestId,
            ...allowed(person, [
              "participant_type",
              "full_legal_name",
              "email",
              "identity_name_confirmed",
              "witness_source",
              "quantity",
              "sort_order",
            ]),
            mobile_phone: person.phone || person.mobile_phone || null,
            sort_order: Number(person.sort_order ?? index),
          }))),
        }),
      );
    }
    if (input.acts.length) {
      await rows(
        await api("request_notarial_acts", {
          method: "POST",
          body: JSON.stringify(
            input.acts.map((act, index) => ({
              service_request_id: requestId,
              act_number: index + 1,
              act_type: act.act_type,
              requires_admin_review: act.act_type === "unsure",
            })),
          ),
        }),
      );
    }

    for (const file of input.files) {
      const name = safeName(file.name);
      const mime = String(file.type || "application/octet-stream");
      const raw = Uint8Array.from(
        atob(String(file.base64 || "")),
        (char) => char.charCodeAt(0),
      );
      if (!raw.length || raw.length > MAX_FILE_BYTES) {
        throw new Error(`${name} is empty or larger than 10 MB.`);
      }
      const path = `${requestId}/${
        adminRequest ? "admin" : "customer"
      }/${crypto.randomUUID()}-${name}`;
      const upload = await fetch(
        `${SUPABASE_URL}/storage/v1/object/service-request-files/${path}`,
        {
          method: "POST",
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": mime,
            "x-upsert": "false",
          },
          body: raw,
        },
      );
      if (!upload.ok) {
        throw new Error(`Document upload failed: ${await upload.text()}`);
      }
      storedPaths.push(path);
      await rows(
        await api("request_files", {
          method: "POST",
          body: JSON.stringify({
            service_request_id: requestId,
            file_name: String(file.name || name),
            file_path: path,
            file_type: mime,
            file_size: raw.length,
            uploaded_by: adminRequest ? "admin" : "customer",
            document_category: String(
              file.category || (adminRequest ? "admin-intake" : "intake"),
            ),
            document_classification: adminRequest
              ? "supporting_document"
              : "customer_document",
            customer_visible: !adminRequest,
            eligible_for_delivery: false,
            review_state: "pending",
            is_active: true,
          }),
        }),
      );
    }
    await rows(
      await api("request_timeline_events", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          event_type: "request_received",
          title: "Request received",
          detail: input.files.length
            ? `${
              adminRequest ? "Administrator" : "Customer"
            } submitted ${input.files.length} document(s) with the request.`
            : adminRequest
            ? "Administrator created the request without attached documents."
            : "Customer submitted a request without documents and supplied an upload exception.",
          actor_type: adminRequest ? "admin" : "customer",
          visibility: "customer",
          metadata: {
            file_count: input.files.length,
            upload_exception: !input.files.length,
          },
        }),
      }),
    );
    return json({
      ok: true,
      request_id: requestId,
      customer_id: result?.customer_id,
      customer_resolution: result?.customer_resolution,
    });
  } catch (error) {
    await removeStored(storedPaths);
    if (requestId) {
      await api(`service_requests?id=eq.${encodeURIComponent(requestId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    console.error("public_request_submit_failed", {
      requestId: requestId || null,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({
      ok: false,
      error:
        "We could not submit your request. Please try again or contact Aligned Print & Scan.",
    }, 400);
  }
});
