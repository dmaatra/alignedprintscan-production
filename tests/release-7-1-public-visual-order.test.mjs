import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage preserves the requested service-to-business narrative order", async () => {
  const html = await read("index.html");
  const markers = [
    '<section class="section" id="services">',
    '<p class="eyebrow">How RON Works</p>',
    '<p class="eyebrow">Mobile Service</p>',
    '<p class="eyebrow">Document Support</p>',
    '<p class="eyebrow">Services for Businesses</p>',
    'id="about"',
    '<p class="eyebrow">Security & Technology</p>',
    '<p class="eyebrow">Ready to begin?</p>',
  ];
  const positions = markers.map((marker) => html.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /<h3>Loan Signing Services<\/h3>/);
  assert.match(html, /Explore Business Accounts/);
  assert.match(html, /Business Portal Sign In/);
});

test("Loan Signing uses the canonical light-dark-light section rhythm", async () => {
  const [html, css] = await Promise.all([
    read("loan-signing.html"),
    read("assets/css/styles.css"),
  ]);
  assert.match(html, /<section class="section">.*Our Role/s);
  assert.match(html, /<section class="section dark-band">.*Structured Review/s);
  assert.match(html, /Structured Review.*<section class="section">.*For Businesses/s);
  assert.match(html, /styles\.css\?v=20260820-release-7-2/);
  assert.match(css, /service-page main > \.section\.dark-band/);
  assert.match(css, /section\.dark-band \.card/);
  assert.match(html, /class="btn primary"[^>]*>Start a Loan Signing Request/);
});

test("Release 7.1 preserves canonical navigation and public-only scope", async () => {
  const html = await read("loan-signing.html");
  for (const label of [
    "Home",
    "Services",
    "Remote Online Notary",
    "Mobile Notary",
    "Print &amp; Scan",
    "Loan Signing",
    "Pricing",
    "FAQs",
    "Request Service",
  ]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "", />Business Accounts</);
  assert.match(html, /<footer class="site-footer footer">/);
});
