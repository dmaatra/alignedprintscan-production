import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicFiles = [
  ...fs.readdirSync(root).filter((name) => name.endsWith(".html")),
  ...fs.readdirSync(path.join(root, "resources"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `resources/${entry.name}/index.html`),
  "resources/index.html",
].filter((file) => fs.existsSync(path.join(root, file)));

const pageName = (file) => file.startsWith("resources/") ? "resources" : path.basename(file, ".html");
const prefixFor = (file) => file === "resources/index.html" ? "../" : file.startsWith("resources/") ? "../../" : "";
const current = (active, page) => active === page ? ' aria-current="page"' : "";

function header(prefix, active) {
  return `<header class="site-header"><div class="container nav"><a class="brand" href="${prefix}index.html"><img src="${prefix}assets/images/logo-symbol.webp" alt="Aligned Print &amp; Scan symbol logo" width="52" height="52"><span>Aligned Print &amp; Scan</span></a><button class="menu-btn" type="button" aria-label="Open menu" aria-controls="primary-navigation" aria-expanded="false"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button><nav class="nav-links" id="primary-navigation" aria-label="Primary navigation"><a href="${prefix}index.html"${current(active,"index")}>Home</a><span class="service-dropdown"><button type="button" aria-haspopup="true" aria-expanded="false">Services <span aria-hidden="true">▾</span></button><span class="service-dropdown-menu"><a href="${prefix}remote-online-notary.html"${current(active,"remote-online-notary")}>Remote Online Notary</a><a href="${prefix}mobile-notary.html"${current(active,"mobile-notary")}>Mobile Notary</a><a href="${prefix}print-scan.html"${current(active,"print-scan")}>Print &amp; Scan</a><a href="${prefix}loan-signing.html"${current(active,"loan-signing")}>Loan Signing</a><span class="service-dropdown-divider" aria-hidden="true"></span><span class="service-dropdown-label">For Businesses</span><a href="${prefix}business-accounts.html"${current(active,"business-accounts")}>Business Accounts</a></span></span><a href="${prefix}pricing.html"${current(active,"pricing")}>Pricing</a><a href="${prefix}resources/"${current(active,"resources")}>Resources</a><a href="${prefix}faq.html"${current(active,"faq")}>FAQs</a><a href="${prefix}pricing.html#request" class="nav-cta">Request Service</a></nav></div></header>`;
}

function footer(prefix) {
  return `<footer class="site-footer footer"><div class="container"><div class="footer-grid"><div><img class="footer-logo" src="${prefix}assets/images/logo-full.webp" alt="Aligned Print &amp; Scan full logo" width="148" height="148"><h3>Secure Document &amp; Notary Solutions</h3><p>Remote Online &amp; Mobile Notary Services<br>Professional Print, Scan &amp; Document Support</p></div><div><h4>Services</h4><a href="${prefix}remote-online-notary.html">Remote Online Notary</a><a href="${prefix}mobile-notary.html">Mobile Notary</a><a href="${prefix}print-scan.html">Print &amp; Scan</a><a href="${prefix}loan-signing.html">Loan Signing</a><a href="${prefix}pricing.html">Pricing</a><a href="${prefix}faq.html">FAQs</a><a href="${prefix}resources/">Resource Center</a></div><div><h4>Company</h4><a href="${prefix}index.html#about">About</a><a href="${prefix}pricing.html#request">Request Service</a><a href="${prefix}terms.html">Terms of Service</a><a href="${prefix}privacy.html">Privacy Policy</a><a href="${prefix}accessibility.html">Accessibility</a><a href="${prefix}support.html">Customer Support</a></div><div><h4>For Businesses</h4><a href="${prefix}business-accounts.html">Business Accounts</a><a href="${prefix}business-login.html" class="footer-business-login">Business Portal Sign In</a><a href="${prefix}loan-signing.html">Loan Signing Services</a></div><div><h4>Connect</h4><div class="socials"><a href="https://www.instagram.com/aligned.printscan" target="_blank" rel="noopener noreferrer" aria-label="Instagram">IG</a><a href="https://www.facebook.com/profile.php?id=61593146406891" target="_blank" rel="noopener noreferrer" aria-label="Aligned Print & Scan on Facebook">FB</a><a href="https://share.google/rBUN6hRZiTF5UZPwz" target="_blank" rel="noopener noreferrer" aria-label="Aligned Print & Scan on Google Business Profile (opens in a new tab)">GB</a><a href="https://www.youtube.com/@alignedprintscan" target="_blank" rel="noopener noreferrer" aria-label="YouTube">YT</a></div><a href="mailto:hello@alignedprintscan.com">hello@alignedprintscan.com</a><a href="tel:+14693838879">(469) 383-8879</a><p>Waxahachie, Texas</p></div></div><div class="footer-bottom">© 2026 Aligned Print &amp; Scan. All Rights Reserved.</div></div></footer>`;
}

let changed = 0;
for (const file of publicFiles) {
  const target = path.join(root, file);
  let html = fs.readFileSync(target, "utf8");
  if (!html.includes('<header class="site-header"') || !html.includes('<footer class="site-footer footer"')) continue;
  const prefix = prefixFor(file);
  const next = html
    .replace(/<header class="site-header">[\s\S]*?<\/header>/, header(prefix, pageName(file)))
    .replace(/<footer class="site-footer footer">[\s\S]*?<\/footer>/, footer(prefix))
    .replace(/(assets\/css\/styles\.css)(?:\?[^"']*)?/g, "$1?v=20260820-release-9-2-1")
    .replace(/(assets\/css\/resources\.css)(?:\?[^"']*)?/g, "$1?v=20260820-release-9-2-1")
    .replace(/(assets\/js\/script\.js)(?:\?[^"']*)?/g, "$1?v=20260820-release-9-2-1")
    .replace(/(assets\/js\/resources\.js)(?:\?[^"']*)?/g, "$1?v=20260820-release-9-2-1");
  if (next !== html) {
    fs.writeFileSync(target, next);
    changed += 1;
  }
}
console.log(`Synchronized ${changed} public page shells.`);
