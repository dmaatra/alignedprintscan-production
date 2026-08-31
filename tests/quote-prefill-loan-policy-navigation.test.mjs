import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(read("assets/js/pricing-config.js"), context);
vm.runInContext(read("assets/js/estimate-components.js"), context);
const pricing = context.window.ALIGNED_PRICING;
const estimates = context.window.APSEstimateComponents;

test("canonical Mobile estimate snapshots three proposed quote lines totaling $80", () => {
  const snapshot = estimates.build("mobile", {
    notarialActs: [{ act_type: "acknowledgment" }, { act_type: "acknowledgment" }, { act_type: "jurat" }],
    providedWitnessCount: 0,
  }, pricing);
  assert.equal(snapshot.total, 80);
  assert.deepEqual(
    JSON.parse(JSON.stringify(estimates.quoteRows(snapshot))).map(({ description, quantity, unit_price, line_total }) => ({ description, quantity, unit_price, line_total })),
    [
      { description: "Mobile Notary Appointment Base", quantity: 1, unit_price: 50, line_total: 50 },
      { description: "Acknowledgment", quantity: 2, unit_price: 10, line_total: 20 },
      { description: "Jurat", quantity: 1, unit_price: 10, line_total: 10 },
    ],
  );
});

test("RON and Print & Scan component sums preserve current estimate math", () => {
  const ron = estimates.build("ron", { notarialActs: [{ act_type: "acknowledgment" }, { act_type: "jurat" }], providedWitnessCount: 1 }, pricing);
  assert.equal(ron.total, 70);
  const print = estimates.build("print", { print: { pages: 10, copies: 2, color: "bw", sides: "single", paperSize: "legal", paperType: "standard" }, scanPages: 3, fulfillment: "courier" }, pricing);
  assert.equal(print.total, 30);
  assert.equal(print.components.reduce((sum, line) => sum + (line.billable ? line.line_amount : 0), 0), print.total);
});

test("owner-approved Loan Signing starting fees and review states are canonical", () => {
  const expected = { seller: 125, loan_modification: 125, buyer_purchase: 150, refinance: 150, heloc: 150, reverse_mortgage: 175 };
  for (const [signingType, total] of Object.entries(expected)) {
    const snapshot = estimates.build("loan_signing", { signingType, scanbacks: "no", roundTripMiles: 10 }, pricing);
    assert.equal(snapshot.total, total, signingType);
  }
  for (const signingType of ["commercial", "other_custom"]) {
    const snapshot = estimates.build("loan_signing", { signingType, scanbacks: "no", roundTripMiles: 10 }, pricing);
    assert.equal(snapshot.total, 0);
    assert.equal(snapshot.review_required, true);
  }
  const portal = read("supabase/functions/business-portal/index.ts");
  assert.match(portal, /loan_modification: 125/);
  assert.match(portal, /heloc: 150/);
  assert.match(portal, /commercial: null/);
  assert.match(portal, /other_custom: null/);
  assert.match(portal, /pricing_review_required: pricingReviewRequired/);
});

test("routine scanbacks, package printing, signer copy, and local travel remain included", () => {
  const yes = estimates.build("loan_signing", { signingType: "refinance", scanbacks: "yes", roundTripMiles: 10 }, pricing);
  const no = estimates.build("loan_signing", { signingType: "refinance", scanbacks: "no", roundTripMiles: 10 }, pricing);
  const unknown = estimates.build("loan_signing", { signingType: "refinance", scanbacks: "unknown", roundTripMiles: 10 }, pricing);
  assert.equal(yes.total, 150);
  assert.equal(no.total, 150);
  assert.equal(unknown.total, 150);
  assert.equal(unknown.review_required, true);
  assert.equal(yes.components.find((line) => line.key === "loan_signing:scanbacks").line_amount, 0);
  assert.equal(yes.components.some((line) => /Printing \/ Copies/.test(line.label)), false);
});

test("Loan Signing round-trip travel boundaries do not reuse Mobile tiers", () => {
  for (const miles of [10, 30]) assert.deepEqual(JSON.parse(JSON.stringify(estimates.loanSigningTravel(miles))), { band: "included", charge: 0, reviewRequired: false, label: `Local Travel — ${miles} RT Miles` });
  for (const miles of [31, 40]) assert.equal(estimates.loanSigningTravel(miles).charge, 25);
  assert.equal(estimates.loanSigningTravel(41).reviewRequired, true);
});

test("wait and resign policy remains review-only with APS-caused exclusions", async () => {
  const { waitReview, resignReview } = await import("../supabase/functions/_shared/loan-signing-policy.mjs");
  const arrival = "2026-08-31T12:00:00Z";
  assert.equal(waitReview({ arrival_at: arrival, signing_started_at: "2026-08-31T12:30:00Z" }).suggested_amount, 0);
  assert.equal(waitReview({ arrival_at: arrival, signing_started_at: "2026-08-31T12:31:00Z" }).suggested_amount, 25);
  assert.equal(waitReview({ arrival_at: arrival, signing_started_at: "2026-08-31T13:01:00Z", aps_caused_delay: true }).suggested_amount, 0);
  assert.equal(resignReview({ agreedFee: 150, cause: "aps_notary" }).suggested_amount, 0);
  assert.equal(resignReview({ agreedFee: 150, cause: "signer" }).requires_admin_review, true);
});

test("request snapshots seed Quote Builder once and historical rows retain bundled fallback", () => {
  const admin = read("assets/js/admin.js");
  const submit = read("supabase/functions/public-request-submit/index.ts");
  const migration = read("supabase/migrations/20260831114239_quote_prefill_loan_signing_policy.sql");
  assert.match(admin, /APSEstimateComponents\?\.quoteRows/);
  assert.match(admin, /startsWith\("loan_signing:travel:"\)/);
  assert.match(admin, /invoiceItems\.length[\s\S]*defaultInvoiceRows/);
  assert.match(submit, /validatedEstimateSnapshot/);
  assert.match(submit, /estimate_components: input\.request\.estimate_components/);
  assert.match(migration, /estimate_components jsonb/);
  assert.match(migration, /Existing rows remain null/);
});

test("Loan Signing is a first-class common-line family and request navigation targets the wizard", () => {
  const admin = read("assets/js/admin.js");
  const script = read("assets/js/script.js");
  const css = read("assets/css/admin-v3.css");
  assert.match(admin, /group: "Loan Signing"/);
  assert.match(admin, /Extended Travel — 31–40 RT Miles/);
  assert.doesNotMatch(admin, /group: "Loan Signing"[\s\S]{0,180}Standard E-Doc Package Printing/);
  assert.match(script, /showStep\(currentStep \+ 1, true\)/);
  assert.match(script, /showStep\(currentStep - 1, true\)/);
  assert.match(script, /const target = heading \|\| qs\("#smartRequestForm"\)/);
  assert.match(script, /behavior: "instant"/);
  assert.match(css, /\.invoice-preset-row \{ grid-template-columns: 1fr; \}/);
});
