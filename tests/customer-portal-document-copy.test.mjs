import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("../assets/js/script.js", import.meta.url), "utf8");

test("customer portal uses customer-facing APS document copy", () => {
  assert.match(script, /Files provided to you by Aligned Print &amp; Scan will appear here\./);
  assert.match(script, /No documents have been provided yet\./);
  assert.doesNotMatch(script, /Customer deliverables intentionally released by APS\./);
  assert.doesNotMatch(script, /No APS deliverables have been released yet\./);
});

test("APS document release filtering remains intact", () => {
  assert.match(
    script,
    /const apsDocuments = documents\.filter\(file => file\.document_classification !== "completed_notarized_document" && !customerProvidedDocuments\.includes\(file\)\);/,
  );
  assert.match(script, /portalDocumentList\(apsDocuments, "No documents have been provided yet\."\)/);
});

test("customer portal avoids internal APS shorthand outside request references", () => {
  for (const phrase of [
    "APS is confirming",
    "APS is preparing",
    "APS will release",
    "APS will provide",
    "Tell APS",
    "document APS requested",
    "APS Note",
    "contact APS",
  ]) assert.doesNotMatch(script, new RegExp(phrase));
});
