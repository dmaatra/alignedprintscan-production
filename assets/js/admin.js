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
      const searchIndex = [
        refFromId(r.id),
        r.id,
        name,
        customer?.email,
        customer?.phone,
        r.service_type,
        serviceLabel(r.service_type),
        r.status,
        r.workflow_status,
        statusLabel(r.workflow_status || r.status),
        r.invoice_number,
        ...(r.search_invoice_numbers || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return `
      <button class="request-row ${selected}" data-id="${r.id}" data-reference="${escapeHtml(refFromId(r.id))}" data-customer-name="${escapeHtml(name)}" data-customer-email="${escapeHtml(customer?.email || "")}" data-customer-phone="${escapeHtml(customer?.phone || "")}" data-invoice-numbers="${escapeHtml([r.invoice_number, ...(r.search_invoice_numbers || [])].filter(Boolean).join("|"))}" data-service-label="${escapeHtml(serviceLabel(r.service_type))}" data-status-label="${escapeHtml(statusLabel(r.workflow_status || r.status))}" data-search-index="${escapeHtml(searchIndex)}" type="button">
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
  const activeSearchTerm =
    $("#requestSearch")?.value || $("#globalAdminSearch")?.value || "";
  window.AdminV3?.filterVisibleRequestCards(activeSearchTerm);
}
async function getFiles(requestId) {
  const { data, error } = await adminClient
    .from("request_files")
    .select("id,file_name,file_path,file_type,file_size,created_at,uploaded_by,document_category,document_classification,customer_visible,eligible_for_delivery,is_active")
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
async function getInvoiceItems(requestId, invoices = []) {
  const { data, error } = await adminClient
    .from("invoice_items")
    .select("*")
    .eq("service_request_id", requestId)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    return [];
  }

  const initialInvoice = invoices.find((invoice) => {
    return (
      String(invoice.invoice_type || "").includes("initial") ||
      String(invoice.invoice_number || "").endsWith("-01")
    );
  });

  return (data || []).filter((item) => {
    return (
      item.invoice_id === null ||
      String(item.invoice_id || "") === String(initialInvoice?.id || "")
    );
  });
}

function detailEntries(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const hidden = new Set([
    "id",
    "service_request_id",
    "created_at",
    "updated_at",
  ]);
  const explicitLabels = {
    witness_count: "Total Witnesses Required",
    client_witness_count: "Customer Will Provide",
    provided_witness_count: "Aligned Print & Scan Will Provide",
    witness_provider: "Witness Provider",
    witness_need: "Witnesses Required",
    witnesses_needed: "Witnesses Required",
  };

  const labels = (key) =>
    explicitLabels[key] ||
    String(key || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const entries = [];
  list.forEach((row) => {
    Object.entries(row || {}).forEach(([key, value]) => {
      if (
        hidden.has(key) ||
        value === null ||
        value === undefined ||
        value === ""
      )
        return;
      entries.push({ key, label: labels(key), value });
    });
  });
  return entries;
}

function detailMap(entries) {
  const cells = (entries || []).map(
    ({ label, value }) =>
      `<div><span class="small-label">${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`,
  );
  return cells.length
    ? `<div class="admin-detail-grid service-detail-map">${cells.join("")}</div>`
    : '<p class="admin-muted">No service-specific details found for this request.</p>';
}

function groupedServiceDetails(rows, serviceType) {
  const groups = { service: [], appointment: [], witness: [], printing: [] };
  const appointmentPattern =
    /date|time|appointment|location|address|platform|fulfillment|delivery|pickup|courier/;
  const witnessPattern = /witness/;
  const printingPattern = /print|scan|paper|page|copy|color|binding/;

  detailEntries(rows).forEach((entry) => {
    const key = String(entry.key || "").toLowerCase();
    if (witnessPattern.test(key)) groups.witness.push(entry);
    else if (printingPattern.test(key)) groups.printing.push(entry);
    else if (appointmentPattern.test(key)) groups.appointment.push(entry);
    else groups.service.push(entry);
  });

  const service = String(serviceType || "").toLowerCase();
  const isMeaningfulRequirement = ({ value }) => {
    if (value === true) return true;
    if (typeof value === "number") return value > 0;
    const normalized = String(value || "").trim().toLowerCase();
    return !["", "0", "false", "no", "none", "not required"].includes(
      normalized,
    );
  };
  const showWitness = groups.witness.some(isMeaningfulRequirement);
  const showPrinting =
    service === "print" ||
    service.includes("print") ||
    groups.printing.some(isMeaningfulRequirement);

  if (!showWitness) {
    groups.service.push(...groups.witness);
    groups.witness = [];
  }
  if (!showPrinting) {
    groups.service.push(...groups.printing);
    groups.printing = [];
  }

  return {
    ...groups,
    showWitness,
    showPrinting,
  };
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

async function getArchivedCustomerUpdates(requestId) {
  const historyQuery = await adminClient
    .from("request_customer_note_history")
    .select(
      "id,note_text,original_author,original_created_at,archived_at,archived_by,source_note_field",
    )
    .eq("service_request_id", requestId)
    .order("archived_at", { ascending: false });

  if (!historyQuery.error) {
    return { updates: historyQuery.data || [], error: null };
  }

  // Keep the admin history readable during the deployment window before the
  // forward metadata migration is applied. Other errors remain visible.
  const missingMetadataColumns =
    historyQuery.error.code === "42703" ||
    /column .* does not exist/i.test(historyQuery.error.message || "");
  if (!missingMetadataColumns) {
    return { updates: [], error: historyQuery.error };
  }

  const fallbackQuery = await adminClient
    .from("request_customer_note_history")
    .select("id,note_text,archived_at")
    .eq("service_request_id", requestId)
    .order("archived_at", { ascending: false });

  return {
    updates: fallbackQuery.data || [],
    error: fallbackQuery.error,
  };
}

function archivedCustomerUpdatesHtml({ updates = [], error = null } = {}) {
  if (error) {
    console.error("Archived customer updates could not be loaded:", error);
    return `<div class="admin-v3-history-state is-error" role="alert" data-history-state="error">
      <strong>Archived updates are temporarily unavailable.</strong>
      <p>Refresh the request or confirm the customer-update archive migration has been applied.</p>
    </div>`;
  }

  if (!updates.length) {
    return `<div class="admin-v3-history-state" data-history-state="empty">
      <strong>No archived customer updates.</strong>
      <p>Completed customer updates will appear here after the order becomes financially complete.</p>
    </div>`;
  }

  return `<ol class="admin-v3-customer-update-history" data-history-state="populated">
    ${updates
      .map((update) => {
        const originalDetails = [
          update.original_author
            ? `Originally added by ${escapeHtml(update.original_author)}`
            : null,
          update.original_created_at
            ? new Date(update.original_created_at).toLocaleString()
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const archiveDetails = [
          update.archived_at
            ? `Archived ${new Date(update.archived_at).toLocaleString()}`
            : "Archived date unavailable",
          update.archived_by
            ? `by ${escapeHtml(update.archived_by)}`
            : null,
        ]
          .filter(Boolean)
          .join(" ");

        return `<li class="admin-v3-customer-update-entry">
          <p>${escapeHtml(update.note_text || "")}</p>
          ${originalDetails ? `<small>${originalDetails}</small>` : ""}
          <small>${archiveDetails}</small>
        </li>`;
      })
      .join("")}
  </ol>`;
}

async function renderArchivedCustomerUpdates(requestId) {
  const historyRoot = $("#archivedCustomerUpdatesHistory");
  if (!historyRoot) return;

  const result = await getArchivedCustomerUpdates(requestId);
  if (selectedRequest?.id !== requestId) return;

  const currentRoot = $("#archivedCustomerUpdatesHistory");
  if (!currentRoot) return;
  currentRoot.innerHTML = archivedCustomerUpdatesHtml(result);
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

  const initialRows = [];
  const finalRows = [];
  if (initial || originalQuote) {
    const initialNumber =
      initial?.invoice_number ||
      (
        (request?.invoice_number ||
          refFromId(request?.id || "").replace("APS-", "INV-")) + "-01"
      ).replace("-01-01", "-01");
    initialRows.push(`<div class="invoice-summary-item clean-summary-item">
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
      finalRows.push(`<div class="invoice-summary-item clean-summary-item">
        <div><span class="small-label">Final Balance</span><strong>${escapeHtml(inv.invoice_number || "Final Balance")}</strong></div>
        <div><span>${escapeHtml(status)}</span><strong>${money(displayAmount)}</strong></div>
        ${receipt ? `<a href="${escapeHtml(receipt)}" target="_blank" rel="noopener">View Receipt</a>` : ""}
      </div>`);
    });
  } else {
    finalRows.push(
      '<div class="invoice-summary-item clean-summary-item muted-summary-item"><div><span class="small-label">Final Balance</span><strong>Not issued</strong></div><div><span>Only appears when a final balance invoice is issued.</span></div></div>',
    );
  }

  return `<div class="financial-summary-grid">
    <div><span class="small-label">Original Quote</span><strong>${money(originalQuote)}</strong></div>
    <div><span class="small-label">Total Service Value</span><strong>${money(totalServiceValue)}</strong></div>
    <div><span class="small-label">Paid to Date</span><strong>${money(paidToDate)}</strong></div>
    <div><span class="small-label">Balance Due</span><strong>${money(balanceDue)}</strong></div>
  </div>
  <div class="admin-v3-payment-group"><span class="small-label">Invoice #1</span><div class="invoice-summary-list clean-invoice-summary">${initialRows.join("") || '<div class="invoice-summary-item clean-summary-item muted-summary-item"><div><strong>Not issued</strong></div></div>'}</div></div>
  <div class="admin-v3-payment-group"><span class="small-label">Additional / Final Invoice</span><div class="invoice-summary-list clean-invoice-summary">${finalRows.join("")}</div></div>
  <div class="admin-v3-payment-group"><span class="small-label">Payment History</span><div class="invoice-summary-list clean-invoice-summary">${invoices.length ? invoices.map((invoice) => `<div class="invoice-summary-item clean-summary-item"><div><strong>${escapeHtml(invoice.invoice_number || "Invoice")}</strong></div><div><span>${escapeHtml(statusLabel(invoice.status || "pending"))}</span><strong>${money(invoice.amount_paid || invoice.paid_amount || invoice.amount_due || 0)}</strong></div></div>`).join("") : '<div class="invoice-summary-item clean-summary-item muted-summary-item"><div><strong>No invoice history</strong></div></div>'}</div></div>`;
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
      ["awaiting_payment", "Payment Due"],
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
      ["awaiting_payment", "Payment Due"],
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
      ["awaiting_payment", "Payment Due"],
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
    payment_pending: "awaiting_payment",
    payment_submitted: "payment_received",
    paid_confirmed: "payment_received",
    scheduled: "appointment_confirmed",
    scheduling: "payment_received",
    final_balance_payment_submitted: "final_payment_received",
  };
  const rawStatus = request?.workflow_status || request?.status || "under_review";
  const current = aliases[rawStatus] || rawStatus;
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
  return `<div class="admin-detail-section internal-workflow-card premium-workflow-card" data-v3-tab-target="overview">
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


async function getPatch32Records(requestId) {
  const [actions, timeline, communications] = await Promise.all([
    adminClient.from("customer_action_requests").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
    adminClient.from("request_timeline_events").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
    adminClient.from("request_communications").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
  ]);
  return { actions: actions.data || [], timeline: timeline.data || [], communications: communications.data || [] };
}

function patch32AdminPanels(records = {}) {
  const actions = records.actions || [];
  const pending = actions.filter((a) => String(a.status || "") === "pending");
  const actionRows = pending.length ? pending.map((a) => `<div class="admin-action-request" data-action-id="${escapeHtml(a.id)}"><strong>${escapeHtml(String(a.action_type || "request").toUpperCase())}</strong><p>${escapeHtml(a.reason || "No reason provided")}</p>${a.proposed_appointment_at ? `<p><strong>Proposed:</strong> ${new Date(a.proposed_appointment_at).toLocaleString()}</p>` : ""}<label>Resolution message<textarea class="action-resolution-message" placeholder="Message to customer"></textarea></label><label>Approved refund amount<input class="action-refund-amount" type="number" min="0" step="0.01" value="0"></label><div class="status-actions"><button class="btn primary resolve-customer-action" data-decision="approved" type="button">Approve</button><button class="btn dark resolve-customer-action" data-decision="denied" type="button">Deny</button></div></div>`).join("") : '<p class="admin-muted">No pending cancellation or reschedule requests.</p>';
  const commRows = (records.communications || []).slice(0, 25).map((c) => `<li><strong>${escapeHtml(c.subject || c.channel || "Communication")}</strong><small>${escapeHtml(c.direction || "")} · ${escapeHtml(c.delivery_status || "")} · ${c.created_at ? new Date(c.created_at).toLocaleString() : ""}</small></li>`).join("") || '<li class="admin-muted">No communications logged.</li>';
  const timelineRows = (records.timeline || []).slice(0, 30).map((e) => `<li><strong>${escapeHtml(e.title || e.event_type || "Event")}</strong><p>${escapeHtml(e.detail || "")}</p><small>${escapeHtml(e.actor_type || "system")} · ${e.created_at ? new Date(e.created_at).toLocaleString() : ""}</small></li>`).join("") || '<li class="admin-muted">No timeline events logged.</li>';
  return `<div class="admin-detail-section"><h3>Cancellation & Reschedule Review</h3>${actionRows}</div>
  <div class="admin-detail-section"><h3>Communication Log</h3><ul class="admin-file-list">${commRows}</ul></div>
  <div class="admin-detail-section"><h3>Automatic Timeline</h3><ul class="admin-file-list">${timelineRows}</ul></div>`;
}

async function resolveCustomerAction(button) {
  const card = button.closest(".admin-action-request");
  const { data, error } = await adminClient.functions.invoke("admin-resolve-customer-action", { body: { action_id: card?.dataset.actionId, decision: button.dataset.decision, admin_message: card?.querySelector(".action-resolution-message")?.value || "", approved_refund_amount: Number(card?.querySelector(".action-refund-amount")?.value || 0) } });
  if (error || data?.ok === false) throw new Error(data?.error || error?.message || "Action could not be resolved.");
  await loadRequests();
  await selectRequest(selectedRequest.id);
}

async function uploadAdminDocuments(requestId) {
  const input = document.querySelector("#adminAdditionalFiles");
  const files = Array.from(input?.files || []);
  if (!files.length) throw new Error("Choose at least one document.");
  for (const file of files) {
    const safe = String(file.name || "document").replace(/[^a-z0-9._-]+/gi, "-");
    const path = `${requestId}/admin/${crypto.randomUUID()}-${safe}`;
    const { error: uploadError } = await adminClient.storage.from("service-request-files").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    const classification = document.querySelector("#adminDocumentClassification")?.value || "internal_document";
    // Classification describes the file; it never releases the file. Customer
    // access requires the separate, explicit Release to Customer action.
    const { error: recordError } = await adminClient.from("request_files").insert({ service_request_id: requestId, file_name: file.name, file_path: path, file_type: file.type, file_size: file.size, uploaded_by: "admin", document_category: "admin-additional", document_classification: classification, customer_visible: false, eligible_for_delivery: false, is_active: true });
    if (recordError) throw recordError;
  }
  await adminClient.from("request_timeline_events").insert({ service_request_id: requestId, event_type: "documents_uploaded", title: "Administrator documents uploaded", detail: `${files.length} document(s) uploaded by administrator.`, actor_type: "admin", metadata: { file_count: files.length } });
  await selectRequest(requestId);
}

async function proofCommand(command, extra = {}, documentCommand = false) {
  const { data, error } = await adminClient.functions.invoke(
    documentCommand ? "proof-admin-document" : "proof-admin-transaction",
    { body: { command, serviceRequestId: selectedRequest?.id, ...extra } },
  );
  if (error || data?.ok === false) throw new Error(data?.error?.message || error?.message || "Proof operation failed.");
  return data;
}

function proofState(value) {
  return statusLabel(value || "not_started");
}

async function loadProofControlPanel() {
  const host = $("#proofControlPanel");
  if (!host || selectedRequest?.service_type !== "ron") return;
  try {
    const data = await proofCommand("get_control_panel");
    const tx = data.transaction;
    const participants = data.participants || [];
    const signers = data.signers || [];
    const assets = data.assets || [];
    const sourceAssets = assets.filter(asset => asset.asset_type === "source_document");
    const completedAssets = assets.filter(asset => ["completed_document", "audit_trail"].includes(asset.asset_type));
    const appointmentReady = Boolean(data.request?.appointment_confirmed_at && data.request?.appointment_date && data.request?.appointment_time);
    host.innerHTML = `
      <div class="admin-v3-section-heading"><span class="small-label">RON Session / Proof</span><h3>Secure Online Notary Orchestration</h3></div>
      <p class="admin-muted">APS owns business readiness and customer delivery. Proof executes the secure notarization.</p>
      ${!data.configured ? '<div class="email-notice"><strong>Proof is not configured.</strong><p>Configure the required server-side Proof secrets before using transaction actions.</p></div>' : ""}
      <div class="admin-detail-grid proof-control-grid">
        <div><span class="small-label">RON readiness</span><strong>${data.invoices?.primaryPaymentReady && appointmentReady ? "Business prerequisites ready" : "Preparation required"}</strong></div>
        <div><span class="small-label">Primary payment</span><strong>${data.invoices?.primaryPaymentReady ? "Satisfied" : `Blocked · ${money(data.invoices?.openBalance || 0)} open`}</strong></div>
        <div><span class="small-label">Appointment</span><strong>${appointmentReady ? "Confirmed" : "Not confirmed"}</strong></div>
        <div><span class="small-label">Approved signers</span><strong>${participants.filter(person => person.participant_type === "signer").length} / ${data.ron?.number_of_signers || 0}</strong></div>
        <div><span class="small-label">Proof transaction</span><strong>${tx?.proof_transaction_id ? escapeHtml(tx.proof_transaction_id) : "Not created"}</strong></div>
        <div><span class="small-label">Provider status</span><strong>${proofState(tx?.proof_status || tx?.creation_state)}</strong></div>
        <div><span class="small-label">Activation</span><strong>${proofState(tx?.activation_state)}</strong></div>
        <div><span class="small-label">Last synchronization</span><strong>${tx?.last_synced_at ? new Date(tx.last_synced_at).toLocaleString() : "Not synchronized"}</strong></div>
      </div>
      ${tx?.last_error_message || tx?.webhook_manual_review_reason ? `<div class="email-notice"><strong>Administrator attention required</strong><p>${escapeHtml(tx.last_error_message || tx.webhook_manual_review_reason)}</p></div>` : ""}
      <div class="proof-control-section"><h4>Signers</h4>${signers.length ? `<ul class="admin-file-list">${signers.map(signer => `<li><strong>Signer ${signer.signer_position}: ${escapeHtml([signer.first_name,signer.last_name].filter(Boolean).join(" ") || signer.email)}</strong><small>${proofState(signer.configuration_state)} · ${proofState(signer.proof_status)}${signer.access_link_present ? " · Secure access available" : ""}</small></li>`).join("")}</ul>` : '<p class="admin-muted">Approved APS participants have not been mapped to Proof.</p>'}</div>
      <div class="proof-control-section"><h4>Documents</h4>${sourceAssets.length ? `<ul class="admin-file-list">${sourceAssets.map(asset => `<li><strong>${escapeHtml(asset.file_name)}</strong><small>${proofState(asset.upload_state)} · ${proofState(asset.processing_state)} · ${proofState(asset.requirement)}${asset.witness_required ? " · Witness required" : ""}</small></li>`).join("")}</ul>` : '<p class="admin-muted">No APS source documents have been selected for Proof.</p>'}<div id="proofEligibleDocuments"></div></div>
      <div class="proof-control-section"><h4>Completed assets</h4>${completedAssets.length ? `<ul class="admin-file-list">${completedAssets.map(asset => `<li><strong>${escapeHtml(asset.file_name)}</strong><small>${proofState(asset.retrieval_state)} · Internal until explicitly released through APS Documents</small>${asset.retrieval_state === "retrieved" ? `<button class="btn dark proof-stage-asset" data-asset-id="${escapeHtml(asset.id)}" type="button">Stage for Review</button>` : ""}</li>`).join("")}</ul>` : '<p class="admin-muted">No completed notarized documents have been retrieved.</p>'}${tx?.completed_assets_available ? `<div class="status-actions">${sourceAssets.map(asset => `<button class="btn dark proof-retrieve-document" data-source-id="${escapeHtml(asset.id)}" type="button">Retrieve ${escapeHtml(asset.file_name)}</button>`).join("")}<button class="btn dark" id="proofRetrieveAudit" type="button">Retrieve Audit Trail</button></div>` : ""}</div>
      <div class="status-actions proof-actions">
        ${!tx ? '<button class="btn primary" id="proofCreateDraft" type="button">Create Proof Draft</button>' : ""}
        ${tx && !signers.length ? '<button class="btn dark" id="proofConfigureSigners" type="button">Map Approved Signers</button>' : ""}
        ${tx ? '<button class="btn dark" id="proofLoadDocuments" type="button">Select APS Documents</button><button class="btn dark" id="proofSyncStatus" type="button">Sync Proof Status</button>' : ""}
        ${tx && tx.activation_state !== "activated" ? '<button class="btn primary" id="proofActivate" type="button">Activate Prepared Transaction</button>' : ""}
      </div>
      <div id="proofActionStatus" role="status" aria-live="polite"></div>`;
    $("#proofCreateDraft")?.addEventListener("click", async () => runProofUiAction(async () => {
      const primary = participants.find(person => person.participant_type === "signer");
      if (!primary?.email) throw new Error("An approved signer email is required.");
      await proofCommand("create_draft", { signerEmail: primary.email });
    }));
    $("#proofConfigureSigners")?.addEventListener("click", () => runProofUiAction(() => proofCommand("configure_approved_signers", { integrationId: tx.id })));
    $("#proofSyncStatus")?.addEventListener("click", () => runProofUiAction(() => proofCommand("refresh", { integrationId: tx.id })));
    $("#proofLoadDocuments")?.addEventListener("click", () => loadEligibleProofDocuments(tx.id));
    $("#proofActivate")?.addEventListener("click", () => runProofUiAction(async () => {
      const readiness = await proofCommand("evaluate_activation_readiness", { integrationId: tx.id, confirmActivation: false });
      if (readiness.readiness?.blockingCodes?.filter(code => code !== "ADMIN_CONFIRMATION_REQUIRED").length) throw new Error(`Activation blocked: ${readiness.readiness.blockingCodes.join(", ")}`);
      if (!confirm("Activate this prepared Proof transaction? Proof will send its required signer invitation.")) return;
      await proofCommand("activate", { integrationId: tx.id, confirmActivation: true });
    }));
    $$(".proof-retrieve-document").forEach(button => button.addEventListener("click", () => runProofUiAction(() => proofCommand("retrieve_completed_document", { integrationId: tx.id, sourceAssetId: button.dataset.sourceId }, true))));
    $("#proofRetrieveAudit")?.addEventListener("click", () => runProofUiAction(() => proofCommand("retrieve_audit_trail", { integrationId: tx.id }, true)));
    $$(".proof-stage-asset").forEach(button => button.addEventListener("click", () => runProofUiAction(async () => {
      await proofCommand("stage_completed_asset", { integrationId: tx.id, assetId: button.dataset.assetId }, true);
      await selectRequest(selectedRequest.id);
      window.AdminV3?.activateTab("documents");
    })));
  } catch (error) {
    host.innerHTML = `<div class="admin-v3-section-heading"><span class="small-label">RON Session / Proof</span><h3>Secure Online Notary Orchestration</h3></div><div class="email-notice"><strong>Proof state could not be loaded.</strong><p>${escapeHtml(error.message || String(error))}</p></div>`;
  }
}

async function runProofUiAction(action) {
  const status = $("#proofActionStatus");
  if (status) status.textContent = "Working…";
  try { await action(); if (status) status.textContent = "Proof operation completed."; await loadProofControlPanel(); }
  catch (error) { if (status) status.textContent = error.message || String(error); }
}

async function loadEligibleProofDocuments(integrationId) {
  const result = await proofCommand("list_eligible_source_documents", { integrationId }, true);
  const host = $("#proofEligibleDocuments");
  if (!host) return;
  host.innerHTML = `${result.documents?.map(document => `<label class="check"><input class="proof-document-choice" type="checkbox" value="${escapeHtml(document.requestFileId)}" ${document.eligible ? "" : "disabled"}> ${escapeHtml(document.fileName)} <small>${document.eligible ? "Eligible PDF" : escapeHtml(document.reason)}</small></label>`).join("") || '<p class="admin-muted">No eligible APS documents.</p>'}<div class="admin-detail-grid"><label>Proof requirement<select id="proofDocumentRequirement"><option value="notarization">Notarization</option><option value="esign">Electronic signature</option><option value="identity_confirmation">Identity confirmation</option><option value="readonly">Read only</option><option value="non_essential">Non-essential</option></select></label><label class="check"><input id="proofWitnessRequired" type="checkbox"> Witness required for selected document(s)</label></div><button class="btn primary" id="proofPrepareDocuments" type="button">Prepare &amp; Upload Selected</button>`;
  $("#proofPrepareDocuments")?.addEventListener("click", () => runProofUiAction(async () => {
    const requirement = $("#proofDocumentRequirement").value;
    const flags = { requirement, notarizationRequired: requirement === "notarization", esignRequired: requirement === "esign", identityConfirmationRequired: requirement === "identity_confirmation", witnessRequired: $("#proofWitnessRequired").checked, signingRequiresMeeting: requirement === "notarization", customerCanAnnotate: requirement === "esign", bundlePosition: null };
    const selected = $$(".proof-document-choice:checked").map(input => input.value);
    if (!selected.length) throw new Error("Select at least one eligible APS PDF.");
    for (const requestFileId of selected) {
      const prepared = await proofCommand("prepare_upload", { integrationId, requestFileId, flags }, true);
      await proofCommand("upload_source_document", { integrationId, assetId: prepared.document.assetId }, true);
    }
  }));
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
  const [files, serviceDetails, invoices, patch32Records, participantResult, actResult, templateResult, messageResult, completionResult] = await Promise.all([
    getFiles(id),
    getDetailRows(table, id),
    getInvoices(id),
    getPatch32Records(id),
    adminClient.from("request_participants").select("*").eq("service_request_id", id).order("sort_order"),
    adminClient.from("request_notarial_acts").select("*").eq("service_request_id", id).order("act_number"),
    adminClient.from("message_templates").select("*").eq("active", true).order("name"),
    adminClient.from("messages").select("*").eq("service_request_id", id).order("created_at", { ascending: false }),
    adminClient.from("request_completion_facts").select("*").eq("service_request_id", id).maybeSingle(),
  ]);
  const participants = participantResult.data || [];
  const notarialActs = actResult.data || [];
  const messageTemplates = templateResult.data || [];
  const requestMessages = messageResult.data || [];
  const completionFacts = completionResult.data || {};
  const invoiceItems = await getInvoiceItems(id, invoices);
  const currentInvoice = invoices.find(invoice => !["void", "cancelled"].includes(String(invoice.status || "").toLowerCase())) || invoices[0] || {};
  currentMessagePreviewContext = {
    templates: messageTemplates,
    context: {
      requestId: selectedRequest.id,
      reference: ref,
      customer: customer || {},
      serviceType: selectedRequest.service_type,
      serviceName: serviceLabel(selectedRequest.service_type),
      requestedDate: customerPreviewDate(selectedRequest.preferred_date, "Not provided"),
      requestedTime: selectedRequest.preferred_time_window || "Not provided",
      appointmentDate: customerPreviewDate(selectedRequest.appointment_date, "Not confirmed"),
      appointmentTime: selectedRequest.appointment_time || "Not confirmed",
      appointmentLocation: selectedRequest.service_type === "ron" ? "" : (selectedRequest.appointment_location || "Not provided"),
      appointmentLink: selectedRequest.service_type === "ron" ? (selectedRequest.appointment_link || selectedRequest.ron_session_url || "") : "",
      appointmentInstructions: selectedRequest.appointment_instructions || "Review your secure request for preparation details.",
      preferredContact: customer?.preferred_contact || "Not provided",
      quoteNumber: selectedRequest.current_quote_id || "Current quote",
      quoteVersion: "Current",
      quoteAmount: money(selectedRequest.quote_amount || selectedRequest.estimated_total || 0),
      quoteItems: invoiceItems.map(item => ({ name: item.description || item.item_name || "Service", quantity: item.quantity || 1, rate: money(item.unit_price || item.rate || 0), total: money(item.line_total || item.amount || 0) })),
      invoiceNumber: currentInvoice.invoice_number || selectedRequest.invoice_number || "Not issued",
      paymentAmount: money(currentInvoice.amount_paid || selectedRequest.paid_amount || 0),
      paymentDate: customerPreviewDate(selectedRequest.paid_at, "Not recorded"),
      paidAmount: money(selectedRequest.paid_amount || 0),
      balanceDue: money(selectedRequest.balance_due || currentInvoice.balance_due || 0),
      releasedDocumentNames: files.filter(file => file.customer_visible && file.eligible_for_delivery && file.document_classification !== "internal_document").map(file => file.file_name),
      completionDate: customerPreviewDate(selectedRequest.completed_at, "Not completed"),
      siteUrl: location.origin,
    },
  };
  const fileItems = await Promise.all(
    files.map(async (f) => {
      const url = await signedUrl(f.file_path);
      const released = f.customer_visible && f.eligible_for_delivery && f.document_classification !== "internal_document";
      return `<li>${url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(f.file_name)}</a>` : escapeHtml(f.file_name)}<small>${f.file_type || "file"} · ${f.file_size ? Math.round(f.file_size / 1024) + " KB" : ""} · ${released ? "Released to customer" : "Internal / not released"}</small><button class="btn dark release-document-btn" data-file-id="${escapeHtml(f.id)}" data-released="${released}" type="button">${released ? "Withdraw Release" : "Release to Customer"}</button></li>`;
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
  const groupedDetails = groupedServiceDetails(
    serviceDetails,
    selectedRequest.service_type,
  );
  const customerName =
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    "Customer not provided";
  const activeClientNote =
    selectedRequest.quote_notes || selectedRequest.customer_message || "";
  const paidInvoiceCount = invoices.filter((invoice) =>
    ["paid", "payment_received", "final_payment_received"].includes(
      String(invoice.status || "").toLowerCase(),
    ),
  ).length;
  const requestSchedule =
    selectedRequest.appointment_date ||
    selectedRequest.preferred_date ||
    "Not scheduled";

  detail.innerHTML = `
    <section class="admin-v3-overview" data-v3-tab-target="overview">
      <div class="admin-v3-overview-identity">
        <div><span class="small-label">Order</span><h3>${escapeHtml(ref)}</h3><p>${escapeHtml(customerName)} · ${serviceLabel(selectedRequest.service_type)}</p></div>
        <div class="admin-v3-overview-status"><span class="small-label">Current workflow</span><strong>${statusLabel(selectedRequest.workflow_status || selectedRequest.status)}</strong><span>${isArchived(selectedRequest) ? "Archived order" : "Active order"}</span></div>
      </div>
      <div class="admin-v3-overview-grid">
        <div class="admin-v3-overview-card is-financial"><span class="small-label">Financial position</span><strong>${money(selectedRequest.quote_amount || selectedRequest.estimated_total || 0)}</strong><p>${paidInvoiceCount} of ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} paid</p></div>
        <div class="admin-v3-overview-card"><span class="small-label">Schedule</span><strong>${escapeHtml(requestSchedule)}</strong><p>${escapeHtml(selectedRequest.appointment_time || selectedRequest.preferred_time_window || "Time not confirmed")}</p></div>
        <div class="admin-v3-overview-card is-supporting"><span class="small-label">Operational detail</span><strong>${selectedRequest.detected_pdf_page_count || "—"} pages</strong><p>Detected PDF pages when available</p></div>
      </div>
    </section>

    ${internalWorkflowGuide(selectedRequest)}

    <div class="admin-detail-section invoice-builder-card" data-v3-tab-target="quote" data-payment-group="quote">
      <div class="admin-v3-section-heading"><span class="small-label">Quote</span><h3>Full Service Quote Builder</h3></div>
      <p class="admin-muted">Build the full estimated service quote here. Saving the quote updates the customer-facing quote; status buttons control when emails are sent.</p>
      <div class="invoice-preset-row"><select id="invoicePresetSelect"><option value="">Add common line item…</option></select><button id="addPresetInvoiceRow" class="btn dark" type="button">Add Selected</button></div><div id="invoiceRows" class="invoice-rows"></div>
      <div class="invoice-total-line"><strong>Invoice Total</strong><span id="invoiceTotalPreview">$0.00</span></div>
      <label>Invoice / client note</label>
      <textarea id="invoiceNote" placeholder="Premium client-facing note, preparation instructions, appointment readiness, or quote terms…">${escapeHtml(selectedRequest.quote_notes || selectedRequest.customer_message || "")}</textarea>
      <div class="dashboard-action-groups">
        <div class="dashboard-action-group"><span class="small-label">Quote Actions</span><div class="status-actions invoice-actions"><button id="addInvoiceRow" class="btn dark" type="button">Add Line Item</button><button id="saveInvoiceBtn" class="btn primary" type="button">Save Quote</button></div></div>
        <div class="dashboard-action-group"><span class="small-label">Payment Actions</span><div class="status-actions invoice-actions"><button id="recordPrimaryPaymentBtn" class="btn dark" type="button">Record Primary Payment</button><button id="recordSupplementalPaymentBtn" class="btn dark" type="button">Record Supplemental Payment</button><button id="createAdditionalInvoiceBtn" class="btn dark" type="button">Create Additional Invoice</button></div></div>
      </div>
      <p class="admin-muted small-admin-note">Save the quote first. Then use Status Update to send Quote Ready or move the request forward.</p>
    </div>

    <div class="admin-detail-section invoice-summary-card" data-v3-tab-target="payments">
      <div class="admin-v3-section-heading"><span class="small-label">Invoice #1 · Additional / Final Invoice · Payment History</span><h3>Invoice Payment Summary</h3></div>
      <p class="admin-muted">Track the full quote value, paid-to-date amount, initial payment, and final balance here.</p>
      ${invoiceSummaryHtml(invoices, selectedRequest, invoiceItems)}
    </div>

    <div class="admin-detail-section admin-v3-financial-actions" data-v3-tab-target="payments">
      <div><span class="small-label">Balance Summary</span><h3>${money(selectedRequest.balance_due_at_appointment || 0)} due at appointment</h3><p class="admin-muted">Use the quote and invoice records above as the authoritative financial history.</p></div>
      <div><span class="small-label">Financial Actions</span><p class="admin-muted">Quote, invoice, receipt, and final-balance actions remain in their existing sections.</p></div>
    </div>

    ${patch32AdminPanels(patch32Records)}

    <div class="admin-detail-section appointment-editor-card" data-v3-tab-target="fulfillment">
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

    ${selectedRequest.service_type === "ron" ? '<section class="admin-detail-section proof-control-panel" id="proofControlPanel" data-v3-tab-target="fulfillment"><div class="admin-v3-section-heading"><span class="small-label">RON Session / Proof</span><h3>Loading secure-session orchestration…</h3></div></section>' : ""}

    <div class="admin-detail-section completion-facts-card" data-v3-tab-target="fulfillment">
      <div class="admin-v3-section-heading"><span class="small-label">Completion Gate</span><h3>Authoritative Fulfillment Facts</h3></div>
      <p class="admin-muted">Record what was actually purchased and fulfilled. A zero balance alone does not complete an order.</p>
      <fieldset><legend>Purchased service components</legend>${["ron","mobile","print_copy","scan","courier"].map(component => `<label class="check"><input class="completion-component" type="checkbox" value="${component}" ${(completionFacts.components || []).includes(component) ? "checked" : ""}> ${escapeHtml(statusLabel(component))}</label>`).join("")}</fieldset>
      <div class="admin-detail-grid">
        ${[["ron_session_completed","RON session completed"],["mobile_service_completed","Mobile service performed"],["production_completed","Print/Copy production completed"],["scan_completed","Scanning completed"],["pickup_completed","Pickup/handoff completed"],["delivery_completed","Delivery/handoff completed"],["proof_of_delivery_present","Proof of delivery present"]].map(([key,label]) => `<label class="check"><input class="completion-fact" data-key="${key}" type="checkbox" ${completionFacts[key] ? "checked" : ""}> ${label}</label>`).join("")}
      </div>
      <div class="admin-detail-grid">
        <label>Document readiness<select id="completionDocumentState"><option value="pending" ${selectedRequest.document_state === "pending" ? "selected" : ""}>Pending / review required</option><option value="approved" ${selectedRequest.document_state === "approved" ? "selected" : ""}>Reviewed and ready</option><option value="not_applicable" ${selectedRequest.document_state === "not_applicable" ? "selected" : ""}>Not applicable</option></select></label>
        <label>Participant / witness readiness<select id="completionParticipantState"><option value="pending" ${selectedRequest.participant_state === "pending" ? "selected" : ""}>Pending / unresolved</option><option value="approved" ${selectedRequest.participant_state === "approved" ? "selected" : ""}>Prepared and ready</option><option value="not_applicable" ${selectedRequest.participant_state === "not_applicable" ? "selected" : ""}>Not applicable</option></select></label>
        <label>Customer-delivery path<select id="completionDeliveryPath"><option value="">Select the applicable path…</option><option value="aps" ${completionFacts.aps_deliverable_required === true ? "selected" : ""}>APS must release a portal deliverable</option><option value="external" ${completionFacts.external_platform_delivery ? "selected" : ""}>External platform delivers final document</option><option value="physical" ${completionFacts.physical_only ? "selected" : ""}>Physical-only; no portal deliverable</option><option value="declined" ${completionFacts.customer_declined_optional_deliverable ? "selected" : ""}>Customer declined optional deliverable</option></select></label>
        <label class="check"><input id="completionPickupRequired" type="checkbox" ${completionFacts.pickup_required !== false ? "checked" : ""}> Courier pickup is required</label>
        <label class="check"><input id="completionPodRequired" type="checkbox" ${completionFacts.proof_of_delivery_required ? "checked" : ""}> Proof of delivery is required</label>
      </div>
      <button id="saveCompletionFactsBtn" class="btn primary" type="button">Save Fulfillment Facts</button>
      <div id="completionGateResult" class="email-notice" role="status" aria-live="polite" hidden></div>
      <div id="completionExceptionPanel" class="email-notice" hidden>
        <h4>Complete with Exception</h4><p>This is an intentional audited override, not the normal completion path.</p>
        <label>Exception type<select id="completionExceptionType"><option value="">Select type…</option><option value="approved_balance_exception">Approved balance exception</option><option value="physical_only_no_portal_deliverable">Physical-only fulfillment; no portal deliverable required</option><option value="customer_declined_optional_deliverable">Customer declined optional deliverable</option><option value="external_platform_delivery">External-platform final document delivery</option><option value="administrative_closure">Administrative closure</option><option value="other">Other</option></select></label>
        <label>Required explanation<textarea id="completionExceptionExplanation"></textarea></label>
        <button id="completeWithExceptionBtn" class="btn dark" type="button">Complete with Exception</button>
      </div>
    </div>

    <section class="admin-detail-section customer-identity-card" data-v3-tab-target="customer">
      <div class="admin-v3-section-heading"><span class="small-label">Customer Identity</span><h3>${escapeHtml(customerName)}</h3></div>
      <div class="admin-detail-grid">
        <div><span class="small-label">APS Reference</span><strong>${escapeHtml(ref)}</strong></div>
        <div><span class="small-label">Order Relationship</span><strong>Primary customer</strong></div>
      </div>
    </section>

    <section class="admin-detail-section" data-v3-tab-target="customer">
      <div class="admin-v3-section-heading"><span class="small-label">Transaction Participants</span><h3>Signers &amp; Witnesses</h3></div>
      ${participants.length ? `<ul class="admin-file-list">${participants.map(person=>`<li><strong>${escapeHtml(person.full_legal_name || (person.witness_source === "aps" ? `APS-provided witness × ${person.quantity || 1}` : "Identity pending"))}</strong><small>${escapeHtml(statusLabel(person.participant_type))}${person.email ? ` · ${escapeHtml(person.email)}` : ""}</small></li>`).join("")}</ul>` : '<p class="admin-muted">No structured participants are stored for this legacy request.</p>'}
      ${notarialActs.length ? `<h4>Requested acts</h4><ul class="admin-file-list">${notarialActs.map(act=>`<li><strong>Act ${act.act_number}: ${escapeHtml(statusLabel(act.act_type))}</strong><small>${act.requires_admin_review ? "Admin review required; APS must not choose certificate language." : "Customer selection recorded"}</small></li>`).join("")}</ul>` : ""}
    </section>

    <section class="admin-detail-section" data-v3-tab-target="customer">
      <div class="admin-v3-section-heading"><span class="small-label">Contact Information</span><h3>Customer Contact</h3></div>
      <div class="admin-detail-grid">
        <div><span class="small-label">Email</span><strong>${escapeHtml(customer?.email || "Not provided")}</strong></div>
        <div><span class="small-label">Phone</span><strong>${escapeHtml(customer?.phone || "Not provided")}</strong></div>
        <div><span class="small-label">Preferred Contact</span><strong>${escapeHtml(customer?.preferred_contact || "Not provided")}</strong></div>
      </div>
    </section>

    <section class="admin-detail-section" data-v3-tab-target="customer">
      <div class="admin-v3-section-heading"><span class="small-label">Service Details</span><h3>${serviceLabel(selectedRequest.service_type)}</h3></div>
      ${detailMap(groupedDetails.service)}
    </section>

    <section class="admin-detail-section" data-v3-tab-target="customer">
      <div class="admin-v3-section-heading"><span class="small-label">Appointment Information</span><h3>Requested & Confirmed Schedule</h3></div>
      <div class="admin-detail-grid">
        <div><span class="small-label">Requested Date</span><strong>${escapeHtml(selectedRequest.preferred_date || "Not provided")}</strong></div>
        <div><span class="small-label">Requested Time</span><strong>${escapeHtml(selectedRequest.preferred_time_window || "Not provided")}</strong></div>
        <div><span class="small-label">Confirmed Date</span><strong>${escapeHtml(selectedRequest.appointment_date || "Not confirmed")}</strong></div>
        <div><span class="small-label">Confirmed Time</span><strong>${escapeHtml(selectedRequest.appointment_time || "Not confirmed")}</strong></div>
        <div><span class="small-label">Location</span><strong>${escapeHtml(selectedRequest.appointment_location || "Not provided")}</strong></div>
        <div><span class="small-label">Platform / Fulfillment</span><strong>${escapeHtml(selectedRequest.appointment_platform || "Not provided")}</strong></div>
      </div>
      ${groupedDetails.appointment.length ? detailMap(groupedDetails.appointment) : ""}
    </section>

    ${groupedDetails.showWitness ? `<section class="admin-detail-section" data-v3-tab-target="customer"><div class="admin-v3-section-heading"><span class="small-label">Witness Information</span><h3>Witness Requirements</h3></div>${detailMap(groupedDetails.witness)}</section>` : ""}

    ${groupedDetails.showPrinting ? `<section class="admin-detail-section" data-v3-tab-target="customer"><div class="admin-v3-section-heading"><span class="small-label">Printing / Scanning</span><h3>Document Production</h3></div>${detailMap(groupedDetails.printing)}</section>` : ""}

    <section class="admin-detail-section customer-financial-card" data-v3-tab-target="customer">
      <div><span class="small-label">Financial Summary</span><h3>${money(selectedRequest.quote_amount || selectedRequest.estimated_total || 0)}</h3><p class="admin-muted">${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · ${paidInvoiceCount} paid</p></div>
      <button class="btn dark" type="button" data-open-workspace-tab="payments">Open Payments</button>
    </section>

    <div class="admin-detail-section" data-v3-tab-target="documents">
      <h3>Uploaded Files</h3>
      ${fileItems.length ? `<ul class="admin-file-list">${fileItems.join("")}</ul>` : '<p class="admin-muted">No files uploaded with this request.</p>'}
      <label>Document classification<select id="adminDocumentClassification"><option value="completed_scan">Completed Scan</option><option value="completed_notarized_document">Completed Notarized Document</option><option value="customer_deliverable">Customer Deliverable</option><option value="internal_document" selected>Internal Document</option><option value="supporting_document">Supporting Document</option><option value="other">Other</option></select></label>
      <label>Upload additional administrator documents<input id="adminAdditionalFiles" type="file" multiple></label><button id="uploadAdminFilesBtn" class="btn dark" type="button">Upload Documents</button>
    </div>

    <section class="admin-detail-section notes-active-card" data-v3-tab-target="messages">
      <div class="admin-v3-section-heading"><span class="small-label">Customer Communication</span><h3>Message Composer</h3></div>
      <div class="admin-detail-grid">
        <label>Template<select id="messageTemplateSelect"><option value="">Select an APS template…</option>${messageTemplates.map(template => `<option value="${escapeHtml(template.id)}" data-status="${escapeHtml(template.associated_status || "")}" data-required="${escapeHtml(template.required_attachment_type || "")}">${escapeHtml(template.name)}</option>`).join("")}</select></label>
        <label>Recipient<input id="messageRecipient" type="email" value="${escapeHtml(customer?.email || "")}"></label>
        <label>CC (comma separated)<input id="messageCc" type="text"></label>
        <label>Status after successful send<select id="messageStatus"><option value="">No status change</option>${["under_review","quote_ready","awaiting_approval","awaiting_payment","payment_received","final_payment_received","appointment_confirmed","appointment_needs_rescheduling","quote_expired","completed"].map(value => `<option value="${value}">${escapeHtml(statusLabel(value))}</option>`).join("")}</select></label>
      </div>
      <label>Subject<input id="messageSubject" type="text"></label>
      <label>Message HTML<textarea id="messageBody" rows="10"></textarea></label>
      <fieldset class="message-attachments"><legend>Existing order documents</legend>
        ${files.length ? files.map(file => `<label class="check"><input class="message-file-attachment" type="checkbox" value="${escapeHtml(file.id)}" ${file.customer_visible && file.eligible_for_delivery && file.document_classification !== "internal_document" ? "" : "disabled"}> ${escapeHtml(file.file_name)} <small>${file.customer_visible && file.eligible_for_delivery ? "Released deliverable" : "Not released"}</small></label>`).join("") : '<p class="admin-muted">No order documents available.</p>'}
      </fieldset>
      <p id="messageRequirement" class="admin-muted">Choose a template to see attachment requirements.</p>
      <div id="messagePreview" class="email-notice" hidden></div>
      <div class="status-actions"><button id="previewMessageBtn" class="btn dark" type="button">Preview</button><button id="sendMessageBtn" class="btn primary" type="button">Send Message</button><button id="sendAndUpdateStatusBtn" class="btn primary" type="button">Send &amp; Update Status</button></div>
      <div id="messageComposerStatus" role="status" aria-live="polite"></div>
    </section>

    <section class="admin-detail-section" data-v3-tab-target="messages">
      <div class="admin-v3-notes-subsection">
        <div class="admin-v3-section-heading"><span class="small-label">Workflow Status</span><h3>Update Order Status</h3></div>
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
      </div>
      <div class="admin-v3-notes-subsection admin-v3-internal-notes">
        <div class="admin-v3-section-heading"><span class="small-label">Internal Notes</span><h3>APS Staff Note</h3></div>
        <p class="admin-muted">Internal notes are visible only to APS staff and are not visible to the customer.</p>
        <textarea id="adminStatusNote" placeholder="Add an internal note visible only to APS staff..."></textarea>
        <label class="check"><input id="updateStatusWithoutSending" type="checkbox"> Update Status Without Sending (exception only)</label>
      </div>
    </section>

    <section class="admin-detail-section notes-history-card" data-v3-tab-target="messages">
      <div class="admin-v3-section-heading"><span class="small-label">Archived Customer Updates</span><h3>Customer Update History</h3></div>
      <div id="archivedCustomerUpdatesHistory" aria-live="polite">
        <div class="admin-v3-history-state" data-history-state="loading">
          <strong>Loading archived customer updates…</strong>
        </div>
      </div>
      ${requestMessages.length ? `<ul class="admin-file-list communication-history-list">${requestMessages.map(message => `<li><div><span class="small-label">${escapeHtml(statusLabel(message.source_type || (message.created_by ? "admin" : "automatic")))} · ${escapeHtml(message.channel || "email")}${message.template_key ? ` · ${escapeHtml(message.template_key)}` : ""}</span><strong>${escapeHtml(message.subject)}</strong><small>${escapeHtml(message.recipient)} · ${escapeHtml(statusLabel(message.delivery_state))} · ${new Date(message.sent_at || message.failed_at || message.attempted_at || message.created_at).toLocaleString()}</small>${message.error_message ? `<small class="communication-error">${escapeHtml(message.error_message)}</small>` : ""}</div><details><summary>Inspect rendered message</summary><iframe class="communication-rendered-preview" sandbox title="Rendered customer message" srcdoc="${escapeHtml(message.rendered_html || `<pre>${escapeHtml(message.rendered_text || "No rendered content retained.")}</pre>`)}"></iframe>${message.provider_message_id ? `<small>Provider ID: ${escapeHtml(message.provider_message_id)}</small>` : ""}</details></li>`).join("")}</ul>` : '<p class="admin-muted">No customer communications logged for this request.</p>'}
    </section>

    <section class="admin-detail-section" data-v3-tab-target="overview">
      <div class="admin-v3-section-heading"><span class="small-label">Request Administration</span><h3>Request Visibility</h3></div>
      <div class="status-actions archive-actions">
        <button id="archiveRequestBtn" class="btn dark" type="button">${isArchived(selectedRequest) ? "Restore Request" : "Archive Request"}</button>
      </div>
      <p class="admin-muted small-admin-note">Archiving hides the request from the active dashboard. It does not delete client files, invoice items, or history.</p>
    </section>
  `;
  renderInvoiceRows(rows);
  $$(".status-actions button[data-status]", detail).forEach((btn) => btn.addEventListener("click", () => btn.dataset.status === "completed" ? beginCompletion(messageTemplates) : selectStatusMessage(btn.dataset.status, messageTemplates)));
  $("#messageTemplateSelect", detail)?.addEventListener("change", () => applyMessageTemplate(messageTemplates, customer, ref));
  $("#previewMessageBtn", detail)?.addEventListener("click", previewMessage);
  $("#sendMessageBtn", detail)?.addEventListener("click", () => sendComposedMessage(false));
  $("#sendAndUpdateStatusBtn", detail)?.addEventListener("click", () => sendComposedMessage(true));
  $$(".release-document-btn", detail).forEach(button => button.addEventListener("click", () => setDocumentRelease(button.dataset.fileId, button.dataset.released !== "true")));
  $("#saveCompletionFactsBtn", detail)?.addEventListener("click", saveCompletionFacts);
  $("#completeWithExceptionBtn", detail)?.addEventListener("click", completeWithException);
  populateInvoicePresetSelect();

  $$(".resolve-customer-action", detail).forEach((button) => button.addEventListener("click", async () => { try { await resolveCustomerAction(button); } catch (error) { alert(error.message || "Action could not be resolved."); } }));
  $("#uploadAdminFilesBtn", detail)?.addEventListener("click", async () => { try { await uploadAdminDocuments(id); } catch (error) { alert(error.message || "Documents could not be uploaded."); } });
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
  $("#recordPrimaryPaymentBtn")?.addEventListener("click", () => recordAdminPayment("initial"));
  $("#recordSupplementalPaymentBtn")?.addEventListener("click", () => recordAdminPayment("final"));
  $("#createAdditionalInvoiceBtn")?.addEventListener(
    "click",
    createAdditionalInvoice,
  );
  $("#saveAppointmentBtn")?.addEventListener("click", saveAppointmentDetails);
  $("#archiveRequestBtn")?.addEventListener("click", toggleArchiveRequest);
  $$('[data-open-workspace-tab]', detail).forEach((button) => {
    button.addEventListener("click", () =>
      window.AdminV3?.activateTab(button.dataset.openWorkspaceTab),
    );
  });

  // Convert the newly rendered long detail view into the v3 tab workspace.
  window.AdminV3?.organizeRequestDetail();
  void loadProofControlPanel();
  void renderArchivedCustomerUpdates(id);
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

