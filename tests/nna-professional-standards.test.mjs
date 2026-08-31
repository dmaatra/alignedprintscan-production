import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFileSync(path.join(root, name), "utf8");
const publicHtml = readdirSync(root, { recursive: true })
  .filter((name) => name.endsWith(".html") && !name.startsWith("docs/"))
  .map((name) => ({ name, html: read(name) }));

test("owner-supplied credential artwork remains byte-for-byte unchanged", () => {
  const fixtures = [
    ["assets/images/credentials/nna-member-2026.png", "fe0365946cfebfca93378d05207a1fa34023df76b725e4c6d5f574d3df820060"],
    ["assets/images/credentials/nna-certified-notary-signing-agent-2026.png", "6ae45c820460c3ac9ead480327ec1bd2f03e6b62ae5288f512615853af53fffe"],
  ];
  for (const [name, expected] of fixtures) {
    const actual = createHash("sha256").update(readFileSync(path.join(root, name))).digest("hex");
    assert.equal(actual, expected, name);
  }
});

test("homepage adds the approved standard without a credential badge or new section", () => {
  const home = read("index.html");
  assert.match(home, /APS notaries maintain active membership with the National Notary[\s\S]*Certified Notary Signing Agent credential/);
  assert.doesNotMatch(home, /nna-member-2026|nna-certified-notary-signing-agent-2026/);
  assert.equal((home.match(/id="about"/g) || []).length, 1);
});

test("About page distinguishes affiliation from individual credential", () => {
  const about = read("about.html");
  assert.match(about, /Professional Standards &amp; Affiliations/);
  assert.match(about, /Professional Affiliation[\s\S]*National Notary Association Member/);
  assert.match(about, /Loan Signing Credential[\s\S]*NNA Certified Notary Signing Agent/);
  assert.match(about, /alt="National Notary Association Member"/);
  assert.match(about, /alt="NNA Certified Notary Signing Agent"/);
});

test("Loan Signing uses the official credential name and required badge", () => {
  const loan = read("loan-signing.html");
  assert.match(loan, /Qualified Loan Signing Professionals/);
  assert.match(loan, /nna-certified-notary-signing-agent-2026\.png/);
  assert.match(loan, /NNA Certified Notary Signing Agent credential/);
  assert.doesNotMatch(loan, /NNA Certified Loan Signing Agent/);
});

test("digital cards preserve their locked layouts and use the corrected wording only where appropriate", () => {
  const doneisha = read("doneisha.html");
  const company = read("card.html");
  const script = read("assets/js/digital-card.js");
  assert.match(script, /NNA Certified Notary Signing Agent \| Bonded & Insured/);
  for (const card of [doneisha, company]) {
    assert.doesNotMatch(card, /nna-member-2026|nna-certified-notary-signing-agent-2026/);
  }
});

test("every maintained canonical website footer uses the LLC legal name", () => {
  const footerPages = publicHtml.filter(({ html }) => html.includes('<footer class="site-footer footer">'));
  assert.ok(footerPages.length >= 20);
  for (const { name, html } of footerPages) {
    assert.match(html, /© 2026 Aligned Print &amp; Scan LLC\. All Rights Reserved\./, name);
    assert.doesNotMatch(html, /© 2026 Aligned Print &amp; Scan\. All Rights Reserved\./, name);
  }
});

test("obvious legal-entity references and About discovery are consistent", () => {
  assert.match(read("terms.html"), /Company Information[\s\S]*Aligned Print &(?:amp;)? Scan LLC is based/);
  assert.match(read("privacy.html"), /Aligned Print &(?:amp;)? Scan LLC values client privacy/);
  assert.match(read("sitemap.xml"), /https:\/\/alignedprintscan\.com\/about\.html/);
  for (const { name, html } of publicHtml.filter(({ html }) => html.includes('<footer class="site-footer footer">'))) {
    assert.match(html, /href="(?:\.\.\/){0,2}about\.html">About<\/a>/, name);
  }
});
