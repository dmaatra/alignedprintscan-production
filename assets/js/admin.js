const SUPABASE_URL = "https://sfsdniavqldgbiretply.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco";
const SITE_URL = window.location.origin;
const PRICING = window.ALIGNED_PRICING || {
  ron: {
    onlineServiceFee: 25,
    notarialAct: 10,
    providedWitness: 25,
  },
  mobile: {
    appointmentBase: 50,
    notarialAct: 10,
    providedWitness: 50,
    afterHours: {
      after7pm: 25,
      after9pm: 50,
    },
    travelTiers: {
      "0-15": 0,
      "16-20": 10,
      "21-25": 20,
      "26-30": 30,
      "31-40": 45,
    },
  },
  documentServices: {
    bwLetter: 0.25,
    bwLegal: 0.35,
    colorLetter: 0.5,
    colorLegal: 0.6,
    colorPaperAddOn: 0.15,
    cardstockAddOn: 0.4,
    scanPerPage: 1,
    pdfMerge: 5,
    courierBase: 20,
    mobileDocumentBase: 20,
    courierTiers: {
      "0-15": 20,
      "16-20": 30,
      "21-25": 40,
      "26-30": 50,
    },
  },
};
const adminClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => "$" + Number(n || 0).toFixed(2);
const refFromId = (id) =>
  id ? "APS-" + String(id).slice(0, 8).toUpperCase() : "APS-REQUEST";
const serviceLabel = (s) =>
  ({
    ron: "Remote Online Notary",
    mobile: "Mobile Notary",
    print: "Print & Scan",
  })[s] || "Service Request";
const statusLabel = (s) =>
  ({
    under_review: "Under Review",
    quote_ready: "Quote Ready",
    awaiting_approval: "Awaiting Approval",
    awaiting_payment: "Awaiting Payment",
    payment_received: "Payment Received",
    final_payment_received: "Final Payment Received",
    appointment_confirmed: "Appointment Confirmed",
    appointment_needs_rescheduling: "Appointment Needs Rescheduling",
    quote_expired: "Quote Expired",
    completed: "Completed",
    archived: "Archived",
    cancelled: "Cancelled",
    declined: "Declined",
    quote_sent: "Quote Sent",
    payment_pending: "Payment Pending",
    payment_submitted: "Payment Submitted",
    scheduled: "Scheduled",
    changes_requested: "Changes Requested",
    new: "New",
    in_progress: "In Progress",
    resolved: "Resolved",
    waiting_on_customer: "Waiting on Customer",
  })[s] ||
  String(s || "under_review")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

let requests = [];
let supportTickets = [];
let selectedRequest = null;
let realtimeChannel = null;
let supportChannel = null;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function inputVal(id) {
  return document.getElementById(id)?.value || "";
}

function numericVal(id) {
  return Number(inputVal(id) || 0) || 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[c],
  );
}

function showToast(message) {
  const toast = $("#newRequestToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 5200);
}

function playNewRequestSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.warn("Audio alert unavailable:", err);
  }
}
async function ensureAdminSession() {
  if (!adminClient) return null;
  const { data } = await adminClient.auth.getSession();
  return data.session;
}
async function handleLogin() {
  const form = $("#adminLoginForm");
  if (!form || !adminClient) return;
  const status = $("#adminLoginStatus");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status) status.textContent = "Signing in…";
    const email = form.email.value.trim();
    const password = form.password.value;
    const { error } = await adminClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (status) status.textContent = error.message;
      return;
    }
    window.location.href = "admin-dashboard.html";
  });
}

function serviceColor(service) {
  if (service === "ron") return "tag-ron";
  if (service === "mobile") return "tag-mobile";
  if (service === "print") return "tag-print";
  return "";
}