function renderMessageTemplate(value, customer, ref) {
  const replacements = {
    request_reference: ref,
    customer_first_name: customer?.first_name || "Customer",
    customer_name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer",
    quote_amount: Number(selectedRequest?.quote_amount || selectedRequest?.estimated_total || 0).toFixed(2),
    appointment_date: selectedRequest?.appointment_date || selectedRequest?.preferred_date || "",
    appointment_time: selectedRequest?.appointment_time || selectedRequest?.preferred_time_window || "",
    appointment_location: selectedRequest?.appointment_location || "",
    appointment_link: selectedRequest?.appointment_link || selectedRequest?.ron_session_url || "",
    portal_url: `${location.origin}/success.html?request_id=${selectedRequest?.id || ""}`,
  };
  return String(value || "").replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => replacements[key] ?? "");
}

let currentMessagePreviewContext = null;

function customerPreviewDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00-05:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(date);
}

async function fullEmailPreviewModule() {
  return import("../../supabase/functions/_shared/template-preview.mjs");
}

function applyMessageTemplate(templates, customer, ref) {
  const template = templates.find(item => item.id === $("#messageTemplateSelect")?.value);
  if (!template) return;
  $("#messageSubject").value = renderMessageTemplate(template.subject_template, customer, ref);
  $("#messageBody").value = renderMessageTemplate(template.html_template, customer, ref);
  $("#messageStatus").value = template.associated_status || "";
  $("#messageRequirement").textContent = template.required_attachment_type
    ? `Required attachment: ${statusLabel(template.required_attachment_type)}. The message cannot be sent without it.`
    : "No attachment is required. Released order documents may be selected below.";
  previewMessage();
}

