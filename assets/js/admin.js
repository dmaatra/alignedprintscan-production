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
window.adminClient = adminClient;

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
    loan_signing: "Loan Signing",
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
const mobileTravelSession = new Map();

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

async function invokeMobileTravel(command, body = {}) {
  const { data, error } = await adminClient.functions.invoke("admin-route-distance", { body: { command, request_id: selectedRequest?.id, ...body } });
  if (error || !data?.ok) {
    let serverError = data?.error;
    if (!serverError && error?.context?.json) {
      try { serverError = (await error.context.json())?.error; } catch (_) { /* Preserve the transport fallback below. */ }
    }
    throw new Error(serverError || error?.message || "Travel calculation failed.");
  }
  return data;
}

function travelCalculationMarkup(calculation) {
  if (!calculation) return '<p class="admin-muted">Choose an origin to calculate driving distance. The quote is not changed until you select Add to Quote.</p>';
  const applied=calculation.application_state==="applied";
  return `<div class="mobile-travel-results" data-calculation-id="${escapeHtml(calculation.id)}"><div><span>One-way driving distance</span><strong>${Number(calculation.one_way_miles).toFixed(1)} miles</strong></div><div><span>Round-trip distance</span><strong>${Number(calculation.round_trip_miles).toFixed(1)} miles</strong></div><div><span>Estimated drive time</span><strong>${Math.max(1,Math.round(Number(calculation.duration_seconds||0)/60))} minutes each way</strong></div><div><span>APS travel tier</span><strong>${escapeHtml(calculation.pricing_tier_label)}</strong></div><div><span>Suggested travel fee</span><strong>${calculation.suggested_fee==null?"Manual pricing required":money(calculation.suggested_fee)}</strong></div><div><span>Quote state</span><strong>${applied?`${money(calculation.applied_fee)} currently applied`:"Preview only"}</strong></div></div><div class="mobile-travel-apply"><label>Actual fee<input id="mobileTravelFee" type="number" min="0" step=".01" value="${Number(calculation.applied_fee??calculation.suggested_fee??0).toFixed(2)}"></label><label>Override/operator note<textarea id="mobileTravelNote" placeholder="Required when fee differs from suggestion"></textarea></label><button id="applyMobileTravel" class="btn primary" type="button">${applied?"Update Quote":"Add to Quote"}</button></div>`;
}

async function loadMobileTravelCard({force=false}={}) {
  const panel=$("#mobileTravelCard");if(!panel||selectedRequest?.service_type!=="mobile")return;
  const status=$("#mobileTravelStatus",panel),results=$("#mobileTravelResults",panel);
  try{
    const state=await invokeMobileTravel("get_request"),detail=state.detail||{},destination=[detail.street_address,detail.unit,detail.city,detail.state,detail.zip].filter(Boolean).join(", ");
    $("#mobileTravelDestination",panel).textContent=destination||"Complete the Mobile service address first.";
    const originSelect=$("#mobileTravelOrigin",panel);originSelect.innerHTML='<option value="">Default travel origin</option>'+state.origins.map(origin=>`<option value="${escapeHtml(origin.id)}" ${origin.is_default?"selected":""}>${escapeHtml(origin.label)}${origin.is_default?" — Default":""}</option>`).join("")+'<option value="one-time">Use Different Starting Address</option>';
    const prior=state.calculations?.[0]||null;results.innerHTML=travelCalculationMarkup(prior);bindMobileTravelActions();
    if(!destination){status.textContent="Travel distance unavailable — complete the Mobile service address first.";return;}
    if(!state.origins.length){status.textContent="Add an active Default Travel Origin in Settings or use a one-time starting address.";return;}
    if(!state.configured){status.textContent="Automatic travel calculation is not configured. Manual travel entry remains available.";return;}
    const sessionKey=`${selectedRequest.id}:${originSelect.value}:${destination}`;
    if(force||!mobileTravelSession.has(sessionKey)){if(await calculateMobileTravel(force))mobileTravelSession.set(sessionKey,true);}
    else status.textContent=prior?"Saved route result loaded.":"Ready to calculate.";
  }catch(error){status.textContent=error.message;results.innerHTML=travelCalculationMarkup(null);bindMobileTravelActions();}
}

async function calculateMobileTravel(force=false){const panel=$("#mobileTravelCard"),status=$("#mobileTravelStatus",panel),origin=$("#mobileTravelOrigin",panel),oneTime=origin.value==="one-time";status.textContent="Calculating driving route…";try{const body={force,origin_id:oneTime?null:origin.value};if(oneTime)body.one_time_origin={label:"One-time origin",street_address:$("#oneTimeOriginStreet",panel).value,city:$("#oneTimeOriginCity",panel).value,state:$("#oneTimeOriginState",panel).value,zip:$("#oneTimeOriginZip",panel).value};const data=await invokeMobileTravel("calculate",body);$("#mobileTravelResults",panel).innerHTML=travelCalculationMarkup(data.calculation);status.textContent=data.cached?"Saved route result reused.":"Route calculated. Review the suggestion before changing the quote.";bindMobileTravelActions();return true;}catch(error){status.textContent=error.message;return false;}}
function bindMobileTravelActions(){const panel=$("#mobileTravelCard");if(!panel)return;const origin=$("#mobileTravelOrigin",panel);origin?.addEventListener("change",()=>{$("#oneTimeOriginFields",panel).hidden=origin.value!=="one-time";if(origin.value!=="one-time")void calculateMobileTravel(false);});$("#recalculateMobileTravel",panel)?.addEventListener("click",()=>calculateMobileTravel(true));$("#applyMobileTravel",panel)?.addEventListener("click",async()=>{try{await invokeMobileTravel("apply_to_quote",{calculation_id:$(".mobile-travel-results",panel)?.dataset.calculationId,actual_fee:Number($("#mobileTravelFee",panel).value),operator_note:$("#mobileTravelNote",panel).value});showToast("Mobile travel charge applied through the maintained quote workflow.");await selectRequest(selectedRequest.id);}catch(error){alert(error.message);}});$("#applyManualMobileTravel",panel)?.addEventListener("click",async()=>{try{await invokeMobileTravel("apply_manual",{round_trip_miles:Number($("#manualTravelMiles",panel).value),actual_fee:Number($("#manualTravelFee",panel).value),operator_note:$("#manualTravelNote",panel).value});showToast("Manual Mobile travel charge applied with audit history.");await selectRequest(selectedRequest.id);}catch(error){alert(error.message);}});}

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
  if (!data.session) return null;
  const { error } = await adminClient.functions.invoke("admin-business-foundation", { body: { command: "staff_access" } });
  if (error) {
    await adminClient.auth.signOut();
    return null;
  }
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
    const session = await ensureAdminSession();
    if (!session) {
      if (status) status.textContent = "Active APS staff access is required. Business members must use Business Sign In.";
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
      group: "Loan Signing",
      label: "Seller / Simple Loan Signing Service",
      quantity: 1,
      unitPrice: PRICING.loanSigning.standardPackages.seller,
    },
    {
      group: "Loan Signing",
      label: "Loan Modification Signing Service",
      quantity: 1,
      unitPrice: PRICING.loanSigning.standardPackages.loan_modification,
    },
    {
      group: "Loan Signing",
      label: "Buyer / Purchase Loan Signing Service",
      quantity: 1,
      unitPrice: PRICING.loanSigning.standardPackages.buyer_purchase,
    },
    {
      group: "Loan Signing",
      label: "Refinance Loan Signing Service",
      quantity: 1,
      unitPrice: PRICING.loanSigning.standardPackages.refinance,
    },
    {
      group: "Loan Signing",
      label: "HELOC Loan Signing Service",
      quantity: 1,
      unitPrice: PRICING.loanSigning.standardPackages.heloc,
    },
    {
      group: "Loan Signing",
      label: "Reverse Mortgage Loan Signing Service",
      quantity: 1,
      unitPrice: PRICING.loanSigning.standardPackages.reverse_mortgage,
    },
    {
      group: "Loan Signing",
      label: "Extended Travel — 31–40 RT Miles",
      quantity: 1,
      unitPrice: PRICING.loanSigning.extendedTravel31To40,
    },
    {
      group: "Loan Signing",
      label: "Approved Additional Wait Time — Started 30 Minutes",
      quantity: 1,
      unitPrice: 25,
    },
    {
      group: "Loan Signing",
      label: "Other Approved Loan Signing Adjustment — Enter Reviewed Rate",
      quantity: 1,
      unitPrice: 0,
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
  const quick = window.APSAdminRequestFilters?.active || "all";
  return requests.filter((r) => {
    const requestStatus = r.status || "under_review";
    const serviceOk = service === "all" || r.service_type === service;
    const statusOk = status === "all" || requestStatus === status;
    const archiveOk =
      archive === "all" ||
      (archive === "active" ? !isArchived(r) : isArchived(r));
    const quickOk =
      quick === "all" ||
      (quick === "active" && !["completed", "cancelled"].includes(requestStatus)) ||
      (quick === "pending" && [
        "under_review",
        "quote_ready",
        "awaiting_approval",
        "changes_requested",
        "awaiting_payment",
        "payment_pending",
        "final_balance_due",
      ].includes(requestStatus)) ||
      (quick === "completed" && requestStatus === "completed");
    return serviceOk && statusOk && archiveOk && quickOk;
  });
}

window.APSAdminRequestFilters = {
  active: "all",
  setQuickFilter(value) {
    this.active = ["all", "active", "pending", "completed"].includes(value)
      ? value
      : "all";
    renderRequestList();
  },
};

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
      <button class="request-row ${selected}" data-id="${r.id}" data-archived="${String(isArchived(r))}" data-reference="${escapeHtml(refFromId(r.id))}" data-customer-name="${escapeHtml(name)}" data-customer-email="${escapeHtml(customer?.email || "")}" data-customer-phone="${escapeHtml(customer?.phone || "")}" data-invoice-numbers="${escapeHtml([r.invoice_number, ...(r.search_invoice_numbers || [])].filter(Boolean).join("|"))}" data-service-label="${escapeHtml(serviceLabel(r.service_type))}" data-status-label="${escapeHtml(statusLabel(r.workflow_status || r.status))}" data-search-index="${escapeHtml(searchIndex)}" type="button">
        <span class="request-ref">${refFromId(r.id)}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${created}</small>
        <span class="service-tag ${serviceColor(r.service_type)}">${serviceLabel(r.service_type)}</span>
        <span class="status-pill">${statusLabel(r.status)}</span>${requestUrgencyBadge(r)}${archivedBadge}
      </button>
    `;
    })
    .join("");
  const activeSearchTerm =
    $("#requestSearch")?.value || $("#globalAdminSearch")?.value || "";
  window.AdminV3?.filterVisibleRequestCards(activeSearchTerm);
}
async function getFiles(requestId) {
  const { data, error } = await adminClient
    .from("request_files")
    .select("id,file_name,file_path,file_type,file_size,created_at,uploaded_by,document_category,document_classification,customer_visible,eligible_for_delivery,review_state,is_active,detected_page_count,page_count_status,page_count_source,page_count_error")
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
  if (error) throw new Error(`Unable to load ${table} details: ${error.message}`);
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
    witness_review_required: "Witness Review Required",
    scan_back_needed: "Completed-document scan back",
    scan_to_pdf_needed: "Document scanning / PDF conversion",
  };

  const labels = (key) =>
    explicitLabels[key] ||
    String(key || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const entries = [];
  list.forEach((row) => {
    const witnessesRequired = [row.witness_need, row.witnesses_needed].some(value => value === true || ["yes","required"].includes(String(value || "").toLowerCase()));
    Object.entries(row || {}).forEach(([key, value]) => {
      if (
        hidden.has(key) ||
        value === null ||
        value === undefined ||
        value === ""
      )
        return;
      if (key === "witnesses_needed" && row.witness_need !== undefined) return;
      if (["witness_provider","client_witness_count","provided_witness_count"].includes(key) && !witnessesRequired) value = "N/A";
      if (key === "witness_count" && !witnessesRequired) value = 0;
      if (key === "witness_review_required" && !witnessesRequired) value = false;
      if (typeof value === "boolean") value = value ? "Yes" : "No";
      if (key === "witness_need") value = witnessesRequired ? "Yes" : "No";
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

function participantLegalName(person = {}) {
  return [person.first_name, person.middle_name, person.last_name].map(value => String(value || "").trim()).filter(Boolean).join(" ") || String(person.full_legal_name || "").trim();
}

function participantReadiness(person = {}) {
  if (person.participant_type !== "signer") return [];
  const missing=[];
  if (!String(person.first_name || "").trim()) missing.push("First name");
  if (!String(person.last_name || "").trim()) missing.push("Last name");
  return missing;
}

function assembledMobileAddress(detail = {}, fallback = "") {
  detail ||= {};
  const street=[detail.street_address,detail.unit].filter(Boolean).join(" ").trim();
  const locality=[detail.city,detail.state].filter(Boolean).join(", ") + (detail.zip ? ` ${detail.zip}` : "");
  return [street,locality.trim()].filter(Boolean).join("\n") || fallback || "Not provided";
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
  if (s === "loan_signing" || s.includes("loan")) return "loan";
  return "document";
}

function internalWorkflowGuide(request) {
  const kind = workflowKind(request?.service_type);
  const label =
    kind === "ron"
      ? "Remote Online Notary Workflow"
      : kind === "mobile"
        ? "Mobile Notary Workflow"
        : kind === "loan"
          ? "Loan Signing Workflow"
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
    loan: [
      ["under_review", "Assignment Received"],
      ["awaiting_approval", "Scope & Pricing Review"],
      ["awaiting_payment", "Payment Due"],
      ["payment_received", "Payment Received"],
      ["appointment_confirmed", "Signing Scheduled"],
      ["signing_in_progress", "Signing In Progress"],
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
  const snapshot = request.estimate_components;
  let snapshotRows = window.APSEstimateComponents?.quoteRows?.(
    request.estimate_components,
  ) || [];
  if (snapshot?.snapshot_version === window.APSEstimateComponents?.SNAPSHOT_VERSION) {
    const assignment = Array.isArray(request.loan_signing_assignments)
      ? request.loan_signing_assignments[0]
      : request.loan_signing_assignments;
    if (request.service_type === "loan_signing" && assignment?.round_trip_miles !== null && assignment?.round_trip_miles !== undefined) {
      const intakeTravelLabels = new Set((snapshot.components || []).filter((item) => String(item.key || "").startsWith("loan_signing:travel:")).map((item) => item.label));
      snapshotRows = snapshotRows.filter((row) => !intakeTravelLabels.has(row.description));
      const travel = window.APSEstimateComponents.loanSigningTravel(assignment.round_trip_miles);
      if (travel.charge > 0) snapshotRows.push({ item_type: "service", description: travel.label, quantity: 1, unit_price: travel.charge, line_total: travel.charge });
      if (travel.reviewRequired) snapshotRows.push({ item_type: "service", description: travel.label, quantity: 1, unit_price: 0, line_total: 0 });
    }
    if (snapshotRows.length) return snapshotRows;
    const reviewLine = snapshot.components?.find((item) => item.billable && item.review_required);
    if (reviewLine) return [{ item_type: "service", description: reviewLine.label, quantity: 1, unit_price: 0, line_total: 0 }];
  }
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

function estimateRequirementsSummary(request = {}) {
  const snapshot = request.estimate_components;
  if (!snapshot || !Array.isArray(snapshot.components)) return "";
  const included = snapshot.components.filter((item) => !item.billable || item.included || item.review_required);
  if (!included.length) return "";
  const assignment = Array.isArray(request.loan_signing_assignments) ? request.loan_signing_assignments[0] : request.loan_signing_assignments;
  const mileage = request.service_type === "loan_signing" && assignment?.round_trip_miles !== null && assignment?.round_trip_miles !== undefined
    ? window.APSEstimateComponents.loanSigningTravel(assignment.round_trip_miles)
    : null;
  return `<aside class="estimate-requirements-summary" aria-label="Estimate and assignment requirements">
    <div class="admin-v3-section-heading"><span class="small-label">Estimate Snapshot</span><h3>Included / Assignment Requirements</h3></div>
    <ul>${included.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${item.review_required ? "Review Required" : item.included ? "Included" : "Operational"}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</span></li>`).join("")}</ul>
    ${mileage ? `<p><strong>Operator-reviewed round-trip mileage:</strong> ${escapeHtml(mileage.label)} · ${mileage.reviewRequired ? "Review Required" : mileage.charge ? money(mileage.charge) : "Included"}</p>` : ""}
    ${snapshot.review_required ? '<p class="admin-muted"><strong>Operator review is required before the quote is sent.</strong></p>' : ""}
  </aside>`;
}