function requestUrgencyBadge(r) {
  if (r.is_same_day_request)
    return '<span class="status-pill urgent-pill">Same-Day Request</span>';
  if (r.is_next_day_request)
    return '<span class="status-pill nextday-pill">Next-Day Request</span>';
  if (!r.preferred_date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requested = new Date(r.preferred_date + "T12:00:00");
  requested.setHours(0, 0, 0, 0);
  const diffDays = Math.round((requested - today) / 86400000);
  if (diffDays === 0)
    return '<span class="status-pill urgent-pill">Same-Day Request</span>';
  if (diffDays === 1)
    return '<span class="status-pill nextday-pill">Next-Day Request</span>';
  return "";
}

function quoteBuilderPresets() {
  /**
   * Quick items are grouped by service so the invoice builder is easier to scan.
   * Prices come from the centralized configuration whenever possible.
   */
  return [
    {
      group: "Remote Online Notary",
      label: "Online Notarization Service Fee",
      quantity: 1,
      unitPrice: PRICING.ron.onlineServiceFee,
    },
    {
      group: "Remote Online Notary",
      label: "Remote Witness — Aligned Print & Scan Provided",
      quantity: 1,
      unitPrice: PRICING.ron.providedWitness,
    },
    {
      group: "Texas Notarial Acts",
      label: "Acknowledgment",
      quantity: 1,
      unitPrice: PRICING.ron.notarialAct,
    },
    {
      group: "Texas Notarial Acts",
      label: "Jurat",
      quantity: 1,
      unitPrice: PRICING.ron.notarialAct,
    },
    {
      group: "Texas Notarial Acts",
      label: "Oath or Affirmation",
      quantity: 1,
      unitPrice: PRICING.ron.notarialAct,
    },
    {
      group: "Texas Notarial Acts",
      label: "Certified Copy — When Authorized",
      quantity: 1,
      unitPrice: PRICING.ron.notarialAct,
    },
    {
      group: "Texas Notarial Acts",
      label: "Additional Notarial Act",
      quantity: 1,
      unitPrice: PRICING.ron.notarialAct,
    },
    {
      group: "Mobile Notary",
      label: "Mobile Appointment Base (0–15 round-trip miles)",
      quantity: 1,
      unitPrice: PRICING.mobile.appointmentBase,
    },
    {
      group: "Mobile Notary",
      label: "Extended Travel (16–20 round-trip miles)",
      quantity: 1,
      unitPrice: PRICING.mobile.travelTiers["16-20"],
    },
    {
      group: "Mobile Notary",
      label: "Extended Travel (21–25 round-trip miles)",
      quantity: 1,
      unitPrice: PRICING.mobile.travelTiers["21-25"],
    },
    {
      group: "Mobile Notary",
      label: "Extended Travel (26–30 round-trip miles)",
      quantity: 1,
      unitPrice: PRICING.mobile.travelTiers["26-30"],
    },
    {
      group: "Mobile Notary",
      label: "Extended Travel (31–40 round-trip miles)",
      quantity: 1,
      unitPrice: PRICING.mobile.travelTiers["31-40"],
    },
    {
      group: "Mobile Notary",
      label: "Mobile Witness — Aligned Print & Scan Provided",
      quantity: 1,
      unitPrice: PRICING.mobile.providedWitness,
    },
    {
      group: "Mobile Notary",
      label: "After-Hours Service — After 7:00 PM",
      quantity: 1,
      unitPrice: PRICING.mobile.afterHours.after7pm,
    },
    {
      group: "Mobile Notary",
      label: "Late-Night Service — After 9:00 PM",
      quantity: 1,
      unitPrice: PRICING.mobile.afterHours.after9pm,
    },
    {
      group: "Print & Scan",
      label: "Printing / Copies — B&W Letter",
      quantity: 1,
      unitPrice: PRICING.documentServices.bwLetter,
    },
    {
      group: "Print & Scan",
      label: "Printing / Copies — B&W Legal",
      quantity: 1,
      unitPrice: PRICING.documentServices.bwLegal,
    },
    {
      group: "Print & Scan",
      label: "Printing / Copies — Color Letter",
      quantity: 1,
      unitPrice: PRICING.documentServices.colorLetter,
    },
    {
      group: "Print & Scan",
      label: "Printing / Copies — Color Legal",
      quantity: 1,
      unitPrice: PRICING.documentServices.colorLegal,
    },
    {
      group: "Print & Scan",
      label: "Scanning",
      quantity: 1,
      unitPrice: PRICING.documentServices.scanPerPage,
    },
    {
      group: "Print & Scan",
      label: "PDF Merge / Organization",
      quantity: 1,
      unitPrice: PRICING.documentServices.pdfMerge,
    },
    {
      group: "Print & Scan",
      label: "Color Paper Add-on",
      quantity: 1,
      unitPrice: PRICING.documentServices.colorPaperAddOn,
    },
    {
      group: "Print & Scan",
      label: "Cardstock Add-on",
      quantity: 1,
      unitPrice: PRICING.documentServices.cardstockAddOn,
    },
    {
      group: "Courier",
      label: "Courier Delivery Base (0–15 round-trip miles)",
      quantity: 1,
      unitPrice: PRICING.documentServices.courierBase,
    },
    {
      group: "Other",
      label: "Client-Provided Document Witness — Documentation Only",
      quantity: 1,
      unitPrice: 0,
    },
    {
      group: "Other",
      label: "Courtesy / Waived Fee",
      quantity: 1,
      unitPrice: 0,
    },
    {
      group: "Other",
      label: "Custom Line Item",
      quantity: 1,
      unitPrice: 0,
    },
  ];
}
function isArchived(r) {
  return !!r.archived_at;
}

function isOpenValueStatus(status) {
  return !["completed", "cancelled", "declined", "archived"].includes(
    status || "under_review",
  );
}

function displayValue(r) {
  return Number(r.quote_amount || r.estimated_total || 0);
}

function renderStats() {
  const active = requests.filter((r) => !isArchived(r));
  const newCount = active.filter(
    (r) => (r.status || "under_review") === "under_review",
  ).length;
  const openValue = active
    .filter((r) => isOpenValueStatus(r.status))
    .reduce((sum, r) => sum + displayValue(r), 0);
  setText("statNew", String(newCount));
  setText("statTotal", String(active.length));
  setText("statRevenue", money(openValue));
  setText(
    "statSelected",
    selectedRequest ? refFromId(selectedRequest.id) : "None",
  );
}

function filteredRequests() {
  const service = $("#requestFilter")?.value || "all";
  const status = $("#statusFilter")?.value || "all";
  const archive = $("#archiveFilter")?.value || "active";
  return requests.filter((r) => {
    const serviceOk = service === "all" || r.service_type === service;
    const statusOk =
      status === "all" || (r.status || "under_review") === status;
    const archiveOk =
      archive === "all" ||
      (archive === "active" ? !isArchived(r) : isArchived(r));
    return serviceOk && statusOk && archiveOk;
  });
}

function renderRequestList() {
  const list = $("#requestList");
  if (!list) return;
  const items = filteredRequests();
  if (!items.length) {
    list.innerHTML =
      '<div class="request-empty">No requests match this view.</div>';
    return;
  }
  list.innerHTML = items
    .map((r) => {
      const customer = Array.isArray(r.customers)
        ? r.customers[0]
        : r.customers;
      const name =
        `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() ||
        "Client";
      const created = r.created_at
        ? new Date(r.created_at).toLocaleString()
        : "";
      const selected = selectedRequest?.id === r.id ? "selected" : "";
      const archivedBadge = isArchived(r)
        ? '<span class="status-pill archived-pill">Archived</span>'
        : "";
      return `
      <button class="request-row ${selected}" data-id="${r.id}" type="button">
        <span class="request-ref">${refFromId(r.id)}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${created}</small>
        <span class="service-tag ${serviceColor(r.service_type)}">${serviceLabel(r.service_type)}</span>
        <span class="status-pill">${statusLabel(r.status)}</span>${requestUrgencyBadge(r)}${archivedBadge}
      </button>
    `;
    })
    .join("");
  $$(".request-row", list).forEach((btn) =>
    btn.addEventListener("click", () => selectRequest(btn.dataset.id)),
  );
}
async function getFiles(requestId) {
  const { data, error } = await adminClient
    .from("request_files")
    .select("id,file_name,file_path,file_type,file_size,created_at")
    .eq("service_request_id", requestId)
    .order("created_at", {
      ascending: false,
    });
  if (error) throw error;
  return data || [];
}
async function signedUrl(filePath) {
  const { data, error } = await adminClient.storage
    .from("service-request-files")
    .createSignedUrl(filePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}
async function getDetailRows(table, requestId) {
  const { data, error } = await adminClient
    .from(table)
    .select("*")
    .eq("service_request_id", requestId)
    .maybeSingle();
  if (error) return null;
  return data;
}
async function getInvoiceItems(requestId) {
  const { data, error } = await adminClient
    .from("invoice_items")
    .select("*")
    .eq("service_request_id", requestId)
    .is("invoice_id", null)
    .order("created_at", {
      ascending: true,
    });
  if (error) return [];
  return data || [];
}

function detailMap(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length)
    return '<p class="admin-muted">No service-specific details found for this request.</p>';
  const hidden = new Set([
    "id",
    "service_request_id",
    "created_at",
    "updated_at",
  ]);
  const labels = (key) =>
    String(key || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const cells = [];
  list.forEach((row) => {
    Object.entries(row || {}).forEach(([key, value]) => {
      if (
        hidden.has(key) ||
        value === null ||
        value === undefined ||
        value === ""
      )
        return;
      cells.push(
        `<div><span class="small-label">${escapeHtml(labels(key))}</span><strong>${escapeHtml(String(value))}</strong></div>`,
      );
    });
  });
  return cells.length
    ? `<div class="admin-detail-grid service-detail-map">${cells.join("")}</div>`
    : '<p class="admin-muted">No service-specific details found for this request.</p>';
}

async function getInvoices(requestId) {
  const { data, error } = await adminClient
    .from("invoices")
    .select("*")
    .eq("service_request_id", requestId)
    .order("created_at", {
      ascending: true,
    });
  if (error) {
    console.warn(error);
    return [];
  }
  return data || [];
}

function invoiceSummaryHtml(invoices = [], request = null, quoteItems = []) {
  const quoteTotal = quoteItems.reduce(
    (sum, item) =>
      sum +
      Number(
        item.line_total ||
          Number(item.quantity || 1) * Number(item.unit_price || 0) ||
          0,
      ),
    0,
  );
  const originalQuote =
    Number(
      request?.quote_amount || request?.estimated_total || quoteTotal || 0,
    ) || 0;
  const initial =
    invoices.find(
      (inv) =>
        String(inv.invoice_type || "").includes("initial") ||
        String(inv.invoice_number || "").endsWith("-01"),
    ) || null;
  const finals = invoices.filter(
    (inv) =>
      String(inv.invoice_type || "").includes("final") ||
      String(inv.invoice_number || "").endsWith("-02") ||
      String(inv.status || "").includes("final"),
  );

  const paidStatuses = new Set([
    "paid",
    "payment_received",
    "final_payment_received",
    "payment_submitted",
    "final_balance_payment_submitted",
  ]);
  const closedStatuses = new Set(["void", "cancelled"]);
  const initialStatus = String(initial?.status || "").toLowerCase();
  // Invoice payment display is derived from the invoice record itself.
  // Workflow status must never make an unpaid invoice appear paid.
  const initialPaid = paidStatuses.has(initialStatus);

  const initialAmount =
    Number(
      initial?.amount_due ||
        request?.initial_payment_amount ||
        originalQuote ||
        0,
    ) || 0;
  const paidInitial = initialPaid
    ? Number(initial?.amount_paid || initial?.paid_amount || initialAmount || 0)
    : 0;

  const paidFinal = finals
    .filter((inv) => paidStatuses.has(String(inv.status || "").toLowerCase()))
    .reduce(
      (sum, inv) =>
        sum + Number(inv.amount_paid || inv.paid_amount || inv.amount_due || 0),
      0,
    );

  const unpaidFinal = finals
    .filter(
      (inv) =>
        !paidStatuses.has(String(inv.status || "").toLowerCase()) &&
        !closedStatuses.has(String(inv.status || "").toLowerCase()),
    )
    .reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0);

  const paidToDate = invoices.length
    ? paidInitial + paidFinal
    : Number(request?.paid_amount || 0) || 0;

  const totalServiceValue =
    originalQuote +
    finals.reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0);
  const balanceDue = Math.max(0, totalServiceValue - paidToDate);

  const rows = [];
  if (initial || originalQuote) {
    const initialNumber =
      initial?.invoice_number ||
      (
        (request?.invoice_number ||
          refFromId(request?.id || "").replace("APS-", "INV-")) + "-01"
      ).replace("-01-01", "-01");
    rows.push(`<div class="invoice-summary-item clean-summary-item">
      <div><span class="small-label">Initial Payment</span><strong>${escapeHtml(initialNumber)}</strong></div>
      <div><span>${initialPaid ? "Paid" : "Due / Pending"}</span><strong>${money(initialAmount)}</strong></div>
      ${initial?.receipt_url || initial?.receipt_pdf_url || request?.receipt_url || request?.receipt_pdf_url ? `<a href="${escapeHtml(initial?.receipt_url || initial?.receipt_pdf_url || request?.receipt_url || request?.receipt_pdf_url)}" target="_blank" rel="noopener">View Receipt</a>` : ""}
    </div>`);
  }

  if (finals.length) {
    finals.forEach((inv) => {
      const invoiceIsPaid = paidStatuses.has(
        String(inv.status || "").toLowerCase(),
      );
      const status = invoiceIsPaid
        ? "Paid"
        : statusLabel(inv.status || "final_balance_due");
      const displayAmount = invoiceIsPaid
        ? Number(inv.amount_paid || inv.paid_amount || inv.amount_due || 0)
        : Number(inv.amount_due || 0);
      const receipt = inv.receipt_url || inv.receipt_pdf_url;
      rows.push(`<div class="invoice-summary-item clean-summary-item">
        <div><span class="small-label">Final Balance</span><strong>${escapeHtml(inv.invoice_number || "Final Balance")}</strong></div>
        <div><span>${escapeHtml(status)}</span><strong>${money(displayAmount)}</strong></div>
        ${receipt ? `<a href="${escapeHtml(receipt)}" target="_blank" rel="noopener">View Receipt</a>` : ""}
      </div>`);
    });
  } else {
    rows.push(
      '<div class="invoice-summary-item clean-summary-item muted-summary-item"><div><span class="small-label">Final Balance</span><strong>Not issued</strong></div><div><span>Only appears when a final balance invoice is issued.</span></div></div>',
    );
  }

  return `<div class="financial-summary-grid">
    <div><span class="small-label">Original Quote</span><strong>${money(originalQuote)}</strong></div>
    <div><span class="small-label">Total Service Value</span><strong>${money(totalServiceValue)}</strong></div>
    <div><span class="small-label">Paid to Date</span><strong>${money(paidToDate)}</strong></div>
    <div><span class="small-label">Balance Due</span><strong>${money(balanceDue)}</strong></div>
  </div>
  <div class="invoice-summary-list clean-invoice-summary">${rows.join("")}</div>`;
}

function workflowKind(service) {
  const s = String(service || "").toLowerCase();
  if (s === "ron" || s.includes("remote")) return "ron";
  if (s === "mobile" || s.includes("notary")) return "mobile";
  return "document";
}

function internalWorkflowGuide(request) {
  const kind = workflowKind(request?.service_type);
  const label =
    kind === "ron"
      ? "Remote Online Notary Workflow"
      : kind === "mobile"
        ? "Mobile Notary Workflow"
        : "Print & Scan Workflow";
  const steps = {
    ron: [
      ["under_review", "Request Submitted"],
      ["awaiting_approval", "Quote Prepared"],
      ["payment_received", "Payment Received"],
      ["appointment_confirmed", "Appointment Confirmed"],
      ["identity_verification", "Identity Verification"],
      ["ron_session", "RON Session"],
      ["completed", "Completed"],
      ["review", "Review Requested"],
    ],
    mobile: [
      ["under_review", "Request Submitted"],
      ["awaiting_approval", "Quote Prepared"],
      ["payment_received", "Payment Received"],
      ["appointment_confirmed", "Appointment Confirmed"],
      ["mobile_visit", "Mobile Visit Completed"],
      ["final_balance_due", "Final Balance Due"],
      ["final_payment_received", "Final Payment Received"],
      ["completed", "Completed"],
    ],
    document: [
      ["under_review", "Request Submitted"],
      ["awaiting_approval", "Quote Prepared"],
      ["approved", "Quote Approved"],
      ["payment_received", "Production Payment Received"],
      ["appointment_confirmed", "Fulfillment Scheduled"],
      ["final_balance_due", "Final Balance Due"],
      ["final_payment_received", "Final Payment Received"],
      ["completed", "Service Completed"],
    ],
  }[kind];
  const aliases = {
    quote_ready: "awaiting_approval",
    quote_sent: "awaiting_approval",
    awaiting_payment: "approved",
    payment_pending: "approved",
    payment_submitted: "payment_received",
    paid_confirmed: "payment_received",
    scheduled: "appointment_confirmed",
    scheduling: "payment_received",
    final_balance_payment_submitted: "final_payment_received",
  };
  const current = aliases[request?.status] || request?.status || "under_review";
  let index = steps.findIndex((s) => s[0] === current);
  if (
    index < 0 &&
    ["identity_verification", "ron_session", "mobile_visit", "review"].includes(
      current,
    )
  )
    index = steps.findIndex((s) => s[0] === current);
  if (index < 0) index = 0;
  const next =
    steps[Math.min(index + 1, steps.length - 1)]?.[1] ||
    steps[index]?.[1] ||
    "Review request";
  return `<div class="admin-detail-section internal-workflow-card premium-workflow-card">
    <div class="section-title-row"><div><h3>Internal Workflow Guide</h3><p class="admin-muted">${label} · Current step highlighted for internal review.</p></div></div>
    <div class="internal-workflow-steps clean-workflow-steps compact-workflow-steps">
      ${steps.map((step, i) => `<div class="internal-workflow-step ${i < index ? "done" : ""} ${i === index ? "current" : ""}"><span>${String(i + 1).padStart(2, "0")}</span><strong>${escapeHtml(step[1])}</strong></div>`).join("")}
    </div>
    <div class="next-action-card"><span class="small-label">Next recommended action</span><strong>${escapeHtml(next)}</strong></div>
  </div>`;
}

function invoiceRowsFromDom() {
  return $$(".invoice-row").map((row) => {
    const description =
      row.querySelector('[data-field="description"]')?.value?.trim() ||
      "Service fee";
    const quantity =
      Number(row.querySelector('[data-field="quantity"]')?.value || 1) || 1;
    const unit_price =
      Number(row.querySelector('[data-field="unit_price"]')?.value || 0) || 0;
    return {
      item_type: "service",
      description,
      quantity,
      unit_price,
      line_total: quantity * unit_price,
      taxable: false,
    };
  });
}

function renderInvoiceRows(rows) {
  const wrap = $("#invoiceRows");
  if (!wrap) return;

  wrap.innerHTML = rows
    .map((item, index) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price || 0);
      const lineTotal = quantity * unitPrice;

      return `
        <div class="invoice-row" data-row-index="${index}">
          <label class="invoice-field invoice-field--description">
            <span>Service / item</span>
            <input
              data-field="description"
              type="text"
              value="${escapeHtml(item.description || "")}"
              placeholder="Service or item description"
            />
          </label>

          <label class="invoice-field invoice-field--quantity">
            <span>Qty</span>
            <input
              data-field="quantity"
              type="number"
              min="0"
              step="1"
              value="${quantity}"
            />
          </label>

          <label class="invoice-field invoice-field--rate">
            <span>Rate</span>
            <input
              data-field="unit_price"
              type="number"
              min="0"
              step="0.01"
              value="${unitPrice.toFixed(2)}"
            />
          </label>

          <div class="invoice-field invoice-field--total">
            <span>Amount</span>
            <output data-field="line_total">${money(lineTotal)}</output>
          </div>

          <button
            class="btn danger-ghost remove-invoice-row"
            type="button"
            aria-label="Remove this invoice line item"
          >
            Remove
          </button>
        </div>
      `;
    })
    .join("");

  $$(".invoice-row input", wrap).forEach((input) => {
    input.addEventListener("input", updateInvoiceTotalPreview);
  });

  $$(".remove-invoice-row", wrap).forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".invoice-row")?.remove();
      updateInvoiceTotalPreview();
    });
  });

  updateInvoiceTotalPreview();
}
function updateInvoiceTotalPreview() {
  const rows = $$(".invoice-row");
  let invoiceTotal = 0;

  rows.forEach((row) => {
    const quantity = Number(
      row.querySelector('[data-field="quantity"]')?.value || 0,
    );
    const unitPrice = Number(
      row.querySelector('[data-field="unit_price"]')?.value || 0,
    );
    const lineTotal = quantity * unitPrice;

    const output = row.querySelector('[data-field="line_total"]');
    if (output) output.textContent = money(lineTotal);

    invoiceTotal += lineTotal;
  });

  setText("invoiceTotalPreview", money(invoiceTotal));
}
function defaultInvoiceRows(request = {}) {
  const service = String(request.service_type || "").toLowerCase();
  const amount =
    Number(request.quote_amount || request.estimated_total || 0) || 0;
  if (amount > 0) {
    return [
      {
        description: serviceLabel(service),
        quantity: 1,
        unit_price: amount,
        line_total: amount,
      },
    ];
  }
  if (service === "ron")
    return [
      {
        description: "Online Notarization Service Fee",
        quantity: 1,
        unit_price: PRICING.ron.onlineServiceFee,
        line_total: PRICING.ron.onlineServiceFee,
      },
      {
        description: "Notarial Act",
        quantity: 1,
        unit_price: PRICING.ron.notarialAct,
        line_total: PRICING.ron.notarialAct,
      },
    ];
  if (service === "mobile")
    return [
      {
        description: "Mobile Appointment Base (0–15 miles)",
        quantity: 1,
        unit_price: 50,
        line_total: 50,
      },
    ];
  return [
    {
      description: "Print & Scan",
      quantity: 1,
      unit_price: 0,
      line_total: 0,
    },
  ];
}

async function selectRequest(id) {
  selectedRequest = requests.find((r) => r.id === id);
  renderStats();
  renderRequestList();
  if (!selectedRequest) return;

  // Keep the Admin Portal v3 header synchronized with the active request.
  window.AdminV3?.syncSelectedRequest(selectedRequest);
  const detail = $("#requestDetail");
  const ref = refFromId(selectedRequest.id);
  setText("detailRef", ref);
  detail.innerHTML = '<p class="admin-muted">Loading details…</p>';

  const customer = Array.isArray(selectedRequest.customers)
    ? selectedRequest.customers[0]
    : selectedRequest.customers;
  const table =
    selectedRequest.service_type === "ron"
      ? "ron_requests"
      : selectedRequest.service_type === "mobile"
        ? "mobile_notary_requests"
        : "print_scan_requests";
  const [files, serviceDetails, invoiceItems, invoices] = await Promise.all([
    getFiles(id),
    getDetailRows(table, id),
    getInvoiceItems(id),
    getInvoices(id),
  ]);
  const fileItems = await Promise.all(
    files.map(async (f) => {
      const url = await signedUrl(f.file_path);
      return `<li>${url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(f.file_name)}</a>` : escapeHtml(f.file_name)}<small>${f.file_type || "file"} · ${f.file_size ? Math.round(f.file_size / 1024) + " KB" : ""}</small></li>`;
    }),
  );
  const quoteLocked = [
    "payment_received",
    "appointment_confirmed",
    "final_balance_due",
    "final_payment_received",
    "completed",
  ].includes(String(selectedRequest.status || "").toLowerCase());
  const rows = quoteLocked
    ? []
    : invoiceItems.length
      ? invoiceItems
      : defaultInvoiceRows(selectedRequest);

  detail.innerHTML = `
    <div class="admin-detail-grid">
      <div><span class="small-label">Client</span><h3>${escapeHtml(customer?.first_name || "")} ${escapeHtml(customer?.last_name || "")}</h3><p>${escapeHtml(customer?.email || "")}<br>${escapeHtml(customer?.phone || "")}<br><strong>Prefers:</strong> ${escapeHtml(customer?.preferred_contact || "Not provided")}</p></div>
      <div><span class="small-label">Service</span><h3>${serviceLabel(selectedRequest.service_type)}</h3><p>${selectedRequest.preferred_date || "No preferred date"} · ${selectedRequest.preferred_time_window || "No time selected"}</p></div>
      <div><span class="small-label">Current Status</span><h3>${statusLabel(selectedRequest.status)}</h3><p>${isArchived(selectedRequest) ? "Archived" : "Active request"}</p></div>
      <div><span class="small-label">Page Count</span><h3>${selectedRequest.detected_pdf_page_count || "—"}</h3><p>Detected PDF pages when available</p></div>
    </div>

    ${internalWorkflowGuide(selectedRequest)}

    <div class="admin-detail-section invoice-builder-card">
      <h3>Full Service Quote Builder</h3>
      <p class="admin-muted">Build the full estimated service quote here. Saving the quote updates the customer-facing quote; status buttons control when emails are sent.</p>
      <div class="invoice-preset-row"><select id="invoicePresetSelect"><option value="">Add common line item…</option></select><button id="addPresetInvoiceRow" class="btn dark" type="button">Add Selected</button></div><div id="invoiceRows" class="invoice-rows"></div>
      <div class="invoice-total-line"><strong>Invoice Total</strong><span id="invoiceTotalPreview">$0.00</span></div>
      <label>Invoice / client note</label>
      <textarea id="invoiceNote" placeholder="Premium client-facing note, preparation instructions, appointment readiness, or quote terms…">${escapeHtml(selectedRequest.quote_notes || selectedRequest.customer_message || "")}</textarea>
      <div class="dashboard-action-groups">
        <div class="dashboard-action-group"><span class="small-label">Quote Actions</span><div class="status-actions invoice-actions"><button id="addInvoiceRow" class="btn dark" type="button">Add Line Item</button><button id="saveInvoiceBtn" class="btn primary" type="button">Save Quote</button><button id="openStatusPageBtn" class="btn dark" type="button">Open Client Status Page</button></div></div>
        <div class="dashboard-action-group"><span class="small-label">Payment Actions</span><div class="status-actions invoice-actions"><button id="createAdditionalInvoiceBtn" class="btn dark" type="button">Issue Final Balance Invoice</button></div></div>
      </div>
      <p class="admin-muted small-admin-note">Save the quote first. Then use Status Update to send Quote Ready or move the request forward.</p>
    </div>

    <div class="admin-detail-section invoice-summary-card">
      <h3>Invoice Payment Summary</h3>
      <p class="admin-muted">Track the full quote value, paid-to-date amount, initial payment, and final balance here.</p>
      ${invoiceSummaryHtml(invoices, selectedRequest, invoiceItems)}
    </div>

    <div class="admin-detail-section appointment-editor-card">
      <h3>Appointment / Fulfillment Details</h3>
      <p class="admin-muted">Update these before marking the appointment confirmed. These details appear on the customer's status page and in the appointment confirmation email.</p>
      <div class="admin-detail-grid appointment-fields">
        <label>Appointment Date<input id="appointmentDate" type="date" value="${escapeHtml(selectedRequest.appointment_date || selectedRequest.preferred_date || "")}"></label>
        <label>Appointment Time<input id="appointmentTime" type="text" placeholder="Example: 6:30 PM CST" value="${escapeHtml(selectedRequest.appointment_time || selectedRequest.preferred_time_window || "")}"></label>
        <label>Platform / Method<input id="appointmentPlatform" type="text" placeholder="Mobile document service, courier delivery, Proof, BlueNotary" value="${escapeHtml(selectedRequest.appointment_platform || "")}"></label>
      </div>
      <label>Service Address / Delivery Address</label>
      <input id="appointmentLocation" type="text" placeholder="Mobile service address, delivery address, or meeting location" value="${escapeHtml(selectedRequest.appointment_location || "")}">
      <label>Secure Session Link / Optional URL</label>
      <input id="appointmentLink" type="text" placeholder="RON session URL, meeting link, or tracking/support link" value="${escapeHtml(selectedRequest.appointment_link || selectedRequest.ron_session_url || "")}">
      <label>Appointment Instructions</label>
      <textarea id="appointmentInstructions" placeholder="ID requirements, parking notes, RON prep, upload instructions, etc.">${escapeHtml(selectedRequest.appointment_instructions || "")}</textarea>
      <label>Due at Appointment / Additional Onsite Fees</label>
      <input id="balanceDueAtAppointment" type="number" min="0" step="0.01" value="${Number(selectedRequest.balance_due_at_appointment || 0).toFixed(2)}">
      <label>Onsite / Additional Line Item Note</label>
      <textarea id="appointmentLineItemsNote" placeholder="Example: Additional notarizations, extra prints, witnesses, scanning, travel overage, etc.">${escapeHtml(selectedRequest.appointment_line_items_note || "")}</textarea>
      <div class="status-actions invoice-actions">
        <button id="saveAppointmentBtn" class="btn primary" type="button">Save Appointment Details</button>
      </div>
    </div>

    <div class="admin-detail-section">
      <h3>Service Details</h3>${detailMap(serviceDetails)}
    </div>

    <div class="admin-detail-section">
      <h3>Uploaded Files</h3>
      ${fileItems.length ? `<ul class="admin-file-list">${fileItems.join("")}</ul>` : '<p class="admin-muted">No files uploaded with this request.</p>'}
    </div>

    <div class="admin-detail-section">
      <h3>Status Update</h3>
      <div class="status-actions">
        <button data-status="under_review" class="btn dark" type="button">Under Review</button>
        <button data-status="quote_ready" class="btn dark" type="button">Quote Ready</button>
        <button data-status="awaiting_approval" class="btn dark" type="button">Awaiting Approval</button>
        <button data-status="awaiting_payment" class="btn dark" type="button">Awaiting Payment</button>
        <button data-status="payment_received" class="btn dark" type="button">Payment Received</button>
        <button data-status="final_payment_received" class="btn dark" type="button">Final Payment Received</button>
        <button data-status="appointment_confirmed" class="btn dark" type="button">Appointment Confirmed</button>
        <button data-status="appointment_needs_rescheduling" class="btn dark" type="button">Needs Rescheduling</button>
        <button data-status="quote_expired" class="btn dark" type="button">Quote Expired</button>
        <button data-status="completed" class="btn dark" type="button">Completed</button>
      </div>
      <textarea id="adminStatusNote" placeholder="Internal note or client-facing update draft…"></textarea>
      <div class="status-actions archive-actions">
        <button id="archiveRequestBtn" class="btn dark" type="button">${isArchived(selectedRequest) ? "Restore Request" : "Archive Request"}</button>
      </div>
      <p class="admin-muted small-admin-note">Archiving hides the request from the active dashboard. It does not delete client files, invoice items, or history.</p>
    </div>
  `;
  renderInvoiceRows(rows);
  $$(".status-actions button[data-status]", detail).forEach((btn) =>
    btn.addEventListener("click", () =>
      updateRequestStatus(btn.dataset.status),
    ),
  );
  populateInvoicePresetSelect();
  $("#addInvoiceRow")?.addEventListener("click", () => {
    const current = invoiceRowsFromDom();
    current.push({
      description: "",
      quantity: 1,
      unit_price: 0,
      line_total: 0,
    });
    renderInvoiceRows(current);
    populateInvoicePresetSelect();
  });
  $("#addPresetInvoiceRow")?.addEventListener("click", () =>
    addSelectedPresetInvoiceRow(),
  );
  $("#saveInvoiceBtn")?.addEventListener("click", saveInvoice);
  $("#createAdditionalInvoiceBtn")?.addEventListener(
    "click",
    createAdditionalInvoice,
  );
  $("#saveAppointmentBtn")?.addEventListener("click", saveAppointmentDetails);
  $("#openStatusPageBtn")?.addEventListener("click", () =>
    window.open(
      `success.html?request_id=${selectedRequest.id}&ref=${encodeURIComponent(ref)}`,
      "_blank",
    ),
  );
  $("#archiveRequestBtn")?.addEventListener("click", toggleArchiveRequest);

  // Convert the newly rendered long detail view into the v3 tab workspace.
  window.AdminV3?.organizeRequestDetail();
}