function selectStatusMessage(status, templates) {
  window.AdminV3?.activateTab("messages");
  const select = $("#messageTemplateSelect");
  const template = templates.find(item => item.associated_status === status);
  $("#messageStatus").value = status;
  if (template && select) {
    select.value = template.id;
    select.dispatchEvent(new Event("change"));
  } else {
    $("#messageComposerStatus").textContent = `No active centralized template is mapped to ${statusLabel(status)}.`;
  }
  $("#messageTemplateSelect")?.focus();
}

async function previewMessage() {
  const preview = $("#messagePreview");
  if (!preview) return;
  const templateId = $("#messageTemplateSelect")?.value;
  const template = currentMessagePreviewContext?.templates?.find(item => item.id === templateId);
  if (!template) { preview.hidden = false; preview.textContent = "Choose a template to render the complete customer email."; return; }
  const { renderFullTemplateEmail } = await fullEmailPreviewModule();
  const rendered = renderFullTemplateEmail({ template, context: currentMessagePreviewContext.context, editedBody: $("#messageBody")?.value || "", subjectOverride: $("#messageSubject")?.value || null });
  preview.hidden = false;
  preview.innerHTML = `<div class="email-preview-toolbar"><strong>${escapeHtml($("#messageSubject")?.value || rendered.subject)}</strong><span>Full customer email · current request data</span></div><iframe class="aps-full-email-preview" title="Complete customer email preview" sandbox srcdoc="${escapeHtml(rendered.html)}"></iframe>`;
}

