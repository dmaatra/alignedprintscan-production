export const APS_BRAND = Object.freeze({
  companyName: "Aligned Print & Scan",
  legalName: "Aligned Print & Scan LLC",
  supportEmail: "hello@alignedprintscan.com",
  supportPhone: "(469) 383-8879",
  location: "Waxahachie, Texas",
  tagline: "Remote & Mobile Notary · Print, Scan & Document Support",
});

export function escapeEmail(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

export function recipientGreeting(person = {}) {
  const firstName = String(person.first_name || "").trim();
  const displayName = String(person.display_name || person.full_legal_name || "").trim();
  const trustworthy = firstName || displayName.split(/\s+/).filter(Boolean)[0] || "";
  return trustworthy ? `Hello ${escapeEmail(trustworthy)},` : "Hello,";
}

export function customerPortalUrl(siteUrl, requestId, tab = "overview") {
  const base = String(siteUrl || "https://alignedprintscan.com").replace(/\/$/, "");
  return `${base}/success.html?request_id=${encodeURIComponent(String(requestId || ""))}&tab=${encodeURIComponent(tab)}`;
}

export const CUSTOMER_ACTION_DESTINATIONS = Object.freeze({
  document: { label: "Upload Document", tab: "documents" },
  quote: { label: "Review Quote", tab: "quote-payment" },
  payment: { label: "Make Payment", tab: "quote-payment" },
  appointment: { label: "View Appointment", tab: "fulfillment" },
  deliverable: { label: "View Documents", tab: "documents" },
  message: { label: "View Message", tab: "messages" },
  overview: { label: "View My Request", tab: "overview" },
});

export function emailButton(url, label) {
  return `<p style="margin:24px 0 4px"><a href="${escapeEmail(url)}" style="display:inline-block;background:#c8a96b;color:#111522;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${escapeEmail(label)}</a></p>`;
}

export function emailPanel(rows = []) {
  const content = rows.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `<tr><td style="padding:8px 10px;color:#161c4d;font-weight:bold;vertical-align:top">${escapeEmail(label)}</td><td style="padding:8px 10px;overflow-wrap:anywhere">${escapeEmail(value)}</td></tr>`).join("");
  return content ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#fffaf2;border:1px solid #e7dcc5;border-radius:16px;margin:18px 0"><tbody>${content}</tbody></table>` : "";
}

export function renderCustomerEmailShell({ body = "", preheader = "", eyebrow = "APS Update", title = "Your Request Update", siteUrl = "https://alignedprintscan.com", logoUrl = "", supportEmail = "", supportPhone = "" } = {}) {
  const base = String(siteUrl).replace(/\/$/, "");
  const email = supportEmail || APS_BRAND.supportEmail;
  const phone = supportPhone || APS_BRAND.supportPhone;
  const logo = logoUrl || `${base}/assets/images/logo-full.webp`;
  return `<!doctype html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f3ee;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden">${escapeEmail(preheader)}</div><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f3ee;padding:24px 10px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e7dcc5"><tr><td style="padding:28px 24px 20px;text-align:center;border-bottom:4px solid #c8a96b"><img src="${escapeEmail(logo)}" alt="${APS_BRAND.companyName}" style="width:210px;max-width:75%;height:auto;margin:0 auto 12px;display:block"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#161c4d;font-weight:800">${APS_BRAND.tagline}</div></td></tr><tr><td style="padding:30px 26px"><p style="letter-spacing:.16em;text-transform:uppercase;color:#c8a96b;font-size:12px;font-weight:800;margin:0 0 8px">${escapeEmail(eyebrow)}</p><h1 style="font-family:Georgia,serif;color:#161c4d;margin:0 0 16px;font-size:30px;line-height:1.2">${escapeEmail(title)}</h1><div style="height:2px;width:64px;background:#c8a96b;margin:0 0 22px"></div>${body || ""}</td></tr><tr><td style="padding:24px 26px;background:#fffaf2;border-top:1px solid #e7dcc5;color:#5b5a61;font-size:14px"><strong style="color:#161c4d">Need assistance?</strong><br>Contact customer support and include your APS reference number.<br><br><a href="mailto:${escapeEmail(email)}" style="color:#161c4d;font-weight:bold">${escapeEmail(email)}</a><br>${escapeEmail(phone)}<br>${APS_BRAND.location}<br><br><a href="${escapeEmail(base)}/support.html" style="color:#a98235;font-weight:bold">Customer Support</a><div style="margin-top:18px;color:#8a8072">${APS_BRAND.legalName}</div></td></tr></table></td></tr></table></body></html>`;
}
