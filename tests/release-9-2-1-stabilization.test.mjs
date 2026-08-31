import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("homepage uses canonical lower heading treatment and a representative business image", () => {
  const html = read("index.html");
  assert.match(html, /<h2>\s*Professional document solutions designed for modern convenience\.\s*<\/h2>/);
  assert.match(html, /business-account-coordination\.webp/);
  assert.match(html, /Two Black small-business professionals coordinating recurring document services/);
  assert.doesNotMatch(html, /Built for ongoing business relationships/);
});

test("resource hero and helpfulness controls keep canonical, high-contrast states", () => {
  const css = read("assets/css/resources.css");
  const js = read("assets/js/resources.js");
  assert.match(css, /\.resource-hero\{[^}]*radial-gradient\(circle at 12% 18%,rgba\(200,169,107,\.17\),transparent 30%\),linear-gradient\(135deg,var\(--aps-navy-primary\),var\(--aps-navy-secondary\)\)/s);
  assert.match(css, /\.helpfulness h2\{[^}]*color:#fff!important/s);
  assert.match(css, /\[data-helpful="yes"\][^}]*var\(--aps-gold-primary\)/s);
  assert.match(css, /\[data-helpful="no"\][^}]*var\(--aps-cream-1\)/s);
  assert.match(css, /\.is-selected/);
  assert.doesNotMatch(css, /\.helpfulness form\{[^}]*background:\s*#000/s);
  assert.match(js, /setAttribute\("aria-pressed","false"\)/);
  assert.match(js, /classList\.toggle\("is-selected"/);
});

test("business authentication geometry matches the Admin Login design tokens", () => {
  const css = read("assets/css/business-auth-release-9-2.css");
  for (const token of ["max-width:520px", "width:76px", "font-size:clamp(2.25rem,8vw,3.5rem)", "min-height:var(--aps-control-height)", "border-radius:var(--aps-radius-pill)"])
    assert.ok(css.includes(token), token);
  for (const page of ["business-login.html", "business-forgot-password.html", "business-reset-password.html"])
    assert.match(read(page), /business-auth-release-9-2\.css\?v=20260820-release-9-2-1-production/);
});

test("public payment-terms article is archived without deleting managed history", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read("assets/js/resource-content.js"), sandbox);
  const articles = sandbox.window.APSResourceContent.articles;
  assert.equal(articles.length, 11);
  assert.ok(!articles.some((article) => article.slug === "business-payment-terms-prepaid-due-net"));
  assert.ok(!fs.existsSync(path.join(root, "resources/business-payment-terms-prepaid-due-net/index.html")));
  assert.doesNotMatch(read("sitemap.xml"), /business-payment-terms-prepaid-due-net/);
  const migration = read("supabase/migrations/20260820122146_release_9_2_1_archive_public_payment_terms_article.sql");
  assert.match(migration, /status = 'archived'/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test("admin core requests survive protected Loan Signing enrichment failures", () => {
  const admin = read("assets/js/admin.js");
  const module = read("assets/js/admin-v3.js");
  const edge = read("supabase/functions/admin-loan-signing-fulfillment/index.ts");
  assert.doesNotMatch(admin, /loan_signing_assignments\(\*\)/);
  assert.match(admin, /functions\.invoke\("admin-loan-signing-fulfillment"/);
  assert.match(admin, /command:\s*"snapshot"/);
  assert.match(admin, /Promise\.allSettled/);
  assert.match(admin, /loan_signing_enrichment_error/);
  assert.match(admin, /Requests could not be loaded\. Refresh your session and try again\./);
  assert.match(admin, /details unavailable[\s\S]*Request Visibility/);
  assert.match(admin, /details unavailable[\s\S]*archiveRequestBtn/);
  assert.match(admin, /Fulfillment and permanent-deletion actions remain unavailable/);
  assert.match(admin, /\$\("#archiveRequestBtn", detail\)\?\.addEventListener\("click", toggleArchiveRequest\)/);
  assert.match(module, /Core requests remain available/);
  assert.match(edge, /requireRelease2Staff/);
  assert.match(edge, /serviceRows/);
  assert.doesNotMatch(admin, /service_role/i);
});

test("Templates resolves specifications through its maintained module import", () => {
  const module = read("assets/js/admin-v3.js");
  assert.match(module, /templateSpecifications:\s*\{\}/);
  assert.match(module, /moduleState\.templateSpecifications\[template\.template_key\]/);
  assert.match(module, /import\("\.\.\/\.\.\/supabase\/functions\/_shared\/template-preview\.mjs"\)/);
  assert.doesNotMatch(module, /const spec=TEMPLATE_SPECIFICATIONS\[template\.template_key\]\|\|\{\},service/);
});

test("Admin request quick tabs apply real status groups", () => {
  const admin = read("assets/js/admin.js");
  const module = read("assets/js/admin-v3.js");
  assert.match(admin, /APSAdminRequestFilters/);
  assert.match(admin, /quick === "active"/);
  assert.match(admin, /quick === "pending"/);
  assert.match(admin, /quick === "completed"/);
  assert.match(module, /setQuickFilter/);
  assert.match(module, /classList\.toggle\("is-active"/);
});