async function saveCompletionFacts() {
  if (!selectedRequest) return;
  const deliveryPath = $("#completionDeliveryPath")?.value || "";
  const payload = {
    service_request_id: selectedRequest.id,
    components: $$(".completion-component:checked").map(input => input.value),
    pickup_required: Boolean($("#completionPickupRequired")?.checked),
    proof_of_delivery_required: Boolean($("#completionPodRequired")?.checked),
    aps_deliverable_required: deliveryPath === "aps" ? true : deliveryPath ? false : null,
    external_platform_delivery: deliveryPath === "external",
    physical_only: deliveryPath === "physical",
    customer_declined_optional_deliverable: deliveryPath === "declined",
  };
  $$(".completion-fact").forEach(input => { payload[input.dataset.key] = Boolean(input.checked); });
  payload.updated_at = new Date().toISOString();
  const [{ error }, { error: requestError }] = await Promise.all([
    adminClient.from("request_completion_facts").upsert(payload, { onConflict: "service_request_id" }),
    adminClient.from("service_requests").update({ document_state: $("#completionDocumentState")?.value || "pending", participant_state: $("#completionParticipantState")?.value || "pending" }).eq("id", selectedRequest.id),
  ]);
  const result = $("#completionGateResult");
  if (error || requestError) { result.hidden = false; result.textContent = error?.message || requestError?.message || "Fulfillment facts could not be saved."; return; }
  selectedRequest.document_state = $("#completionDocumentState")?.value || "pending";
  selectedRequest.participant_state = $("#completionParticipantState")?.value || "pending";
  result.hidden = false; result.textContent = "Fulfillment facts saved.";
}