function mergeCommunicationRecords(canonical = [], legacy = []) {
  const canonicalIds = new Set(canonical.map((row) => String(row.id || "")));
  const normalizedCanonical = canonical.map((row) => ({
    ...row,
    delivery_status: row.delivery_state || row.delivery_status || "",
    created_at: row.sent_at || row.failed_at || row.attempted_at || row.created_at,
  }));
  const legacyOnly = legacy.filter((row) => {
    const unifiedId = String(row.metadata?.unified_message_id || "");
    return !unifiedId || !canonicalIds.has(unifiedId);
  });
  return [...normalizedCanonical, ...legacyOnly].sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

async function getPatch32Records(requestId) {
  const [actions, refunds, timeline, canonicalCommunications, legacyCommunications] = await Promise.all([
    adminClient.from("customer_action_requests").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
    adminClient.from("refunds").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
    adminClient.from("request_timeline_events").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
    adminClient.from("messages").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
    adminClient.from("request_communications").select("*").eq("service_request_id", requestId).order("created_at", { ascending: false }),
  ]);
  return {
    actions: actions.data || [],
    refunds: refunds.data || [],
    timeline: timeline.data || [],
    communications: mergeCommunicationRecords(canonicalCommunications.data || [], legacyCommunications.data || []),
  };
}

function patch32AdminPanels(records = {}) {
  const actions = records.actions || [];
  const refunds = records.refunds || [];
  const pending = actions.filter((a) => String(a.status || "") === "pending");
  const actionRows = pending.length ? pending.map((a) => `<div class="admin-action-request" data-action-id="${escapeHtml(a.id)}" data-action-type="${escapeHtml(a.action_type)}"><strong>${escapeHtml(String(a.action_type || "request").toUpperCase())}</strong><p>${escapeHtml(a.reason || "No reason provided")}</p>${a.proposed_appointment_at ? `<p><strong>Proposed:</strong> ${new Date(a.proposed_appointment_at).toLocaleString()}</p>` : ""}<div class="status-actions"><button class="btn primary resolve-customer-action" type="button">${a.action_type === "cancel" ? "Cancel / Review Cancellation" : "Review Reschedule"}</button></div></div>`).join("") : '<p class="admin-muted">No pending cancellation or reschedule requests.</p>';
  const approvedRefunds = actions.filter(a => Number(a.approved_refund_amount || 0) > 0).map(a => ({ action: a, recorded: refunds.filter(r => r.customer_action_request_id === a.id && r.status === "succeeded").reduce((sum, r) => sum + Number(r.amount || 0), 0) })).filter(row => Number(row.action.approved_refund_amount || 0) > row.recorded + .009);
  const refundWork = approvedRefunds.map(row => `<div class="admin-action-request" data-action-id="${escapeHtml(row.action.id)}"><strong>REFUND PROCESSING REQUIRED</strong><p>Approved: ${money(row.action.approved_refund_amount)} · Recorded: ${money(row.recorded)}</p><button class="btn primary open-refund-workflow" type="button">Process / Record Refund</button></div>`).join("");
  const refundRows = refunds.length ? `<ul class="admin-file-list">${refunds.map(r => `<li><strong>${money(r.amount)} refunded via ${escapeHtml(statusLabel(r.refund_method))}</strong><small>${escapeHtml(statusLabel(r.status))} · ${r.issued_at ? new Date(r.issued_at).toLocaleString() : "Pending"}${r.provider_refund_id ? ` · Provider ${escapeHtml(r.provider_refund_id)}` : r.external_reference ? ` · Reference ${escapeHtml(r.external_reference)}` : ""}</small></li>`).join("")}</ul>` : '<p class="admin-muted">No refunds recorded. Original payment history remains unchanged.</p>';
  const commRows = (records.communications || []).slice(0, 25).map((c) => `<li><strong>${escapeHtml(c.subject || c.channel || "Communication")}</strong><small>${escapeHtml(c.direction === "inbound" ? "Inbound · Customer" : "Outbound · APS")} · ${escapeHtml(c.delivery_state || c.delivery_status || "")} · ${c.created_at ? new Date(c.created_at).toLocaleString() : ""}</small>${c.rendered_text || c.body ? `<p>${escapeHtml(c.rendered_text || c.body)}</p>` : ""}${c.metadata?.attachment_names?.length ? `<small>Attachments: ${escapeHtml(c.metadata.attachment_names.join(", "))}</small>` : ""}</li>`).join("") || '<li class="admin-muted">No communications logged.</li>';
  const timelineRows = (records.timeline || []).slice(0, 30).map((e) => `<li><strong>${escapeHtml(e.title || e.event_type || "Event")}</strong><p>${escapeHtml(e.detail || "")}</p><small>${escapeHtml(e.actor_type || "system")} · ${e.created_at ? new Date(e.created_at).toLocaleString() : ""}</small></li>`).join("") || '<li class="admin-muted">No timeline events logged.</li>';
  return `<div class="admin-detail-section"><h3>Cancellation & Reschedule Review</h3>${actionRows}${refundWork}</div><div class="admin-detail-section"><h3>Refund History</h3>${refundRows}</div>
  <div class="admin-detail-section"><h3>Communication Log</h3><ul class="admin-file-list">${commRows}</ul></div>
  <div class="admin-detail-section"><h3>Automatic Timeline</h3><ul class="admin-file-list">${timelineRows}</ul></div>`;
}

async function resolveCustomerAction(button) {
  const card = button.closest(".admin-action-request");
  if (card?.dataset.actionType === "reschedule") return openRescheduleWorkflow(card.dataset.actionId);
  return openCancellationWorkflow(card?.dataset.actionId);
}

async function invokeServiceAdjustment(body) {
  const { data, error } = await adminClient.functions.invoke("admin-service-adjustment", { body: { request_id: selectedRequest.id, ...body } });
  if (error || data?.ok === false) throw new Error(data?.error || error?.message || "The workflow could not be completed.");
  return data;
}

async function openCancellationWorkflow(actionId) {
  const preview = await invokeServiceAdjustment({ command: "preview_cancellation" });
  const dialog = document.createElement("dialog"); dialog.className = "admin-v3-danger-dialog service-adjustment-dialog";
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><span class="small-label">Guided cancellation review</span><h2>Cancel / Review Cancellation</h2><p><strong>${escapeHtml(refFromId(selectedRequest.id))}</strong> · ${escapeHtml(serviceLabel(selectedRequest.service_type))} · Policy band: ${escapeHtml(statusLabel(preview.policy_band))}</p><p>Paid ${money(preview.financials.paid)} · Refunded ${money(preview.financials.refunded)} · Net retained ${money(preview.financials.net_retained)} · Outstanding ${money(preview.financials.outstanding)}</p><label>Decision<select name="decision"><option value="approved">Approve cancellation</option><option value="denied">Deny request</option></select></label><label>Reason<select name="reason"><option value="customer_requested">Customer requested</option><option value="aps_unable_to_fulfill">APS unable to fulfill</option><option value="duplicate_request">Duplicate request</option><option value="service_unavailable">Service unavailable</option><option value="other">Other</option></select></label><label>Effective date/time<input name="effective" type="datetime-local" required></label><label class="check"><input name="work" type="checkbox"> Work already performed / meaningful resources committed</label><div class="admin-detail-grid"><label>Earned work<input name="earned" type="number" min="0" step=".01" value="0"></label><label>Nonrecoverable cost<input name="cost" type="number" min="0" step=".01" value="0"></label><label>Cancellation / reserved-capacity amount<input name="fee" type="number" min="0" step=".01" value="0"></label><label>Approved refund<input name="refund" type="number" min="0" step=".01" value="0"></label></div><label class="check"><input name="waived" type="checkbox"> Waive cancellation / reschedule fee</label><label>Internal waiver reason (never shown to customer)<textarea name="waiver"></textarea></label><label>Customer-facing explanation<textarea name="explanation" required></textarea></label><p class="admin-muted">This decision does not move funds. An approved refund must be processed against the exact original payment.</p><div class="status-actions"><button value="cancel" class="btn secondary">Close</button><button type="button" class="btn primary confirm-cancellation">Confirm Review</button></div><div class="workflow-result" role="status" aria-live="polite"></div></form>`;
  document.body.append(dialog); dialog.addEventListener("close",()=>dialog.remove()); dialog.showModal(); const form=dialog.querySelector("form"); form.elements.effective.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  dialog.querySelector(".confirm-cancellation").addEventListener("click", async e=>{if(!form.reportValidity())return;const button=e.currentTarget;button.disabled=true;try{await invokeServiceAdjustment({command:"resolve_cancellation",action_id:actionId,decision:form.elements.decision.value,cancellation_reason_code:form.elements.reason.value,effective_at:new Date(form.elements.effective.value).toISOString(),work_performed:form.elements.work.checked,earned_amount:Number(form.elements.earned.value),nonrecoverable_cost:Number(form.elements.cost.value),fee_amount:Number(form.elements.fee.value),approved_refund_amount:Number(form.elements.refund.value),fee_waived:form.elements.waived.checked,internal_waiver_reason:form.elements.waiver.value,customer_explanation:form.elements.explanation.value});dialog.close();await loadRequests();await selectRequest(selectedRequest.id)}catch(error){dialog.querySelector(".workflow-result").textContent=error.message;button.disabled=false}});
}

async function openRescheduleWorkflow(actionId) {
  const dialog=document.createElement("dialog");dialog.className="admin-v3-danger-dialog service-adjustment-dialog";dialog.innerHTML=`<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><span class="small-label">Guided reschedule</span><h2>Reschedule Appointment</h2><label>New date<input name="date" type="date" required></label><label>New time<input name="time" type="time" required></label><label>Reason<textarea name="reason" required></textarea></label><label class="check"><input name="customer" type="checkbox" checked> Customer-requested</label><label>Applicable fee<input name="fee" type="number" min="0" step=".01" value="0"></label><label class="check"><input name="waived" type="checkbox"> Fee waived</label><label>Internal waiver reason<textarea name="waiver"></textarea></label><p class="admin-muted">An existing Proof transaction is preserved; rescheduling never recreates it solely because the appointment changed.</p><div class="status-actions"><button value="cancel" class="btn secondary">Close</button><button type="button" class="btn primary confirm-reschedule">Save &amp; Notify Customer</button></div><div class="workflow-result" role="status" aria-live="polite"></div></form>`;document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove());dialog.showModal();const form=dialog.querySelector("form");dialog.querySelector(".confirm-reschedule").addEventListener("click",async e=>{if(!form.reportValidity())return;const button=e.currentTarget;button.disabled=true;try{await invokeServiceAdjustment({command:"reschedule",action_id:actionId,new_date:form.elements.date.value,new_time:form.elements.time.value,reason:form.elements.reason.value,customer_requested:form.elements.customer.checked,fee_amount:Number(form.elements.fee.value),fee_waived:form.elements.waived.checked,internal_waiver_reason:form.elements.waiver.value});dialog.close();await loadRequests();await selectRequest(selectedRequest.id)}catch(error){dialog.querySelector(".workflow-result").textContent=error.message;button.disabled=false}});
}

async function openRefundWorkflow(actionId) {
  const preview=await invokeServiceAdjustment({command:"preview_cancellation"});const payments=preview.payments||[];const dialog=document.createElement("dialog");dialog.className="admin-v3-danger-dialog service-adjustment-dialog";dialog.innerHTML=`<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><span class="small-label">History-preserving refund</span><h2>Process / Record Refund</h2><label>Original payment<select name="payment" required><option value="">Select payment</option>${payments.map(p=>`<option value="${escapeHtml(p.id)}">${money(p.amount)} · ${escapeHtml(statusLabel(p.payment_method))} · ${escapeHtml(p.external_reference||"No reference")}</option>`).join("")}</select></label><label>Refund amount<input name="amount" type="number" min=".01" step=".01" required></label><label>Refund method<select name="method"><option value="stripe">Stripe — APS issues refund</option><option value="zelle">Zelle — record after external return</option><option value="cash_app">Cash App — record after external return</option><option value="cash">Cash — record after return</option><option value="check">Check — record after issue</option><option value="other">Other offline — record after return</option></select></label><label>External reference (required for offline refunds)<input name="reference"></label><label>Reason<textarea name="reason" required></textarea></label><label>Internal note<textarea name="note"></textarea></label><p class="admin-muted">Offline methods record funds already returned outside APS. Stripe uses the exact original PaymentIntent and an idempotency key.</p><div class="status-actions"><button value="cancel" class="btn secondary">Close</button><button type="button" class="btn primary confirm-refund">Confirm Refund</button></div><div class="workflow-result" role="status" aria-live="polite"></div></form>`;document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove());dialog.showModal();const form=dialog.querySelector("form");dialog.querySelector(".confirm-refund").addEventListener("click",async e=>{if(!form.reportValidity())return;if(!confirm("Confirm this refund against the selected original payment?"))return;const button=e.currentTarget;button.disabled=true;try{await invokeServiceAdjustment({command:"refund",action_id:actionId,payment_id:form.elements.payment.value,amount:Number(form.elements.amount.value),refund_method:form.elements.method.value,external_reference:form.elements.reference.value,reason:form.elements.reason.value,admin_note:form.elements.note.value,idempotency_key:`refund:${form.elements.payment.value}:${Number(form.elements.amount.value).toFixed(2)}:${form.elements.reference.value||actionId}`});dialog.close();await loadRequests();await selectRequest(selectedRequest.id)}catch(error){dialog.querySelector(".workflow-result").textContent=error.message;button.disabled=false}});
}

async function openServiceConversionWorkflow(){
  if(!["ron","mobile"].includes(selectedRequest.service_type))return;
  const next=selectedRequest.service_type==="ron"?"mobile":"ron";
  const dialog=document.createElement("dialog");dialog.className="admin-v3-danger-dialog service-adjustment-dialog";
  dialog.innerHTML=`<form method="dialog"><button class="dialog-close" value="cancel" formnovalidate aria-label="Close">×</button><span class="small-label">History-preserving service conversion</span><h2>Change Service / Convert Service</h2><p><strong>${escapeHtml(refFromId(selectedRequest.id))}</strong> remains the transaction of record. Quotes, invoices, payments, refunds, documents, messages, Timeline, appointments, and Proof history are preserved.</p><div class="admin-detail-grid"><div><span class="small-label">Current service</span><strong>${escapeHtml(serviceLabel(selectedRequest.service_type))}</strong></div><div><span class="small-label">New service</span><strong>${escapeHtml(serviceLabel(next))}</strong></div><div><span class="small-label">Paid to date</span><strong>${money(selectedRequest.paid_amount||0)}</strong></div><label>Recalculated new-service total<input name="total" type="number" min="0" step=".01" required value="${Number(selectedRequest.quote_amount||selectedRequest.estimated_total||0).toFixed(2)}"></label></div>${next==="mobile"?`<fieldset><legend>Mobile destination requirements</legend><div class="admin-detail-grid"><label>Street address<input name="street" required></label><label>Unit<input name="unit"></label><label>City<input name="city" required></label><label>State<input name="state" required></label><label>ZIP<input name="zip" required></label></div></fieldset>`:`<fieldset><legend>RON destination requirements</legend><div class="admin-detail-grid"><label>Number of signers<input name="signers" type="number" min="1" value="1" required></label><label>Number of notarial acts<input name="acts" type="number" min="1" value="1" required></label></div><p>Each signer must have a first name, last name, and individual email before Proof orchestration.</p></fieldset>`}<label>Conversion reason / operator note<textarea name="reason" required></textarea></label><button type="button" class="btn dark preview-conversion">Preview Financial &amp; Workflow Impact</button><div class="workflow-result" role="status" aria-live="polite"></div><div class="status-actions"><button value="cancel" formnovalidate class="btn secondary">Close</button><button type="button" class="btn primary confirm-conversion" disabled>Confirm Service Conversion</button></div></form>`;
  document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove());dialog.showModal();const form=dialog.querySelector("form"),result=dialog.querySelector(".workflow-result"),confirmButton=dialog.querySelector(".confirm-conversion");
  dialog.querySelector(".preview-conversion").addEventListener("click",async()=>{if(!form.reportValidity())return;try{const preview=await invokeServiceAdjustment({command:"preview_service_conversion",new_service_type:next,new_service_total:Number(form.elements.total.value)});result.innerHTML=`<strong>Conversion preview</strong><p>Current paid/net applied: ${money(preview.financials.net_retained)} · New total: ${money(preview.new_service_total)} · Additional due: ${money(preview.additional_amount_due)} · Credit/refund review: ${money(preview.credit_or_refund_due)}</p><p>Same APS request: Yes · Proof history preserved: ${preview.proof_history_preserved?"Yes":"N/A"}</p>`;confirmButton.disabled=false;}catch(error){result.textContent=error.message;}});
  confirmButton.addEventListener("click",async()=>{if(!form.reportValidity()||!confirm("Convert this APS request while preserving all historical records?"))return;confirmButton.disabled=true;try{await invokeServiceAdjustment({command:"convert_service",new_service_type:next,new_service_total:Number(form.elements.total.value),reason:form.elements.reason.value,street_address:form.elements.street?.value,unit:form.elements.unit?.value,city:form.elements.city?.value,state:form.elements.state?.value,zip:form.elements.zip?.value,number_of_signers:Number(form.elements.signers?.value||1),number_of_notarizations:Number(form.elements.acts?.value||1)});dialog.close();await loadRequests();await selectRequest(selectedRequest.id);showToast("Service converted; financial and fulfillment history preserved.");}catch(error){result.textContent=error.message;confirmButton.disabled=false;}});
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
    const { data: records, error: recordError } = await adminClient.from("request_files").insert({ service_request_id: requestId, file_name: file.name, file_path: path, file_type: file.type, file_size: file.size, uploaded_by: "admin", document_category: "admin-additional", document_classification: classification, customer_visible: false, eligible_for_delivery: false, is_active: true, page_count_status: /pdf$/i.test(file.name)||file.type==="application/pdf"?"pending":"not_pdf" }).select("id");
    if (recordError) throw recordError;
    if ((/pdf$/i.test(file.name) || file.type === "application/pdf") && records?.[0]?.id) {
      const result = await adminClient.functions.invoke("admin-pdf-page-count", { body: { request_id: requestId, file_id: records[0].id } });
      if (result.error || result.data?.ok === false) console.warn("PDF page count requires review:", result.data?.error || result.error?.message);
    }
  }
  await adminClient.from("request_timeline_events").insert({ service_request_id: requestId, event_type: "documents_uploaded", title: "Administrator documents uploaded", detail: `${files.length} document(s) uploaded by administrator.`, actor_type: "admin", metadata: { file_count: files.length } });
  await selectRequest(requestId);
}

async function verifyPdfPageCount(fileId, currentValue = "") {
  const value = prompt("Enter the verified PDF page count.", currentValue || "");
  if (value === null) return;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    alert("Enter a whole-number page count of 1 or more.");
    return;
  }
  const { data, error } = await adminClient.functions.invoke("admin-pdf-page-count", {
    body: { request_id: selectedRequest.id, file_id: fileId, manual_page_count: count },
  });
  if (error || data?.ok === false) throw new Error(data?.error || error?.message || "Page count could not be saved.");
  await loadRequests();
  await selectRequest(selectedRequest.id);
  window.AdminV3?.activateTab("documents");
  showToast("Verified PDF page count saved and request total recalculated.");
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

function proofOperatorStepper(data,tx,signers,sourceAssets,completedAssets,appointmentReady){
  const payment=Boolean(data.invoices?.primaryPaymentReady),signerReady=signers.length>0&&signers.every(s=>s.configuration_state==="configured"),docsReady=sourceAssets.length>0&&sourceAssets.every(a=>["processed","complete"].includes(a.processing_state)||a.upload_state==="processed"),prepared=Boolean(tx?.document_preparation_confirmed_at),activated=tx?.activation_state==="activated",completed=Boolean(tx?.completed_at||tx?.meeting_state==="completed"),retrieved=completedAssets.some(a=>a.retrieval_state==="retrieved"),proofFiles=(data.files||[]).filter(file=>file.document_category==="proof-completed"),reviewed=proofFiles.some(file=>file.review_state==="approved"),released=proofFiles.some(file=>file.customer_visible===true&&file.eligible_for_delivery===true),signerAccess=signers.some(s=>s.access_link_present||s.invitation_state==="invited"),liveStarted=completed||tx?.meeting_state==="in_progress";
  const stages=[["Business Readiness",payment&&appointmentReady],["Create Proof Draft",Boolean(tx)],["Prepare Signers",signerReady],["Prepare Documents",docsReady],["Tag / Prepare in Proof",prepared,"Admin confirmed"],["Review & Activate",activated],["Signer Access",signerAccess],["Live Notarization",liveStarted],["Proof Completion",completed],["Completed Document Return",retrieved],["APS Review",reviewed],["Customer Release",released],["APS Completion",selectedRequest?.workflow_status==="completed"]];
  let currentFound=false;return `<ol class="proof-operator-stepper">${stages.map(([label,done,note])=>{let state=done?"complete":currentFound?"waiting":"current";if(!done&&!currentFound)currentFound=true;if(label==="Business Readiness"&&!done)state="blocked";return `<li class="is-${state}"><span>${state.replaceAll('_',' ')}</span><strong>${label}</strong>${note?`<small>${note}</small>`:""}</li>`;}).join("")}</ol>`;
}

function proofReturnGuidance(data, tx, assets, files) {
  const state = window.APSProofReturnState?.derive({ request: data.request || selectedRequest, transaction: tx, assets, files }) || null;
  if (!state) return "";
  const opened = tx && sessionStorage.getItem(`aps:proof-opened:${selectedRequest.id}`) === "true";
  const proofAction = ["before_handoff", "in_progress"].includes(state.key)
    ? `<a class="btn dark proof-open-dashboard" href="https://app.proof.com" target="_blank" rel="noopener noreferrer">${state.key === "before_handoff" ? "Open Proof in New Tab ↗" : "Continue in Proof ↗"}</a>` : "";
  const workspaceAction = state.tab && state.tab !== "proof"
    ? `<button class="btn ${state.attention ? "dark" : "primary"} proof-return-action" data-tab="${escapeHtml(state.tab)}" data-document-id="${escapeHtml(state.documentId || "")}" type="button">${escapeHtml(state.action)}</button>` : "";
  return `<section class="proof-return-guidance is-${escapeHtml(state.key)}" data-proof-return-state="${escapeHtml(state.key)}" aria-live="polite"><div><span class="small-label">${opened ? "Proof opened in a new tab" : "Proof operator handoff"}</span><h4>${escapeHtml(state.title)}</h4><p>${escapeHtml(state.body)}</p>${tx ? '<small>Sync Proof Status retrieves the latest state for this existing transaction. It never creates or activates a transaction or resends an invitation.</small>' : ""}</div><div class="proof-return-actions">${proofAction}${workspaceAction}</div></section>`;
}

function focusProofDocument(requestId) {
  const documentId = sessionStorage.getItem(`aps:focus-document:${requestId}`);
  if (!documentId) return;
  const row = document.querySelector(`[data-proof-return-document="${CSS.escape(documentId)}"]`);
  if (!row) return;
  sessionStorage.removeItem(`aps:focus-document:${requestId}`);
  row.classList.add("is-proof-target");
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.querySelector("a,button")?.focus({ preventScroll: true });
}

async function loadProofControlPanel() {
  const host = $("#proofControlPanel");
  if (!host || selectedRequest?.service_type !== "ron") return;
  try {
    const data = await proofCommand("get_control_panel");
    const tx = data.transaction;
    const participants = data.participants || [];
    const signers = data.signers || [];
    const signerMappingRetryable = signers.length > 0 && signers.every(signer => ["rejected", "failed"].includes(signer.configuration_state));
    const assets = data.assets || [];
    const sourceAssets = assets.filter(asset => asset.asset_type === "source_document");
    const completedAssets = assets.filter(asset => ["completed_document", "audit_trail"].includes(asset.asset_type));
    const appointmentReady = Boolean(data.request?.appointment_confirmed_at && data.request?.appointment_date && data.request?.appointment_time);
    host.innerHTML = `
      <div class="admin-v3-section-heading"><span class="small-label">RON Session / Proof</span><h3>Secure Online Notary Orchestration</h3></div>
      <p class="admin-muted">APS owns business readiness and customer delivery. Proof executes the secure notarization.</p>
      ${proofReturnGuidance(data, tx, assets, data.files || [])}
      <div class="proof-handoff"><p><strong>Proof-native work stays in Proof.</strong> Identity verification, the live meeting, signatures, certificates, and seal placement are completed in Proof. APS remains open for synchronized status, document review, release, and final completion.</p></div>
      ${tx&&!tx.document_preparation_confirmed_at?'<div class="proof-control-section"><h4>Proof Document Preparation</h4><p class="admin-muted">Complete field placement, certificate-space review, and other Proof-native preparation in Proof. This confirmation is an APS administrator attestation, not Proof verification.</p><button class="btn dark" id="proofConfirmPreparation" type="button">I Completed Document Preparation in Proof</button></div>':tx?.document_preparation_confirmed_at?`<div class="email-notice"><strong>Admin Confirmed</strong><p>Proof document preparation was confirmed ${new Date(tx.document_preparation_confirmed_at).toLocaleString()}.</p></div>`:""}
      ${proofOperatorStepper(data,tx,signers,sourceAssets,completedAssets,appointmentReady)}
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
      ${!tx && !participants.some(person => person.participant_type === "signer" && person.email) ? '<div class="email-notice"><strong>Proof draft blocked</strong><p>Add and approve at least one signer with an individual email address before creating the Proof draft.</p><button class="btn dark" id="proofOpenCustomer" type="button">Open Customer &amp; Signers</button></div>' : ""}
      <div class="proof-control-section"><h4>Signers</h4>${signers.length ? `<ul class="admin-file-list">${signers.map(signer => `<li><strong>Signer ${signer.signer_position}: ${escapeHtml([signer.first_name,signer.last_name].filter(Boolean).join(" ") || signer.email)}</strong><small>${proofState(signer.configuration_state)} · ${proofState(signer.proof_status)}${signer.access_link_present ? " · Secure access available" : ""}</small></li>`).join("")}</ul>` : '<p class="admin-muted">Approved APS participants have not been mapped to Proof.</p>'}</div>
      <div class="proof-control-section"><h4>Documents</h4>${sourceAssets.length ? `<ul class="admin-file-list">${sourceAssets.map(asset => `<li><strong>${escapeHtml(asset.file_name)}</strong><small>${proofState(asset.upload_state)} · ${proofState(asset.processing_state)} · ${proofState(asset.requirement)}${asset.witness_required ? " · Witness required" : ""}</small></li>`).join("")}</ul>` : '<p class="admin-muted">No APS source documents have been selected for Proof.</p>'}<div id="proofEligibleDocuments"></div></div>
      <div class="proof-control-section"><h4>Completed assets</h4>${completedAssets.length ? `<ul class="admin-file-list">${completedAssets.map(asset => `<li><strong>${escapeHtml(asset.file_name)}</strong><small>${proofState(asset.retrieval_state)} · Internal until explicitly released through APS Documents</small>${asset.retrieval_state === "retrieved" ? `<button class="btn dark proof-stage-asset" data-asset-id="${escapeHtml(asset.id)}" type="button">Stage for Review</button>` : ""}</li>`).join("")}</ul>` : '<p class="admin-muted">No completed notarized documents have been retrieved.</p>'}${tx?.completed_assets_available ? `<div class="status-actions">${sourceAssets.map(asset => `<button class="btn dark proof-retrieve-document" data-source-id="${escapeHtml(asset.id)}" type="button">Retrieve ${escapeHtml(asset.file_name)}</button>`).join("")}<button class="btn dark" id="proofRetrieveAudit" type="button">Retrieve Audit Trail</button></div>` : ""}</div>
      <div class="status-actions proof-actions">
        ${!tx ? '<button class="btn primary" id="proofCreateDraft" type="button">Create Proof Draft</button>' : ""}
        ${tx && (!signers.length || signerMappingRetryable) ? `<button class="btn dark" id="proofConfigureSigners" type="button">${signerMappingRetryable ? "Retry Approved Signer Mapping" : "Map Approved Signers"}</button>` : ""}
        ${tx ? '<button class="btn dark" id="proofLoadDocuments" type="button">Select APS Documents</button><button class="btn dark" id="proofSyncStatus" type="button" title="Retrieves the latest state for this existing Proof transaction.">Sync Proof Status</button>' : ""}
        ${tx && tx.activation_state !== "activated" ? '<button class="btn primary" id="proofActivate" type="button">Activate &amp; Send to Signer</button>' : ""}
      </div>
      <div id="proofActionStatus" role="status" aria-live="polite"></div>`;
    $("#proofCreateDraft")?.addEventListener("click", async () => runProofUiAction(async () => {
      const primary = participants.find(person => person.participant_type === "signer");
      if (!primary?.email) throw new Error("An approved signer email is required.");
      await proofCommand("create_draft", { signerEmail: primary.email });
    }));
    $$(".proof-open-dashboard").forEach(link => link.addEventListener("click", () => {
      sessionStorage.setItem(`aps:proof-opened:${selectedRequest.id}`, "true");
      window.setTimeout(() => loadProofControlPanel(), 0);
    }));
    $$(".proof-return-action").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.documentId) sessionStorage.setItem(`aps:focus-document:${selectedRequest.id}`, button.dataset.documentId);
      window.AdminV3?.activateTab(button.dataset.tab || "fulfillment");
      if (button.dataset.tab === "documents") window.setTimeout(() => focusProofDocument(selectedRequest.id), 120);
    }));
    $("#proofOpenCustomer")?.addEventListener("click", () => window.AdminV3?.activateTab("customer"));
    $("#proofConfigureSigners")?.addEventListener("click", () => runProofUiAction(() => proofCommand("configure_approved_signers", { integrationId: tx.id })));
    $("#proofConfirmPreparation")?.addEventListener("click", () => runProofUiAction(async()=>{if(!confirm("Confirm that document preparation was completed in Proof? APS will record your administrator attestation."))return;const {error}=await adminClient.rpc("confirm_proof_document_preparation",{p_transaction_id:tx.id});if(error)throw error;}));
    $("#proofSyncStatus")?.addEventListener("click", () => runProofUiAction(async () => {
      await proofCommand("refresh", { integrationId: tx.id });
      await proofCommand("refresh_signers", { integrationId: tx.id });
    }));
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
      window.setTimeout(() => focusProofDocument(selectedRequest.id), 120);
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
  const { error: viewedError } = await adminClient.rpc("admin_mark_request_viewed", { p_request: selectedRequest.id });
  if (!viewedError) await window.AdminV3?.syncRequestCount?.();

  // Keep the Admin Portal v3 header synchronized with the active request.
  window.AdminV3?.syncSelectedRequest(selectedRequest);
  const detail = $("#requestDetail");
  const ref = refFromId(selectedRequest.id);
  setText("detailRef", ref);
  detail.innerHTML = '<p class="admin-muted">Loading details…</p>';

  const customer = Array.isArray(selectedRequest.customers)
    ? selectedRequest.customers[0]
    : selectedRequest.customers;
  const detailTables = {
    ron: "ron_requests",
    mobile: "mobile_notary_requests",
    print: "print_scan_requests",
    loan_signing: "loan_signing_assignments",
  };
  const table = detailTables[selectedRequest.service_type];
  if (!table) {
    detail.innerHTML = '<section class="admin-detail-section"><h3>Unsupported service</h3><p class="admin-muted">APS cannot safely load service details for this request type.</p></section>';
    return;
  }
  const [files, serviceDetails, invoices, patch32Records, participantResult, actResult, templateResult, messageResult, completionResult, identityReviewResult] = await Promise.all([
    getFiles(id),
    getDetailRows(table, id),
    getInvoices(id),
    getPatch32Records(id),
    adminClient.from("request_participants").select("*").eq("service_request_id", id).order("sort_order"),
    adminClient.from("request_notarial_acts").select("*").eq("service_request_id", id).order("act_number"),
    adminClient.from("message_templates").select("*").eq("active", true).order("name"),
    adminClient.from("messages").select("*").eq("service_request_id", id).order("created_at", { ascending: false }),
    adminClient.from("request_completion_facts").select("*").eq("service_request_id", id).maybeSingle(),
    adminClient.from("review_queue_items").select("id,blocker_key,title,detail,state").eq("service_request_id", id).eq("blocker_key", "possible_existing_customer").eq("state", "open").maybeSingle(),
  ]);
  if (!serviceDetails) {
    detail.innerHTML = `<section class="admin-detail-section" data-v3-tab-target="overview"><h3>${escapeHtml(serviceLabel(selectedRequest.service_type))} details unavailable</h3><p class="admin-muted">The request identity is preserved, but its service-specific detail record is missing. Review the request record before taking fulfillment action.</p></section>
      <section class="admin-detail-section" data-v3-tab-target="overview">
        <div class="admin-v3-section-heading"><span class="small-label">Request Administration</span><h3>Request Visibility</h3></div>
        <div class="status-actions archive-actions">
          <button id="archiveRequestBtn" class="btn dark" type="button">${isArchived(selectedRequest) ? "Restore Request" : "Archive Request"}</button>
        </div>
        <p class="admin-muted small-admin-note">Archiving hides the request from active operations without deleting history. Fulfillment and permanent-deletion actions remain unavailable until the missing service detail is reviewed.</p>
      </section>`;
    $("#archiveRequestBtn", detail)?.addEventListener("click", toggleArchiveRequest);
    return;
  }
  const participants = participantResult.data || [];
  const notarialActs = actResult.data || [];
  const messageTemplates = templateResult.data || [];
  const requestMessages = messageResult.data || [];
  const completionFacts = completionResult.data || {};
  const identityReview = identityReviewResult.data || null;
  const identityCandidates = identityReview ? [...new Map(requests.map(request => Array.isArray(request.customers) ? request.customers[0] : request.customers).filter(candidate => candidate?.id && candidate.id !== customer?.id && ((customer?.normalized_email && candidate.normalized_email === customer.normalized_email) || (customer?.normalized_phone && candidate.normalized_phone === customer.normalized_phone))).map(candidate => [candidate.id, candidate])).values()] : [];
  const invoiceItems = await getInvoiceItems(id, invoices);
  const currentInvoice = invoices.find(invoice => !["void", "cancelled"].includes(String(invoice.status || "").toLowerCase())) || invoices[0] || {};
  const activeInvoices=invoices.filter(invoice=>!["void","cancelled","draft"].includes(String(invoice.status||"").toLowerCase()));
  const totalInvoiced=activeInvoices.reduce((sum,invoice)=>sum+Number(invoice.amount_due||0),0);
  const totalPaid=activeInvoices.reduce((sum,invoice)=>sum+Number(invoice.amount_paid??invoice.paid_amount??0),0);
  const totalBalance=Math.max(0,activeInvoices.reduce((sum,invoice)=>sum+Number(invoice.balance_due??Math.max(0,Number(invoice.amount_due||0)-Number(invoice.amount_paid??invoice.paid_amount??0))),0));
  const paidInvoiceCount=activeInvoices.filter(invoice=>Number(invoice.balance_due??Math.max(0,Number(invoice.amount_due||0)-Number(invoice.amount_paid??invoice.paid_amount??0)))<=0).length;
  const mobileAddress=selectedRequest.service_type==="mobile"?assembledMobileAddress(serviceDetails,selectedRequest.appointment_location):selectedRequest.appointment_location||"Not provided";
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
      const customerUpload = f.uploaded_by === "customer" && f.document_classification === "customer_document";
      const provenance = customerUpload ? "Customer Upload" : f.document_classification === "completed_notarized_document" ? "Proof Completed Document" : f.document_classification === "customer_deliverable" ? "APS Deliverable" : f.document_classification === "internal_document" ? "Admin / Internal" : "Admin Upload";
      const access = customerUpload ? "Customer already has access" : released ? "Released to customer" : "Customer-hidden";
      const proofCompleted = f.document_classification === "completed_notarized_document";
      const reviewed = ["approved", "reviewed", "ready"].includes(String(f.review_state || "").toLowerCase());
      const reviewControl = proofCompleted && !reviewed ? `<button class="btn dark review-proof-document-btn" data-file-id="${escapeHtml(f.id)}" type="button">Mark APS Review Complete</button>` : "";
      const releaseControl = customerUpload || (proofCompleted && !reviewed) ? "" : `<button class="btn dark release-document-btn" data-file-id="${escapeHtml(f.id)}" data-released="${released}" type="button">${released ? "Withdraw Release" : "Release to Customer"}</button>`;
      const removable=!customerUpload&&!proofCompleted&&!released&&f.uploaded_by==="admin";
      const removalControl=removable?`<button class="btn danger-ghost remove-admin-document-btn" data-file-id="${escapeHtml(f.id)}" type="button">Remove Admin Upload</button>`:"";
      const received = f.created_at ? ` · Received ${new Date(f.created_at).toLocaleString()}` : "";
      const pageState = f.page_count_status === "detected" || f.page_count_status === "manual" ? `${f.detected_page_count} page${f.detected_page_count===1?"":"s"}${f.page_count_status==="manual"?" · manually verified":""}` : f.page_count_status === "failed" || f.page_count_status === "pending" ? "Page count needs review" : "Page count not applicable";
      const pageControl = (/pdf$/i.test(f.file_name)||f.file_type==="application/pdf") ? `<button class="btn dark verify-pdf-page-count-btn" data-file-id="${escapeHtml(f.id)}" data-current="${escapeHtml(f.detected_page_count||"")}" type="button">${f.page_count_status==="failed"||f.page_count_status==="pending"?"Enter Verified Page Count":"Correct Page Count"}</button>` : "";
      return `<li class="${proofCompleted ? "proof-completed-document" : ""}" ${proofCompleted ? `data-proof-return-document="${escapeHtml(f.id)}"` : ""}>${proofCompleted ? '<span class="small-label">Proof Completed Document</span>' : ""}${url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(f.file_name)}</a>` : escapeHtml(f.file_name)}<small>${escapeHtml(provenance)} · ${f.file_type || "file"} · ${f.file_size ? Math.round(f.file_size / 1024) + " KB" : ""} · ${escapeHtml(pageState)}${received} · ${reviewed ? "APS Review Complete" : proofCompleted ? "Pending APS Review" : escapeHtml(access)} · ${escapeHtml(access)}</small>${pageControl}${reviewControl}${releaseControl}${removalControl}</li>`;
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
  const retryableFinalInvoice = invoices.find(invoice => isFinalPaymentInvoice(invoice) && paymentInvoiceBalance(invoice) > 0.009 && !["void", "cancelled"].includes(String(invoice.status || "").toLowerCase()));
  const finalInvoiceMessageKey = retryableFinalInvoice ? `invoice:${retryableFinalInvoice.id}:final_balance_due` : null;
  const finalInvoiceMessage = finalInvoiceMessageKey ? requestMessages.find(message => message.idempotency_key === finalInvoiceMessageKey) : null;
  const showFinalInvoiceNotificationRetry = retryableFinalInvoice && (!finalInvoiceMessage || finalInvoiceMessage.delivery_state === "failed");
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
        <div class="admin-v3-overview-card is-financial"><span class="small-label">Financial position</span><strong>${money(totalInvoiced)}</strong><p>${paidInvoiceCount} of ${activeInvoices.length} invoice${activeInvoices.length === 1 ? "" : "s"} paid · ${money(totalPaid)} paid · ${money(totalBalance)} due</p></div>
        <div class="admin-v3-overview-card"><span class="small-label">Schedule</span><strong>${escapeHtml(requestSchedule)}</strong><p>${escapeHtml(selectedRequest.appointment_time || selectedRequest.preferred_time_window || "Time not confirmed")}</p></div>
        <div class="admin-v3-overview-card is-supporting"><span class="small-label">PDF page count</span><strong>${selectedRequest.pdf_page_count_review_required ? "Needs review" : selectedRequest.detected_pdf_page_count ? `${selectedRequest.detected_pdf_page_count} pages` : "Pending source document"}</strong><p>${selectedRequest.pdf_page_count_changed_after_quote ? "Changed after quote — pricing review required" : "Authoritative active source-PDF total"}</p></div>
      </div>
      <div class="admin-v3-overview-grid acquisition-summary" aria-label="Acquisition and review status">
        <div class="admin-v3-overview-card"><span class="small-label">How Customer Found APS</span><strong>${escapeHtml(statusLabel(selectedRequest.customer_reported_source || "not_recorded"))}</strong><p>${escapeHtml(selectedRequest.customer_reported_source_detail || "Customer-reported source")}</p></div>
        <div class="admin-v3-overview-card"><span class="small-label">Technical Source</span><strong>${escapeHtml(selectedRequest.acquisition_utm_source || selectedRequest.first_touch_source || selectedRequest.acquisition_referrer_host || "Direct / unknown")}</strong><p>${escapeHtml([selectedRequest.acquisition_utm_medium, selectedRequest.acquisition_utm_campaign].filter(Boolean).join(" · ") || selectedRequest.acquisition_landing_page || "No technical attribution")}</p></div>
        <div class="admin-v3-overview-card"><span class="small-label">Review Request</span><strong>${escapeHtml(statusLabel(selectedRequest.review_request_state || "not_eligible"))}</strong><p>${selectedRequest.review_request_sent_at ? `Sent ${new Date(selectedRequest.review_request_sent_at).toLocaleString()}` : selectedRequest.review_request_eligible_at ? `Eligible since ${new Date(selectedRequest.review_request_eligible_at).toLocaleString()}` : "Requires legitimate completion, required release, and zero balance"}</p></div>
      </div>
    </section>

    ${internalWorkflowGuide(selectedRequest)}

    <div class="admin-detail-section invoice-builder-card" data-v3-tab-target="quote" data-payment-group="quote">
      <div class="admin-v3-section-heading"><span class="small-label">Quote</span><h3>Full Service Quote Builder</h3></div>
      <p class="admin-muted">Review the proposed estimate-derived lines below. Saving updates the customer-facing quote; status buttons control when emails are sent.</p>
      ${estimateRequirementsSummary(selectedRequest)}
      <div class="invoice-preset-row"><select id="invoicePresetSelect"><option value="">Add common line item…</option></select><button id="addPresetInvoiceRow" class="btn dark" type="button">Add Selected</button></div><div id="invoiceRows" class="invoice-rows"></div>
      <div class="invoice-total-line"><strong>Quote Total</strong><span id="invoiceTotalPreview">$0.00</span></div>
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
      ${showFinalInvoiceNotificationRetry ? `<div class="email-notice"><strong>Customer invoice notification needs attention</strong><p>The supplemental invoice is preserved. Retry only its customer communication; this will not recreate the invoice or change the balance.</p><button id="retryFinalInvoiceNotificationBtn" class="btn dark" data-invoice-id="${escapeHtml(retryableFinalInvoice.id)}" type="button">Retry Invoice Notification</button></div>` : ""}
    </div>

    ${patch32AdminPanels(patch32Records)}

    ${selectedRequest.service_type === "mobile" ? `<section class="admin-detail-section mobile-travel-card" id="mobileTravelCard" data-v3-tab-target="fulfillment"><div class="admin-v3-section-heading"><span class="small-label">Mobile Notary</span><h3>Travel Distance &amp; Quote</h3></div><div class="mobile-travel-route"><label>Starting location<select id="mobileTravelOrigin"><option>Loading saved origins…</option></select></label><div><span class="small-label">Destination</span><strong id="mobileTravelDestination">Loading structured service address…</strong></div><button id="recalculateMobileTravel" class="btn dark" type="button">Recalculate</button></div><div id="oneTimeOriginFields" class="admin-detail-grid" hidden><label>Street<input id="oneTimeOriginStreet"></label><label>City<input id="oneTimeOriginCity"></label><label>State<input id="oneTimeOriginState" maxlength="2"></label><label>ZIP<input id="oneTimeOriginZip"></label></div><p id="mobileTravelStatus" class="admin-muted" role="status" aria-live="polite">Loading travel configuration…</p><div id="mobileTravelResults"></div><details class="mobile-travel-manual"><summary>Manual mileage/travel charge fallback</summary><p>Use this only when automatic routing is unavailable. A reason is required and the route is not falsified.</p><div class="admin-detail-grid"><label>Round-trip miles<input id="manualTravelMiles" type="number" min="0" step=".1"></label><label>Travel fee<input id="manualTravelFee" type="number" min="0" step=".01"></label><label>Required reason<textarea id="manualTravelNote"></textarea></label></div><button id="applyManualMobileTravel" class="btn dark" type="button">Add Manual Travel to Quote</button></details></section>` : ""}

    ${selectedRequest.service_type === "loan_signing" ? '<section class="admin-detail-section lsa-fulfillment-workspace" id="loanSigningFulfillmentPanel" data-v3-tab-target="fulfillment"><div class="admin-v3-section-heading"><span class="small-label">Loan Signing Fulfillment</span><h3>Loading Assignment Requirements…</h3></div></section>' : ""}

    <div class="admin-detail-section appointment-editor-card" data-v3-tab-target="fulfillment">
      <h3>Appointment / Fulfillment Details</h3>
      <p class="admin-muted">Update these before marking the appointment confirmed. These details appear on the customer's status page and in the appointment confirmation email.</p>
      <div class="admin-detail-grid appointment-fields">
        <label>Appointment Date<input id="appointmentDate" type="date" value="${escapeHtml(selectedRequest.appointment_date || selectedRequest.preferred_date || "")}"></label>
        <label>Appointment Time<input id="appointmentTime" type="text" placeholder="Example: 6:30 PM CST" value="${escapeHtml(selectedRequest.appointment_time || selectedRequest.preferred_time_window || "")}"></label>
        ${selectedRequest.service_type === "ron" ? `<label>RON Platform<input id="appointmentPlatform" type="text" placeholder="Proof" value="${escapeHtml(selectedRequest.appointment_platform || "")}"></label>` : selectedRequest.service_type === "print" ? `<label>Delivery Method<input id="appointmentPlatform" type="text" placeholder="Courier or mobile document service" value="${escapeHtml(selectedRequest.appointment_platform || serviceDetails.fulfillment_type || "")}"></label>` : ""}
      </div>
      ${selectedRequest.service_type === "mobile" ? `<label>Mobile Service Address</label><input id="appointmentLocation" type="text" placeholder="Service address or meeting location" value="${escapeHtml(selectedRequest.appointment_location || mobileAddress || "")}">` : selectedRequest.service_type === "print" ? `<label>Delivery / Service Address</label><input id="appointmentLocation" type="text" placeholder="Courier or mobile-service destination" value="${escapeHtml(selectedRequest.appointment_location || serviceDetails.delivery_address || "")}">` : ""}
      ${selectedRequest.service_type === "ron" ? `<label>Secure Session Link</label><input id="appointmentLink" type="text" placeholder="Proof signer session URL" value="${escapeHtml(selectedRequest.appointment_link || selectedRequest.ron_session_url || "")}">` : ""}
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
      <fieldset><legend>Purchased service components</legend>${({ron:["ron"],mobile:["mobile"],print:["print_copy","scan","courier"]}[selectedRequest.service_type] || []).map(component => `<label class="check"><input class="completion-component" type="checkbox" value="${component}" ${(completionFacts.components || []).includes(component) ? "checked" : ""}> ${escapeHtml(statusLabel(component))}</label>`).join("")}</fieldset>
      <div class="admin-detail-grid">
        ${(selectedRequest.service_type === "ron" ? [["ron_session_completed","RON session completed"]] : selectedRequest.service_type === "mobile" ? [["mobile_service_completed","Mobile service performed"]] : selectedRequest.service_type === "loan_signing" ? [["signing_completed","Signing completed"],["post_signing_qc_completed","Post-signing quality check completed"],["return_completed","Authorized return completed"]] : [["production_completed","Print/Copy production completed"],["scan_completed","Scanning completed"],...(String(serviceDetails.fulfillment_type||"").toLowerCase()==="pickup"?[["pickup_completed","Legacy pickup/handoff completed"]]:[]),["delivery_completed","Delivery/handoff completed"],["proof_of_delivery_present","Proof of delivery present"]]).map(([key,label]) => `<label class="check"><input class="completion-fact" data-key="${key}" type="checkbox" ${completionFacts[key] ? "checked" : ""}> ${label}</label>`).join("")}
      </div>
      <div class="admin-detail-grid">
        <label>Document readiness<select id="completionDocumentState"><option value="pending" ${selectedRequest.document_state === "pending" ? "selected" : ""}>Pending / review required</option><option value="approved" ${selectedRequest.document_state === "approved" ? "selected" : ""}>Reviewed and ready</option><option value="not_applicable" ${selectedRequest.document_state === "not_applicable" ? "selected" : ""}>Not applicable</option></select></label>
        <label>Participant / witness readiness<select id="completionParticipantState"><option value="pending" ${selectedRequest.participant_state === "pending" ? "selected" : ""}>Pending / unresolved</option><option value="approved" ${selectedRequest.participant_state === "approved" ? "selected" : ""}>Prepared and ready</option><option value="not_applicable" ${selectedRequest.participant_state === "not_applicable" ? "selected" : ""}>Not applicable</option></select></label>
        <label>Customer-delivery path<select id="completionDeliveryPath"><option value="">Select the applicable path…</option><option value="aps" ${completionFacts.aps_deliverable_required === true ? "selected" : ""}>APS must release a portal deliverable</option><option value="external" ${completionFacts.external_platform_delivery ? "selected" : ""}>External platform delivers final document</option><option value="physical" ${completionFacts.physical_only ? "selected" : ""}>Physical-only; no portal deliverable</option><option value="declined" ${completionFacts.customer_declined_optional_deliverable ? "selected" : ""}>Customer declined optional deliverable</option></select></label>
        ${selectedRequest.service_type === "print" ? `<label class="check"><input id="completionPickupRequired" type="checkbox" ${completionFacts.pickup_required === true ? "checked" : ""}> Courier pickup is required</label><label class="check"><input id="completionPodRequired" type="checkbox" ${completionFacts.proof_of_delivery_required ? "checked" : ""}> Proof of delivery is required</label>` : '<span class="admin-muted">Courier pickup and proof of delivery: N/A for this service.</span>'}
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
      ${["ron","mobile"].includes(selectedRequest.service_type)?'<button id="convertServiceBtn" class="btn dark" type="button">Change Service / Convert Service</button>':""}
    </section>

    ${identityReview ? `<section class="admin-detail-section identity-review-card" data-v3-tab-target="customer"><div class="admin-v3-section-heading"><span class="small-label">Possible Existing Customer</span><h3>Administrator identity review required</h3></div><p>${escapeHtml(identityReview.detail || "Contact information matches another profile but identity data conflicts.")}</p>${identityCandidates.length ? `<label>Existing customer<select id="identityCandidateCustomer">${identityCandidates.map(candidate=>`<option value="${escapeHtml(candidate.id)}">${escapeHtml(`${candidate.first_name||""} ${candidate.last_name||""}`.trim())} · ${escapeHtml(candidate.email||candidate.phone||"")}</option>`).join("")}</select></label><div class="status-actions"><button id="linkExistingCustomerBtn" class="btn primary" type="button">Link to Existing Customer</button><button id="keepNewCustomerBtn" class="btn secondary" type="button">Keep as New Customer</button></div>`:`<p class="admin-muted">No active candidate is available in the loaded directory. Keep this profile separate or review Customers.</p><button id="keepNewCustomerBtn" class="btn secondary" type="button">Keep as New Customer</button>`}</section>` : ""}

    <section class="admin-detail-section" data-v3-tab-target="customer">
      <div class="admin-v3-section-heading"><span class="small-label">Transaction Participants</span><h3>Signers &amp; Witnesses</h3></div>
      ${["ron","mobile"].includes(selectedRequest.service_type)&&![selectedRequest.status,selectedRequest.workflow_status].some(value=>["completed","cancelled","declined"].includes(String(value||"").toLowerCase()))?'<div class="status-actions"><button class="btn primary add-participant-btn" type="button">Add Participant</button><button class="btn dark flag-participant-review-btn" type="button">Flag Additional Participant Review</button></div>':""}
      ${participants.length ? `<ul class="admin-file-list">${participants.map(person=>{const proofWitness=selectedRequest.service_type==="ron"&&person.participant_type==="witness"&&person.witness_source==="aps",name=participantLegalName(person)||(proofWitness?`Proof On-Demand Witness × ${person.quantity||1}`:person.witness_source==="aps"?`APS-provided witness × ${person.quantity||1}`:"Identity pending"),missing=proofWitness?[]:participantReadiness(person),terminalStates=["completed","cancelled","declined"],locked=terminalStates.includes(String(selectedRequest.status||"").toLowerCase())||terminalStates.includes(String(selectedRequest.workflow_status||"").toLowerCase());return `<li><strong>${escapeHtml(name)}</strong><small>${proofWitness?"Assigned through Proof during the live session · No participant information required from APS":`${escapeHtml(statusLabel(person.participant_type))}${person.email?` · ${escapeHtml(person.email)}`:""}${person.mobile_phone?` · ${escapeHtml(person.mobile_phone)}`:""}`}</small>${missing.length?`<p class="communication-error">Missing: ${escapeHtml(missing.join(", "))}</p>`:""}${proofWitness?'<small>Proof will assign the live witness; this requirement is not an editable person record.</small>':locked?'<small>Participant editing is locked for this terminal request.</small>':`<button class="btn dark edit-participant-btn" data-participant-id="${escapeHtml(person.id)}" type="button">Edit Participant</button>`}</li>`}).join("")}</ul>` : selectedRequest.service_type==="print" ? '<p class="admin-muted">Notarial signer information is not required for Print &amp; Scan.</p>' : '<p class="admin-muted">No structured participants are stored for this request.</p>'}
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
        <div><span class="small-label">Location</span><strong class="multiline-value">${escapeHtml(mobileAddress)}</strong></div>
        <div><span class="small-label">Platform / Fulfillment</span><strong>${escapeHtml(selectedRequest.appointment_platform || "Not provided")}</strong></div>
      </div>
      ${groupedDetails.appointment.length ? detailMap(groupedDetails.appointment) : ""}
    </section>

    ${groupedDetails.showWitness ? `<section class="admin-detail-section" data-v3-tab-target="customer"><div class="admin-v3-section-heading"><span class="small-label">Witness Information</span><h3>Witness Requirements</h3></div>${detailMap(groupedDetails.witness)}</section>` : ""}

    ${groupedDetails.showPrinting ? `<section class="admin-detail-section" data-v3-tab-target="customer"><div class="admin-v3-section-heading"><span class="small-label">Printing / Scanning</span><h3>Document Production</h3></div>${detailMap(groupedDetails.printing)}</section>` : ""}

    <section class="admin-detail-section customer-financial-card" data-v3-tab-target="customer">
      <div><span class="small-label">Financial Summary</span><h3>${money(totalInvoiced)}</h3><p class="admin-muted">${activeInvoices.length} invoice${activeInvoices.length === 1 ? "" : "s"} · ${paidInvoiceCount} paid · ${money(totalPaid)} paid to date · ${money(totalBalance)} balance due</p></div>
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
        <label>Template<select id="messageTemplateSelect"><option value="">Select an APS template…</option>${[...messageTemplates].sort((a,b)=>selectedRequest.service_type==="loan_signing"?Number(!String(a.template_key).startsWith("lsa_"))-Number(!String(b.template_key).startsWith("lsa_")):0).map(template => `<option value="${escapeHtml(template.id)}" data-status="${escapeHtml(template.associated_status || "")}" data-required="${escapeHtml(template.required_attachment_type || "")}">${escapeHtml(template.name)}</option>`).join("")}</select></label>
        <label>Recipient<input id="messageRecipient" type="email" value="${escapeHtml(customer?.email || "")}"></label>
        <label>CC (comma separated)<input id="messageCc" type="text"></label>
        <label>Status after successful send<select id="messageStatus"><option value="">No status change</option>${["under_review","quote_ready","awaiting_approval","awaiting_payment","payment_received","final_payment_received","appointment_confirmed","appointment_needs_rescheduling","quote_expired","completed"].map(value => `<option value="${value}">${escapeHtml(statusLabel(value))}</option>`).join("")}</select></label>
      </div>
      <label>Subject<input id="messageSubject" type="text"></label>
      <label>Message HTML<textarea id="messageBody" rows="10"></textarea></label>
      <fieldset class="message-attachments"><legend>Existing order documents</legend>
        ${files.length ? files.map(file => { const customerUpload=file.uploaded_by==="customer"&&file.document_classification==="customer_document"; const released=file.customer_visible&&file.eligible_for_delivery&&file.document_classification!=="internal_document"; return `<label class="check"><input class="message-file-attachment" type="checkbox" value="${escapeHtml(file.id)}" ${customerUpload||released ? "" : "disabled"}> ${escapeHtml(file.file_name)} <small>${customerUpload ? "Customer Upload · eligible request attachment" : released ? "Released deliverable" : "Internal / customer-hidden"}</small></label>`; }).join("") : '<p class="admin-muted">No order documents available.</p>'}
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
        <button id="permanentDeleteRequestBtn" class="btn danger" type="button">Permanently Delete Request</button>
      </div>
      <p class="admin-muted small-admin-note">Archiving hides the request from active operations without deleting history. Permanent deletion is server-gated and limited to eligible test/junk records.</p>
    </section>
  `;
  renderInvoiceRows(rows);
  $$(".status-actions button[data-status]", detail).forEach((btn) => btn.addEventListener("click", () => {
    if (btn.dataset.status === "completed") return beginCompletion(messageTemplates);
    if (btn.dataset.status === "payment_received") return openManualPaymentDialog("initial");
    if (btn.dataset.status === "final_payment_received") return openManualPaymentDialog("final");
    if ($("#updateStatusWithoutSending", detail)?.checked) return updateRequestStatus(btn.dataset.status);
    return selectStatusMessage(btn.dataset.status, messageTemplates);
  }));
  $("#messageTemplateSelect", detail)?.addEventListener("change", () => applyMessageTemplate(messageTemplates, customer, ref));
  $("#previewMessageBtn", detail)?.addEventListener("click", previewMessage);
  $("#sendMessageBtn", detail)?.addEventListener("click", () => sendComposedMessage(false));
  $$(".edit-participant-btn", detail).forEach(button => button.addEventListener("click", () => openParticipantEditor(participants.find(person => person.id === button.dataset.participantId))));
  $(".add-participant-btn", detail)?.addEventListener("click", () => openParticipantEditor(null));
  $(".flag-participant-review-btn", detail)?.addEventListener("click", flagAdditionalParticipantReview);
  $("#sendAndUpdateStatusBtn", detail)?.addEventListener("click", () => sendComposedMessage(true));
  $$(".release-document-btn", detail).forEach(button => button.addEventListener("click", () => setDocumentRelease(button.dataset.fileId, button.dataset.released !== "true")));
  $$(".review-proof-document-btn", detail).forEach(button => button.addEventListener("click", () => reviewProofDocument(button.dataset.fileId)));
  $$(".remove-admin-document-btn", detail).forEach(button => button.addEventListener("click", async()=>{if(!confirm("Remove this unreleased administrator upload? The file history will be preserved as inactive."))return;try{await invokeServiceAdjustment({command:"remove_admin_document",file_id:button.dataset.fileId});await selectRequest(id);showToast("Administrator upload removed; audit history preserved.");}catch(error){alert(error.message||"Document could not be removed.")}}));
  $$(".verify-pdf-page-count-btn", detail).forEach(button => button.addEventListener("click", async()=>{try{await verifyPdfPageCount(button.dataset.fileId,button.dataset.current)}catch(error){alert(error.message||"Page count could not be saved.")}}));
  window.setTimeout(() => focusProofDocument(selectedRequest.id), 0);
  $("#saveCompletionFactsBtn", detail)?.addEventListener("click", saveCompletionFacts);
  $("#completeWithExceptionBtn", detail)?.addEventListener("click", completeWithException);
  populateInvoicePresetSelect();

  $$(".resolve-customer-action", detail).forEach((button) => button.addEventListener("click", async () => { try { await resolveCustomerAction(button); } catch (error) { alert(error.message || "Action could not be resolved."); } }));
  $$(".open-refund-workflow", detail).forEach((button) => button.addEventListener("click", async () => { try { await openRefundWorkflow(button.closest(".admin-action-request")?.dataset.actionId); } catch (error) { alert(error.message || "Refund workflow could not be opened."); } }));
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
  $("#recordPrimaryPaymentBtn")?.addEventListener("click", () => openManualPaymentDialog("initial"));
  $("#recordSupplementalPaymentBtn")?.addEventListener("click", () => openManualPaymentDialog("final"));
  $("#createAdditionalInvoiceBtn")?.addEventListener(
    "click",
    createAdditionalInvoice,
  );
  $("#retryFinalInvoiceNotificationBtn")?.addEventListener("click", retryFinalInvoiceNotification);
  $("#convertServiceBtn")?.addEventListener("click",openServiceConversionWorkflow);
  $("#saveAppointmentBtn")?.addEventListener("click", saveAppointmentDetails);
  $("#archiveRequestBtn")?.addEventListener("click", toggleArchiveRequest);
  $("#permanentDeleteRequestBtn")?.addEventListener("click", openPermanentDeleteDialog);
  $("#linkExistingCustomerBtn")?.addEventListener("click", async()=>{const customerId=$("#identityCandidateCustomer")?.value;if(!customerId)return;const {data,error}=await adminClient.functions.invoke("admin-customer-lifecycle",{body:{command:"link_request",request_id:selectedRequest.id,customer_id:customerId}});if(error||!data?.ok){alert(data?.error||error?.message||"Customer link failed.");return;}await loadRequests();await selectRequest(id);showToast("Request linked to the existing customer.");});
  $("#keepNewCustomerBtn")?.addEventListener("click", async()=>{const {data,error}=await adminClient.functions.invoke("admin-customer-lifecycle",{body:{command:"keep_new_customer",request_id:selectedRequest.id}});if(error||!data?.ok){alert(data?.error||error?.message||"Identity review could not be resolved.");return;}await selectRequest(id);showToast("Customer profile kept separate.");});
  $$('[data-open-workspace-tab]', detail).forEach((button) => {
    button.addEventListener("click", () =>
      window.AdminV3?.activateTab(button.dataset.openWorkspaceTab),
    );
  });

  // Convert the newly rendered long detail view into the v3 tab workspace.
  window.AdminV3?.organizeRequestDetail();
  void loadProofControlPanel();
  void loadMobileTravelCard();
  void loadLoanSigningFulfillmentPanel();
  void renderArchivedCustomerUpdates(id);
}

async function invokeLoanSigningFulfillment(command,body={}){const{data,error}=await adminClient.functions.invoke("admin-loan-signing-fulfillment",{body:{command,request_id:selectedRequest.id,...body}});if(error||!data?.ok)throw new Error(data?.error||error?.message||"Loan Signing fulfillment action failed.");return data}
function lsaOptions(values,current){return values.map(value=>`<option value="${value}" ${String(current)===value?"selected":""}>${escapeHtml(statusLabel(value))}</option>`).join("")}
async function loadLoanSigningFulfillmentPanel(){const panel=$("#loanSigningFulfillmentPanel");if(!panel||selectedRequest?.service_type!=="loan_signing")return;try{const data=await invokeLoanSigningFulfillment("snapshot"),a=data.assignment||{},active=(data.packages||[]).find(p=>p.status==="active"),blockers=data.completion?.blockers||[],exceptions=data.exceptions||[],charges=data.charges||[],visits=data.visits||[],resolutions=data.resolutions||[],financials=data.financials||{};panel.innerHTML=`
  <div class="admin-v3-section-heading"><span class="small-label">Current Stage · ${escapeHtml(statusLabel(a.lsa_stage))}</span><h3>Assignment Requirements &amp; Fulfillment</h3><p><strong>Next action:</strong> ${escapeHtml(blockers[0]?.message||"All applicable requirements pass; completion may be evaluated.")}</p></div>
  <form id="lsaAssignmentForm" class="lsa-stage-workspace"><details open><summary>Instructions Review &amp; Signer Confirmation</summary><div class="admin-detail-grid"><label class="check"><input name="instructions_reviewed" type="checkbox" ${a.instructions_reviewed_at?"checked":""}> Instructions reviewed against authoritative sources</label><label>Signer Confirmation<select name="signer_confirmation_status">${lsaOptions(["not_required","required_pending","confirmed","unable_to_reach","reschedule_needed","other_review"],a.signer_confirmation_status)}</select></label><label>Contact Method<input name="signer_contact_method" value="${escapeHtml(a.signer_contact_method||"")}"></label><label>Round-Trip Mileage<input name="round_trip_miles" type="number" min="0" step="0.1" value="${a.round_trip_miles??""}" placeholder="APS origin to signing and back"></label><label>Neutral Note<textarea name="signer_confirmation_note">${escapeHtml(a.signer_confirmation_note||"")}</textarea></label></div><p class="admin-muted">0–30 RT miles are included; 31–40 adds the proposed $25 Extended Travel line; 41+ requires review. Ordinary Mobile Notary travel tiers do not apply.</p></details>
  <details><summary>Package &amp; Printing</summary><p>Active package: <strong>${active?`Version ${active.version_number} · ${active.authoritative_page_count} pages`:"Missing"}</strong></p><div class="admin-detail-grid"><label>Paper Size<select name="paper_size">${lsaOptions(["letter","legal","mixed_letter_legal","other"],a.paper_size)}</select></label><label>Sidedness<select name="sidedness">${lsaOptions(["single_sided","double_sided","mixed_per_instructions","unknown"],a.sidedness)}</select></label><label>Color<select name="print_color">${lsaOptions(["black_white","color","mixed","per_instructions"],a.print_color)}</select></label><label>Scaling<select name="print_scaling">${lsaOptions(["actual_size_100","fit_shrink","mixed_per_instructions","other_authorized"],a.print_scaling)}</select></label><label>Signing Sets<input name="signing_set_count" type="number" min="0" value="${Number(a.signing_set_count||0)}"></label><label>Borrower Copies<input name="borrower_copy_count" type="number" min="0" value="${Number(a.borrower_copy_count||0)}"></label><label>Additional Copies<input name="additional_copy_count" type="number" min="0" value="${Number(a.additional_copy_count||0)}"></label><label>Print Status<select name="print_status">${lsaOptions(["not_required","not_ready","ready_to_print","printing","printed","qc_required","qc_passed","reprint_required"],a.print_status)}</select></label><label>Print QC<select name="print_qc_status">${lsaOptions(["not_required","pending","passed","failed_reprint_required"],a.print_qc_status)}</select></label><label>Borrower Copy<select name="borrower_copy_status">${lsaOptions(["not_required","pending","prepared","digital_per_instructions","other_authorized"],a.borrower_copy_status)}</select></label></div></details>
  <details><summary>Signing &amp; Post-Signing QC</summary><div class="admin-detail-grid"><label>Signing Outcome<select name="signing_outcome"><option value="">Needs review</option>${lsaOptions(["completed","partially_completed_review","did_not_complete_review"],a.signing_outcome)}</select></label><label>Signing-Table QC<select name="post_signing_qc_status">${lsaOptions(["pending","passed","issue_review"],a.post_signing_qc_status)}</select></label><label>Stage<select name="lsa_stage">${lsaOptions(["assignment_received","instructions_review","package_preparation","ready_for_appointment","signing","post_signing_requirements","return","completed"],a.lsa_stage)}</select></label></div></details>
  <details><summary>Scanbacks &amp; Return</summary><div class="admin-detail-grid"><label>Scanbacks<select name="scanbacks_required">${lsaOptions(["unknown","yes","no"],a.scanbacks_required)}</select></label><label>Approval Before Return<select name="approval_before_return_required">${lsaOptions(["unknown","yes","no"],a.approval_before_return_required)}</select></label><label>Physical Return<select name="physical_return_required">${lsaOptions(["unknown","yes","no"],a.physical_return_required)}</select></label><label>Return Method<select name="return_method"><option value="">Needs review</option>${lsaOptions(["prepaid_carrier_label","fedex","ups","usps","direct_title_escrow","other_authorized","no_physical_return"],a.return_method)}</select></label></div></details>
  <button class="btn primary" type="submit">Save Fulfillment State</button></form>
  <section class="lsa-exception-review"><div class="admin-v3-section-heading"><span class="small-label">Exception &amp; Financial Review</span><h4>Facts → Policy → Admin Decision → Communication</h4><p>Suggestions never charge, invoice, refund, or message automatically.</p></div>
  <div class="admin-detail-grid"><div><strong>Original agreed fee</strong><br>${money(financials.original_agreed_fee||0)}</div><div><strong>Previously invoiced</strong><br>${money(financials.previously_invoiced||0)}</div><div><strong>Previously paid</strong><br>${money(financials.previously_paid||0)}</div><div><strong>Open reviews</strong><br>${exceptions.filter(x=>!["resolved","closed"].includes(x.status)).length}</div></div>
  <form id="lsaExceptionForm" class="admin-detail-grid"><label>Outcome / Exception<select name="outcome">${lsaOptions(["cancelled","no_sign","partial_incomplete","resign_required","return_visit_required","excessive_wait_review","package_document_issue","signer_unavailable","identity_notarization_stop","orderer_instruction_stop","other_review"],"")}</select></label><label>Requested / Directed By<select name="requested_by_type">${lsaOptions(["ordering_organization","signer_customer","aps_staff","title_escrow","signing_service","lender","authorized_other_orderer"],"aps_staff")}</select></label><label>Cause<select name="cause_category">${lsaOptions(["aps_notary","signer","orderer_package","unknown_review"],"unknown_review")}</select><label>Neutral internal facts<textarea name="neutral_internal_note" required></textarea></label><label class="check"><input name="aps_caused_delay" type="checkbox"> Wait was APS-caused (exclude suggested wait fee)</label><button class="btn dark" type="submit">Record for Review</button></form>
  ${exceptions.map(x=>`<article class="admin-v3-overview-card"><span class="small-label">${escapeHtml(statusLabel(x.status))}</span><strong>${escapeHtml(statusLabel(x.outcome))}</strong><p>${escapeHtml(x.customer_safe_status||"")}</p>${!["resolved","closed"].includes(x.status)?`${resolutions.some(r=>r.exception_id===x.id)?`<button class="btn dark close-lsa-exception" data-id="${x.id}" type="button">Complete Communication &amp; Close</button>`:`<button class="btn dark resolve-lsa-financial" data-id="${x.id}" type="button">Authorize Financial Resolution</button>`}<button class="btn dark add-lsa-visit" data-id="${x.id}" type="button">Add Linked Visit</button>`:""}</article>`).join("")||"<p>No exception records.</p>"}
  <h4>Visit / Attempt History</h4>${visits.map(v=>`<p><strong>Visit ${Number(v.visit_number)}</strong> · ${escapeHtml(statusLabel(v.visit_type))} · ${escapeHtml(statusLabel(v.outcome||"Scheduled"))}${v.appointment_at?` · ${escapeHtml(new Date(v.appointment_at).toLocaleString())}`:""}</p>`).join("")||"<p>No additional visits.</p>"}
  <h4>Financial Resolutions</h4>${resolutions.map(r=>`<article class="admin-v3-overview-card"><strong>${escapeHtml(statusLabel(r.resolution_type))}</strong><div class="admin-detail-grid"><span>Original ${money(r.original_agreed_fee)}</span><span>Final service value ${money(r.final_service_value)}</span><span>Refund due ${money(r.refund_due)}</span><span>Additional due ${money(r.additional_amount_due)}</span></div>${Number(r.additional_amount_due)>0&&!r.invoice_id?`<button class="btn dark invoice-lsa-resolution" data-id="${r.id}" type="button">Create Separate Supplemental Invoice</button>`:r.invoice_id?"<p>Supplemental invoice linked.</p>":""}</article>`).join("")||"<p>No authorized financial resolution.</p>"}
  <h4>Authorized Additional Charges</h4><button id="addLsaCharge" class="btn dark" type="button">Review Additional Charge</button>${charges.map(c=>`<p><strong>${escapeHtml(statusLabel(c.charge_type))}</strong> · suggested ${money(c.suggested_amount)} · ${escapeHtml(statusLabel(c.decision))}${c.authorized_amount!==null?` · authorized ${money(c.authorized_amount)}`:""}</p>`).join("")||"<p>No additional charges.</p>"}</section>
  <div class="lsa-package-actions"><h4>Package Versioning</h4><button id="addLsaPackage" class="btn dark" type="button">Record Package / Replacement</button><p>Replacement packages preserve prior versions, reopen dependent review, and never alter an accepted fee automatically.</p></div>
  <div class="lsa-requirements"><h4>Applicable Requirement Blockers</h4>${blockers.length?`<ul>${blockers.map(item=>`<li>${escapeHtml(item.message)}</li>`).join("")}</ul>`:"<p>No applicable blockers.</p>"}<p>${data.requirements.length} structured requirements · ${data.stipulations.length} stipulations · ${data.scanbacks.length} scanback records · ${data.returns.length} return records</p><div class="status-actions"><button id="addLsaRequirement" class="btn dark" type="button">Add Requirement</button><button id="addLsaStipulation" class="btn dark" type="button">Add Stipulation</button><button id="recordLsaScanback" class="btn dark" type="button">Record Scanback</button><button id="recordLsaReturn" class="btn dark" type="button">Record Return</button></div></div>`;
  $("#lsaAssignmentForm",panel).addEventListener("submit",async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));["signing_set_count","borrower_copy_count","additional_copy_count"].forEach(key=>values[key]=Number(values[key]||0));if(values.round_trip_miles!=="")values.round_trip_miles=Number(values.round_trip_miles);else delete values.round_trip_miles;values.instructions_reviewed=event.currentTarget.elements.instructions_reviewed.checked;values.printing_required=values.print_status!=="not_required";try{await invokeLoanSigningFulfillment("save_assignment",values);showToast("Loan Signing fulfillment updated and audited.");await refreshSelectedRequest(selectedRequest.id)}catch(error){alert(error.message)}});
  $("#addLsaPackage",panel).addEventListener("click",async()=>{const reason=prompt("Replacement reason or source note (leave blank for initial package):")||"";try{await invokeLoanSigningFulfillment("add_package",{replacement_reason:reason});showToast("The latest authoritative package source was versioned; prior history is preserved.");await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}})
  $("#addLsaRequirement",panel).addEventListener("click",async()=>{const title=prompt("Authoritative assignment requirement:");if(!title)return;const group=prompt("Requirement group: assignment, signers, appointment, printing, package, stipulations, signing, scanbacks, return, or completion","assignment")||"assignment";const source=prompt("Source: orderer_instructions, closing_instructions, shipping_label, email_message, title_escrow_instruction, signing_service_instruction, admin_verified, or other_authoritative_source","orderer_instructions")||"orderer_instructions";try{await invokeLoanSigningFulfillment("save_requirement",{requirement_key:`${group}_${Date.now()}`,title,requirement_group:group,applicability:"required",status:"pending",source_type:source});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}});
  $("#addLsaStipulation",panel).addEventListener("click",async()=>{const title=prompt("Orderer-defined stipulation:");if(!title)return;try{await invokeLoanSigningFulfillment("save_stipulation",{title,required:true,status:"pending",proof_private:true});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}});
  $("#recordLsaScanback",panel).addEventListener("click",async()=>{const status=prompt("Scanback state: needed, scanning, qc, ready_to_submit, submitted, accepted, approval_pending, approved_for_return, or correction_required","submitted");if(!status)return;const qc=prompt("QC state: pending, passed, or failed","passed")||"pending";try{await invokeLoanSigningFulfillment("save_scanback",{package_version_id:active?.id||null,content_scope:"full_package",status,qc_status:qc,submitted_at:["submitted","accepted","approval_pending","approved_for_return"].includes(status)?new Date().toISOString():null});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}});
  $("#recordLsaReturn",panel).addEventListener("click",async()=>{const method=prompt("Return method: prepaid_carrier_label, fedex, ups, usps, direct_title_escrow, other_authorized, or no_physical_return",a.return_method||"fedex");if(!method)return;const tracking=method==="no_physical_return"?null:prompt("Tracking number if required (leave blank if not yet available):");try{await invokeLoanSigningFulfillment("save_return",{return_method:method,carrier:["fedex","ups","usps"].includes(method)?method:null,tracking_required:!["direct_title_escrow","no_physical_return"].includes(method),tracking_number:tracking||null,tracking_status:tracking?"recorded":"not_yet_available",status:method==="no_physical_return"?"returned":"pending",completed_at:method==="no_physical_return"?new Date().toISOString():null});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}});
  $("#lsaExceptionForm",panel).addEventListener("submit",async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));values.aps_caused_delay=event.currentTarget.elements.aps_caused_delay.checked;try{await invokeLoanSigningFulfillment("save_exception",values);showToast("Exception recorded for separate operational, financial, and communication review.");await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}});
  $$(".resolve-lsa-financial",panel).forEach(button=>button.addEventListener("click",async()=>{const resolution_type=prompt("Resolution: no_charge, partial_charge, full_agreed_fee, custom_authorized_amount, full_refund, partial_refund, no_refund, or no_financial_change","no_financial_change");if(!resolution_type)return;const authorized_charge=Number(prompt("Authorized final base service value (refund or additional balance is derived from paid history)","0")||0),decision_reason=prompt("Required internal decision rationale:");if(!decision_reason)return;const customer_safe_explanation=prompt("Customer-safe explanation (no blame or internal policy matrix):")||"APS completed its review and will provide any required financial follow-up separately.";try{await invokeLoanSigningFulfillment("resolve_financial",{exception_id:button.dataset.id,resolution_type,authorized_charge,decision_reason,customer_safe_explanation});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}}));
  $$(".add-lsa-visit",panel).forEach(button=>button.addEventListener("click",async()=>{const visit_type=prompt("Visit type: resign or return_visit","resign");if(!visit_type)return;try{await invokeLoanSigningFulfillment("save_visit",{exception_id:button.dataset.id,visit_type});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}}));
  $$(".invoice-lsa-resolution",panel).forEach(button=>button.addEventListener("click",async()=>{if(!confirm("Create a separate supplemental invoice for this authorized amount? The original invoice will not be changed."))return;try{await invokeLoanSigningFulfillment("execute_charge_invoice",{resolution_id:button.dataset.id});showToast("Authorized Loan Signing amount placed on a separate supplemental invoice.");await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}}));
  $$(".close-lsa-exception",panel).forEach(button=>button.addEventListener("click",async()=>{if(!confirm("Confirm that the authorized financial follow-up and customer-safe communication are complete, then close this exception?"))return;try{await invokeLoanSigningFulfillment("close_exception",{exception_id:button.dataset.id,communication_complete:true});showToast("Loan Signing exception closed.");await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}}));
  $("#addLsaCharge",panel).addEventListener("click",async()=>{const charge_type=prompt("Charge type: excessive_wait, additional_authorized_travel, authorized_reprint, replacement_package_preparation, additional_signing_visit, resign_fee, cancellation_charge, or other_authorized_assignment_adjustment","excessive_wait");if(!charge_type)return;const suggested_amount=Number(prompt("Suggested amount (not automatically owed)","0")||0),decision=prompt("Decision: pending_review, waived, or authorized","pending_review")||"pending_review",authorized_amount=decision==="authorized"?Number(prompt("Authorized amount","0")||0):0,reason=prompt("Reason / internal rationale:")||"Admin review required";try{await invokeLoanSigningFulfillment("save_charge",{charge_type,suggested_amount,decision,authorized_amount,reason});await loadLoanSigningFulfillmentPanel()}catch(error){alert(error.message)}});
}catch(error){panel.innerHTML=`<div class="admin-v3-section-heading"><span class="small-label">Loan Signing Fulfillment</span><h3>Workspace unavailable</h3></div><p class="communication-error">${escapeHtml(error.message)}</p>`}}

async function saveAppointmentDetails() {
  // APPOINTMENT DETAILS
  // The dashboard shows the customer's requested date/time as a starting point.
  // Blank fields should NOT wipe existing database values.
  if (!selectedRequest) return;
  const requestId = selectedRequest.id;

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
    appointment_timezone:
      selectedRequest.appointment_timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "America/Chicago",
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
  // Rebuild the selected workspace after the realtime request refresh. Without
  // this, the fulfillment save can leave the visible tab panels detached from
  // the persistent workspace controller until a full page reload.
  await loadRequests();
  await selectRequest(requestId);
  window.AdminV3?.activateTab("fulfillment");
  showToast("Appointment details saved.");
  return true;
}

function isFinalPaymentInvoice(invoice) {
  return ["final", "final_balance", "supplemental", "additional"].some((kind) =>
    String(invoice.invoice_type || "").includes(kind)
  ) || String(invoice.invoice_number || "").endsWith("-02");
}

function paymentInvoiceBalance(invoice) {
  return Math.max(0, Number(invoice.amount_due || 0) - Number(invoice.amount_paid || invoice.paid_amount || 0));
}

/** Open a visible, testable recorder for money received outside Stripe. */
async function openManualPaymentDialog(paymentStage) {
  if (!selectedRequest) return;
  const invoices = await getInvoices(selectedRequest.id);
  const target = invoices.find((invoice) =>
    isFinalPaymentInvoice(invoice) === (paymentStage === "final") && paymentInvoiceBalance(invoice) > 0.009
  );
  const matching = invoices.find((invoice) => isFinalPaymentInvoice(invoice) === (paymentStage === "final"));
  if (!target) {
    const message = matching
      ? "Payment already recorded. This invoice has already been paid and has no outstanding balance."
      : paymentStage === "final"
        ? "No unpaid supplemental or final invoice is available."
        : "No unpaid primary invoice is available. Approve the quote before recording payment.";
    alert(message);
    return;
  }

  const due = Number(target.amount_due || 0);
  const paid = Number(target.amount_paid || target.paid_amount || 0);
  const outstanding = paymentInvoiceBalance(target);
  const paymentAttemptReference = `manual:${selectedRequest.id}:${target.id}:${crypto.randomUUID()}`;
  const dialog = document.createElement("dialog");
  dialog.className = "admin-v3-danger-dialog manual-payment-dialog";
  dialog.innerHTML = `<form method="dialog">
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <span class="small-label">Offline / Manual Payment</span>
    <h2>Record Payment Received</h2>
    <p>This records money received outside the automated Stripe checkout flow. It does not create a new invoice or charge Stripe.</p>
    <div class="manual-payment-summary">
      <div><span>Invoice</span><strong>${escapeHtml(target.invoice_number || "Existing invoice")}</strong></div>
      <div><span>Invoice total</span><strong>${money(due)}</strong></div>
      <div><span>Already paid</span><strong>${money(paid)}</strong></div>
      <div><span>Outstanding</span><strong>${money(outstanding)}</strong></div>
    </div>
    <label>Amount received<input name="amount" type="number" min="0.01" max="${outstanding.toFixed(2)}" step="0.01" value="${outstanding.toFixed(2)}" required></label>
    <label>Payment method / source<input name="method" type="text" placeholder="Zelle, Cash App, cash, check, external, or TEST" required></label>
    <label>Reference / note<input name="reference" type="text" placeholder="Optional transaction reference or internal note"></label>
    <div class="status-actions"><button type="button" class="btn secondary cancel-manual-payment">Cancel</button><button type="button" class="btn primary record-manual-payment">Record Payment</button></div>
    <div class="manual-payment-status" role="status" aria-live="polite"></div>
  </form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  const form = dialog.querySelector("form");
  const submit = dialog.querySelector(".record-manual-payment");
  const output = dialog.querySelector(".manual-payment-status");
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close("cancel"));
  dialog.querySelector(".cancel-manual-payment").addEventListener("click", () => dialog.close("cancel"));
  submit.addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    const amount = Number(form.elements.amount.value);
    if (amount > outstanding + 0.009) {
      output.textContent = `Amount cannot exceed the outstanding balance of ${money(outstanding)}.`;
      return;
    }
    const method = form.elements.method.value.trim();
    const reference = form.elements.reference.value.trim();
    submit.disabled = true;
    output.textContent = "Recording payment…";
    const saved = await recordAdminPayment(paymentStage, {
      invoice_id: target.id, amount, method,
      reference: reference || paymentAttemptReference,
      note: reference, payment_stage: paymentStage,
      is_test: method.toLowerCase() === "test",
    });
    if (saved) dialog.close();
    else { submit.disabled = false; output.textContent = "Payment was not recorded."; }
  });
  dialog.showModal();
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
async function recordAdminPayment(paymentStage, payment) {
  if (!selectedRequest) return false;
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
  if (status === "completed" && !selectedRequest?.completed_at && currentMessagePreviewContext?.context) {
    currentMessagePreviewContext.context.completionDate = customerPreviewDate(new Date().toISOString(), "Completion pending");
  }
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
  const requestId = selectedRequest.id;
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
  await loadRequests();
  await selectRequest(requestId);
  window.AdminV3?.activateTab("fulfillment");
  const refreshedResult = $("#completionGateResult");
  if (refreshedResult) {
    refreshedResult.hidden = false;
    refreshedResult.textContent = "Fulfillment facts saved.";
  }
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
  const files = await getFiles(selectedRequest.id);
  const target = files.find((file) => file.id === fileId);
  if (!target) { alert("Document not found."); return; }
  if (target.uploaded_by === "customer" && target.document_classification === "customer_document") { alert("This is a customer upload. The customer already has secure request-scoped access, so release is not applicable."); return; }
  if (released && target.document_classification === "internal_document") { alert("Internal and audit documents cannot be released. Reclassify an eligible customer deliverable through an authorized workflow first."); return; }
  const { error } = await adminClient.rpc("admin_set_document_release", { p_request: selectedRequest.id, p_file: fileId, p_release: released });
  if (error) { alert(error.message || "Document release could not be updated."); return; }
  showToast(released ? "Document released to the customer portal." : "Customer release withdrawn.");
  await selectRequest(selectedRequest.id);
  window.AdminV3?.activateTab("documents");
}

