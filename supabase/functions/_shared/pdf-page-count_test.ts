import { assertEquals } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { detectPdfPageCount } from "./pdf-page-count.ts";

Deno.test("authoritative PDF parser counts a real multi-page PDF", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  document.addPage();
  const result = await detectPdfPageCount(await document.save(), "source.pdf", "application/pdf");
  assertEquals(result, { count: 3, status: "detected", error: null });
});

Deno.test("unreadable PDF is explicitly routed to administrator review", async () => {
  const result = await detectPdfPageCount(new TextEncoder().encode("not a pdf"), "source.pdf", "application/pdf");
  assertEquals(result.status, "failed");
  assertEquals(result.count, null);
});

Deno.test("non-PDF files do not participate in PDF totals", async () => {
  const result = await detectPdfPageCount(new Uint8Array([1, 2, 3]), "photo.jpg", "image/jpeg");
  assertEquals(result, { count: null, status: "not_pdf", error: null });
});
