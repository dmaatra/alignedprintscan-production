// Aligned Print & Scan — Public status reader
// Purpose: Success page calls this function to safely retrieve the current order status.
// Notes: Uses the service role key server-side so the public success page does not need direct table access.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ||
  "https://sfsdniavqldgbiretply.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function refFromId(id: string) {
  return id ? `APS-${id.slice(0, 8).toUpperCase()}` : "APS-REQUEST";
}

function cleanUuid(value: unknown) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
    ? text
    : "";
}

function pick(source: any, keys: string[]) {
  return keys.reduce((result: Record<string, unknown>, key) => {
    if (source?.[key] !== undefined) result[key] = source[key];
    return result;
  }, {});
}

// Customer Activity is a deliberately small public vocabulary. Never pass
// administrator-authored timeline titles/details through this boundary.
const CUSTOMER_ACTIVITY_COPY: Record<
  string,
  { title: string; detail: string }
> = {
  request_submitted: {
    title: "Request received",
    detail: "Your request was received and is being reviewed.",
  },
  quote_ready: {
    title: "Quote ready",
    detail: "Your service quote is ready to review.",
  },
  quote_approved: {
    title: "Quote approved",
    detail: "Your quote approval was received.",
  },
  awaiting_payment: {
    title: "Payment requested",
    detail: "Payment information is available in Quote & Payment.",
  },
  payment_received: {
    title: "Payment received",
    detail: "Your payment was received successfully.",
  },
  final_payment_received: {
    title: "Final payment received",
    detail: "Your final payment was received successfully.",
  },
  appointment_confirmed: {
    title: "Appointment confirmed",
    detail:
      "Your confirmed appointment details are available in Appointment/Fulfillment.",
  },
  document_uploaded: {
    title: "Document received",
    detail: "A document you provided was received securely.",
  },
  documents_uploaded: {
    title: "Documents received",
    detail: "Documents you provided were received securely.",
  },
  document_released: {
    title: "Document available",
    detail: "A document is available in Documents.",
  },
  final_balance_due: {
    title: "Final balance available",
    detail: "Updated payment information is available in Quote & Payment.",
  },
  completed: {
    title: "Request completed",
    detail: "Your request has been completed.",
  },
};

