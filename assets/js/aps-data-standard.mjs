/** Reusable APS normalization and display helpers. Legal names remain verbatim. */
export function collapseWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value) {
  return collapseWhitespace(value).toLowerCase();
}

export function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.replace(/[^\d+]/g, "");
}

export function formatPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : collapseWhitespace(value);
}

export function normalizeSearch(value) {
  return collapseWhitespace(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9@+]+/g, " ").trim();
}

export function professionalSimpleName(value) {
  const cleaned = collapseWhitespace(value);
  if (!/^[A-Za-z]+$/.test(cleaned) || !([cleaned.toLowerCase(), cleaned.toUpperCase()].includes(cleaned))) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function canonicalReference(id) {
  const raw = String(id ?? "").trim();
  if (/^aps-/i.test(raw)) return raw.toUpperCase();
  return `APS-${raw.slice(0, 8).toUpperCase()}`;
}

export function normalizeState(value) {
  return collapseWhitespace(value).toUpperCase();
}

export function normalizeZip(value) {
  const match = String(value ?? "").trim().match(/^(\d{5})(?:-?(\d{4}))?$/);
  return match ? `${match[1]}${match[2] ? `-${match[2]}` : ""}` : collapseWhitespace(value);
}

export function normalizePersonInput({ first_name, last_name, email, phone } = {}) {
  return {
    first_name: professionalSimpleName(first_name),
    last_name: professionalSimpleName(last_name),
    email: normalizeEmail(email),
    phone: normalizePhone(phone) || null,
  };
}
