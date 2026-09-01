import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const corePages = {
  "index.html": "https://alignedprintscan.com/",
  "mobile-notary.html": "https://alignedprintscan.com/mobile-notary.html",
  "remote-online-notary.html": "https://alignedprintscan.com/remote-online-notary.html",
  "loan-signing.html": "https://alignedprintscan.com/loan-signing.html",
  "print-scan.html": "https://alignedprintscan.com/print-scan.html",
};

test("core service metadata is distinct, branded, and geographically aligned", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const [file, canonical] of Object.entries(corePages)) {
    const html = read(file);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || "";
    const description = html.match(/<meta[^>]+(?:name="description"[^>]+content="([^"]+)"|content="([^"]+)"[^>]+name="description")[^>]*>/)?.slice(1).find(Boolean) || "";
    assert.match(title, /Aligned Print &(?:amp;)? Scan/, file);
    assert.ok(title.length <= 70, `${file}: title is concise`);
    assert.ok(description.length >= 100 && description.length <= 170, `${file}: description is human-readable`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), file);
    assert.equal(titles.has(title), false, `${file}: duplicate title`);
    assert.equal(descriptions.has(description), false, `${file}: duplicate description`);
    titles.add(title);
    descriptions.add(description);
  }
});

test("the sitemap includes every core canonical service and excludes the removed About route", () => {
  const sitemap = read("sitemap.xml");
  for (const canonical of Object.values(corePages)) {
    assert.match(sitemap, new RegExp(canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(sitemap, /about\.html/);
});

test("local physical services establish Waxahachie and Ellis County relevance", () => {
  for (const file of ["mobile-notary.html", "loan-signing.html", "print-scan.html"]) {
    const html = read(file);
    assert.match(html, /Waxahachie/i, file);
    assert.match(html, /Ellis County/i, file);
  }
});

test("RON preserves statewide service and legitimate local business context", () => {
  const html = read("remote-online-notary.html");
  assert.match(html, /Texas Remote Online Notary/);
  assert.match(html, /eligible customers remotely throughout Texas/);
  assert.match(html, /based in Waxahachie/);
  assert.match(html, /Ellis County/);
});

test("homepage structured data separates the public brand from the legal entity without exposing an address", () => {
  const html = read("index.html");
  const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || "";
  const schema = JSON.parse(source);
  assert.equal(schema.name, "Aligned Print & Scan");
  assert.equal(schema.legalName, "Aligned Print & Scan LLC");
  assert.deepEqual(schema.areaServed.map(({ name }) => name), ["Waxahachie, Texas", "Ellis County, Texas", "Texas"]);
  assert.equal("address" in schema, false);
});
