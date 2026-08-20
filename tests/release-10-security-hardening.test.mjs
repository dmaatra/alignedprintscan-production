import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260820212518_release_10_harden_rpc_execution_and_search_paths.sql",
    import.meta.url,
  ),
  "utf8",
);

test("public intake RPC remains restricted to the validated service-role boundary", () => {
  assert.match(
    migration,
    /revoke all on function public\.aps_create_request_with_customer\(jsonb, jsonb\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.aps_create_request_with_customer\(jsonb, jsonb\)[\s\S]*to service_role/i,
  );
});

test("internal page-count trigger procedure is not browser executable", () => {
  assert.match(
    migration,
    /revoke all on function public\.request_files_refresh_pdf_page_count\(\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.request_files_refresh_pdf_page_count\(\)[\s\S]*to service_role/i,
  );
});

test("normalization helper search paths are immutable", () => {
  for (const helper of [
    "aps_normalize_email",
    "aps_normalize_phone",
    "aps_normalize_name",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${helper}\\(text\\) set search_path = ''`, "i"),
    );
  }
});

test("superseded order and quote intake tables retain history without browser access", () => {
  for (const table of ["orders", "order_files", "quote_requests", "quote_request_files"]) {
    assert.match(migration, new RegExp(`public\\.${table}`, "i"));
  }
  assert.match(
    migration,
    /revoke all on table public\.orders, public\.order_files,[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(migration, /drop policy if exists "Allow public select quote requests"/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(orders|order_files|quote_requests|quote_request_files)/i);
});

test("support ticket management requires the maintained admin helper", () => {
  assert.match(migration, /drop policy if exists "Allow admin support ticket access"/i);
  assert.match(
    migration,
    /create policy "APS admins manage support tickets"[\s\S]*to authenticated[\s\S]*using \(public\.is_admin\(\)\)[\s\S]*with check \(public\.is_admin\(\)\)/i,
  );
  assert.doesNotMatch(migration, /drop policy if exists "Allow public support ticket insert"/i);
});