export function customerActivityEvent(event: any) {
  const copy =
    CUSTOMER_ACTIVITY_COPY[String(event?.event_type || "").toLowerCase()];
  return copy ? { ...copy, created_at: event.created_at } : null;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
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

async function readJsonOrEmpty(response: Response) {
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    let requestId = cleanUuid(body.request_id || body.id);
    const referenceNumber = String(body.reference_number || body.ref || "")
      .trim();

    // Allow fallback lookup by APS reference number when the URL has ref but not request_id.
    if (!requestId && referenceNumber.toUpperCase().startsWith("APS-")) {
      const prefix = referenceNumber.replace(/^APS-/i, "").slice(0, 8)
        .toLowerCase();
      const lookup = await supabaseFetch(
        `service_requests?select=id&id=ilike.${
          encodeURIComponent(prefix)
        }*&limit=1`,
      );
      const rows = await readJsonOrEmpty(lookup);
      requestId = rows?.[0]?.id || "";
    }

    if (!requestId) {
      return json({ ok: false, error: "Missing or invalid request_id." }, 400);
    }

    // Use broad selects to prevent 400 errors when optional columns are still being migrated.
    const requestRes = await supabaseFetch(
      `service_requests?select=*&id=eq.${requestId}&limit=1`,
    );
    if (!requestRes.ok) throw new Error(await requestRes.text());

    const requestRows = await requestRes.json();
    const request = requestRows?.[0];
    if (!request) return json({ ok: false, error: "Request not found." }, 404);

    let customer = null;
    if (request.customer_id) {
      const customerRes = await supabaseFetch(
        `customers?select=*&id=eq.${request.customer_id}&limit=1`,
      );
      const customerRows = await readJsonOrEmpty(customerRes);
      customer = customerRows?.[0] || null;
    }
    const publicCustomer = customer
      ? pick(customer, ["id", "first_name", "last_name", "email", "phone"])
      : null;
    const publicRequest = pick(request, [
      "id",
      "service_type",
      "status",
      "workflow_status",
      "preferred_date",
      "preferred_time_window",
      "appointment_date",
      "appointment_time",
      "appointment_location",
      "appointment_platform",
      "appointment_link",
      "appointment_instructions",
      "appointment_line_items_note",
      "ron_session_url",
      "fulfillment_method",
      "service_method",
      "service_address",
      "delivery_address",
      "print_address",
      "location",
      "street_address",
      "quote_amount",
      "initial_payment_amount",
      "estimated_total",
      "paid_amount",
      "balance_due",
      "paid_at",
      "invoice_number",
      "quote_notes",
      "customer_message",
      "receipt_url",
      "receipt_pdf_url",
      "review_link_google",
      "review_link_yelp",
      "prep_video_url",
      "current_quote_id",
      "document_state",
    ]);
    publicRequest.customers = publicCustomer ? [publicCustomer] : [];

    const invoicesRes = await supabaseFetch(
      `invoices?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
    );
    const invoices = (await readJsonOrEmpty(invoicesRes)) || [];
    const publicInvoices = invoices.map((invoice: any) =>
      pick(invoice, [
        "id",
        "invoice_number",
        "invoice_type",
        "status",
        "payment_status",
        "amount_due",
        "amount_paid",
        "paid_amount",
        "balance_due",
        "paid_at",
        "receipt_url",
        "receipt_pdf_url",
        "note",
        "created_at",
      ])
    );

    const allItemsRes = await supabaseFetch(
      `invoice_items?select=*&service_request_id=eq.${requestId}&order=created_at.asc`,
    );
    const allItems = (await readJsonOrEmpty(allItemsRes)) || [];

    const initialInvoice = invoices.find((invoice: any) => {
      return (
        String(invoice.invoice_type || "").includes("initial") ||
        String(invoice.invoice_number || "").endsWith("-01")
      );
    });

    // Before approval, editable quote rows have invoice_id = null. After
    // approval, those same rows are attached to Invoice #1. Return either form
    // as the public quote so the customer portal remains consistent.
    const items = allItems.filter((item: any) => {
      return (
        item.invoice_id === null ||
        String(item.invoice_id || "") === String(initialInvoice?.id || "")
      );
    });

    const additionalItems = allItems.filter((item: any) => {
      return (
        item.invoice_id !== null &&
        String(item.invoice_id || "") !== String(initialInvoice?.id || "")
      );
    });
    const publicItem = (item: any) =>
      pick(item, [
        "id",
        "invoice_id",
        "item_type",
        "description",
        "quantity",
        "unit_price",
        "line_total",
        "sort_order",
      ]);

    const detailTable = request.service_type === "ron"
      ? "ron_requests"
      : request.service_type === "mobile"
      ? "mobile_notary_requests"
      : request.service_type === "print"
      ? "print_scan_requests"
      : null;

    let serviceDetail = null;
    if (detailTable) {
      const detailRes = await supabaseFetch(
        `${detailTable}?select=*&service_request_id=eq.${requestId}&limit=1`,
      );
      const detailRows = await readJsonOrEmpty(detailRes);
      serviceDetail = detailRows?.[0] || null;
    }
    const detailFields = request.service_type === "ron"
      ? [
        "document_type",
        "number_of_signers",
        "number_of_notarizations",
        "tech_ready",
        "valid_id_confirmed",
        "consent_to_recording",
        "witness_need",
        "witness_count",
        "witness_provider",
      ]
      : request.service_type === "mobile"
      ? [
        "street_address",
        "unit",
        "city",
        "state",
        "zip",
        "number_of_signers",
        "number_of_notarizations",
        "witness_need",
        "witness_count",
        "witness_provider",
        "print_add_on",
        "scan_to_pdf_needed",
      ]
      : [
        "fulfillment_type",
        "delivery_address",
        "black_white_pages",
        "color_pages",
        "paper_size",
        "print_sides",
        "paper_type",
        "scan_pages",
      ];
    const publicServiceDetail = serviceDetail
      ? pick(serviceDetail, detailFields)
      : null;

    const filesRes = await supabaseFetch(
      `request_files?select=id,file_name,file_path,file_type,file_size,document_category,document_classification,customer_visible,eligible_for_delivery,uploaded_by,created_at,is_active&service_request_id=eq.${requestId}&order=created_at.desc`,
    );
    const files = (await readJsonOrEmpty(filesRes)) || [];
    const customerDocuments = await Promise.all(
      files.filter((file: any) => {
        const ownUpload = file.uploaded_by === "customer" &&
          file.document_classification === "customer_document";
        const releasedDeliverable = file.customer_visible === true &&
          file.eligible_for_delivery === true &&
          file.document_classification !== "internal_document";
        return file.is_active !== false && (ownUpload || releasedDeliverable);
      }).map(async (file: any) => {
        const signResponse = await fetch(
          `${SUPABASE_URL}/storage/v1/object/sign/service-request-files/${file.file_path}`,
          {
            method: "POST",
            headers: {
              apikey: SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn: 3600 }),
          },
        );
        const signed = await readJsonOrEmpty(signResponse);
        return {
          id: file.id,
          file_name: file.file_name,
          file_type: file.file_type,
          file_size: file.file_size,
          document_classification: file.document_classification,
          uploaded_by: file.uploaded_by,
          created_at: file.created_at,
          download_url: signed?.signedURL
            ? `${SUPABASE_URL}/storage/v1${signed.signedURL}`
            : null,
        };
      }),
    );

    const actionsRes = await supabaseFetch(
      `customer_action_requests?select=*&service_request_id=eq.${requestId}&order=created_at.desc`,
    );
    const customerActions = (await readJsonOrEmpty(actionsRes)) || [];
    const refundsRes = await supabaseFetch(
      `refunds?select=id,invoice_id,payment_id,amount,refund_method,status,issued_at,created_at&service_request_id=eq.${requestId}&status=in.(pending,processing,succeeded)&order=created_at.desc`,
    );
    const refunds = (await readJsonOrEmpty(refundsRes)) || [];

    const timelineRes = await supabaseFetch(
      `request_timeline_events?select=*&service_request_id=eq.${requestId}&order=created_at.desc&limit=100`,
    );
    const timelineEvents = (await readJsonOrEmpty(timelineRes)) || [];

    const communicationsRes = await supabaseFetch(
      `request_communications?select=id,direction,channel,subject,delivery_status,created_at&service_request_id=eq.${requestId}&order=created_at.desc&limit=100`,
    );
    const communications = (await readJsonOrEmpty(communicationsRes)) || [];
    const messagesRes = await supabaseFetch(
      `messages?select=id,subject,rendered_text,sent_at,created_at&service_request_id=eq.${requestId}&visibility=eq.customer&delivery_state=eq.sent&order=sent_at.desc&limit=100`,
    );
    const messages = (await readJsonOrEmpty(messagesRes)) || [];

    let ronSession = null;
    if (request.service_type === "ron") {
      const proofRes = await supabaseFetch(
        `proof_transactions?select=id,proof_status,aps_status,activation_state,activated_at,completed_at,released_at,completed_assets_available,last_synced_at&service_request_id=eq.${requestId}&is_active=eq.true&order=created_at.desc&limit=1`,
      );
      const proof = ((await readJsonOrEmpty(proofRes)) || [])[0];
      if (proof) {
        const signerRes = await supabaseFetch(
          `proof_signers?select=invitation_state,aps_status,proof_status,access_link_present,completed_at&proof_transaction_record_id=eq.${proof.id}&email=eq.${
            encodeURIComponent(customer?.email || "")
          }&limit=1`,
        );
        const signer = ((await readJsonOrEmpty(signerRes)) || [])[0] || null;
        const issuedInvoices = invoices.filter((invoice: any) =>
          !["void", "cancelled", "draft"].includes(
            String(invoice.status || "").toLowerCase(),
          )
        );
        const paymentRequired = !issuedInvoices.length ||
          issuedInvoices.some((invoice: any) =>
            Number(
              invoice.balance_due ??
                (Number(invoice.amount_due || 0) -
                  Number(invoice.amount_paid ?? invoice.paid_amount ?? 0)),
            ) > 0
          );
        const sessionState = paymentRequired
          ? "payment_required"
          : !request.appointment_confirmed_at || !request.appointment_date ||
              !request.appointment_time
          ? "appointment_pending"
          : ["completed", "released"].includes(String(proof.proof_status || ""))
          ? "completed"
          : proof.activation_state === "activated" &&
              signer?.access_link_present
          ? "ready"
          : proof.activation_state === "activated"
          ? "invitation_sent"
          : "preparing";
        ronSession = {
          state: sessionState,
          signer_status: signer?.aps_status || signer?.proof_status || null,
          invitation_state: signer?.invitation_state || null,
          access_available: Boolean(signer?.access_link_present),
          appointment_date: request.appointment_date || null,
          appointment_time: request.appointment_time || null,
          completed_at: proof.completed_at || null,
          released_at: proof.released_at || null,
          last_synced_at: proof.last_synced_at || null,
        };
      }
    }

    return json({
      ok: true,
      request: publicRequest,
      items: items.map(publicItem),
      invoices: publicInvoices,
      additional_invoice_items: additionalItems.map(publicItem),
      service_detail: publicServiceDetail,
      file_count: Array.isArray(files)
        ? files.filter((f: any) => f.is_active !== false).length
        : 0,
      customer_documents: customerDocuments,
      customer_actions: customerActions.map((action: any) =>
        pick(action, [
          "id",
          "action_type",
          "status",
          "created_at",
          "updated_at",
        ])
      ),
      refunds,
      messages,
      customer_activity: timelineEvents
        .filter((event: any) => event.visibility === "customer")
        .map(customerActivityEvent)
        .filter(Boolean),
      ron_session: ronSession,
      reference_number: refFromId(requestId),
    });
  } catch (err) {
    return json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 400);
  }
});
