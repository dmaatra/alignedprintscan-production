import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical navigation launches Loan Signing without adding Business Accounts", async () => {
  const pages = await Promise.all(["index.html", "business-accounts.html", "loan-signing.html"].map(read));
  for (const page of pages) {
    const nav = page.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)?.[0] || "";
    assert.match(nav, /loan-signing\.html/);
    assert.match(nav, />Request Service</);
    assert.doesNotMatch(nav, />Business Accounts</);
  }
});

test("homepage presents four active services and business discovery", async () => {
  const page = await read("index.html");
  assert.match(page, /href="loan-signing\.html"[\s\S]*?<div class="card-icon">04<\/div>/);
  assert.doesNotMatch(page, /Coming Soon|currently in preparation/);
  assert.match(page, /Services for Businesses/);
  assert.match(page, /Explore Business Accounts/);
});

test("Business Accounts and Loan Signing use the canonical public shell", async () => {
  for (const name of ["business-accounts.html", "loan-signing.html"]) {
    const page = await read(name);
    assert.match(page, /class="site-header"/);
    assert.match(page, /class="container nav"/);
    assert.match(page, /class="footer-grid"/);
    assert.match(page, /Montserrat/);
    assert.match(page, /Playfair\+Display/);
    assert.match(page, /Business Portal Sign In/);
  }
});

test("Business Account application preserves all Release 2 fields across five steps", async () => {
  const page = await read("business-accounts.html");
  assert.equal((page.match(/data-business-step=/g) || []).length, 5);
  for (const field of ["organization_name", "business_type", "website", "primary_contact_name", "business_email", "phone", "address_line1", "address_line2", "city", "state", "zip", "billing_contact_name", "billing_contact_email", "estimated_monthly_volume", "requested_payment_terms", "services_interested", "notes"]) assert.match(page, new RegExp(`name="${field}"`));
  assert.match(page, /Step 1 of 5/);
  assert.match(page, /Review &amp; Submit/);
});

test("stepped application keeps the canonical backend and guards duplicate submissions", async () => {
  const script = await read("assets/js/business-accounts.js");
  assert.match(script, /business-account-application/);
  assert.match(script, /let submitting = false/);
  assert.match(script, /if \(submitting \|\| !validateStep/);
  assert.match(script, /data-edit-step/);
  assert.match(script, /showStep\(currentStep - 1\)/);
  assert.match(script, /data\.services_interested = selectedServices\(\)/);
});

test("mobile application avoids nested scrolling and canonical breakpoint remains early", async () => {
  const css = await read("assets/css/styles.css");
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1100px\)/);
  assert.match(css, /\.business-application\{min-height:0/);
  assert.doesNotMatch(css, /\.business-application[^}]*overflow-y/);
});

test("Release 6.1 leaves backend, Stripe, Proof, and Release 7 architecture untouched", async () => {
  const script = await read("assets/js/business-accounts.js");
  assert.doesNotMatch(script, /stripe|proof|scanback submission|return tracking/i);
});
