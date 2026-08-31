import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260831034900_admin_read_loan_signing_assignments.sql",
    import.meta.url,
  ),
  "utf8",
);
const admin = await readFile(
  new URL("../assets/js/admin.js", import.meta.url),
  "utf8",
);

test("Loan Signing workspace grants authenticated administrators read-only detail access", () => {
  assert.match(
    migration,
    /grant select on public\.loan_signing_assignments to authenticated/,
  );
  assert.match(migration, /for select\s+to authenticated/);
  assert.match(migration, /using \(\(select public\.is_admin\(\)\)\)/);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all).*authenticated/i,
  );
});

test("Loan Signing overview uses its own workflow guide without Print fallback", () => {
  assert.match(admin, /s === "loan_signing" \|\| s\.includes\("loan"\)/);
  assert.match(admin, /Loan Signing Workflow/);
  assert.match(admin, /\["under_review", "Assignment Received"\]/);
  assert.match(admin, /\["appointment_confirmed", "Signing Scheduled"\]/);
});
