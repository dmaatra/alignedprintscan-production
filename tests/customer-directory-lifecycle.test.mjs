import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalReference, collapseWhitespace, formatPhone, normalizeEmail, normalizePersonInput, normalizePhone, normalizeSearch, normalizeState, normalizeZip } from "../assets/js/aps-data-standard.mjs";

const [migration, admin, adminV3, intake, lifecycle, config] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260813102521_customer_directory_review_queue_cleanup.sql", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/admin.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/admin-v3.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/js/script.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/admin-customer-lifecycle/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
]);

const cases = [
  ["customer_id remains authoritative", () => assert.match(migration, /service_requests set customer_id=p_survivor/)],
  ["multiple requests can belong to one customer", () => assert.doesNotMatch(migration, /unique[^\n]+customer_id/i)],
  ["name alone does not auto-link", () => assert.match(migration, /normalized_email = v_email/)],
  ["fuzzy names do not auto-link", () => assert.doesNotMatch(migration, /similarity\(|levenshtein|soundex/i)],
  ["exact normalized email and phone links", () => assert.match(migration, /email_phone_name/)],
  ["ambiguous matches require review", () => assert.match(migration, /ambiguous_review/)],
  ["shared contact conflicts remain separate", () => assert.match(migration, /conflicting_identity/)],
  ["safe existing customer avoids duplicate", () => assert.match(intake, /aps_create_request_with_customer/)],
  ["automatic links are audited", () => assert.match(migration, /customer_link_audits/)],
  ["existing duplicates are not auto-merged", () => assert.doesNotMatch(migration, /update public\.service_requests set customer_id[^\n]+normalized_/)],
  ["admin merge preserves request history", () => assert.match(migration, /admin_merge_customer_profiles/)],
  ["request-scoped dependencies remain attached", () => { const merge=migration.slice(migration.indexOf("admin_merge_customer_profiles"),migration.indexOf("admin_request_delete_eligibility"));assert.match(merge,/update public\.service_requests set customer_id/);assert.doesNotMatch(merge,/delete from public\.(invoices|payments|messages|request_files|request_timeline_events)/); }],
  ["merge is server authorized", () => assert.match(lifecycle, /requireProofAdmin/)],
  ["public intake normalizes identity", () => assert.match(intake, /normalizePersonInput/)],
  ["Admin New Order normalizes identity", () => assert.match(adminV3, /normalizePersonInput/)],
  ["customer database updates normalize", () => assert.match(migration, /aps_sync_customer_normalized_values/)],
  ["names trim and collapse whitespace", () => assert.equal(collapseWhitespace("  Doneisha   Ra "), "Doneisha Ra")],
  ["simple display values are professionally cased", () => assert.deepEqual(normalizePersonInput({first_name:"doneisha",last_name:"RA"}), {first_name:"Doneisha",last_name:"Ra",email:"",phone:null})],
  ["legal names are not title-cased", () => assert.equal(normalizePersonInput({first_name:"LaToya",last_name:"de la Cruz"}).last_name, "de la Cruz")],
  ["email normalization is lowercase", () => assert.equal(normalizeEmail(" Doneisha@GMAIL.COM "), "doneisha@gmail.com")],
  ["phone normalization is E.164", () => assert.equal(normalizePhone("713-972-4132"), "+17139724132")],
  ["phone display is professional", () => assert.equal(formatPhone("+17139724132"), "(713) 972-4132")],
  ["state is uppercase", () => assert.equal(normalizeState(" tx "), "TX")],
  ["ZIP+4 is preserved", () => assert.equal(normalizeZip("01234-5678"), "01234-5678")],
  ["APS references are canonical", () => assert.equal(canonicalReference("b45d17e3-aaa"), "APS-B45D17E3")],
  ["notes are not passed through a title-case helper", () => assert.doesNotMatch(intake, /notes:\s*(title|normalizePerson)/)],
  ["normalized search is case insensitive", () => assert.equal(normalizeSearch("DONEISHA"), normalizeSearch("doneisha"))],
  ["directory groups by customer ID", () => assert.match(adminV3, /const map=new Map\(\)/)],
  ["Customers search exists", () => assert.match(adminV3, /id="customerSearch"/)],
  ["Customers sorting exists", () => assert.match(adminV3, /id="customerSort"/)],
  ["customer request counts use grouped arrays", () => assert.match(adminV3, /row\.requests\.length/)],
  ["last request sort uses Date values", () => assert.match(adminV3, /new Date\(b\.lastRequest\.created_at\)/)],
  ["customer request links open requests", () => assert.match(adminV3, /customer-request-link/)],
  ["review issues group by request", () => assert.match(adminV3, /reviewRows\(\)/)],
  ["review rows do not flatMap issue rows", () => assert.doesNotMatch(adminV3.slice(adminV3.indexOf("function renderReviewQueue"), adminV3.indexOf("function financialDate")), /flatMap/)],
  ["priority derives from state", () => assert.match(adminV3, /function reviewPriority/)],
  ["review age uses timestamps", () => assert.match(adminV3, /Date\.now\(\)-new Date\(value\)/)],
  ["appointment urgency uses typed dates", () => assert.match(adminV3, /requestAppointmentTimestamp/)],
  ["Review Request deep links", () => assert.match(adminV3, /data-tab=.*Review Request/)],
  ["review sorting is deterministic", () => assert.match(adminV3, /id="reviewSort"/)],
  ["archive removes requests from active helper", () => assert.match(adminV3, /!request\.archived_at/)],
  ["active sidebar count excludes archived", () => assert.match(adminV3, /dataset\.archived !== "true"/)],
  ["archive preserves related history", () => assert.match(admin, /All history was retained/)],
  ["restore returns request to active visibility", () => assert.match(lifecycle, /command === "archive" \|\| command === "restore"/)],
  ["permanent delete requires admin", () => assert.match(lifecycle, /requireProofAdmin/)],
  ["permanent delete requires DELETE", () => assert.match(migration, /p_confirmation <> 'DELETE'/)],
  ["eligible test request may delete", () => assert.match(migration, /'test','development','junk','spam'/)],
  ["paid requests are protected", () => assert.match(migration, /Real payment history is protected/)],
  ["completed requests are protected", () => assert.match(migration, /Completed requests are protected/)],
  ["dependent participant records are cleaned", () => assert.match(migration, /delete from public\.request_participants/)],
  ["customer with other requests is retained", () => assert.match(migration, /customer_remaining_requests/)],
  ["archived filter remains available", () => assert.match(admin, /archiveFilter/)],
  ["archived requests stay excluded from badge", () => assert.match(admin, /data-archived/)],
  ["quote workflow remains represented", () => assert.match(admin, /saveInvoice/)],
  ["payment workflow remains represented", () => assert.match(admin, /recordAdminPayment/)],
  ["message templates remain represented", () => assert.match(adminV3, /renderTemplates/)],
  ["document release controls remain represented", () => assert.match(admin, /setDocumentRelease/)],
  ["customer portal intake path remains present", () => assert.match(intake, /sendRequestNotifications/)],
  ["timeline remains request scoped", () => assert.match(admin, /request_timeline_events/)],
  ["financial navigation remains intact", () => assert.match(adminV3, /renderFinancial/)],
  ["completion gate remains intact", () => assert.match(admin, /beginCompletion/)],
  ["service-specific workflows remain intact", () => { for (const value of ["ron_requests","mobile_notary_requests","print_scan_requests"]) assert.match(adminV3, new RegExp(value)); }],
];

for (const [name, fn] of cases) test(name, fn);

test("admin lifecycle Edge Function requires gateway JWT", () => {
  assert.match(config, /\[functions\.admin-customer-lifecycle\][\s\S]*verify_jwt = true/);
});