async function reviewProofDocument(fileId) {
  if (!selectedRequest || !fileId) return;
  if (!confirm("Confirm APS review of this completed Proof document? This does not release it to the customer.")) return;
  const { error } = await adminClient.rpc("admin_review_proof_completed_document", { p_request: selectedRequest.id, p_file: fileId });
  if (error) { alert(error.message || "Completed document review could not be recorded."); return; }
  showToast("APS review completed. Customer release remains explicit.");
  sessionStorage.setItem(`aps:focus-document:${selectedRequest.id}`, fileId);
  await selectRequest(selectedRequest.id);
  window.AdminV3?.activateTab("documents");
  window.setTimeout(() => focusProofDocument(selectedRequest.id), 120);
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

function openParticipantEditor(person) {
  if (!selectedRequest) return;
  const adding=!person;
  const dialog = document.createElement("dialog");
  dialog.className = "admin-v3-danger-dialog participant-editor-dialog";
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" formnovalidate aria-label="Close">×</button><span class="small-label">Transaction Participant</span><h2>${adding?"Add":"Edit"} Participant</h2><p>${adding?"Enter only customer-confirmed participant information. Do not infer a signer from document text.":"Correct the participant record"} for ${escapeHtml(refFromId(selectedRequest.id))}. This does not change the primary customer profile or rewrite the original submission.</p>${adding?'<label>Participant type<select name="participant_type" required><option value="signer">Signer</option><option value="witness">Witness</option></select></label>':""}<div class="admin-detail-grid"><label>First name<input name="first_name" value="${escapeHtml(person?.first_name||"")}" required></label><label>Middle name<input name="middle_name" value="${escapeHtml(person?.middle_name||"")}"></label><label>Last name<input name="last_name" value="${escapeHtml(person?.last_name||"")}" required></label><label>Email<input name="email" type="email" value="${escapeHtml(person?.email||"")}" ${selectedRequest.service_type==="ron"&&person?.participant_type==="signer"?"required":""}></label><label>Phone<input name="mobile_phone" type="tel" value="${escapeHtml(person?.mobile_phone||"")}"></label></div><p class="admin-muted">Saving updates the canonical roster and signer count, recalculates readiness, resolves participant Review Queue blockers only when complete, and records an internal Timeline audit event.</p><div class="status-actions"><button value="cancel" formnovalidate class="btn secondary">Close</button><button type="button" class="btn primary save-participant">${adding?"Add":"Save"} Participant</button></div><div class="workflow-result" role="status" aria-live="polite"></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener("close",()=>dialog.remove());
  const form=dialog.querySelector("form");
  const syncParticipantRequirements=()=>{if(adding)form.elements.email.required=selectedRequest.service_type==="ron"&&form.elements.participant_type.value==="signer";};
  form.elements.participant_type?.addEventListener("change",syncParticipantRequirements);syncParticipantRequirements();
  dialog.querySelector(".save-participant").addEventListener("click",async(event)=>{if(!form.reportValidity())return;const button=event.currentTarget;button.disabled=true;try{const values=Object.fromEntries(new FormData(form));const {data,error}=await adminClient.functions.invoke("admin-update-participant",{body:{command:adding?"add":"update",request_id:selectedRequest.id,participant_id:person?.id||null,...values}});if(error||!data?.ok)throw new Error(data?.error||error?.message||"Participant update failed.");dialog.close();showToast(`Participant ${adding?"added":"updated"} and readiness recalculated.`);await refreshSelectedRequest(selectedRequest.id)}catch(error){dialog.querySelector(".workflow-result").textContent=error.message;button.disabled=false;}});
  dialog.showModal();
}

async function flagAdditionalParticipantReview(){if(!selectedRequest)return;const reason=prompt("Describe the neutral participant clarification needed. Do not make a legal conclusion about who must sign.");if(!String(reason||"").trim())return;const {data,error}=await adminClient.functions.invoke("admin-update-participant",{body:{command:"flag_additional_review",request_id:selectedRequest.id,reason:String(reason).trim()}});if(error||!data?.ok){alert(data?.error||error?.message||"The participant review could not be flagged.");return}showToast(data.duplicate?"Additional participant review is already open.":"Additional participant review added to Review Queue.");await refreshSelectedRequest(selectedRequest.id)}

async function updateRequestStatus(status) {
  // STATUS UPDATE + EMAILS
  // Uses the deployed Edge Function so status, history, customer email,
  // admin email, and success page movement stay in sync.
  if (!selectedRequest) return;
  const sendMessage = !$("#updateStatusWithoutSending")?.checked;

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
          send_message: sendMessage,
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

    if (data?.notification?.ok === false) {
      alert("The final balance invoice was created successfully, but the customer notification failed. The financial record was preserved; retry the notification from Messages after reviewing the failure.");
    } else {
      showToast(data?.notification?.duplicate ? "Final balance invoice already exists; customer notification was not duplicated." : "Final balance invoice issued and customer email sent.");
    }
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

async function retryFinalInvoiceNotification(event) {
  if (!selectedRequest) return;
  const button = event?.currentTarget;
  const invoiceId = String(button?.dataset.invoiceId || "");
  if (!invoiceId || button?.disabled) return;
  button.disabled = true;
  button.textContent = "Retrying…";
  try {
    const { data, error } = await adminClient.functions.invoke("create-additional-invoice", {
      body: {
        request_id: selectedRequest.id,
        invoice_id: invoiceId,
        notification_only: true,
        note: selectedRequest.appointment_line_items_note || selectedRequest.quote_notes || "Final balance invoice ready for review and payment.",
      },
    });
    if (error || data?.ok === false) throw new Error(data?.error || error?.message || "Customer notification failed.");
    showToast(data?.duplicate ? "Invoice notification was already sent; no duplicate was created." : "Invoice notification sent and added to Communication Log.");
    await refreshSelectedRequest(selectedRequest.id);
    window.AdminV3?.activateTab("payments");
  } catch (error) {
    alert(`The invoice remains unchanged. Customer notification retry failed: ${error.message}`);
    button.disabled = false;
    button.textContent = "Retry Invoice Notification";
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
  const { data, error } = await adminClient.functions.invoke("admin-customer-lifecycle", { body: { command: archived ? "restore" : "archive", request_id: selectedRequest.id, reason: archived ? "Restored to active operations." : "Removed from active operations; history retained." } });
  if (error || !data?.ok) { alert(data?.error || error?.message || "Request lifecycle update failed."); return; }
  await loadRequests();
  await selectRequest(selectedRequest.id);
  showToast(archived ? "Request restored." : "Request archived. All history was retained.");
}

async function openPermanentDeleteDialog() {
  if (!selectedRequest) return;
  const { data, error } = await adminClient.functions.invoke("admin-customer-lifecycle", { body: { command: "delete_eligibility", request_id: selectedRequest.id } });
  const eligibility = Array.isArray(data?.result) ? data.result[0] : data?.result;
  if (error || !data?.ok || !eligibility) { alert(data?.error || error?.message || "Deletion eligibility could not be checked."); return; }
  const dialog = document.createElement("dialog");
  dialog.className = "admin-v3-danger-dialog";
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><span class="small-label">Permanent deletion</span><h2>Permanently delete ${escapeHtml(refFromId(selectedRequest.id))}?</h2>${eligibility.eligible?`<p>This eligible test/junk request and safely deletable dependent test data will be permanently removed. This cannot be undone.</p><label>Reason<input name="reason" required minlength="3" placeholder="Test, junk, spam, or accidental submission"></label><label>Type DELETE to continue<input name="confirmation" required autocomplete="off"></label><div class="status-actions"><button value="cancel" class="btn secondary">Cancel</button><button type="button" class="btn danger confirm-permanent-delete">Permanently Delete</button></div>`:`<p>This request is protected and cannot be permanently deleted. Archive it instead.</p><ul>${(eligibility.blockers||[]).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul><button value="cancel" class="btn dark">Close</button>`}</form>`;
  document.body.append(dialog);dialog.addEventListener("close",()=>dialog.remove());dialog.showModal();
  dialog.querySelector(".confirm-permanent-delete")?.addEventListener("click",async(event)=>{const form=dialog.querySelector("form");if(!form.reportValidity())return;event.currentTarget.disabled=true;const confirmation=form.elements.confirmation.value;const reason=form.elements.reason.value;if(confirmation!=="DELETE"){form.elements.confirmation.setCustomValidity("Type DELETE exactly.");form.elements.confirmation.reportValidity();event.currentTarget.disabled=false;return;}const result=await adminClient.functions.invoke("admin-customer-lifecycle",{body:{command:"delete",request_id:selectedRequest.id,confirmation,reason}});if(result.error||!result.data?.ok){alert(result.data?.error||result.error?.message||"Deletion failed.");event.currentTarget.disabled=false;return;}dialog.close();selectedRequest=null;await loadRequests();showToast(`${eligibility.reference} permanently deleted.`);});
}
async function loadRequests() {
  setText("adminLiveStatus", "Loading requests…");
  window.dispatchEvent(new CustomEvent("aps:requests-loading"));
  const { data, error } = await adminClient
    .from("service_requests")
    .select(
      "id,created_at,service_type,status,preferred_date,preferred_time_window,notes,estimated_total,estimate_components,archived_at,quote_amount,full_quote_amount,initial_payment_amount,paid_amount,quote_notes,current_quote_id,invoice_number,invoice_url,receipt_url,receipt_pdf_url,payment_status,paid_at,appointment_confirmed_at,appointment_date,appointment_time,appointment_timezone,appointment_location,appointment_link,appointment_platform,appointment_instructions,balance_due_at_appointment,appointment_line_items_note,customer_message,review_link_google,review_link_yelp,prep_video_url,invoice_status,balance_due,workflow_status,payment_state,appointment_state,request_completeness,document_state,participant_state,fulfillment_state,detected_pdf_page_count,pdf_page_count_review_required,pdf_page_count_changed_after_quote,is_same_day_request,is_next_day_request,quote_expires_at,customer_reported_source,customer_reported_source_detail,acquisition_landing_page,acquisition_referrer_host,acquisition_utm_source,acquisition_utm_medium,acquisition_utm_campaign,first_touch_source,review_request_state,review_request_eligible_at,review_request_sent_at,customers(id,first_name,last_name,email,phone,preferred_contact,created_at,normalized_email,normalized_phone,normalized_name,merged_at,first_acquisition_source,first_acquisition_at),request_participants(participant_type,first_name,middle_name,last_name,full_legal_name,email),ron_requests(ron_platform),mobile_notary_requests(street_address,unit,city,state,zip),print_scan_requests(fulfillment_type,delivery_address)",
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(300);
  if (error) {
    console.error("Authorized request loader failed:", error);
    const safeRequestError = "Requests could not be loaded. Refresh your session and try again.";
    setText("adminLiveStatus", safeRequestError);
    $("#requestList").innerHTML =
      `<div class="request-empty">${safeRequestError}</div>`;
    window.dispatchEvent(
      new CustomEvent("aps:requests-error", {
        detail: { message: safeRequestError },
      }),
    );
    return;
  }
  requests = data || [];
  const loanSigningRequests = requests.filter(
    (request) => request.service_type === "loan_signing",
  );
  if (loanSigningRequests.length) {
    const enrichmentResults = await Promise.allSettled(
      loanSigningRequests.map(async (request) => {
        const { data: snapshot, error: snapshotError } =
          await adminClient.functions.invoke("admin-loan-signing-fulfillment", {
            body: { command: "snapshot", request_id: request.id },
          });
        if (snapshotError || !snapshot?.ok || !snapshot.assignment) {
          throw new Error(
            snapshot?.error ||
              snapshotError?.message ||
              "Loan Signing details could not be loaded.",
          );
        }
        request.loan_signing_assignments = [snapshot.assignment];
        request.loan_signing_snapshot = snapshot;
      }),
    );
    enrichmentResults.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      loanSigningRequests[index].loan_signing_enrichment_error = true;
      console.error("Authorized Loan Signing enrichment failed:", {
        request_id: loanSigningRequests[index].id,
        error: result.reason,
      });
    });
  }
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
  window.APSAdminInteractions?.bindRequestSelection(
    $("#requestList"),
    selectRequest,
  );
  await loadRequests();
  await loadSupportTickets();
  subscribeRealtime();
}

let proofReturnRefreshAt = 0;
async function refreshProofReturnState() {
  if (document.hidden || selectedRequest?.service_type !== "ron" || !$("#proofControlPanel")) return;
  const now = Date.now();
  if (now - proofReturnRefreshAt < 15000) return;
  proofReturnRefreshAt = now;
  await loadProofControlPanel();
}
window.addEventListener("focus", () => refreshProofReturnState().catch(() => {}));
document.addEventListener("visibilitychange", () => refreshProofReturnState().catch(() => {}));
window.addEventListener("aps:admin-notification", event => {
  if (event.detail?.service_request_id === selectedRequest?.id && selectedRequest?.service_type === "ron") refreshProofReturnState().catch(() => {});
});
handleLogin();
initDashboard();
window.loadRequests = loadRequests;

// Admin Portal v2 shell: keep planned navigation visibly disabled until its module is implemented.
document
  .querySelectorAll('.admin-nav [data-disabled="true"]')
  .forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });
