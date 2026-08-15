import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const growth = read("assets/js/aps-growth.js");
const config = read("assets/js/aps-growth-config.js");
const pricing = read("pricing.html");
const script = read("assets/js/script.js");
const admin = read("assets/js/admin.js");
const wizard = read("assets/js/admin-v3.js");
const migration = read("supabase/migrations/20260815093428_growth_attribution_review_foundation.sql");
const activationMigration = read("supabase/migrations/20260815101226_activate_google_review_workflow.sql");
const submit = read("supabase/functions/public-request-submit/index.ts");
const sendMessage = read("supabase/functions/send-message/index.ts");
const templatePreview = read("supabase/functions/_shared/template-preview.mjs");
const manual = read("docs/APS_SYSTEM_OPERATIONS_WORKFLOW_MANUAL.md");
const sitemap = read("sitemap.xml");
const robots = read("robots.txt");
const publicPages = ["index.html","pricing.html","remote-online-notary.html","mobile-notary.html","print-scan.html","faq.html","terms.html","privacy.html","accessibility.html","support.html"];

test("official Facebook and Google Business links are exact, accessible, and safe on every public footer", () => {
  for (const file of [...publicPages, "success.html"]) {
    const html = read(file);
    assert.match(html, /https:\/\/www\.facebook\.com\/profile\.php\?id=61593146406891/);
    assert.match(html, /aria-label="Aligned Print & Scan on Facebook"/);
    assert.match(html, /https:\/\/share\.google\/rBUN6hRZiTF5UZPwz/);
    assert.match(html, /aria-label="Aligned Print & Scan on Google Business Profile \(opens in a new tab\)"/);
    assert.match(html, /rel="noopener noreferrer"/);
  }
});
test("owner-supplied Google destinations are centralized exactly while GA4 remains unconfigured", () => {
  assert.match(config, /google: "https:\/\/g\.page\/r\/CeY4X1XsHwJFEAI\/review"/);
  assert.match(config, /googleBusinessProfile: "https:\/\/share\.google\/rBUN6hRZiTF5UZPwz"/);
  assert.match(config, /MEASUREMENT_ID = ""/);
});
test("optional customer-reported source supports maintained choices and Other", () => {
  assert.match(pricing, /customerReportedSource/); assert.doesNotMatch(pricing, /customerReportedSource" required/);
  for (const value of ["google","facebook","instagram","proof","referral","returning_customer","other"]) assert.match(pricing, new RegExp(`value="${value}"`));
  assert.match(script, /customer_reported_source_detail/);
});
test("Admin New Order supports reported source without fabricated technical attribution", () => {
  assert.match(wizard, /How customer found APS/); assert.match(wizard, /customer_reported_source/); assert.match(wizard, /first_touch_source/); assert.doesNotMatch(wizard, /acquisition_utm_source/);
});
test("technical attribution stores sanitized values only", () => {
  assert.match(growth, /utm_source/); assert.match(growth, /utm_medium/); assert.match(growth, /utm_campaign/); assert.match(growth, /utm_content/);
  assert.match(growth, /url\.hostname/); assert.match(growth, /location\.pathname/); assert.doesNotMatch(submit, /acquisition_full_url|query_string|portal_token/);
});
test("first touch and request touch remain separate", () => {
  assert.match(growth, /aps_first_touch_v1/); assert.match(growth, /aps_request_touch_v1/); assert.match(submit, /first_acquisition_source=is\.null/);
  assert.match(migration, /first_acquisition_source/); assert.match(migration, /acquisition_utm_source/);
});
test("analytics taxonomy is allowlisted and deduplicated", () => {
  for (const name of ["request_service_view","request_started","service_selected","request_submitted","quote_viewed","quote_approved","payment_checkout_started","customer_portal_opened"]) assert.match(growth, new RegExp(name));
  assert.match(growth, /aps_analytics_events_v1/); assert.match(growth, /sent\.has/);
  assert.match(script, /request_submitted/); assert.ok(script.indexOf("request_submitted") > script.indexOf("!data?.request_id"));
});
test("analytics disables advertising signals and sanitizes portal page URLs", () => {
  assert.match(growth, /allow_google_signals: false/); assert.match(growth, /allow_ad_personalization_signals: false/); assert.match(growth, /page_location: `\$\{location\.origin\}\$\{safeLanding\(\)\}`/);
  for (const forbidden of ["request_id","invoice_number","document","proof_transaction","email","phone"]) assert.doesNotMatch(growth, new RegExp(`${forbidden}.*payload`, "i"));
});
test("review eligibility is completion, balance, and release aware", () => {
  assert.match(migration, /workflow_status,new\.status\) <> 'completed'/); assert.match(migration, /amount_due/); assert.match(migration, /amount_paid/); assert.match(migration, /eligible_for_delivery = true/); assert.match(migration, /customer_visible = false/);
});
test("review state and template are neutral and idempotent", () => {
  assert.match(migration, /not_eligible','eligible','sent/); assert.match(migration, /if new\.review_request_state = 'sent'/i); assert.match(migration, /How was your experience/); assert.doesNotMatch(migration, /5-star|satisfied\?/i);
  assert.match(activationMigration, /active = true/); assert.match(activationMigration, /not conditioned on satisfaction or sentiment/); assert.doesNotMatch(activationMigration, /5-star|positive review|incentive/i);
  assert.match(sendMessage, /review-request:\$\{requestId\}:google/); assert.match(sendMessage, /review_request_state !== "eligible"/); assert.match(sendMessage, /review_request_state: "sent"/); assert.match(sendMessage, /event_type: "review_request_sent"/); assert.match(sendMessage, /review_received: false/);
  assert.match(sendMessage, /REVIEW_DESTINATIONS\.google/);
  assert.match(templatePreview, /https:\/\/g\.page\/r\/CeY4X1XsHwJFEAI\/review/);
});
test("completed portal review CTA uses only the configured direct destination", () => {
  assert.match(script, /APS_REVIEW_DESTINATIONS\?\.google/);
  assert.match(script, /Share an Optional Google Review/);
  assert.match(script, /noopener noreferrer/);
  assert.doesNotMatch(script, /google\.com\/search\?q=Aligned/);
});
test("admin presents compact attribution and review state", () => {
  assert.match(admin, /How Customer Found APS/); assert.match(admin, /Technical Source/); assert.match(admin, /Review Request/);
});
test("sitemap contains canonical public pages only", () => {
  for (const path of ["remote-online-notary.html","mobile-notary.html","print-scan.html","pricing.html","faq.html","terms.html","privacy.html"]) assert.match(sitemap, new RegExp(path.replace(".", "\\.")));
  for (const privatePath of ["admin-dashboard","admin-login","success.html","request_id","document","proof"]) assert.doesNotMatch(sitemap, new RegExp(privatePath, "i"));
});
test("private routes are excluded from crawling", () => {
  assert.match(robots, /Disallow: \/admin-dashboard\.html/); assert.match(robots, /Disallow: \/success\.html/); assert.match(read("success.html"), /noindex,nofollow/);
});
test("canonical links exist on every intended public page", () => {
  for (const file of publicPages) assert.match(read(file), /<link rel="canonical" href="https:\/\/alignedprintscan\.com\//);
});
test("structured data uses verified identity without fake ratings or locations", () => {
  const index = read("index.html"); assert.match(index, /Aligned Print & Scan LLC/); assert.match(index, /sameAs/); assert.doesNotMatch(index, /aggregateRating|streetAddress|reviewCount|openingHours/);
});
test("manual is current, canonical, and complete", () => {
  assert.match(manual, /9bc6149fc563ae68932e67110dcbd96d77c09005/);
  for (const heading of ["Terminology","Admin global modules","Eight-tab request workspace","RON operator playbook","Mobile Notary playbook","Print & Scan playbook","Financial operations","Document lifecycle","Troubleshooting","Quick checklists","Data\/security matrix","Maintenance standard"]) assert.match(manual, new RegExp(heading, "i"));
  for (const tab of ["Overview","Customer","Documents","Quote","Payments","Messages","Fulfillment","Timeline"]) assert.match(manual, new RegExp(`\\| ${tab} \\|`));
  for (const portal of ["Quote & Payment","Appointment/Fulfillment","Activity"]) assert.match(manual, new RegExp(portal.replace("&", "&")));
});
test("manual documents analytics, review, UTM, RON/local, ownership, and external boundaries", () => {
  for (const phrase of ["UTM standard","No satisfaction question","Google Business Profile","GA4 loads only","Authoritative ownership matrix","EXTERNAL PROVIDER BOUNDARY","naturally unverified","Google Search Console"]) assert.match(manual, new RegExp(phrase, "i"));
});
test("customer-facing content contains no obsolete business name", () => {
  for (const file of publicPages) assert.doesNotMatch(read(file), /Aligned Document Services/);
});
