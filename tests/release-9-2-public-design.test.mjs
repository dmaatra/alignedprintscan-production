import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const shellPages = [
  ...fs.readdirSync(root).filter((file) => file.endsWith(".html")),
  "resources/index.html",
  ...fs.readdirSync(path.join(root, "resources"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `resources/${entry.name}/index.html`),
].filter((file) => fs.existsSync(path.join(root, file)) && read(file).includes('<header class="site-header"'));

test("all public pages use the same static navigation hierarchy and five-column footer", () => {
  assert.equal(shellPages.length, 26);
  for (const file of shellPages) {
    const html = read(file);
    const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0] || "";
    const footer = html.match(/<footer class="site-footer footer">[\s\S]*?<\/footer>/)?.[0] || "";
    assert.match(header, />Home<.*>Services .*?>Pricing<.*>Resources<.*>FAQs<.*>Request Service</);
    assert.match(header, /service-dropdown-divider[\s\S]*For Businesses[\s\S]*>Business Accounts</);
    assert.doesNotMatch(header, /<nav[^>]*>[\s\S]*?<a[^>]*>Business Accounts<\/a>[\s\S]*?<\/nav>$/);
    assert.equal((footer.match(/<h4>/g) || []).length, 4, `${file}: footer link columns`);
    assert.match(footer, /<h3>Secure Document &amp; Notary Solutions<\/h3>/);
    assert.match(footer, />Resource Center<\/a>/);
    assert.match(footer, /class="footer-business-login">Business Portal Sign In<\/a>/);
    assert.match(html, /styles\.css\?v=20260820-release-9-2-1-production/);
    assert.match(
      html,
      file === "pricing.html"
        ? /script\.js\?v=20260830-intake-validation-repair/
        : /script\.js\?v=20260820-release-9-2-1-production/,
    );
  }
});

test("the public shell is present before JavaScript and has no runtime replacement", () => {
  assert.match(read("scripts/sync-public-shell.mjs"), /function header/);
  assert.doesNotMatch(read("assets/js/script.js"), /site-header[\s\S]{0,200}innerHTML|site-footer[\s\S]{0,200}innerHTML/);
});

test("resource center uses navy, ivory, and grey bands with browse controls together", () => {
  const html = read("resources/index.html");
  const hero = html.match(/<section class="resource-hero[\s\S]*?<\/section>/)?.[0] || "";
  const browse = html.match(/<section class="[^"]*resource-browse[^"]*"[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(hero, /resourceSearch|Request Service/);
  assert.match(browse, /data-resource-category="all"[\s\S]*resourceSearch/);
  assert.match(html, /resource-help/);
  const css = read("assets/css/resources.css");
  assert.match(css, /\.resource-hero\s*\{[^}]*background:[^}]*var\(--aps-navy-primary\)/s);
  assert.match(css, /\.resource-browse\s*\{[^}]*background:\s*var\(--aps-cream-2\)/s);
  assert.match(css, /\.resource-help\s*\{[^}]*background:\s*#ebecef/s);
  assert.match(css, /\.resource-grid\s*\{[^}]*repeat\(3,/s);
});

test("typography, article sizing, and business auth geometry are locked", () => {
  const styles = read("assets/css/styles.css");
  const resources = read("assets/css/resources.css");
  const auth = read("assets/css/business-auth-release-9-2.css");
  assert.match(styles, /family=Montserrat/);
  assert.match(styles, /family=Playfair\+Display/);
  assert.match(styles, /\.footer-business-login\s*\{\s*white-space:\s*nowrap/);
  assert.match(resources, /\.article-hero h1[^}]*clamp\(2\.15rem,3\.5vw,3\.25rem\)/);
  assert.match(resources, /\.article-image[\s\S]*max-height:\s*360px/);
  assert.match(auth, /max-width:\s*520px/);
  assert.match(auth, /width:\s*76px/);
  for (const file of ["business-login.html", "business-forgot-password.html", "business-reset-password.html"])
    assert.match(read(file), /business-auth-release-9-2\.css/);
});

test("homepage, RON, and image cleanup remain within release scope", () => {
  assert.doesNotMatch(read("index.html"), /We are a growing service provider focused on supporting real workflows/i);
  const ron = read("remote-online-notary.html");
  assert.match(ron, /Five steps/);
  assert.match(ron, /appointment checklist/);
  assert.doesNotMatch(ron, />Procedural help, not legal advice</);
  const content = read("assets/js/resource-content.js");
  for (const image of ["phone-online-notary-session.webp", "loan-signing-appointment.webp", "business-password-recovery.webp"]) {
    assert.match(content, new RegExp(image.replaceAll(".", "\\.")));
    assert.ok(fs.statSync(path.join(root, "assets/images/resources", image)).size > 20_000);
  }
  assert.equal(read("google7bace5a38d37ffed.html"), "google-site-verification: google7bace5a38d37ffed.html");
});
