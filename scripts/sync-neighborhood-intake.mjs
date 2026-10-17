import { readFileSync, writeFileSync } from "node:fs";
const standard = readFileSync(new URL("../pricing.html", import.meta.url), "utf8");
const target = new URL("../neighborhood.html", import.meta.url);
const page = readFileSync(target, "utf8");
const start = '<section class="section" id="request">';
const section = standard.slice(standard.indexOf(start), standard.indexOf("</main>")).trimEnd();
const first = page.indexOf(start), end = page.indexOf('<section class="section cream"><div class="container"><h2>Neighborhood eligibility', first);
if (first < 0 || end < 0) throw new Error("Shared intake boundaries missing");
writeFileSync(target, page.slice(0, first) + section + "\n" + page.slice(end));
