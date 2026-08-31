import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../assets/js/script.js", import.meta.url), "utf8");

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
