import { requireProofAdmin } from "../_shared/proof/admin-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? null : response.json();
}

async function rpc(name: string, body: Record<string, unknown>) {
  return db(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

async function mergePreview(sourceId: string, survivorId: string) {
  const customerRows = await db(
    `customers?select=id,first_name,last_name,email,phone,created_at&id=in.(${sourceId},${survivorId})`,
  );
  const requests = await db(
    `service_requests?select=id,customer_id,status,workflow_status,service_type,completed_at&id=not.is.null&customer_id=in.(${sourceId},${survivorId})`,
  );
  const requestIds = (requests || []).map((item: { id: string }) => item.id);
  const counts: Record<string, number> = {
    requests: requestIds.length,
    active: 0,
    completed: 0,
    invoices: 0,
    payments: 0,
    messages: 0,
    documents: 0,
    ron: 0,
  };
  for (const request of requests || []) {
    const completed = request.completed_at ||
      ["completed", "cancelled"].includes(
        request.workflow_status || request.status,
      );
    counts[completed ? "completed" : "active"] += 1;
    if (request.service_type === "ron") counts.ron += 1;
  }
  if (requestIds.length) {
    const encoded = requestIds.join(",");
    for (
      const [label, table] of [
        ["invoices", "invoices"],
        ["payments", "request_payments"],
        ["messages", "messages"],
        ["documents", "request_files"],
      ]
    ) {
      const rows = await db(
        `${table}?select=id&service_request_id=in.(${encoded})`,
      );
      counts[label] = rows?.length || 0;
    }
  }
  return { customers: customerRows || [], counts };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  try {
    if (request.method !== "POST") {
      return json({ ok: false, error: "POST required." }, 405);
    }
    const admin = await requireProofAdmin(request);
    const body = await request.json().catch(() => ({}));
    const command = String(body.command || "");
    const requestId = String(body.request_id || "");
    if (command === "merge_preview") {
      return json({
        ok: true,
        ...(await mergePreview(
          String(body.source_customer_id),
          String(body.surviving_customer_id),
        )),
      });
    }
    if (command === "merge") {
      return json({
        ok: true,
        result: await rpc("admin_merge_customer_profiles", {
          p_source: body.source_customer_id,
          p_survivor: body.surviving_customer_id,
          p_actor: admin.id,
          p_reason: body.reason,
        }),
      });
    }
    if (command === "delete_eligibility") {
      return json({
        ok: true,
        result: await rpc("admin_request_delete_eligibility", {
          p_request: requestId,
        }),
      });
    }
    if (command === "delete") {
      const fileRows = await db(
        `request_files?select=file_path&service_request_id=eq.${requestId}`,
      );
      const result = await rpc("admin_delete_eligible_request", {
        p_request: requestId,
        p_actor: admin.id,
        p_confirmation: body.confirmation,
        p_reason: body.reason,
      });
      for (const file of fileRows || []) {
        if (!file.file_path) continue;
        const storageResponse = await fetch(
          `${url}/storage/v1/object/service-request-files/${
            String(file.file_path).split("/").map(encodeURIComponent).join("/")
          }`,
          {
            method: "DELETE",
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          },
        );
        if (!storageResponse.ok && storageResponse.status !== 404) {
          console.warn(
            "Eligible test file cleanup failed after request deletion.",
          );
        }
      }
      return json({
        ok: true,
        result,
      });
    }
    if (command === "archive" || command === "restore") {
      const archived = command === "archive";
      const rows = await db(
        `service_requests?select=id,status&id=eq.${requestId}&limit=1`,
      );
      if (!rows?.[0]) {
        return json({ ok: false, error: "Request not found." }, 404);
      }
      await db(`service_requests?id=eq.${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({
          archived_at: archived ? new Date().toISOString() : null,
          archived_by: archived ? admin.id : null,
          archive_reason: archived
            ? String(body.reason || "Archived by administrator.")
            : null,
        }),
      });
      await db("request_lifecycle_audits", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          request_reference: `APS-${requestId.slice(0, 8).toUpperCase()}`,
          action: archived ? "archived" : "restored",
          actor_id: admin.id,
          reason: body.reason || null,
        }),
      });
      return json({ ok: true, archived });
    }
    if (command === "link_request") {
      const customerId = String(body.customer_id || "");
      const requests = await db(
        `service_requests?select=id,customer_id&id=eq.${requestId}&limit=1`,
      );
      const customers = await db(
        `customers?select=id,merged_at&id=eq.${customerId}&limit=1`,
      );
      if (!requests?.[0] || !customers?.[0] || customers[0].merged_at) {
        throw new Error("Request or active customer not found.");
      }
      await db(`service_requests?id=eq.${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ customer_id: customerId }),
      });
      await db("customer_link_audits", {
        method: "POST",
        body: JSON.stringify({
          service_request_id: requestId,
          customer_id: customerId,
          link_type: "admin_confirmed",
          match_basis: "explicit_customer_id",
          confidence: "admin_confirmed",
          actor_id: admin.id,
        }),
      });
      await db(
        `review_queue_items?service_request_id=eq.${requestId}&blocker_key=eq.possible_existing_customer&state=eq.open`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "resolved",
            resolved_at: new Date().toISOString(),
            resolved_by: admin.id,
          }),
        },
      );
      return json({ ok: true });
    }
    if (command === "keep_new_customer") {
      await db(
        `review_queue_items?service_request_id=eq.${requestId}&blocker_key=eq.possible_existing_customer&state=eq.open`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "dismissed",
            resolved_at: new Date().toISOString(),
            resolved_by: admin.id,
          }),
        },
      );
      return json({ ok: true });
    }
    return json({ ok: false, error: "Unsupported command." }, 400);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 400);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, status);
  }
});
