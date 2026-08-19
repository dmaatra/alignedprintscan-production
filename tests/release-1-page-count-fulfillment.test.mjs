import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public and customer upload paths use the same trusted PDF counter", async () => {
  for (const path of ["supabase/functions/public-request-submit/index.ts", "supabase/functions/customer-upload-document/index.ts"]) {
    const source = await read(path);
    assert.match(source, /detectPdfPageCount\(raw/);
    assert.match(source, /detected_page_count: pageCount\.count/);
    assert.match(source, /page_count_status: pageCount\.status/);
  }
  const browser = await read("assets/js/script.js");
  assert.doesNotMatch(browser, /estimatePdfPageCountFromText|detected_pdf_page_count:/);
});

test("page-count migration protects provenance, aggregation, and quote review", async () => {
  const sql = await read("supabase/migrations/20260819090000_authoritative_pdf_page_counts.sql");
  assert.match(sql, /page_count_source.*admin_manual/s);
  assert.match(sql, /refresh_request_pdf_page_count/);
  assert.match(sql, /pdf_page_count_changed_after_quote/);
  assert.match(sql, /revoke all on function public\.refresh_request_pdf_page_count.*anon, authenticated/);
});

test("new Print and Scan orders cannot select pickup while historical pickup remains readable", async () => {
  const wizard = await read("assets/js/admin-v3.js");
  const scheduling = wizard.slice(wizard.indexOf('field("Fulfillment method"'), wizard.indexOf('field("Appointment / fulfillment instructions"'));
  assert.doesNotMatch(scheduling, /value="pickup"/);
  assert.match(scheduling, /value="courier"/);
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /Legacy pickup\/handoff completed/);
});

test("fulfillment editor exposes only service-applicable location and link controls", async () => {
  const admin = await read("assets/js/admin.js");
  assert.match(admin, /selectedRequest\.service_type === "ron"[^]*Secure Session Link/);
  assert.match(admin, /selectedRequest\.service_type === "mobile"[^]*Mobile Service Address/);
  assert.match(admin, /selectedRequest\.service_type === "print"[^]*Delivery \/ Service Address/);
});
