import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("customer portal hamburger uses the shared accessible mobile navigation", async () => {
  const html = await read("success.html");
  const js = await read("assets/js/script.js");
  assert.match(html, /body class="pass-2-public"/);
  assert.match(html, /class="menu-btn"[^>]*aria-label="Open menu"[^>]*aria-expanded="false"/);
  assert.match(js, /\.site-header \.menu-btn/);
  assert.match(js, /menuBtn\.setAttribute\("aria-expanded"/);
});

test("portal tabs and invoice tables expose discoverable horizontal scrolling", async () => {
  const js = await read("assets/js/script.js");
  const css = await read("assets/css/styles.css");
  assert.match(js, /portal-scroll-shell portal-tabs-shell/);
  assert.match(js, /Swipe to see more/);
  assert.match(js, /Swipe to see all invoice columns/);
  assert.match(js, /scrollWidth > scroller\.clientWidth/);
  assert.match(js, /scrollIntoView/);
  assert.match(css, /scroll-snap-type:x proximity/);
  assert.match(css, /position:sticky/);
});

test("customer Activity is mapped at the server boundary and never falls back to raw event fields", async () => {
  const status = await read("supabase/functions/get-request-status/index.ts");
  const portal = await read("assets/js/script.js");
  assert.match(status, /CUSTOMER_ACTIVITY_COPY/);
  assert.match(status, /\.map\(\(event: any\) => customerActivityEvent\(event, request\)\)/);
  assert.match(status, /\.filter\(Boolean\)/);
  assert.doesNotMatch(portal, /event\.title \|\| event\.event_type/);
  assert.doesNotMatch(portal, /event\.detail \|\| event\.description/);
});

test("unknown timeline types are omitted instead of exposing internal wording", async () => {
  const status = await read("supabase/functions/get-request-status/index.ts");
  assert.match(status, /if \(!copy\) return null/);
  assert.match(status, /return \{ \.\.\.copy, detail, created_at: event\.created_at \}/);
  assert.doesNotMatch(status, /pick\(event, \["event_type", "title", "detail"/);
});