async function saveAppointmentDetails() {
  // APPOINTMENT DETAILS
  // The dashboard shows the customer's requested date/time as a starting point.
  // Blank fields should NOT wipe existing database values.
  if (!selectedRequest) return;

  const dateValue =
    $("#appointmentDate")?.value ||
    selectedRequest.appointment_date ||
    selectedRequest.preferred_date ||
    null;
  const timeValue =
    $("#appointmentTime")?.value ||
    selectedRequest.appointment_time ||
    selectedRequest.preferred_time_window ||
    null;
  const platformValue =
    $("#appointmentPlatform")?.value ||
    selectedRequest.appointment_platform ||
    null;
  const locationValue =
    $("#appointmentLocation")?.value ||
    selectedRequest.appointment_location ||
    null;
  const linkValue =
    $("#appointmentLink")?.value ||
    selectedRequest.appointment_link ||
    selectedRequest.ron_session_url ||
    null;
  const instructionsValue =
    $("#appointmentInstructions")?.value ||
    selectedRequest.appointment_instructions ||
    null;
  const lineNoteValue =
    $("#appointmentLineItemsNote")?.value ||
    selectedRequest.appointment_line_items_note ||
    null;
  const balanceValue = $("#balanceDueAtAppointment")?.value;

  const update = {
    appointment_date: dateValue,
    appointment_time: timeValue,
    appointment_platform: platformValue,
    appointment_location: locationValue,
    appointment_link: linkValue,
    appointment_instructions: instructionsValue,
    balance_due_at_appointment:
      balanceValue === ""
        ? Number(selectedRequest.balance_due_at_appointment || 0)
        : Number(balanceValue || 0) || 0,
    appointment_line_items_note: lineNoteValue,
    ron_session_url: linkValue || selectedRequest.ron_session_url || null,
  };

  const { error } = await adminClient
    .from("service_requests")
    .update(update)
    .eq("id", selectedRequest.id);

  if (error) {
    alert(error.message);
    return false;
  }

  await adminClient.from("request_status_updates").insert({
    service_request_id: selectedRequest.id,
    status: selectedRequest.status || "under_review",
    message: "Appointment/fulfillment details updated by admin.",
    sent_email: false,
    sent_sms: false,
  });

  Object.assign(selectedRequest, update);
  showToast("Appointment details saved.");
  return true;
}

