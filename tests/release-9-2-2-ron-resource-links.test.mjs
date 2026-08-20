import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "remote-online-notary.html"), "utf8");
const section = html.match(/<section class="ron-band"><div class="container"><p class="eyebrow">Reliable resources<\/p>[\s\S]*?<\/section>/)?.[0] || "";

test("RON closing resources prioritize APS customer guidance before official sources", () => {
  const ordered = [
    "How Remote Online Notarization Works",
    "Appointment Preparation Checklist",
    "Official Texas Resources",
    "Texas Secretary of State — Online Notary Public Educational Information",
    "Texas Secretary of State — Identity Proofing and Credential Analysis",
    "Request Online Notary",
    "Browse Resource Center",
  ];
  let cursor = -1;
  for (const label of ordered) {
    const next = section.indexOf(label);
    assert.ok(next > cursor, `${label} is out of order`);
    cursor = next;
  }
  assert.match(section, /<p class="eyebrow">Official Texas Resources<\/p>/);
});

test("RON resource destinations and surrounding page structure remain unchanged", () => {
  for (const href of [
    "resources/how-remote-online-notarization-works/",
    "resources/what-you-need-online-notary-appointment/",
    "https://www.sos.state.tx.us/statdoc/online-np-educational.shtml",
    "https://www.sos.state.tx.us/statdoc/identityproofing.shtml",
  ]) assert.match(section, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, /<header class="site-header">/);
  assert.match(html, /<footer class="site-footer footer">/);
  assert.match(section, /href="pricing\.html\?service=ron#request"/);
  assert.match(section, /href="resources\/"/);
});