function renderCompletionBlockers(blockers = []) {
  const result = $("#completionGateResult");
  if (!result) return;
  result.hidden = false;
  result.innerHTML = blockers.length
    ? `<h4>Completion is blocked</h4><ul>${blockers.map(item => `<li><button class="completion-blocker-link" data-tab="${escapeHtml(item.target_tab || "overview")}" type="button">${escapeHtml(item.message)}</button></li>`).join("")}</ul>`
    : "<strong>All applicable completion requirements are satisfied.</strong>";
  $$(".completion-blocker-link", result).forEach(button => button.addEventListener("click", () => window.AdminV3?.activateTab(button.dataset.tab)));
  const exception = $("#completionExceptionPanel");
  if (exception) exception.hidden = blockers.length === 0;
}

async function beginCompletion(templates) {
  if (!selectedRequest) return;
  const { data, error } = await adminClient.functions.invoke("update-request-status", { body: { request_id: selectedRequest.id, status: "completed", validate_only: true, send_message: false } });
  if (error || data?.ok === false) { renderCompletionBlockers(data?.blockers || data?.validation?.blockers || [{ message: data?.error || error?.message || "Completion could not be evaluated.", target_tab: "overview" }]); return; }
  renderCompletionBlockers(data.validation?.blockers || []);
  if (data.validation?.allowed) selectStatusMessage("completed", templates);
  else window.AdminV3?.activateTab("fulfillment");
}