/**
 * Opens a lightweight payment recorder for offline or simulated test payments.
 * Status buttons never force a balance to zero without a payment record.
 */
function promptForPaymentRecord(paymentStage) {
  const defaultAmount = Number(
    selectedRequest?.balance_due_at_appointment ||
      selectedRequest?.quote_amount ||
      selectedRequest?.estimated_total ||
      0,
  );

  const amountText = window.prompt(
    "Payment amount received:",
    defaultAmount.toFixed(2),
  );

  if (amountText === null) return null;

  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a payment amount greater than $0.00.");
    return null;
  }

  const method = window.prompt(
    "Payment method (test, cash, check, Zelle, external, or other):",
    "test",
  );

  if (method === null) return null;

  const note = window.prompt(
    "Payment reference or internal note:",
    paymentStage === "final"
      ? "Simulated final payment test"
      : "Simulated initial payment test",
  );

  return {
    amount,
    method: method.trim() || "test",
    note: note?.trim() || "",
    payment_stage: paymentStage,
    is_test: method.trim().toLowerCase() === "test",
  };
}

/**
 * Returns the active Supabase Auth session for protected admin actions.
 *
 * The dashboard login already uses email/password Supabase Auth. Protected
 * Edge Functions still need the resulting access token sent explicitly so
 * the function gateway can verify the administrator request.
 */
