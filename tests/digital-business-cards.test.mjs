import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const card = read("card.html");
const doneisha = read("doneisha.html");
const script = read("assets/js/digital-card.js");
const vcard = read("assets/vcards/doneisha.vcf");
const companyVcard = read("assets/vcards/aligned-print-scan.vcf");
const styles = read("assets/css/digital-card.css");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const vercel = JSON.parse(read("vercel.json"));

test("digital card routes remain unlisted and noindex", () => {
  for (const html of [card, doneisha]) assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(sitemap, /\/card|\/doneisha/);
  assert.match(robots, /Disallow: \/card/);
  assert.match(robots, /Disallow: \/doneisha/);
  assert.ok(vercel.rewrites.some(({ source, destination }) => source === "/card" && destination === "/card.html"));
  assert.ok(vercel.rewrites.some(({ source, destination }) => source === "/doneisha" && destination === "/doneisha.html"));
});

test("company card uses canonical APS assets, contacts, and intake", () => {
  assert.match(card, /assets\/images\/logo-full\.webp/);
  assert.match(card, /pricing\.html\?utm_source=aps_company_card&amp;utm_medium=digital_card#request/);
  assert.match(card, /tel:\+14693838879/);
  assert.match(card, /mailto:hello@alignedprintscan\.com/);
  assert.doesNotMatch(card, /Doneisha|Owner|Founder|CEO|President/);
  for (const service of ["Remote Online Notary", "Mobile Notary", "Print &amp; Scan", "Loan Signing"]) {
    assert.match(card, new RegExp(service));
  }
  assert.match(card, /data-save-contact href="assets\/vcards\/aligned-print-scan\.vcf"/);
  assert.match(card, /data-card-action="business_portal" href="business-login\.html">Business Portal/);
  assert.doesNotMatch(card, />Business Accounts</);
  assert.doesNotMatch(card, /Business Accounts Available/);
  for (const social of ["Instagram", "Facebook", "YouTube"]) {
    assert.match(card, new RegExp(`aria-label="${social}"`));
  }
  assert.doesNotMatch(card, /<footer class="card-signature-footer">[\s\S]*aria-label="Instagram"/);
});

test("shared card shell locks top and footer geometry for company and professional cards", () => {
  assert.match(styles, /--digital-card-max-width: 760px/);
  assert.match(styles, /--digital-card-brand-height: 256px/);
  assert.match(styles, /--digital-card-brand-height: 194px/);
  assert.match(styles, /\.card-brand[\s\S]*height: var\(--digital-card-brand-height\)/);
  assert.match(styles, /\.card-signature-footer \{ padding: var\(--digital-card-footer-padding\); \}/);
  for (const html of [card, doneisha]) assert.match(html, /<footer class="card-signature-footer">[\s\S]*Online when you can\. Mobile when you need it\.[\s\S]*Online &amp; Mobile Notary and Document Services[\s\S]*<\/footer>/);
});

test("company vCard is company-specific and standards-compatible", () => {
  assert.match(companyVcard, /^BEGIN:VCARD\nVERSION:3\.0\n/);
  assert.match(companyVcard, /FN:Aligned Print & Scan/);
  assert.match(companyVcard, /ORG:Aligned Print & Scan/);
  assert.match(companyVcard, /TITLE:Online & Mobile Notary and Document Services/);
  assert.match(companyVcard, /TEL;TYPE=WORK,VOICE:\+14693838879/);
  assert.match(companyVcard, /EMAIL;TYPE=INTERNET,WORK:hello@alignedprintscan\.com/);
  assert.match(companyVcard, /URL;TYPE=WORK:https:\/\/alignedprintscan\.com\//);
  assert.match(companyVcard, /NOTE:Online when you can\. Mobile when you need it\./);
  assert.doesNotMatch(companyVcard, /Doneisha|Notary Public|Loan Signing Agent|Bonded/);
  assert.match(companyVcard, /END:VCARD\n$/);
});

test("professional profile keeps explicit credentials and reusable vCard data", () => {
  assert.match(script, /const PROFESSIONALS/);
  assert.match(script, /Texas Notary Public/);
  assert.match(script, /Online Notary Public/);
  assert.match(script, /Loan Signing Agent/);
  assert.match(script, /NNA Certified Loan Signing Agent/);
  assert.match(script, /Bonded & Insured/);
  assert.match(script, /BEGIN:VCARD/);
  assert.match(script, /VERSION:3\.0/);
  assert.match(script, /doneisha@alignedprintscan\.com/);
  assert.match(script, /assets\/images\/professionals\/doneisha-approved-portrait\.png/);
  assert.match(doneisha, /href="assets\/vcards\/doneisha\.vcf"/);
  assert.match(vcard, /^BEGIN:VCARD\nVERSION:3\.0\n/);
  assert.match(vcard, /FN:Doneisha Maat Ra/);
  assert.match(vcard, /ORG:Aligned Print & Scan/);
  assert.match(vcard, /TITLE:Texas Notary Public \| Online Notary Public \| Loan Signing Agent/);
  assert.match(vcard, /TEL;TYPE=CELL,VOICE:\+14693838879/);
  assert.match(vcard, /EMAIL;TYPE=INTERNET,WORK:doneisha@alignedprintscan\.com/);
  assert.match(vcard, /URL;TYPE=WORK:https:\/\/alignedprintscan\.com\/doneisha/);
  assert.match(vcard, /URL:https:\/\/alignedprintscan\.com\//);
  assert.match(vcard, /NOTE:NNA Certified Loan Signing Agent \| Bonded & Insured/);
  assert.match(vcard, /END:VCARD\n$/);
  assert.doesNotMatch(doneisha, />Owner<|>Founder<|>CEO<|>President</);
  assert.match(script, /supportingCredentials\.join\(" \| "\)/);
  assert.match(doneisha, /class="card-button card-button-secondary"[^>]*data-save-contact/);
  assert.match(doneisha, /class="card-signature-footer"/);
  assert.doesNotMatch(doneisha, /class="aps-company-name"/);
});

test("both cards use approved APS positioning without retired copy or emoji icons", () => {
  for (const html of [card, doneisha]) {
    assert.match(html, /Online when you can\. Mobile when you need it\./);
    assert.match(html, /Online &amp; Mobile Notary and Document Services/);
    assert.doesNotMatch(html, /Professional Digital Card/i);
    assert.doesNotMatch(html, /Services through Aligned Print &amp; Scan/i);
    assert.doesNotMatch(html, /Professional service, backed by APS/i);
    assert.doesNotMatch(html, /Professional service, thoughtfully coordinated/i);
    assert.doesNotMatch(html, /Secure, precise support online and by appointment/i);
    assert.doesNotMatch(html, /[☎✦✉◆]/u);
  }
});
