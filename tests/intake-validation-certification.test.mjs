import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../assets/js/script.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../assets/js/admin-v3.js", import.meta.url), "utf8");

test("RON and Mobile validate the rendered structured signer names", () => {
  assert.match(script, /need\(\[`signerFirstName\$\{index\}`, `signerLastName\$\{index\}`\]\)/);
  assert.doesNotMatch(script, /need\(\[`signerLegalName\$\{index\}`\]\)/);
});

test("upload-later requires its visible reason and explanation", () => {
  assert.match(script, /need\(\["documentUploadExceptionReason", "documentUploadExceptionDetail"\]\)/);
});

test("choosing upload-later never silently clears selected documents", () => {
  assert.doesNotMatch(script, /el\.name === "documentUploadException" && el\.checked\) clearSelectedRequestFiles/);
  assert.match(script, /Your selected document is still attached/);
  assert.match(script, /const exception = Boolean\(f\.documentUploadException\?\.checked && !files\.length\)/);
});

test("dynamic public signer, witness, act, and Loan Signing fields preserve surviving values", () => {
  assert.match(script, /function preserveDynamicValues\(host, render\)/);
  for (const host of ["signerHost", "loanSignerHost", "actHost"]) {
    assert.match(script, new RegExp(`preserveDynamicValues\\(${host},`));
  }
  assert.match(script, /preserveDynamicValues\(host,/);
});

test("Admin RON and Mobile dynamic fields preserve surviving values", () => {
  assert.match(admin, /function preserveAdminDynamicValues\(host, render\)/);
  assert.match(admin, /preserveAdminDynamicValues\(signerHost,/);
  assert.match(admin, /preserveAdminDynamicValues\(actHost,/);
  assert.match(admin, /preserveAdminDynamicValues\(witnessHost,/);
  assert.match(admin, /form\.addEventListener\("input", \(event\) =>/);
  assert.match(admin, /\["ron_signer_count", "ron_notarization_count", "mobile_signer_count", "mobile_notarization_count"\]\.includes\(name\)/);
  assert.doesNotMatch(admin, /form\.addEventListener\("input", \(\) => \{ setWizardRonStructuredFields/);
});

test("disabled Continue state has visible customer-facing guidance", async () => {
  const pricing = await readFile(new URL("../pricing.html", import.meta.url), "utf8");
  assert.match(pricing, /id="wizardValidationGuidance"[^>]*role="status"/);
  assert.match(script, /Complete the required service details and either add a document or complete the upload-later option/);
  assert.match(script, /This step is complete\. You may continue\./);
});