async function completeWithException() {
  if (!selectedRequest) return;
  const exceptionType = $("#completionExceptionType")?.value || "";
  const explanation = $("#completionExceptionExplanation")?.value?.trim() || "";
  if (!exceptionType || explanation.length < 5) { renderCompletionBlockers([{ message: "Select an exception type and enter a meaningful explanation.", target_tab: "fulfillment" }]); return; }
  const { data, error } = await adminClient.functions.invoke("update-request-status", { body: { request_id: selectedRequest.id, status: "completed", send_message: false, complete_with_exception: true, exception_type: exceptionType, exception_explanation: explanation } });
  if (error || data?.ok === false) { renderCompletionBlockers(data?.blockers || [{ message: data?.error || error?.message || "Exception completion failed.", target_tab: "fulfillment" }]); return; }
  showToast("Order completed with an audited exception.");
  await refreshSelectedRequest(selectedRequest.id);
}

async function setDocumentRelease(fileId, released) {
  if (!selectedRequest || !fileId) return;
  const update = released
    ? { customer_visible: true, eligible_for_delivery: true, document_classification: "customer_deliverable", review_state: "approved" }
    : { customer_visible: false, eligible_for_delivery: false };
  const { error } = await adminClient.from("request_files").update(update).eq("id", fileId).eq("service_request_id", selectedRequest.id);
  if (error) { alert(error.message || "Document release could not be updated."); return; }
  await adminClient.from("request_timeline_events").insert({ service_request_id: selectedRequest.id, event_type: released ? "document_released" : "document_release_withdrawn", title: released ? "Document released" : "Document release withdrawn", actor_type: "admin", visibility: "customer" });
  await selectRequest(selectedRequest.id);
  window.AdminV3?.activateTab("documents");
}

