import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20260831134011_admin_request_initial_review_badge.sql";

function awaitingInitialReview(request, viewedRequestIds = new Set()) {
  const source = String(request.request_source || "").toLowerCase();
  const terminal = new Set(["completed", "cancelled", "canceled", "declined", "refunded", "void"]);
  return ["website", "business_portal"].includes(source)
    && new Date(request.created_at || "2026-08-31T00:00:00Z") >= new Date("2026-08-14T04:36:39Z")
    && !request.archived_at
    && !request.completed_at
    && !request.cancelled_at
    && !terminal.has(String(request.status || "").toLowerCase())
    && !terminal.has(String(request.workflow_status || "").toLowerCase())
    && !viewedRequestIds.has(request.id);
}

test("new website and Business Portal requests qualify for initial review", () => {
  assert.equal(awaitingInitialReview({ id: "web", request_source: "website", status: "under_review" }), true);
  assert.equal(awaitingInitialReview({ id: "business", request_source: "business_portal", status: "under_review" }), true);
});

test("Admin New Order does not increment the badge", () => {
  assert.equal(awaitingInitialReview({ id: "admin", request_source: "admin", status: "under_review" }), false);
});

test("first authorized operator open decrements the company count", () => {
  const rows = [
    { id: "one", request_source: "website", status: "under_review" },
    { id: "two", request_source: "website", status: "under_review" },
    { id: "three", request_source: "business_portal", status: "under_review" },
  ];
  const views = new Set();
  const count = () => rows.filter((row) => awaitingInitialReview(row, views)).length;
  assert.equal(count(), 3);
  views.add("one"); assert.equal(count(), 2);
  views.add("two"); assert.equal(count(), 1);
  views.add("three"); assert.equal(count(), 0);
});

test("reopening is idempotent", () => {
  const row = { id: "one", request_source: "website", status: "under_review" };
  const views = new Set(["one"]);
  views.add("one");
  assert.equal(awaitingInitialReview(row, views), false);
});

test("already-reviewed active request does not count", () => {
  assert.equal(awaitingInitialReview({ id: "seen", request_source: "website", status: "quote_ready" }, new Set(["seen"])), false);
});

test("completed request does not count", () => {
  assert.equal(awaitingInitialReview({ id: "done", request_source: "website", status: "completed" }), false);
  assert.equal(awaitingInitialReview({ id: "done-at", request_source: "website", status: "under_review", completed_at: "2026-08-31" }), false);
});

test("archived and cancelled requests do not count", () => {
  assert.equal(awaitingInitialReview({ id: "archived", request_source: "website", status: "under_review", archived_at: "2026-08-31" }), false);
  assert.equal(awaitingInitialReview({ id: "cancelled", request_source: "website", status: "cancelled" }), false);
});

test("structured synthetic and test sources do not count", () => {
  for (const source of ["test", "development", "junk", "spam", "certification"]) {
    assert.equal(awaitingInitialReview({ id: source, request_source: source, status: "under_review" }), false);
  }
});

test("pre-ledger historical requests do not become new notifications", () => {
  assert.equal(awaitingInitialReview({ id: "historical", created_at: "2026-08-05T00:00:00Z", request_source: "website", status: "payment_received" }), false);
});

test("only authorized APS operators can create first-view state", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /v_admin is null or not public\.is_admin\(\)/);
  assert.match(sql, /revoke all on function public\.admin_mark_request_viewed\(uuid\) from public, anon/);
  assert.match(sql, /grant execute on function public\.admin_mark_request_viewed\(uuid\) to authenticated/);
});

test("company-level first view reuses the existing ledger without a per-admin count", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /where v\.service_request_id = p_request/);
  assert.match(sql, /where v\.service_request_id = r\.id/);
  assert.doesNotMatch(sql, /v\.admin_user_id\s*=\s*v_admin/);
  assert.match(sql, /r\.created_at >= timestamptz '2026-08-14 04:36:39\+00'/);
  assert.match(sql, /for update/);
  assert.match(sql, /on conflict do nothing/);
});

test("refresh paths cover request changes, navigation, drawer, focus, and reload-safe initialization", async () => {
  const js = await read("assets/js/admin-v3.js");
  assert.match(js, /MutationObserver\(\(\) => \{\s*syncRequestCount\(\)/);
  assert.match(js, /if \(isOpen\) syncRequestCount\(\)/);
  assert.match(js, /async function showAdminView\(view\) \{[\s\S]*?syncRequestCount\(\)/);
  assert.match(js, /addEventListener\("focus",\(\)=>syncRequestCount\(\)\)/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /await loadRequests\(\)/);
  assert.match(js, /refreshSequence !== requestCountRefreshSequence/);
});

test("zero state hides the numeric badge and preserves its operational label", async () => {
  const [html, js] = await Promise.all([read("admin-dashboard.html"), read("assets/js/admin-v3.js")]);
  assert.match(html, /id="navRequestCount"[^>]*awaiting initial APS review[^>]*hidden/);
  assert.match(js, /badge\.hidden = unopened === 0/);
  assert.match(js, /new request\$\{unopened === 1 \? "" : "s"\} awaiting initial APS review/);
});
