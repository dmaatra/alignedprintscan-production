import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile request workspace has an explicit non-destructive route back to Requests", async () => {
  const [html, css, js] = await Promise.all([
    read("admin-dashboard.html"),
    read("assets/css/admin-v3.css"),
    read("assets/js/admin-v3.js"),
  ]);

  assert.match(html, /id="workspaceBackToRequests"[^>]*aria-label="Back to Requests"/);
  assert.match(css, /\.admin-v3-workspace-back\s*\{\s*display:\s*none;/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.admin-v3-workspace-back\s*\{[\s\S]*display:\s*inline-flex;/);
  assert.match(js, /workspaceBackToRequests[\s\S]*classList\.remove\("has-selection"\)/);
  assert.match(js, /selectedCard\?\.focus\(\)/);
  assert.doesNotMatch(js, /workspaceBackToRequests[\s\S]{0,500}(update|delete|invoke)\(/);
});

test("all maintained request tabs and the mobile global navigation control remain available", async () => {
  const html = await read("admin-dashboard.html");
  for (const tab of ["overview", "customer", "documents", "quote", "payments", "messages", "fulfillment", "timeline"]) {
    assert.match(html, new RegExp(`data-workspace-tab="${tab}"`));
  }
  assert.match(html, /id="adminMenuButton"[^>]*aria-controls="adminSidebar"[^>]*aria-expanded="false"/s);
});