async function sendComposedMessage(updateStatus) {
  if (!selectedRequest) return;
  if (window.__alignedSendingMessage) return;
  const templateId = $("#messageTemplateSelect")?.value;
  const status = updateStatus ? $("#messageStatus")?.value : "";
  const output = $("#messageComposerStatus");
  if (!templateId) { output.textContent = "Select an APS message template."; return; }
  if (updateStatus && !status) { output.textContent = "Select the status to apply after delivery."; return; }
  window.__alignedSendingMessage = true;
  output.textContent = "Sending…";
  const requestFileIds = $$(".message-file-attachment:checked").map(input => input.value);
  try {
    const { data, error } = await adminClient.functions.invoke("send-message", { body: {
      request_id: selectedRequest.id, template_id: templateId, recipient: $("#messageRecipient")?.value,
      cc: $("#messageCc")?.value, subject: $("#messageSubject")?.value, html: $("#messageBody")?.value,
      request_file_ids: requestFileIds, status,
    } });
    if (error || data?.ok === false) { output.textContent = data?.error || error?.message || "Message delivery failed; status was not changed."; return; }
    output.textContent = updateStatus ? "Message delivered and status updated." : "Message delivered.";
    await refreshSelectedRequest(selectedRequest.id);
  } catch (error) {
    output.textContent = error?.message || "Message delivery failed; status was not changed.";
  } finally {
    window.__alignedSendingMessage = false;
  }
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

  // Status transitions are operational only. Payments are recorded through
  // the explicit Payment Actions above and never materialized by a status.

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
          send_message: !$("#updateStatusWithoutSending")?.checked,
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
  let quoteId = selectedRequest.current_quote_id || null;
  if (quoteId) {
    const { error: quoteError } = await adminClient.from("quotes").update({ amount: total, notes: note, state: "saved", updated_at: new Date().toISOString() }).eq("id", quoteId);
    if (quoteError) { alert(quoteError.message); return false; }
  } else {
    const { data: existingQuote } = await adminClient.from("quotes").select("id").eq("service_request_id", selectedRequest.id).order("version", { ascending: false }).limit(1).maybeSingle();
    quoteId = existingQuote?.id || null;
    if (quoteId) {
      const { error: quoteError } = await adminClient.from("quotes").update({ amount: total, notes: note, state: "saved", updated_at: new Date().toISOString() }).eq("id", quoteId);
      if (quoteError) { alert(quoteError.message); return false; }
    } else {
      const quoteNumber = `Q-${String(selectedRequest.id).slice(0,8).toUpperCase()}-01`;
      const { data: quote, error: quoteError } = await adminClient.from("quotes").insert({ service_request_id: selectedRequest.id, quote_number: quoteNumber, state: "saved", amount: total, notes: note, version: 1 }).select("id").single();
      if (quoteError) { alert(quoteError.message); return false; }
      quoteId = quote.id;
    }
    const { error: linkError } = await adminClient.from("service_requests").update({ current_quote_id: quoteId }).eq("id", selectedRequest.id);
    if (linkError) { alert(linkError.message); return false; }
    selectedRequest.current_quote_id = quoteId;
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
  window.dispatchEvent(new CustomEvent("aps:requests-loading"));
  const { data, error } = await adminClient
    .from("service_requests")
    .select(
      "id,created_at,service_type,status,preferred_date,preferred_time_window,notes,estimated_total,archived_at,quote_amount,full_quote_amount,initial_payment_amount,paid_amount,quote_notes,current_quote_id,invoice_number,invoice_url,receipt_url,receipt_pdf_url,payment_status,paid_at,appointment_confirmed_at,appointment_date,appointment_time,appointment_timezone,appointment_location,appointment_link,appointment_platform,appointment_instructions,balance_due_at_appointment,appointment_line_items_note,customer_message,review_link_google,review_link_yelp,prep_video_url,invoice_status,balance_due,workflow_status,payment_state,appointment_state,request_completeness,document_state,participant_state,fulfillment_state,detected_pdf_page_count,is_same_day_request,is_next_day_request,quote_expires_at,customers(id,first_name,last_name,email,phone,preferred_contact),ron_requests(ron_platform),mobile_notary_requests(street_address,unit,city,state,zip),print_scan_requests(fulfillment_type,delivery_address)",
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(300);
  if (error) {
    setText("adminLiveStatus", `Could not load requests: ${error.message}`);
    $("#requestList").innerHTML =
      `<div class="request-empty">${escapeHtml(error.message)}</div>`;
    window.dispatchEvent(
      new CustomEvent("aps:requests-error", {
        detail: { message: error.message || "Requests could not be loaded." },
      }),
    );
    return;
  }
  requests = data || [];
  const requestIds = requests.map((request) => request.id).filter(Boolean);
  if (requestIds.length) {
    const { data: invoiceSearchRows, error: invoiceSearchError } =
      await adminClient
        .from("invoices")
        .select("service_request_id,invoice_number")
        .in("service_request_id", requestIds);

    if (invoiceSearchError) {
      console.warn(
        "Invoice numbers could not be added to request search:",
        invoiceSearchError,
      );
    } else {
      const invoiceNumbersByRequest = new Map();
      (invoiceSearchRows || []).forEach((invoice) => {
        if (!invoice.service_request_id || !invoice.invoice_number) return;
        const numbers =
          invoiceNumbersByRequest.get(invoice.service_request_id) || [];
        numbers.push(invoice.invoice_number);
        invoiceNumbersByRequest.set(invoice.service_request_id, numbers);
      });
      requests.forEach((request) => {
        request.search_invoice_numbers =
          invoiceNumbersByRequest.get(request.id) || [];
      });
    }
  }
  if (selectedRequest)
    selectedRequest =
      requests.find((r) => r.id === selectedRequest.id) || selectedRequest;
  renderStats();
  renderRequestList();
  setText("adminLiveStatus", "Live and listening for new requests.");
  window.dispatchEvent(new CustomEvent("aps:requests-loaded", { detail: { requests: [...requests] } }));
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
  window.dispatchEvent(new CustomEvent("aps:support-loaded", { detail: { supportTickets: [...supportTickets] } }));
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