async function requireAdminSession() {
  const {
    data: { session },
    error,
  } = await adminClient.auth.getSession();

  if (error) {
    throw new Error(
      `Unable to verify the administrator session: ${error.message}`,
    );
  }

  if (!session?.access_token) {
    throw new Error(
      "Your administrator session is missing or expired. Sign out and sign " +
        "back in before recording a payment.",
    );
  }

  return session;
}

/**
 * Extracts the safe response message returned by a Supabase Edge Function.
 */
async function getFunctionErrorMessage(error) {
  const response = error?.context;

  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      return payload?.error || payload?.message || error.message;
    } catch {
      try {
        return (await response.clone().text()) || error.message;
      } catch {
        // Fall through to the standard error message.
      }
    }
  }

  return error?.message || "The payment could not be recorded.";
}

/**
 * Records a simulated or offline payment against the correct invoice.
 *
 * Test payments bypass Stripe but still create the same linked payment and
 * invoice updates needed to validate Invoice #1 and Invoice #2 behavior.
 */
async function recordAdminPayment(paymentStage) {
  if (!selectedRequest) return false;

  const payment = promptForPaymentRecord(paymentStage);
  if (!payment) return false;

  try {
    const session = await requireAdminSession();

    const { data, error } = await adminClient.functions.invoke(
      "record-admin-payment",
      {
        body: {
          request_id: selectedRequest.id,
          ...payment,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (error) {
      const message = await getFunctionErrorMessage(error);
      throw new Error(message);
    }

    if (data?.ok === false) {
      throw new Error(data.error || "Payment record was not created.");
    }

    showToast(
      payment.is_test
        ? "Test payment recorded. No real money was charged."
        : "Offline payment recorded.",
    );

    await refreshSelectedRequest(selectedRequest.id);
    return true;
  } catch (error) {
    console.error("Payment recording failed:", error);

    alert(
      "Payment recording failed: " +
        (error?.message || "The payment could not be recorded."),
    );

    return false;
  }
}

async function refreshSelectedRequest(requestId) {
  await loadRequests();
  await selectRequest(requestId);
}

async function updateRequestStatus(status) {
  // STATUS UPDATE + EMAILS
  // Uses the deployed Edge Function so status, history, customer email,
  // admin email, and success page movement stay in sync.
  if (!selectedRequest) return;

  // Completion is blocked while an invoice still has a remaining balance.
  // Administrators should record payment, waive the charge, or void the
  // invoice explicitly rather than allowing a status click to erase debt.
  if (status === "completed") {
    const invoices = await getInvoices(selectedRequest.id);
    const paidStatuses = new Set([
      "paid",
      "payment_received",
      "final_payment_received",
      "void",
      "cancelled",
    ]);
    const openBalance = invoices.reduce((total, invoice) => {
      const invoiceStatus = String(invoice.status || "").toLowerCase();
      if (paidStatuses.has(invoiceStatus)) return total;

      const due = Number(invoice.amount_due || 0);
      const paid = Number(invoice.amount_paid || invoice.paid_amount || 0);
      return total + Math.max(0, due - paid);
    }, 0);

    if (openBalance > 0) {
      alert(
        `This request has an outstanding invoice balance of ${money(openBalance)}. ` +
          "Record payment or resolve the invoice before completing it.",
      );
      window.AdminV3?.activateTab("payments");
      return;
    }
  }

  const note = $("#adminStatusNote")?.value || "";

  if (status === "payment_received") {
    const recorded = await recordAdminPayment("initial");
    if (!recorded) return;
  }

  if (status === "final_payment_received") {
    const recorded = await recordAdminPayment("final");
    if (!recorded) return;
  }

  if (status === "appointment_confirmed") {
    const saved = await saveAppointmentDetails();
    if (saved === false) return;
  }

  const appointmentPayload = {
    appointment_date:
      $("#appointmentDate")?.value ||
      selectedRequest.appointment_date ||
      selectedRequest.preferred_date ||
      null,
    appointment_time:
      $("#appointmentTime")?.value ||
      selectedRequest.appointment_time ||
      selectedRequest.preferred_time_window ||
      null,
    appointment_platform:
      $("#appointmentPlatform")?.value ||
      selectedRequest.appointment_platform ||
      null,
    appointment_location:
      $("#appointmentLocation")?.value ||
      selectedRequest.appointment_location ||
      null,
    appointment_link:
      $("#appointmentLink")?.value ||
      selectedRequest.appointment_link ||
      selectedRequest.ron_session_url ||
      null,
    appointment_instructions:
      $("#appointmentInstructions")?.value ||
      selectedRequest.appointment_instructions ||
      null,
    balance_due_at_appointment:
      $("#balanceDueAtAppointment")?.value ||
      selectedRequest.balance_due_at_appointment ||
      0,
    appointment_line_items_note:
      $("#appointmentLineItemsNote")?.value ||
      selectedRequest.appointment_line_items_note ||
      null,
  };

  try {
    const { data, error } = await adminClient.functions.invoke(
      "update-request-status",
      {
        body: {
          request_id: selectedRequest.id,
          status,
          note,
          paid_amount: null,
          appointment: appointmentPayload,
        },
      },
    );

    if (error) throw error;
    if (data && data.ok === false)
      throw new Error(data.error || "Status update failed.");
  } catch (err) {
    console.error(err);
    alert(
      "Status update failed. Confirm update-request-status is deployed and all SQL migrations are run.",
    );
    return;
  }

  Object.assign(selectedRequest, {
    status,
    ...appointmentPayload,
  });
  if (status === "payment_received") {
    selectedRequest.payment_status = "paid";
    selectedRequest.paid_at = new Date().toISOString();
  }
  if (status === "appointment_confirmed") {
    selectedRequest.appointment_confirmed_at = new Date().toISOString();
  }

  await refreshSelectedRequest(selectedRequest.id);
  showToast(`Status updated and emails queued: ${statusLabel(status)}`);
}

function populateInvoicePresetSelect() {
  const select = $("#invoicePresetSelect");
  if (!select || select.dataset.loaded === "true") return;

  const presets = quoteBuilderPresets();
  const groups = [...new Set(presets.map((preset) => preset.group))];

  groups.forEach((groupName) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = groupName;

    presets.forEach((preset, index) => {
      if (preset.group !== groupName) return;

      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${preset.label} — ${money(preset.unitPrice)}`;
      optgroup.appendChild(option);
    });

    select.appendChild(optgroup);
  });

  select.dataset.loaded = "true";
}

function addSelectedPresetInvoiceRow() {
  const select = $("#invoicePresetSelect");
  if (!select || select.value === "") return;

  const preset = quoteBuilderPresets()[Number(select.value)];
  const currentRows = invoiceRowsFromDom();

  currentRows.push({
    description: preset.label,
    quantity: preset.quantity,
    unit_price: preset.unitPrice,
    line_total: preset.quantity * preset.unitPrice,
  });

  renderInvoiceRows(currentRows);
  populateInvoicePresetSelect();
  select.value = "";
}
async function createAdditionalInvoice() {
  if (!selectedRequest) return;
  if (window.__alignedIssuingFinalInvoice) return;

  const items = invoiceRowsFromDom().filter(
    (item) => item.description || Number(item.unit_price || 0) > 0,
  );
  const total = items.reduce((sum, item) => sum + item.line_total, 0);
  if (total <= 0) {
    alert(
      "Add at least one final-balance line item before issuing the invoice.",
    );
    return;
  }

  const note =
    $("#invoiceNote")?.value ||
    "Final balance invoice for additional on-site or fulfillment services.";
  const btn = $("#createAdditionalInvoiceBtn");
  window.__alignedIssuingFinalInvoice = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Issuing…";
  }

  try {
    const { data, error } = await adminClient.functions.invoke(
      "create-additional-invoice",
      {
        body: {
          request_id: selectedRequest.id,
          note,
          items,
        },
      },
    );
    if (error) throw error;
    if (data && data.ok === false)
      throw new Error(data.error || "Final balance invoice was not created.");

    showToast("Final balance invoice issued and customer email sent.");
    await loadRequests();
    await selectRequest(selectedRequest.id);
  } catch (err) {
    console.error(err);
    alert(
      "Final balance invoice failed. Confirm create-additional-invoice is deployed and the invoice SQL migration has been run.",
    );
  } finally {
    window.__alignedIssuingFinalInvoice = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Issue Final Balance Invoice";
    }
  }
}

async function saveInvoice() {
  if (!selectedRequest) return;

  // A paid or submitted initial invoice is immutable. Later charges must be
  // issued through the separate Final Balance Invoice workflow.
  const lockedPaymentStatuses = [
    "submitted",
    "paid",
    "payment_received",
    "final_payment_received",
  ];
  const initialInvoiceLocked =
    lockedPaymentStatuses.includes(
      String(selectedRequest.payment_status || "").toLowerCase(),
    ) || Number(selectedRequest.paid_amount || 0) > 0;

  if (initialInvoiceLocked) {
    alert(
      "Invoice #1 is locked because payment activity has been recorded. " +
        "Use “Issue Final Balance Invoice” for additional charges.",
    );
    return false;
  }

  const items = invoiceRowsFromDom();
  const total = items.reduce((sum, item) => sum + item.line_total, 0);
  const invoiceNumber =
    selectedRequest.invoice_number ||
    refFromId(selectedRequest.id).replace("APS-", "INV-");
  const note = $("#invoiceNote")?.value || "";
  const update = {
    // Keep the full quote and initial payment explicit. These values are not
    // reused for Invoice #2 or later invoices.
    quote_amount: total,
    full_quote_amount: total,
    initial_payment_amount: total,
    quote_notes: note,
    customer_message: note,
    invoice_number: invoiceNumber,
    invoice_status: "draft",
    payment_status: selectedRequest.payment_status || "unpaid",
  };
  const { error: updateError } = await adminClient
    .from("service_requests")
    .update(update)
    .eq("id", selectedRequest.id);
  if (updateError) {
    alert(updateError.message);
    return false;
  }
  // Only replace the initial quote rows. Final-balance invoice items have an
  // invoice_id and must never be deleted when Invoice #1 is edited.
  await adminClient
    .from("invoice_items")
    .delete()
    .eq("service_request_id", selectedRequest.id)
    .is("invoice_id", null);
  const rows = items.map((item) => ({
    ...item,
    service_request_id: selectedRequest.id,
    invoice_id: null,
  }));
  if (rows.length) {
    const { error: itemError } = await adminClient
      .from("invoice_items")
      .insert(rows);
    if (itemError) {
      alert(itemError.message);
      return;
    }
  }
  Object.assign(selectedRequest, update);
  await adminClient.from("request_status_updates").insert({
    service_request_id: selectedRequest.id,
    status: selectedRequest.status || "under_review",
    message: "Quote saved by admin. No customer email sent.",
    sent_email: false,
    sent_sms: false,
  });
  renderStats();
  renderRequestList();
  showToast(
    "Quote saved. Use the Quote Ready status button when you are ready to notify the customer.",
  );
  return true;
}
async function sendInvoiceEmail() {
  if (!selectedRequest) return;
  const invoiceSaved = await saveInvoice();
  if (!invoiceSaved) return;

  const ref = refFromId(selectedRequest.id);
  const status = $("#invoiceNote");
  try {
    const { data, error } = await adminClient.functions.invoke(
      "send-invoice-email",
      {
        body: {
          request_id: selectedRequest.id,
          reference_number: ref,
        },
      },
    );
    if (error) throw error;
    await updateRequestStatus("awaiting_approval");
    showToast("Quote email requested through Resend.");
  } catch (err) {
    console.error(err);
    alert(
      "Invoice saved, but the email function did not complete yet. Deploy send-invoice-email and set RESEND_API_KEY.",
    );
  }
}
async function toggleArchiveRequest() {
  if (!selectedRequest) return;
  const archived = isArchived(selectedRequest);
  const update = {
    archived_at: archived ? null : new Date().toISOString(),
  };
  const { error } = await adminClient
    .from("service_requests")
    .update(update)
    .eq("id", selectedRequest.id);
  if (error) {
    alert(error.message);
    return;
  }
  Object.assign(selectedRequest, update);
  await adminClient.from("request_status_updates").insert({
    service_request_id: selectedRequest.id,
    status: archived ? selectedRequest.status || "under_review" : "archived",
    message: archived
      ? "Request restored to active dashboard."
      : "Request archived from active dashboard. Files retained.",
    sent_email: false,
    sent_sms: false,
  });
  renderStats();
  renderRequestList();
  await selectRequest(selectedRequest.id);
  showToast(
    archived
      ? "Request restored."
      : "Request archived. Files were not deleted.",
  );
}
async function loadRequests() {
  setText("adminLiveStatus", "Loading requests…");
  const { data, error } = await adminClient
    .from("service_requests")
    .select(
      "id,created_at,service_type,status,preferred_date,preferred_time_window,notes,estimated_total,archived_at,quote_amount,full_quote_amount,initial_payment_amount,paid_amount,quote_notes,invoice_number,invoice_url,receipt_url,receipt_pdf_url,payment_status,paid_at,appointment_confirmed_at,appointment_date,appointment_time,appointment_timezone,appointment_location,appointment_link,appointment_platform,appointment_instructions,balance_due_at_appointment,appointment_line_items_note,customer_message,review_link_google,review_link_yelp,prep_video_url,invoice_status,detected_pdf_page_count,is_same_day_request,is_next_day_request,quote_expires_at,customers(first_name,last_name,email,phone,preferred_contact)",
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(300);
  if (error) {
    setText("adminLiveStatus", `Could not load requests: ${error.message}`);
    $("#requestList").innerHTML =
      `<div class="request-empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  requests = data || [];
  if (selectedRequest)
    selectedRequest =
      requests.find((r) => r.id === selectedRequest.id) || selectedRequest;
  renderStats();
  renderRequestList();
  setText("adminLiveStatus", "Live and listening for new requests.");
}

function renderSupportTickets() {
  const list = $("#supportTicketList");
  if (!list) return;
  if (!supportTickets.length) {
    list.innerHTML = '<div class="request-empty">No support tickets yet.</div>';
    return;
  }
  list.innerHTML = supportTickets
    .map((t) => {
      const ref = t.reference_number || "GENERAL SUPPORT";
      const linked =
        ref !== "GENERAL SUPPORT"
          ? requests.find(
              (r) =>
                refFromId(r.id) === ref ||
                refFromId(r.id).toLowerCase() === String(ref).toLowerCase(),
            )
          : null;
      return `
    <div class="support-ticket-card ${t.urgency && t.urgency !== "standard" ? "urgent-ticket" : ""}">
      <div class="support-ticket-head"><span class="request-ref">${escapeHtml(ref)}</span><span class="status-pill">${statusLabel(t.status || "new")}</span></div>
      <h3>${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)}</h3>
      <p><strong>${escapeHtml(t.email)}</strong>${t.phone ? " · " + escapeHtml(t.phone) : ""}${t.preferred_contact_method ? " · Prefers " + escapeHtml(t.preferred_contact_method) : ""}${t.company ? "<br>" + escapeHtml(t.company) : ""}</p>
      <div class="support-ticket-meta">
        <span>${escapeHtml((t.issue_type || t.reason || "support").replaceAll("_", " "))}</span>
        <span>${escapeHtml((t.urgency || "standard").replaceAll("_", " "))}</span>
        ${linked ? `<span>${serviceLabel(linked.service_type)} · ${statusLabel(linked.status)}</span>` : ""}
      </div>
      ${linked ? `<div class="linked-request-mini"><strong>Linked Request</strong><p>${refFromId(linked.id)} · ${money(displayValue(linked))} · ${linked.preferred_date || "No date"} ${linked.preferred_time_window || ""}</p><button class="btn secondary open-linked-request" data-id="${linked.id}" type="button">Open Request</button></div>` : ""}
      <p>${escapeHtml(t.message)}</p>
      <label>Internal notes<textarea class="support-internal-note" data-id="${t.id}" placeholder="Private follow-up notes…">${escapeHtml(t.internal_notes || "")}</textarea></label>
      <div class="status-actions">
        <button class="btn dark support-status" data-id="${t.id}" data-status="in_progress" type="button">In Progress</button>
        <button class="btn dark support-status" data-id="${t.id}" data-status="waiting_on_customer" type="button">Waiting on Customer</button>
        <button class="btn dark support-status" data-id="${t.id}" data-status="resolved" type="button">Resolved</button>
        <button class="btn secondary support-save-note" data-id="${t.id}" type="button">Save Note</button>
        <button class="btn dark support-archive" data-id="${t.id}" type="button">Archive</button>
      </div>
      <small>${t.created_at ? new Date(t.created_at).toLocaleString() : ""}</small>
    </div>`;
    })
    .join("");
  $$(".support-status", list).forEach((btn) =>
    btn.addEventListener("click", () =>
      updateSupportTicket(btn.dataset.id, {
        status: btn.dataset.status,
      }),
    ),
  );
  $$(".support-save-note", list).forEach((btn) =>
    btn.addEventListener("click", () =>
      updateSupportTicket(btn.dataset.id, {
        internal_notes:
          $(`.support-internal-note[data-id="${btn.dataset.id}"]`)?.value || "",
      }),
    ),
  );
  $$(".support-archive", list).forEach((btn) =>
    btn.addEventListener("click", () =>
      updateSupportTicket(btn.dataset.id, {
        archived_at: new Date().toISOString(),
      }),
    ),
  );
  $$(".open-linked-request", list).forEach((btn) =>
    btn.addEventListener("click", () => selectRequest(btn.dataset.id)),
  );
}
async function updateSupportTicket(id, update) {
  const { error } = await adminClient
    .from("support_tickets")
    .update(update)
    .eq("id", id);
  if (error) {
    alert(error.message);
    return;
  }
  await loadSupportTickets();
  showToast("Support ticket updated.");
}
async function loadSupportTickets() {
  const list = $("#supportTicketList");
  if (!list) return;
  const { data, error } = await adminClient
    .from("support_tickets")
    .select("*")
    .is("archived_at", null)
    .order("created_at", {
      ascending: false,
    })
    .limit(100);
  if (error) {
    list.innerHTML = `<div class="request-empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  supportTickets = data || [];
  renderSupportTickets();
}

function subscribeRealtime() {
  if (realtimeChannel) adminClient.removeChannel(realtimeChannel);
  realtimeChannel = adminClient
    .channel("aligned-admin-requests")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_requests",
      },
      async () => {
        await loadRequests();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "service_requests",
      },
      async () => {
        playNewRequestSound();
        showToast("New request received. Dashboard refreshed.");
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED")
        setText("adminLiveStatus", "Live and listening for new requests.");
    });
  if (supportChannel) adminClient.removeChannel(supportChannel);
  supportChannel = adminClient
    .channel("aligned-support-tickets")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "support_tickets",
      },
      async () => {
        await loadSupportTickets();
      },
    )
    .subscribe();
}
async function initDashboard() {
  if (!$("#requestList")) return;
  if (!adminClient) return;
  const session = await ensureAdminSession();
  if (!session) {
    window.location.href = "admin-login.html";
    return;
  }
  setText("adminLiveStatus", `Signed in as ${session.user.email}`);
  $("#signOutBtn")?.addEventListener("click", async () => {
    await adminClient.auth.signOut();
    window.location.href = "admin-login.html";
  });
  $("#refreshRequests")?.addEventListener("click", loadRequests);
  $("#refreshSupport")?.addEventListener("click", loadSupportTickets);
  $("#requestFilter")?.addEventListener("change", renderRequestList);
  $("#statusFilter")?.addEventListener("change", renderRequestList);
  $("#archiveFilter")?.addEventListener("change", renderRequestList);
  await loadRequests();
  await loadSupportTickets();
  subscribeRealtime();
}
handleLogin();
initDashboard();

// Admin Portal v2 shell: keep planned navigation visibly disabled until its module is implemented.
document
  .querySelectorAll('.admin-nav [data-disabled="true"]')
  .forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });
