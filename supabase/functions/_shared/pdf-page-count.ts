import { PDFDocument } from "npm:pdf-lib@1.17.1";

export type PdfPageCount = {
  count: number | null;
  status: "detected" | "failed" | "not_pdf";
  error: string | null;
};

export function isPdf(name: unknown, mime: unknown) {
  return String(mime || "").toLowerCase() === "application/pdf" ||
    /\.pdf$/i.test(String(name || ""));
}

export async function detectPdfPageCount(
  raw: Uint8Array,
  name: unknown,
  mime: unknown,
): Promise<PdfPageCount> {
  if (!isPdf(name, mime)) return { count: null, status: "not_pdf", error: null };
  try {
    const pdf = await PDFDocument.load(raw, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const count = pdf.getPageCount();
    if (!Number.isInteger(count) || count < 1) throw new Error("PDF has no readable pages");
    return { count, status: "detected", error: null };
  } catch {
    return {
      count: null,
      status: "failed",
      error: "Automatic PDF page counting failed; administrator review is required.",
    };
  }
}
