import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("notifications are durable, deduplicated, and administrator-only", async () => {
  const sql = await read("supabase/migrations/20260814002401_admin_live_notifications.sql");
  assert.match(sql, /create table public\.admin_notifications/);
  assert.match(sql, /dedupe_key text not null unique/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on public\.admin_notifications,public\.admin_notification_reads from anon/);
  assert.match(sql, /public\.is_admin\(\)/);
  assert.doesNotMatch(sql, /grant .*admin_notifications.*anon/i);
});

test("private Realtime Broadcast carries identifiers and state, not customer content", async () => {
  const sql = await read("supabase/migrations/20260814002401_admin_live_notifications.sql");
  assert.match(sql, /realtime\.send\(/);
  assert.match(sql, /'admin-notifications',true/);
  assert.match(sql, /realtime\.topic\(\)\)='admin-notifications'/);
  const payload = sql.match(/jsonb_build_object\(([^;]+)\),'notification'/s)?.[1] || "";
  assert.doesNotMatch(payload, /email|phone|body|title|customer/i);
});

test("notification sources use narrow operational event allowlists", async () => {
  const sql = await read("supabase/migrations/20260814002401_admin_live_notifications.sql");
  assert.match(sql, /service_request_admin_notification/);
  assert.match(sql, /timeline_admin_notification/);
  assert.match(sql, /review_item_admin_notification/);
  assert.match(sql, /proof_completed_asset_retrieval_failed/);
  assert.match(sql, /on conflict\(dedupe_key\) do nothing/g);
});

test("admin notification UI supports unread state, sound preference, safe preview, and deep links", async () => {
  const html = await read("admin-dashboard.html");
  const js = await read("assets/js/admin-notifications.js");
  assert.match(html, /adminNotificationBadge/);
  assert.match(html, /adminNotificationSounds/);
  assert.match(html, /testAdminNotification/);
  assert.match(js, /admin_notification_reads/);
  assert.match(js, /localStorage\.getItem\(soundKey\)/);
  assert.match(js, /No production record was created/);
  assert.match(js, /openRequestFromModule/);
});

test("client subscribes to an authenticated private channel and refetches authorized rows", async () => {
  const js = await read("assets/js/admin-notifications.js");
  assert.match(js, /realtime\.setAuth\(\)/);
  assert.match(js, /channel\("admin-notifications",\{config:\{private:true\}\}\)/);
  assert.match(js, /from\("admin_notifications"\).*\.eq\("id",id\)\.single\(\)/s);
  assert.doesNotMatch(js, /from\("messages"\)/);
});

test("notification bell remains accessible at dashboard responsive widths", async () => {
  const css = await read("assets/css/admin-v3.css");
  assert.match(css, /@media \(max-width:1180px\) \{ \.admin-v3-top-actions \.admin-notification-bell \{ display:inline-flex; \} \}/);
  assert.match(css, /@media \(max-width:680px\) \{ \.admin-v3-top-actions \{ display:flex; \}/);
});
