/**
 * Aligned Print & Scan — Admin Portal v3 interaction layer.
 *
 * This file adapts the proven request-management logic in admin.js to the new
 * split-view workspace. Business logic remains in admin.js and Supabase Edge
 * Functions; this file manages presentation, tabs, navigation, and responsive
 * behavior only.
 */

(() => {
  "use strict";

  const state = {
    activeTab: "overview",
    selectedRequestId: null,
    isOrganizingDetail: false,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];

  const detailRoot = $("#requestDetail");
  const workspace = $(".admin-v3-workspace");


  /**
   * Return the request workspace to its accessible starting position.
   *
   * The workspace is its own scroll container. Without an explicit reset,
   * selecting a different request or tab can preserve the previous request's
   * scroll position and leave the request header above the visible viewport.
   */
  function resetWorkspaceScroll({ smooth = false } = {}) {
    if (!workspace) return;

    window.requestAnimationFrame(() => {
      workspace.scrollTo({
        top: 0,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  /** Convert a database status into customer-readable title case. */
  function labelFromStatus(status = "") {
    return String(status || "under_review")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }


  /** Return the recommended workspace action for the request's real state. */
  function primaryActionFor(request = {}) {
    const status = String(request.workflow_status || request.status || "under_review").toLowerCase();
    const actions = {
      under_review: { label: "Build Quote", tab: "quote" },
      quote_ready: { label: "Review & Send Quote", tab: "messages" },
      awaiting_approval: { label: "Review Quote", tab: "quote" },
      changes_requested: { label: "Revise Quote", tab: "quote" },
      awaiting_payment: { label: "Open Invoice #1", tab: "payments" },
      payment_pending: { label: "Review Payment", tab: "payments" },
      payment_received: { label: "Schedule Fulfillment", tab: "fulfillment" },
      appointment_confirmed: { label: "Open Fulfillment", tab: "fulfillment" },
      final_balance_due: { label: "Open Invoice #2", tab: "payments" },
      final_payment_received: { label: "Complete Request", tab: "overview" },
      completed: { label: "View Completed Request", tab: "overview" },
      cancelled: { label: "View Cancellation", tab: "overview" },
    };
    return actions[status] || { label: "Open Next Action", tab: "overview" };
  }

  /** Update the persistent workspace header when a request is selected. */
  function syncSelectedRequest(request) {
    if (!request) return;

    state.selectedRequestId = request.id;

    const customer = Array.isArray(request.customers)
      ? request.customers[0]
      : request.customers;
    const clientName = [customer?.first_name, customer?.last_name]
      .filter(Boolean)
      .join(" ") || "Client";
    const reference = `APS-${String(request.id || "")
      .slice(0, 8)
      .toUpperCase()}`;
    const service =
      request.service_type === "ron"
        ? "Remote Online Notary"
        : request.service_type === "mobile"
          ? "Mobile Notary"
          : "Print & Scan";

    $("#workspaceServiceLabel").textContent = service;
    $("#workspaceTitle").textContent = `${reference} · ${clientName}`;
    $("#workspaceStatus").textContent = labelFromStatus(
      request.workflow_status || request.status,
    );
    $("#workspaceMeta").textContent = [
      request.created_at
        ? `Created ${new Date(request.created_at).toLocaleString()}`
        : null,
      request.preferred_date || request.appointment_date || null,
      request.preferred_time_window || request.appointment_time || null,
    ]
      .filter(Boolean)
      .join(" · ");

    const primaryAction = primaryActionFor(request);
    const primaryButton = $("#workspacePrimaryAction");
    primaryButton.disabled = false;
    primaryButton.textContent = primaryAction.label;
    primaryButton.dataset.targetTab = primaryAction.tab;
    $("#workspaceEmailAction").disabled = false;
    workspace?.classList.add("has-selection");
    resetWorkspaceScroll();

    window.setTimeout(organizeRequestDetail, 0);
  }

  /**
   * Map each existing legacy detail section to its new workspace tab.
   * This preserves tested business logic while replacing the long page.
   */
  function tabForNode(node, index) {
    const explicitTarget = node.dataset.v3TabTarget;
    const heading = $("h3", node)?.textContent?.trim().toLowerCase() || "";
    const text = node.textContent?.trim().toLowerCase() || "";

    if (explicitTarget) return explicitTarget;
    if (index === 0 && node.classList.contains("admin-detail-grid")) {
      return "overview";
    }
    if (text.includes("workflow") && text.includes("recommended action")) {
      return "overview";
    }
    if (heading.includes("quote builder")) return "quote";
    if (heading.includes("invoice payment")) return "payments";
    if (heading.includes("appointment")) return "fulfillment";
    if (heading.includes("service details")) return "customer";
    if (heading.includes("uploaded files")) return "documents";
    if (heading.includes("communication log")) return "messages";
    if (heading.includes("automatic timeline")) return "timeline";
    if (heading.includes("cancellation") || heading.includes("reschedule")) return "overview";
    if (heading.includes("status update")) return "messages";

    return "overview";
  }

  /** Create a helpful empty panel for modules planned for later integration. */
  function createPlaceholder(tabName) {
    const copy = {
      messages: [
        "Messages",
        "Customer messages, status communications, attachments, and delivery history appear here.",
      ],
      timeline: [
        "Timeline",
        "Request, quote, invoice, payment, appointment, session, and completion events will appear here automatically.",
      ],
    }[tabName];

    const card = document.createElement("div");
    card.className = "admin-v3-placeholder-card";
    card.innerHTML = `<h3>${copy[0]}</h3><p>${copy[1]}</p>`;
    return card;
  }

  /** Transform the dynamically rendered request detail into tab panels. */
  function organizeRequestDetail() {
    if (!detailRoot || state.isOrganizingDetail) return;
    if (detailRoot.querySelector("[data-v3-tab-panel]")) return;
    if (detailRoot.querySelector(".admin-v3-empty-state")) return;

    const nodes = [...detailRoot.children];
    if (!nodes.length) return;

    state.isOrganizingDetail = true;

    const panels = new Map();
    const tabNames = [
      "overview",
      "customer",
      "documents",
      "quote",
      "payments",
      "messages",
      "fulfillment",
      "timeline",
    ];

    tabNames.forEach((tabName) => {
      const panel = document.createElement("section");
      panel.dataset.v3TabPanel = tabName;
      panel.className = "admin-v3-tab-stack";
      panels.set(tabName, panel);
    });

    nodes.forEach((node, index) => {
      const tabName = tabForNode(node, index);
      panels.get(tabName).append(node);
    });

    ["messages", "timeline"].forEach((tabName) => {
      if (!panels.get(tabName).children.length) {
        panels.get(tabName).append(createPlaceholder(tabName));
      }
    });

    detailRoot.replaceChildren(...panels.values());
    activateTab(state.activeTab);
    state.isOrganizingDetail = false;
  }

  /** Show exactly one request workspace panel. */
  function activateTab(tabName) {
    state.activeTab = tabName;

    $$("[data-workspace-tab]").forEach((button) => {
      const isActive = button.dataset.workspaceTab === tabName;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });

    $$('[data-v3-tab-panel]', detailRoot).forEach((panel) => {
      const isActive = panel.dataset.v3TabPanel === tabName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    resetWorkspaceScroll();
  }

  /** Filter the rendered request queue without another database request. */
  function filterVisibleRequestCards(searchTerm) {
    const normalized = String(searchTerm || "").trim().toLowerCase();

    $$("#requestList .request-row").forEach((card) => {
      const searchIndex = card.dataset.searchIndex || card.textContent;
      card.hidden = Boolean(
        normalized && !searchIndex.toLowerCase().includes(normalized),
      );
    });
  }

  function normalizedSearch(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9@.+]/g, "");
  }

  function escapeSearchResult(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function renderGlobalSearchResults(searchTerm) {
    const box = $("#globalAdminSearchResults");
    if (!box) return;
    const query = normalizedSearch(searchTerm);
    if (query.length < 2) { box.hidden = true; box.replaceChildren(); return; }
    const results = [];
    $$("#requestList .request-row").forEach((card) => {
      const matches = (value) => normalizedSearch(value).includes(query);
      const reference = card.dataset.reference || "APS Request";
      if (matches(`${reference} ${card.dataset.serviceLabel} ${card.dataset.statusLabel}`)) results.push({ type: "Request", title: reference, detail: `${card.dataset.serviceLabel} · ${card.dataset.statusLabel}`, id: card.dataset.id, tab: "overview" });
      if (matches(`${card.dataset.customerName} ${card.dataset.customerEmail} ${card.dataset.customerPhone}`)) results.push({ type: "Customer", title: card.dataset.customerName || "Customer", detail: card.dataset.customerEmail || card.dataset.customerPhone || reference, id: card.dataset.id, tab: "customer" });
      String(card.dataset.invoiceNumbers || "").split("|").filter(Boolean).forEach((invoice) => { if (matches(`${invoice} ${reference} ${card.dataset.statusLabel}`)) results.push({ type: "Invoice", title: invoice, detail: `${reference} · ${card.dataset.statusLabel}`, id: card.dataset.id, tab: "payments" }); });
    });
    const unique = results.filter((item, index, all) => all.findIndex((candidate) => `${candidate.type}:${candidate.title}:${candidate.id}` === `${item.type}:${item.title}:${item.id}`) === index).slice(0, 12);
    box.hidden = false;
    box.innerHTML = unique.length ? unique.map((item) => `<button type="button" role="option" data-search-request="${escapeSearchResult(item.id)}" data-search-tab="${escapeSearchResult(item.tab)}"><span>${escapeSearchResult(item.type)}</span><strong>${escapeSearchResult(item.title)}</strong><small>${escapeSearchResult(item.detail)}</small></button>`).join("") : '<p>No matching requests, customers, or invoices.</p>';
  }

  /** Keep request counters in the new shell synchronized with rendered cards. */
  function syncRequestCount() {
    const count = $$("#requestList .request-row").length;
    $("#requestCountBadge").textContent = String(count);
    $("#navRequestCount").textContent = String(count);
  }

  /** Wire persistent navigation and controls. */
  function bindShellEvents() {
    $$("[data-workspace-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.workspaceTab);
      });
    });

    $("#requestSearch")?.addEventListener("input", (event) => {
      const term = event.target.value;
      const globalSearch = $("#globalAdminSearch");
      if (globalSearch) globalSearch.value = term;
      filterVisibleRequestCards(term);
    });

    $("#globalAdminSearch")?.addEventListener("input", (event) => {
      const term = event.target.value;
      const requestSearch = $("#requestSearch");
      requestSearch.value = term;
      filterVisibleRequestCards(term);
      renderGlobalSearchResults(term);
    });

    $("#globalAdminSearchResults")?.addEventListener("click", (event) => {
      const result = event.target.closest("[data-search-request]");
      if (!result) return;
      const card = $(`#requestList .request-row[data-id="${result.dataset.searchRequest}"]`);
      if (!card) return;
      card.hidden = false;
      card.click();
      window.setTimeout(() => activateTab(result.dataset.searchTab || "overview"), 80);
      $("#globalAdminSearchResults").hidden = true;
    });

    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("#globalAdminSearch")?.focus();
      }
    });

    $("#adminMenuButton")?.addEventListener("click", (event) => {
      const sidebar = $("#adminSidebar");
      const isOpen = sidebar.classList.toggle("is-open");
      event.currentTarget.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const sidebar = $("#adminSidebar");
      const menuButton = $("#adminMenuButton");
      if (!sidebar?.classList.contains("is-open")) return;
      sidebar.classList.remove("is-open");
      menuButton?.setAttribute("aria-expanded", "false");
      menuButton?.focus();
    });

    $("#workspacePrimaryAction")?.addEventListener("click", (event) => {
      activateTab(event.currentTarget.dataset.targetTab || "overview");
    });

    $("#workspaceEmailAction")?.addEventListener("click", () => {
      activateTab("communication");
    });

    $("#newRequestButton")?.addEventListener("click", () => {
      window.open("pricing.html#request", "_blank", "noopener");
    });

    $$("[data-admin-view]").forEach((link) => {
      link.addEventListener("click", () => {
        $$("[data-admin-view]").forEach((item) => {
          item.classList.remove("is-active");
        });
        link.classList.add("is-active");
        $("#adminSidebar")?.classList.remove("is-open");
        $("#adminMenuButton")?.setAttribute("aria-expanded", "false");
      });
    });

    $$("[data-quick-filter]").forEach((button) => {
      button.setAttribute(
        "aria-selected",
        String(button.classList.contains("is-active")),
      );
      button.addEventListener("click", () => {
        window.queueMicrotask(() => {
          $$("[data-quick-filter]").forEach((item) => {
            item.setAttribute(
              "aria-selected",
              String(item.classList.contains("is-active")),
            );
          });
        });
      });
    });
  }

  const requestListObserver = new MutationObserver(() => {
    syncRequestCount();
  });

  if ($("#requestList")) {
    requestListObserver.observe($("#requestList"), {
      childList: true,
      subtree: true,
    });
  }

  bindShellEvents();

  /* Phase 4.1 Milestone 1 — functional operations modules. */
  const moduleState = {
    requests: [],
    supportTickets: [],
    messages: [],
    templates: [],
    activeView: "requests",
    newOrderStep: 0,
    newOrderMaxStep: 0,
    newOrderCalendarDate: null,
    requestsState: "loading",
    requestsError: "",
    calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calendarSelectedDate: null,
    calendarService: "all",
    calendarStatus: "all",
  };
  const appView = $("#requests");
  const moduleView = $("#adminModuleView");
  const moduleContent = $("#adminModuleContent");
  const moduleTitles = {
    dashboard: ["Overview", "Operations Dashboard", "Live request, schedule, and revenue indicators."],
    calendar: ["Operations", "Scheduling Center", "Plan and export requested and confirmed APS appointments."],
    review: ["Operations", "Review Queue", "Requests that require a specific administrator decision or correction."],
    sessions: ["Operations", "RON Sessions", "Cross-order RON preparation and session state."],
    invoices: ["Financial", "Invoices", "Request-level invoice status and outstanding balances."],
    payments: ["Financial", "Payments", "Paid-to-date and remaining balance visibility."],
    customers: ["Clients", "Customers", "Customer directory built from active service requests."],
    messages: ["Communications", "Messages", "Cross-order customer communication and delivery history."],
    templates: ["Communications", "Templates", "Master APS branded communication templates."],
    support: ["Support", "Support Tickets", "Current customer support workload."],
    settings: ["System", "Settings", "Portal configuration and integration status."],
    new: ["Operations", "New Order", "Create an order received by phone, email, or in person."],
  };
  const getCustomer = (request) => Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const displayMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function requestStatus(request) { return request.workflow_status || request.status || "under_review"; }
  function activeRequests() { return moduleState.requests.filter((request) => !request.archived_at); }
  function openRequestFromModule(id, tab = "overview") {
    showAdminView("requests");
    const button = $(`#requestList .request-row[data-id="${CSS.escape(id)}"]`);
    button?.click();
    window.setTimeout(() => activateTab(tab), 120);
  }
  function table(rows, columns) {
    if (!rows.length) return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No records yet</h3><p>This module will populate automatically from service requests.</p></div>';
    return `<div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr>${columns.map((column)=>`<th>${safe(column.label)}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map((row)=>`<tr>${columns.map((column)=>`<td>${column.render ? column.render(row) : safe(row[column.key])}</td>`).join("")}<td><button class="admin-v3-button admin-v3-button--outline module-open-request" data-request-id="${safe(row.id)}" type="button">Open</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderDashboard() {
    const rows = activeRequests();
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = rows.filter((r)=>{const d=r.appointment_date||r.preferred_date;if(!d)return false;return new Date(`${d}T12:00:00`)>=today;}).length;
    const outstanding = rows.reduce((sum,r)=>sum+Number(r.balance_due||0),0);
    const paid = rows.reduce((sum,r)=>sum+Number(r.paid_amount||0),0);
    const newCount = rows.filter((r)=>["under_review","new"].includes(requestStatus(r))).length;
    return `<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Active requests</span><strong>${rows.length}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Needs review</span><strong>${newCount}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Upcoming dates</span><strong>${upcoming}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Outstanding</span><strong>${displayMoney(outstanding)}</strong></article></div><div class="admin-v3-module-card"><h2>Financial snapshot</h2><p><strong>${displayMoney(paid)}</strong> paid to date across loaded requests · <strong>${displayMoney(outstanding)}</strong> remaining.</p></div>${table(rows.slice(0,10),[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Customer",render:r=>{const c=getCustomer(r)||{};return safe(`${c.first_name||""} ${c.last_name||""}`.trim()||"Client");}},{label:"Service",render:r=>safe(labelFromStatus(r.service_type))},{label:"Status",render:r=>safe(labelFromStatus(requestStatus(r)))}])}`;
  }
  function requestBlockers(request) {
    const blockers=[];
    if(["pending","re_review_required"].includes(request.document_state)) blockers.push([request.document_state==="re_review_required"?"Document re-review required":"Document pending","documents"]);
    if(request.participant_state && request.participant_state!=="complete") blockers.push(["Participant information incomplete","customer"]);
    if(Number(request.balance_due||0)>0) blockers.push(["Payment pending","payments"]);
    if(request.workflow_status==="quote_ready") blockers.push(["Quote approval pending","quote"]);
    if(request.appointment_state==="rescheduling_requested") blockers.push(["Appointment needs confirmation","fulfillment"]);
    return blockers;
  }
  function renderReviewQueue() {
    const items=activeRequests().flatMap(request=>requestBlockers(request).map(([title,tab])=>({request,title,tab})));
    if(!items.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No open review items</h3><p>APS has no loaded requests requiring administrator intervention.</p></div>';
    return `<div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Request</th><th>Customer</th><th>Action required</th><th></th></tr></thead><tbody>${items.map(item=>{const customer=getCustomer(item.request)||{};return `<tr><td>${safe(`APS-${item.request.id.slice(0,8).toUpperCase()}`)}</td><td>${safe(`${customer.first_name||""} ${customer.last_name||""}`.trim())}</td><td>${safe(item.title)}</td><td><button class="admin-v3-button admin-v3-button--outline module-open-request" data-request-id="${safe(item.request.id)}" data-tab="${safe(item.tab)}" type="button">Review</button></td></tr>`}).join("")}</tbody></table></div>`;
  }
  function renderMessages() {
    if(!moduleState.messages.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No messages found</h3><p>Sent and failed customer communications will appear here.</p></div>';
    return `<div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Sent</th><th>Recipient</th><th>Subject</th><th>State</th><th></th></tr></thead><tbody>${moduleState.messages.map(message=>`<tr><td>${safe(message.sent_at?new Date(message.sent_at).toLocaleString():"Draft")}</td><td>${safe(message.recipient)}</td><td>${safe(message.subject)}</td><td>${safe(labelFromStatus(message.delivery_state))}</td><td>${message.service_request_id?`<button class="admin-v3-button admin-v3-button--outline module-open-request" data-request-id="${safe(message.service_request_id)}" data-tab="messages" type="button">Open</button>`:""}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderTemplates() {
    if(!moduleState.templates.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No templates loaded</h3><p>Apply the workflow migration to register the complete APS template library.</p></div>';
    return `<div class="admin-v3-module-grid">${moduleState.templates.map(template=>`<article class="admin-v3-module-card"><p class="small-label">${safe(template.associated_status?labelFromStatus(template.associated_status):"General")}</p><h3>${safe(template.name)}</h3><p>${safe(template.description||"")}</p><p><strong>Required attachment:</strong> ${safe(template.required_attachment_type?labelFromStatus(template.required_attachment_type):"None")}</p></article>`).join("")}</div>`;
  }
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function dateFromKey(value) {
    const [year,month,day]=String(value||"").split("-").map(Number);
    return year&&month&&day ? new Date(year,month-1,day,12) : null;
  }
  function addDays(value, amount) {
    const date=dateFromKey(value); if(!date)return value;
    date.setDate(date.getDate()+amount); return dateKey(date);
  }
  function getRelated(request, key) {
    const value=request?.[key]; return Array.isArray(value) ? value[0] : value;
  }
  function appointmentDate(request) { return request.appointment_date||request.preferred_date||null; }
  function appointmentTime(request) { return request.appointment_date ? request.appointment_time : request.preferred_time_window; }
  function appointmentDesignation(request) { return request.appointment_date ? "Confirmed Appointment" : "Requested / Unconfirmed Time"; }
  function appointmentLocation(request) {
    if(request.appointment_location)return request.appointment_location;
    if(request.service_type==="ron")return request.appointment_platform||getRelated(request,"ron_requests")?.ron_platform||"Remote Online Notary";
    if(request.service_type==="mobile"){
      const detail=getRelated(request,"mobile_notary_requests")||{};
      return [detail.street_address,detail.unit,detail.city,detail.state,detail.zip].filter(Boolean).join(", ");
    }
    const detail=getRelated(request,"print_scan_requests")||{};
    return detail.delivery_address||labelFromStatus(detail.fulfillment_type||request.appointment_platform||"");
  }
  function parseTimePart(value, fallbackMeridiem="") {
    const match=String(value||"").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if(!match)return null;
    let hour=Number(match[1]); const minute=Number(match[2]||0); const meridiem=(match[3]||fallbackMeridiem).toLowerCase();
    if(meridiem==="pm"&&hour<12)hour+=12;
    if(meridiem==="am"&&hour===12)hour=0;
    if(hour>23||minute>59)return null;
    return {minutes:hour*60+minute,meridiem};
  }
  function appointmentTimeRange(value) {
    const parts=String(value||"").replace(/[–—]/g,"-").split("-").map(part=>part.trim()).filter(Boolean);
    const end=parts[1]?parseTimePart(parts[1]):null;
    const start=parseTimePart(parts[0],end?.meridiem||"");
    if(!start)return null;
    const duration=end&&end.minutes>start.minutes ? end.minutes-start.minutes : 60;
    return {start:start.minutes,end:start.minutes+duration,duration};
  }
  function calendarStatusMatches(request, filter) {
    if(filter==="all")return true;
    const status=requestStatus(request);
    if(filter==="active")return !["completed","cancelled"].includes(status);
    if(filter==="pending")return ["under_review","quote_ready","quote_sent","awaiting_approval","changes_requested","awaiting_payment","payment_pending","payment_received","final_balance_due","final_payment_received","quote_expired","appointment_needs_rescheduling"].includes(status);
    if(filter==="confirmed")return status==="appointment_confirmed"||request.appointment_state==="appointment_confirmed";
    if(filter==="completed")return status==="completed";
    if(filter==="cancelled")return status==="cancelled";
    return true;
  }
  function calendarAppointments({filtered=true}={}) {
    return moduleState.requests.filter(request=>appointmentDate(request)).filter(request=>!filtered||(moduleState.calendarService==="all"||request.service_type===moduleState.calendarService)&&calendarStatusMatches(request,moduleState.calendarStatus));
  }
  function calendarSort(rows) {
    return [...rows].sort((a,b)=>{
      const aTime=appointmentTimeRange(appointmentTime(a))?.start??Number.POSITIVE_INFINITY;
      const bTime=appointmentTimeRange(appointmentTime(b))?.start??Number.POSITIVE_INFINITY;
      return aTime-bTime||String(a.created_at||"").localeCompare(String(b.created_at||""));
    });
  }
  function serviceAbbreviation(service) { return service==="ron"?"RON":service==="mobile"?"Mobile":"Print"; }
  function calendarMonthName(date) { return date.toLocaleDateString(undefined,{month:"long",year:"numeric"}); }
  function basicDate(value) { return String(value||"").replaceAll("-",""); }
  function localDateTime(value, minutes) {
    const date=dateFromKey(value); if(!date)return "";
    date.setHours(0,minutes,0,0);
    return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}${String(date.getMinutes()).padStart(2,"0")}00`;
  }
  function calendarEvent(request) {
    const date=appointmentDate(request); const range=appointmentTimeRange(appointmentTime(request));
    const timezone=request.appointment_timezone||"America/Chicago";
    const reference=`APS-${String(request.id).slice(0,8).toUpperCase()}`;
    const service=serviceLabels[request.service_type]||labelFromStatus(request.service_type);
    const title=`APS ${service} · ${reference}`;
    const location=appointmentLocation(request)||"";
    return {date,range,timezone,reference,service,title,location,description:`${reference} — ${service}. Calendar export from the APS Operations Portal.`};
  }
  function googleCalendarUrl(request) {
    const event=calendarEvent(request); const params=new URLSearchParams({action:"TEMPLATE",text:event.title,details:event.description,ctz:event.timezone});
    if(event.location)params.set("location",event.location);
    params.set("dates",event.range?`${localDateTime(event.date,event.range.start)}/${localDateTime(event.date,event.range.end)}`:`${basicDate(event.date)}/${basicDate(addDays(event.date,1))}`);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
  function icsEscape(value) { return String(value||"").replaceAll("\\","\\\\").replaceAll(";","\\;").replaceAll(",","\\,").replace(/\r?\n/g,"\\n"); }
  function icsTimestamp(date=new Date()) { return date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z"); }
  function calendarIcs(request) {
    const event=calendarEvent(request); const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Aligned Print & Scan//APS Scheduling Center//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",`UID:${request.id}@alignedprintscan.com`,`DTSTAMP:${icsTimestamp()}`];
    if(event.range){lines.push(`DTSTART;TZID=${event.timezone}:${localDateTime(event.date,event.range.start)}`,`DTEND;TZID=${event.timezone}:${localDateTime(event.date,event.range.end)}`);}else{lines.push(`DTSTART;VALUE=DATE:${basicDate(event.date)}`,`DTEND;VALUE=DATE:${basicDate(addDays(event.date,1))}`);}
    lines.push(`SUMMARY:${icsEscape(event.title)}`);
    if(event.location)lines.push(`LOCATION:${icsEscape(event.location)}`);
    lines.push(`DESCRIPTION:${icsEscape(event.description)}`,"END:VEVENT","END:VCALENDAR","");
    return lines.join("\r\n");
  }
  function renderCalendarAgenda(rows) {
    const selected=moduleState.calendarSelectedDate;
    const selectedDate=dateFromKey(selected)||new Date();
    const title=selectedDate.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    const cards=calendarSort(rows.filter(request=>appointmentDate(request)===selected));
    const body=cards.length?cards.map(request=>{
      const customer=getCustomer(request)||{}; const name=`${customer.first_name||""} ${customer.last_name||""}`.trim()||"Client";
      const time=appointmentTime(request)||"Time not yet confirmed"; const reference=`APS-${String(request.id).slice(0,8).toUpperCase()}`;
      const location=appointmentLocation(request);
      return `<article class="admin-v3-agenda-card"><div class="admin-v3-agenda-card-head"><div><span class="admin-v3-service-label">${safe(serviceAbbreviation(request.service_type))}</span><span class="admin-v3-appointment-kind">${safe(appointmentDesignation(request))}</span></div><span class="admin-v3-status-badge">${safe(labelFromStatus(requestStatus(request)))}</span></div><h3>${safe(name)}</h3><p class="admin-v3-agenda-reference">${safe(reference)} · ${safe(serviceLabels[request.service_type])}</p><dl><div><dt>Time</dt><dd>${safe(time)}</dd></div>${location?`<div><dt>${request.service_type==="ron"?"Platform":"Location / fulfillment"}</dt><dd>${safe(location)}</dd></div>`:""}</dl><div class="admin-v3-agenda-actions"><button class="admin-v3-button admin-v3-button--navy module-open-request" data-request-id="${safe(request.id)}" data-tab="overview" type="button">Open Order</button><a class="admin-v3-button admin-v3-button--outline" href="${safe(googleCalendarUrl(request))}" target="_blank" rel="noopener noreferrer">Add to Google Calendar</a><button class="admin-v3-button admin-v3-button--outline calendar-download-ics" data-request-id="${safe(request.id)}" type="button">Download Calendar File</button></div></article>`;
    }).join(""):`<div class="admin-v3-calendar-empty"><h3>No appointments on this date</h3><p>Select another date or begin a new order for ${safe(title)}.</p></div>`;
    return `<aside class="admin-v3-calendar-agenda" tabindex="-1" aria-live="polite" aria-atomic="true"><header><div><span>Selected day</span><h2>${safe(title)}</h2><p>${cards.length} appointment${cards.length===1?"":"s"}</p></div><button class="admin-v3-button admin-v3-button--gold calendar-new-order" data-calendar-date="${safe(selected)}" type="button">New Order for This Date</button></header><div class="admin-v3-agenda-list">${body}</div></aside>`;
  }
  function renderCalendar() {
    if(!moduleState.calendarSelectedDate)moduleState.calendarSelectedDate=dateKey(new Date());
    if(moduleState.requestsState==="loading")return '<div class="admin-v3-module-card admin-v3-calendar-state" role="status"><span class="admin-v3-calendar-loader" aria-hidden="true"></span><h2>Loading Scheduling Center</h2><p>Retrieving authenticated appointment data…</p></div>';
    if(moduleState.requestsState==="error")return `<div class="admin-v3-module-card admin-v3-calendar-state" role="alert"><h2>Scheduling data could not be loaded</h2><p>${safe(moduleState.requestsError||"Try loading the calendar again.")}</p><button class="admin-v3-button admin-v3-button--navy calendar-retry" type="button">Retry</button></div>`;
    const rows=calendarAppointments(); const allRows=calendarAppointments({filtered:false}); const month=moduleState.calendarMonth;
    const monthStart=new Date(month.getFullYear(),month.getMonth(),1,12); const gridStart=new Date(monthStart); gridStart.setDate(1-monthStart.getDay());
    const monthRows=rows.filter(request=>{const date=dateFromKey(appointmentDate(request));return date&&date.getFullYear()===month.getFullYear()&&date.getMonth()===month.getMonth();});
    const allMonthRows=allRows.filter(request=>{const date=dateFromKey(appointmentDate(request));return date&&date.getFullYear()===month.getFullYear()&&date.getMonth()===month.getMonth();});
    const cells=Array.from({length:42},(_,index)=>{const date=new Date(gridStart);date.setDate(gridStart.getDate()+index);const key=dateKey(date);const appointments=rows.filter(request=>appointmentDate(request)===key);const today=key===dateKey(new Date());const selected=key===moduleState.calendarSelectedDate;const outside=date.getMonth()!==month.getMonth();const serviceTags=[...new Set(appointments.map(request=>request.service_type))].slice(0,3).map(service=>`<span>${safe(serviceAbbreviation(service))}</span>`).join("");const aria=`${date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}${today?", Today":""}, ${appointments.length} appointment${appointments.length===1?"":"s"}`;return `<button class="admin-v3-calendar-day${today?" is-today":""}${selected?" is-selected":""}${outside?" is-outside":""}" data-calendar-date="${key}" type="button" aria-label="${safe(aria)}" aria-pressed="${selected}"><span class="admin-v3-calendar-day-number">${date.getDate()}${today?'<small>Today</small>':""}</span>${appointments.length?`<strong>${appointments.length}</strong><span class="admin-v3-calendar-day-services">${serviceTags}</span>`:""}</button>`;}).join("");
    const monthMessage=!allMonthRows.length?"No appointments this month":!monthRows.length?"No appointments matching filters":"";
    return `<section class="admin-v3-scheduling-center"><div class="admin-v3-calendar-toolbar"><div class="admin-v3-calendar-navigation"><button class="admin-v3-button admin-v3-button--outline calendar-month-change" data-month-change="-1" type="button" aria-label="Previous Month">Previous Month</button><button class="admin-v3-button admin-v3-button--outline calendar-today" type="button">Today</button><button class="admin-v3-button admin-v3-button--outline calendar-month-change" data-month-change="1" type="button" aria-label="Next Month">Next Month</button></div><div class="admin-v3-calendar-filters"><label>Service<select id="calendarServiceFilter"><option value="all">All Services</option><option value="ron">Remote Online Notary</option><option value="mobile">Mobile Notary</option><option value="print">Print &amp; Scan</option></select></label><label>Status<select id="calendarStatusFilter"><option value="all">All Statuses</option><option value="active">Active</option><option value="pending">Pending / Awaiting Action</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div></div><div class="admin-v3-scheduling-layout"><div class="admin-v3-month-calendar"><header><span>Month calendar</span><h2 id="calendarMonthHeading" tabindex="-1">${safe(calendarMonthName(month))}</h2>${monthMessage?`<p class="admin-v3-calendar-notice">${safe(monthMessage)}</p>`:""}</header><div class="admin-v3-calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="admin-v3-calendar-grid" role="grid" aria-labelledby="calendarMonthHeading">${cells}</div></div>${renderCalendarAgenda(rows)}</div></section>`;
  }
  const wizardSteps = ["Customer", "Service", "Details", "Scheduling", "Pricing", "Review"];
  const serviceLabels = { ron: "Remote Online Notary", mobile: "Mobile Notary", print: "Print & Scan" };
  function wizardCustomers() {
    const customers = new Map();
    moduleState.requests.forEach((request) => {
      const customer = getCustomer(request);
      if (customer?.id) customers.set(customer.id, customer);
    });
    return [...customers.values()].sort((a, b) => `${a.last_name || ""}${a.first_name || ""}`.localeCompare(`${b.last_name || ""}${b.first_name || ""}`));
  }
  function field(label, name, input, options = "") {
    return `<label class="${options}"><span>${label}</span>${input}</label>`;
  }
  function renderNewRequest() {
    const customers = wizardCustomers();
    const customerOptions = customers.map((customer) => `<option value="${safe(customer.id)}">${safe(`${customer.first_name || ""} ${customer.last_name || ""}`.trim())} · ${safe(customer.email || customer.phone || "No contact details")}</option>`).join("");
    const progress = wizardSteps.map((step, index) => `<button type="button" class="admin-v3-wizard-progress-step${index === 0 ? " is-current" : ""}" data-wizard-jump="${index}" aria-current="${index === 0 ? "step" : "false"}" ${index ? "disabled" : ""}><span>${index + 1}</span><strong>${step}</strong></button>`).join("");
    return `<form id="adminCreateRequestForm" class="admin-v3-order-wizard" novalidate>
      <nav class="admin-v3-wizard-progress" aria-label="New Order progress">${progress}</nav>
      <div class="admin-v3-module-card admin-v3-wizard-card">
        <section class="admin-v3-wizard-step is-current" data-wizard-step="0" aria-labelledby="wizardCustomerHeading">
          <div class="admin-v3-wizard-heading"><span>Step 1 of 6</span><h2 id="wizardCustomerHeading">Customer</h2><p>Begin by entering the customer's contact information.</p></div>
          ${customers.length ? field("Existing customer (optional)", "existing_customer_id", `<select name="existing_customer_id"><option value="">Create a new customer</option>${customerOptions}</select>`, "wide") : ""}
          <div class="admin-v3-form-grid">
            ${field("First name", "first_name", '<input name="first_name" required autocomplete="given-name">')}
            ${field("Last name", "last_name", '<input name="last_name" required autocomplete="family-name">')}
            ${field("Email", "email", '<input name="email" type="email" required autocomplete="email">')}
            ${field("Phone", "phone", '<input name="phone" type="tel" autocomplete="tel">')}
            ${field("Preferred contact method", "preferred_contact", '<select name="preferred_contact"><option value="email">Email</option><option value="phone">Phone</option><option value="text">Text</option></select>', "wide")}
          </div>
        </section>
        <section class="admin-v3-wizard-step" data-wizard-step="1" aria-labelledby="wizardServiceHeading" hidden>
          <div class="admin-v3-wizard-heading"><span>Step 2 of 6</span><h2 id="wizardServiceHeading">Service</h2><p>Select the service APS will provide for this order.</p></div>
          <fieldset class="admin-v3-service-choices"><legend class="sr-only">Service type</legend>
            <label><input type="radio" name="service_type" value="ron" required checked><span><strong>Remote Online Notary</strong><small>Secure online notarization.</small></span></label>
            <label><input type="radio" name="service_type" value="mobile" required><span><strong>Mobile Notary</strong><small>On-site notarial service.</small></span></label>
            <label><input type="radio" name="service_type" value="print" required><span><strong>Print &amp; Scan</strong><small>Printing, scanning, copies, or delivery.</small></span></label>
          </fieldset>
        </section>
        <section class="admin-v3-wizard-step" data-wizard-step="2" aria-labelledby="wizardDetailsHeading" hidden>
          <div class="admin-v3-wizard-heading"><span>Step 3 of 6</span><h2 id="wizardDetailsHeading">Service Details</h2><p>Collect only the intake information needed for the selected service.</p></div>
          <div class="admin-v3-service-fields" data-service-fields="ron"><div class="admin-v3-form-grid">
            ${field("Document type", "document_type", '<input name="document_type" placeholder="Example: Power of attorney">')}
            ${field("Signer count", "ron_signer_count", '<input name="ron_signer_count" type="number" min="1" value="1" required>')}
            ${field("Notarial acts", "ron_notarization_count", '<input name="ron_notarization_count" type="number" min="1" value="1" required>')}
            ${field("Are witnesses needed?", "ron_witness_need", '<select name="ron_witness_need"><option value="no">No</option><option value="yes">Yes</option><option value="not_sure">Not sure</option></select>')}
            ${field("Witness count", "ron_witness_count", '<select name="ron_witness_count"><option value="0">None</option><option value="1">1</option><option value="2">2</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Witness provider", "ron_witness_provider", '<select name="ron_witness_provider"><option value="client">Customer</option><option value="aligned">APS</option><option value="shared">Shared</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Customer-provided witnesses", "ron_client_witness_count", '<input name="ron_client_witness_count" type="number" min="0" value="0">', "admin-v3-witness-field")}
            ${field("Technology ready", "ron_tech_ready", '<input name="ron_tech_ready" type="checkbox" class="admin-v3-check">')}
            ${field("Valid ID confirmed", "ron_valid_id", '<input name="ron_valid_id" type="checkbox" class="admin-v3-check">')}
            ${field("Recording consent confirmed", "ron_recording_consent", '<input name="ron_recording_consent" type="checkbox" class="admin-v3-check">')}
          </div></div>
          <div class="admin-v3-service-fields" data-service-fields="mobile" hidden><div class="admin-v3-form-grid">
            ${field("Street address", "mobile_street", '<input name="mobile_street" autocomplete="street-address" required>')}
            ${field("Unit / suite", "mobile_unit", '<input name="mobile_unit">')}
            ${field("City", "mobile_city", '<input name="mobile_city" required>')}
            ${field("State", "mobile_state", '<input name="mobile_state" value="TX" maxlength="2" required>')}
            ${field("ZIP code", "mobile_zip", '<input name="mobile_zip" inputmode="numeric" required>')}
            ${field("Estimated travel miles", "mobile_travel_miles", '<input name="mobile_travel_miles" type="number" min="0" step="0.1" placeholder="Optional">')}
            ${field("Signer count", "mobile_signer_count", '<input name="mobile_signer_count" type="number" min="1" value="1" required>')}
            ${field("Notarial acts", "mobile_notarization_count", '<input name="mobile_notarization_count" type="number" min="1" value="1" required>')}
            ${field("Are witnesses needed?", "mobile_witness_need", '<select name="mobile_witness_need"><option value="no">No</option><option value="yes">Yes</option><option value="not_sure">Not sure</option></select>')}
            ${field("Witness count", "mobile_witness_count", '<select name="mobile_witness_count"><option value="0">None</option><option value="1">1</option><option value="2">2</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Witness provider", "mobile_witness_provider", '<select name="mobile_witness_provider"><option value="client">Customer</option><option value="aligned">APS</option><option value="shared">Shared</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Customer-provided witnesses", "mobile_client_witness_count", '<input name="mobile_client_witness_count" type="number" min="0" value="0">', "admin-v3-witness-field")}
          </div></div>
          <div class="admin-v3-service-fields" data-service-fields="print" hidden><div class="admin-v3-form-grid">
            ${field("Print / copy pages", "print_pages", '<input name="print_pages" type="number" min="0" value="0">')}
            ${field("Copies", "print_copies", '<input name="print_copies" type="number" min="1" value="1">')}
            ${field("Color", "print_color", '<select name="print_color"><option value="bw">Black &amp; white</option><option value="color">Color</option></select>')}
            ${field("Sides", "print_sides", '<select name="print_sides"><option value="single">Single-sided</option><option value="double">Double-sided</option></select>')}
            ${field("Paper size", "print_paper_size", '<select name="print_paper_size"><option value="letter">Letter</option><option value="legal">Legal</option></select>')}
            ${field("Paper type", "print_paper_type", '<select name="print_paper_type"><option value="standard">Standard</option><option value="resume">Résumé</option><option value="cardstock">Cardstock</option><option value="color-paper">Color paper</option></select>')}
            ${field("Pages to scan", "print_scan_pages", '<input name="print_scan_pages" type="number" min="0" value="0">')}
            ${field("Delivery address", "print_delivery_address", '<textarea name="print_delivery_address" rows="3" placeholder="Required for courier or mobile service"></textarea>', "wide")}
          </div></div>
        </section>
        <section class="admin-v3-wizard-step" data-wizard-step="3" aria-labelledby="wizardSchedulingHeading" hidden>
          <div class="admin-v3-wizard-heading"><span>Step 4 of 6</span><h2 id="wizardSchedulingHeading">Scheduling &amp; Fulfillment</h2><p>Record the requested timing and any confirmed fulfillment details.</p></div>
          <div class="admin-v3-form-grid">
            ${field("Requested date", "preferred_date", '<input name="preferred_date" type="date">')}
            ${field("Requested time", "preferred_time_window", '<input name="preferred_time_window" placeholder="Example: 3–4 PM">')}
            ${field("Confirmed appointment date", "appointment_date", '<input name="appointment_date" type="date">', "admin-v3-scheduled-field")}
            ${field("Confirmed appointment time", "appointment_time", '<input name="appointment_time" type="time">', "admin-v3-scheduled-field")}
            ${field("Timezone", "appointment_timezone", '<select name="appointment_timezone"><option value="America/Chicago">Central Time</option><option value="America/New_York">Eastern Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option></select>', "admin-v3-scheduled-field")}
            ${field("RON platform", "ron_platform", '<input name="ron_platform" placeholder="Example: Proof">', "admin-v3-ron-schedule")}
            ${field("Session link", "appointment_link", '<input name="appointment_link" type="url" placeholder="https://">', "admin-v3-ron-schedule")}
            ${field("Appointment location", "appointment_location", '<input name="appointment_location" placeholder="Business name or meeting point">', "admin-v3-mobile-schedule")}
            ${field("Fulfillment method", "print_fulfillment", '<select name="print_fulfillment"><option value="pickup">Pickup</option><option value="courier">Courier delivery</option><option value="mobile-service">Mobile document service</option><option value="mobile-notary">Mobile notary add-on</option></select>', "admin-v3-print-schedule")}
            ${field("Appointment / fulfillment instructions", "appointment_instructions", '<textarea name="appointment_instructions" rows="4" placeholder="Access details, timing, or fulfillment instructions."></textarea>', "wide")}
          </div>
        </section>
        <section class="admin-v3-wizard-step" data-wizard-step="4" aria-labelledby="wizardPricingHeading" hidden>
          <div class="admin-v3-wizard-heading"><span>Step 5 of 6</span><h2 id="wizardPricingHeading">Pricing &amp; Documents</h2><p>Review the APS estimate and attach any documents supplied with the order.</p></div>
          <div class="admin-v3-wizard-pricing-grid">
            <article class="admin-v3-quote-summary"><span>Estimated quote</span><strong id="adminWizardEstimate">$0.00</strong><div id="adminWizardLineItems"></div><small>This estimate uses the existing APS pricing configuration. Invoices are created separately in Payments.</small></article>
            <div class="admin-v3-document-control">${field("Order documents (optional)", "order_documents", '<input name="order_documents" type="file" multiple>')}<p>Documents will be stored with this request when the order is created.</p></div>
          </div>
          ${field("Internal order notes", "notes", '<textarea name="notes" rows="5" placeholder="How the order was received, special instructions, and follow-up needed."></textarea>', "admin-v3-wizard-notes")}
        </section>
        <section class="admin-v3-wizard-step" data-wizard-step="5" aria-labelledby="wizardReviewHeading" hidden>
          <div class="admin-v3-wizard-heading"><span>Step 6 of 6</span><h2 id="wizardReviewHeading">Review &amp; Create</h2><p>Confirm the complete order before creating it.</p></div>
          <div id="adminWizardReview" class="admin-v3-review-grid"></div>
          <label class="admin-v3-confirmation"><input name="confirm_order" type="checkbox" required><span>I reviewed the order details and confirm they are ready to create.</span></label>
        </section>
        <div class="admin-v3-wizard-message" id="adminWizardValidation" role="alert"></div>
        <div class="admin-v3-wizard-actions"><button class="admin-v3-button admin-v3-button--outline" data-cancel-new type="button">Cancel</button><div><button class="admin-v3-button admin-v3-button--outline" id="adminWizardPrevious" type="button" hidden>Previous</button><button class="admin-v3-button admin-v3-button--navy" id="adminWizardNext" type="button">Next</button><button class="admin-v3-button admin-v3-button--gold" id="adminWizardCreate" type="submit" hidden>Create Order</button></div></div>
        <p id="adminCreateRequestStatus" aria-live="polite"></p>
      </div>
    </form>`;
  }
  function renderModule(view) {
    const rows=activeRequests();
    if(view==="dashboard") return renderDashboard();
    if(view==="calendar") return renderCalendar();
    if(view==="review") return renderReviewQueue();
    if(view==="sessions") return table(rows.filter(r=>r.service_type==="ron"),[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Customer",render:r=>{const c=getCustomer(r)||{};return safe(`${c.first_name||""} ${c.last_name||""}`.trim())}},{label:"State",render:r=>safe(labelFromStatus(r.fulfillment_state||r.appointment_state||"needs_preparation"))}]);
    if(view==="new") return renderNewRequest();
    if(view==="invoices") return table(rows,[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Invoice status",render:r=>safe(labelFromStatus(r.invoice_status||r.payment_status||"not_created"))},{label:"Quoted",render:r=>displayMoney(r.quote_amount||r.estimated_total)},{label:"Balance",render:r=>displayMoney(r.balance_due)}]);
    if(view==="payments") return table(rows,[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Paid",render:r=>displayMoney(r.paid_amount)},{label:"Balance",render:r=>displayMoney(r.balance_due)},{label:"State",render:r=>safe(labelFromStatus(r.payment_state||r.payment_status||"not_started"))}]);
    if(view==="customers") return table(rows,[{label:"Customer",render:r=>{const c=getCustomer(r)||{};return safe(`${c.first_name||""} ${c.last_name||""}`.trim()||"Client");}},{label:"Email",render:r=>safe((getCustomer(r)||{}).email||"")},{label:"Phone",render:r=>safe((getCustomer(r)||{}).phone||"")},{label:"Service",render:r=>safe(labelFromStatus(r.service_type))}]);
    if(view==="messages") return renderMessages();
    if(view==="templates") return renderTemplates();
    if(view==="support") {const tickets=moduleState.supportTickets;return `<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Open tickets</span><strong>${tickets.length}</strong></article></div><div class="admin-v3-module-card"><h2>Support workspace</h2><p>Open the request workspace to use the full support controls already connected to Supabase.</p><button class="admin-v3-button admin-v3-button--navy" id="openLegacySupport" type="button">Open support controls</button></div>`;}
    if(view==="settings") return '<div class="admin-v3-module-grid"><article class="admin-v3-module-card"><h3>Supabase</h3><p>Request storage, authentication, files, and realtime updates are connected through the existing configuration.</p></article><article class="admin-v3-module-card"><h3>Stripe</h3><p>Invoice checkout and webhook logic remain unchanged.</p></article><article class="admin-v3-module-card"><h3>Resend</h3><p>Transactional email functions remain unchanged.</p></article><article class="admin-v3-module-card"><h3>Proof infrastructure</h3><p>Owner-supervised connection and webhook setup only. No transaction controls are available here.</p><div class="admin-v3-agenda-actions"><button class="admin-v3-button admin-v3-button--navy" id="verifyProofConnection" type="button">Verify Proof Connection</button><button class="admin-v3-button admin-v3-button--outline" id="registerProofWebhook" type="button">Register Proof Webhook</button></div><div id="proofInfrastructureStatus" role="status" aria-live="polite"><p>No infrastructure check has run in this session.</p></div></article></div>';
    return renderDashboard();
  }
  function bindModuleActions() {
    $$(".module-open-request", moduleContent).forEach(button=>button.addEventListener("click",()=>openRequestFromModule(button.dataset.requestId,button.dataset.tab||"overview")));
    $("[data-cancel-new]", moduleContent)?.addEventListener("click",()=>{const returnToCalendar=Boolean(moduleState.newOrderCalendarDate);moduleState.newOrderCalendarDate=null;showAdminView(returnToCalendar?"calendar":"requests");});
    const newOrderForm = $("#adminCreateRequestForm", moduleContent);
    if (newOrderForm) bindNewOrderWizard(newOrderForm);
    bindCalendarActions();
    $("#openLegacySupport", moduleContent)?.addEventListener("click",()=>showAdminView("requests"));
    $("#verifyProofConnection", moduleContent)?.addEventListener("click",()=>runProofInfrastructureCommand("organization_check"));
    $("#registerProofWebhook", moduleContent)?.addEventListener("click",()=>runProofInfrastructureCommand("register_webhook"));
  }

  async function runProofInfrastructureCommand(command) {
    const status = $("#proofInfrastructureStatus", moduleContent);
    const buttons = $$("#verifyProofConnection, #registerProofWebhook", moduleContent);
    if (!status || !adminClient) return;
    buttons.forEach((button) => button.disabled = true);
    status.innerHTML = "<p>Working…</p>";
    try {
      const { data, error } = await adminClient.functions.invoke("proof-admin-transaction", { body: { command } });
      if (error) throw error;
      const timestamp = new Date().toLocaleString();
      if (command === "organization_check") {
        const organization = data?.organization || {};
        status.innerHTML = `<p><strong>Connection verified</strong></p><p>${safe(organization.name || "Proof organization")} · ${safe(organization.id || "Identifier unavailable")}</p><p>Production · ${safe(timestamp)}</p>`;
      } else {
        const subscription = data?.subscription || {};
        const events = Array.isArray(subscription.subscriptions) ? subscription.subscriptions : [];
        status.innerHTML = `<p><strong>Webhook ${subscription.enabled ? "active" : "not active"}</strong></p><p>${safe(subscription.id || "Identifier unavailable")} · ${events.length} events</p><p>${events.map(safe).join(", ")}</p><p>${data?.reused ? "Existing subscription reused" : "New subscription registered"} · ${safe(timestamp)}</p>`;
      }
    } catch (error) {
      status.innerHTML = `<p><strong>Proof infrastructure check failed</strong></p><p>${safe(error?.message || "The operation could not be completed.")}</p><p>${safe(new Date().toLocaleString())}</p>`;
    } finally {
      buttons.forEach((button) => button.disabled = false);
    }
  }
  function refreshCalendarView() {
    if(moduleState.activeView!=="calendar")return;
    moduleContent.innerHTML=renderCalendar(); bindModuleActions();
  }
  function openNewOrderForDate(value) {
    moduleState.newOrderCalendarDate=value;
    showAdminView("new");
    const input=$("#adminCreateRequestForm [name='preferred_date']",moduleContent);
    if(input)input.value=value;
  }
  function downloadCalendarFile(request) {
    const reference=`APS-${String(request.id).slice(0,8).toUpperCase()}`;
    const blob=new Blob([calendarIcs(request)],{type:"text/calendar;charset=utf-8"});
    const url=URL.createObjectURL(blob); const link=document.createElement("a");
    link.href=url; link.download=`${reference}.ics`; document.body.append(link); link.click(); link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function bindCalendarActions() {
    if(moduleState.activeView!=="calendar")return;
    const serviceFilter=$("#calendarServiceFilter",moduleContent); if(serviceFilter){serviceFilter.value=moduleState.calendarService;serviceFilter.addEventListener("change",()=>{moduleState.calendarService=serviceFilter.value;refreshCalendarView();});}
    const statusFilter=$("#calendarStatusFilter",moduleContent); if(statusFilter){statusFilter.value=moduleState.calendarStatus;statusFilter.addEventListener("change",()=>{moduleState.calendarStatus=statusFilter.value;refreshCalendarView();});}
    $$(".calendar-month-change",moduleContent).forEach(button=>button.addEventListener("click",()=>{const direction=Number(button.dataset.monthChange)||0;const selected=dateFromKey(moduleState.calendarSelectedDate)||moduleState.calendarMonth;const target=new Date(moduleState.calendarMonth.getFullYear(),moduleState.calendarMonth.getMonth()+direction,1,12);const lastDay=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();target.setDate(Math.min(selected.getDate(),lastDay));moduleState.calendarMonth=new Date(target.getFullYear(),target.getMonth(),1,12);moduleState.calendarSelectedDate=dateKey(target);refreshCalendarView();$("#calendarMonthHeading",moduleContent)?.focus?.();}));
    $(".calendar-today",moduleContent)?.addEventListener("click",()=>{const today=new Date();moduleState.calendarMonth=new Date(today.getFullYear(),today.getMonth(),1,12);moduleState.calendarSelectedDate=dateKey(today);refreshCalendarView();});
    $$(".admin-v3-calendar-day",moduleContent).forEach(button=>button.addEventListener("click",()=>{moduleState.calendarSelectedDate=button.dataset.calendarDate;const selected=dateFromKey(moduleState.calendarSelectedDate);if(selected&&(selected.getMonth()!==moduleState.calendarMonth.getMonth()||selected.getFullYear()!==moduleState.calendarMonth.getFullYear()))moduleState.calendarMonth=new Date(selected.getFullYear(),selected.getMonth(),1,12);refreshCalendarView();$(".admin-v3-calendar-agenda",moduleContent)?.focus?.();}));
    $(".calendar-new-order",moduleContent)?.addEventListener("click",button=>openNewOrderForDate(button.currentTarget.dataset.calendarDate));
    $$(".calendar-download-ics",moduleContent).forEach(button=>button.addEventListener("click",()=>{const request=moduleState.requests.find(item=>item.id===button.dataset.requestId);if(request)downloadCalendarFile(request);}));
    $(".calendar-retry",moduleContent)?.addEventListener("click",()=>window.loadRequests?.());
  }
  function wizardValue(form, name) { return form.elements[name]?.value?.trim?.() || ""; }
  function wizardNumber(form, name, fallback = 0) { const value = Number(form.elements[name]?.value); return Number.isFinite(value) ? value : fallback; }
  function wizardChecked(form, name) { return Boolean(form.elements[name]?.checked); }
  function wizardService(form) { return form.elements.service_type?.value || "ron"; }
  function wizardMoney(value) { return `$${Number(value || 0).toFixed(2)}`; }
  function wizardPrintCost(form, prefix = "print") {
    const pages = wizardNumber(form, `${prefix}_pages`);
    const copies = prefix === "print" ? Math.max(1, wizardNumber(form, "print_copies", 1)) : 1;
    const color = wizardValue(form, `${prefix}_color`) || "bw";
    const sides = wizardValue(form, `${prefix}_sides`) || "single";
    const paperSize = wizardValue(form, `${prefix}_paper_size`) || "letter";
    const paperType = wizardValue(form, `${prefix}_paper_type`) || "standard";
    let rate = color === "color" ? (sides === "double" ? 0.6 : 0.5) : (sides === "double" ? 0.35 : 0.25);
    if (paperSize === "legal") rate += 0.1;
    rate += ({ resume: 0.25, cardstock: 0.4, "color-paper": 0.15 })[paperType] || 0;
    return pages * copies * rate;
  }
  function wizardWitnessAllocation(form, service) {
    const need = wizardValue(form, `${service}_witness_need`);
    const provider = wizardValue(form, `${service}_witness_provider`);
    const rawCount = wizardValue(form, `${service}_witness_count`);
    const total = rawCount === "not_sure" ? 0 : Number(rawCount) || 0;
    if (need !== "yes" || total <= 0) return { total: 0, customer: 0, aps: 0 };
    if (provider === "aligned") return { total, customer: 0, aps: total };
    if (provider === "client") return { total, customer: total, aps: 0 };
    if (provider === "shared") {
      const customer = Math.min(total, Math.max(0, wizardNumber(form, `${service}_client_witness_count`)));
      return { total, customer, aps: total - customer };
    }
    return { total, customer: 0, aps: 0 };
  }
  function wizardEstimate(form) {
    const pricing = window.ALIGNED_PRICING || {};
    const service = wizardService(form);
    const items = [];
    const add = (label, amount) => { if (Number(amount) > 0) items.push([label, Number(amount)]); };
    if (service === "ron") {
      const acts = Math.max(1, wizardNumber(form, "ron_notarization_count", 1));
      add("Online notarization service fee", pricing.ron?.onlineServiceFee || 25);
      add(`${acts} notarial act${acts === 1 ? "" : "s"}`, (pricing.ron?.notarialAct || 10) * acts);
      add("APS-provided witness coordination", (pricing.ron?.providedWitness || 25) * wizardWitnessAllocation(form, "ron").aps);
    } else if (service === "mobile") {
      const acts = Math.max(1, wizardNumber(form, "mobile_notarization_count", 1));
      add("Mobile appointment base (0–15 miles)", pricing.mobile?.appointmentBase || 50);
      add("Notarial act estimate", (pricing.mobile?.notarialAct || 10) * acts);
      add("APS-provided witness coordination", (pricing.mobile?.providedWitness || 50) * wizardWitnessAllocation(form, "mobile").aps);
    } else {
      add("Printing / copies estimate", wizardPrintCost(form));
      add("Scan to PDF estimate", wizardNumber(form, "print_scan_pages") * (pricing.documentServices?.scanPerPage || 1));
      const fulfillment = wizardValue(form, "print_fulfillment") || "pickup";
      if (fulfillment === "courier") add("Courier delivery estimate", pricing.documentServices?.courierBase || 20);
      if (fulfillment === "mobile-service") add("Mobile document service base", pricing.documentServices?.mobileDocumentBase || 20);
      if (fulfillment === "mobile-notary") {
        add("Mobile appointment base add-on (0–15 miles)", pricing.mobile?.appointmentBase || 50);
        add("Notarial act / signature add-on", pricing.mobile?.notarialAct || 10);
      }
    }
    return { items, total: items.reduce((sum, item) => sum + item[1], 0) };
  }
  function updateWizardEstimate(form) {
    const estimate = wizardEstimate(form);
    $("#adminWizardEstimate", form).textContent = wizardMoney(estimate.total);
    $("#adminWizardLineItems", form).innerHTML = estimate.items.length ? estimate.items.map(([label, amount]) => `<p><span>${safe(label)}</span><strong>${wizardMoney(amount)}</strong></p>`).join("") : "<p>Complete the service details to view an estimate.</p>";
  }
  function setWizardService(form) {
    const service = wizardService(form);
    $$('[data-service-fields]', form).forEach((section) => {
      const active = section.dataset.serviceFields === service;
      section.hidden = !active;
      $$('input, select, textarea', section).forEach((control) => { control.disabled = !active; });
    });
    $$(".admin-v3-ron-schedule", form).forEach((field) => { field.hidden = service !== "ron"; $$('input, select, textarea', field).forEach((control) => { control.disabled = service !== "ron"; }); });
    $$(".admin-v3-mobile-schedule", form).forEach((field) => { field.hidden = service !== "mobile"; $$('input, select, textarea', field).forEach((control) => { control.disabled = service !== "mobile"; }); });
    $$(".admin-v3-print-schedule", form).forEach((field) => { field.hidden = service !== "print"; $$('input, select, textarea', field).forEach((control) => { control.disabled = service !== "print"; }); });
    updateWizardEstimate(form);
  }
  function setWizardWitnessFields(form) {
    ["ron", "mobile"].forEach((service) => {
      const show = wizardValue(form, `${service}_witness_need`) !== "no";
      $$(`.admin-v3-service-fields[data-service-fields="${service}"] .admin-v3-witness-field`, form).forEach((field) => { field.hidden = !show; });
    });
  }
  function reviewItem(label, value) { return `<div><dt>${safe(label)}</dt><dd>${safe(value || "Not provided")}</dd></div>`; }
  function renderWizardReview(form) {
    const service = wizardService(form);
    const files = Array.from(form.elements.order_documents?.files || []);
    const estimate = wizardEstimate(form);
    const customer = `${wizardValue(form, "first_name")} ${wizardValue(form, "last_name")}`.trim();
    let details = "";
    if (service === "ron") details = `${wizardValue(form, "document_type") || "Document type not provided"}; ${wizardNumber(form, "ron_signer_count", 1)} signer(s); ${wizardNumber(form, "ron_notarization_count", 1)} notarial act(s)`;
    if (service === "mobile") details = `${wizardValue(form, "mobile_street")}, ${wizardValue(form, "mobile_city")}, ${wizardValue(form, "mobile_state")} ${wizardValue(form, "mobile_zip")}; ${wizardNumber(form, "mobile_notarization_count", 1)} notarial act(s)`;
    if (service === "print") details = `${wizardNumber(form, "print_pages")} page(s) × ${wizardNumber(form, "print_copies", 1)} copy/copies; ${wizardNumber(form, "print_scan_pages")} scan page(s)`;
    const appointment = [wizardValue(form, "appointment_date") || wizardValue(form, "preferred_date"), wizardValue(form, "appointment_time") || wizardValue(form, "preferred_time_window")].filter(Boolean).join(" · ") || "Not scheduled";
    $("#adminWizardReview", form).innerHTML = `
      <article><h3>Customer</h3><dl>${reviewItem("Name", customer)}${reviewItem("Email", wizardValue(form, "email"))}${reviewItem("Phone", wizardValue(form, "phone"))}${reviewItem("Preferred contact", labelFromStatus(wizardValue(form, "preferred_contact")))}</dl></article>
      <article><h3>Service</h3><dl>${reviewItem("Service", serviceLabels[service])}${reviewItem("Details", details)}</dl></article>
      <article><h3>Appointment</h3><dl>${reviewItem("Requested / confirmed", appointment)}${reviewItem("Platform / location", service === "ron" ? wizardValue(form, "ron_platform") : service === "mobile" ? wizardValue(form, "appointment_location") : labelFromStatus(wizardValue(form, "print_fulfillment")))}</dl></article>
      <article><h3>Pricing</h3><dl>${reviewItem("Estimated quote", wizardMoney(estimate.total))}${reviewItem("Invoice", "Created separately in Payments")}</dl></article>
      <article><h3>Documents</h3><dl>${reviewItem("Files", files.length ? files.map((file) => file.name).join(", ") : "No documents selected")}</dl></article>
      <article><h3>Notes</h3><p>${safe(wizardValue(form, "notes") || "No internal notes added.")}</p></article>`;
  }
  function showWizardStep(form, nextStep, advancing = false) {
    const step = Math.max(0, Math.min(wizardSteps.length - 1, nextStep));
    moduleState.newOrderStep = step;
    if (advancing) moduleState.newOrderMaxStep = Math.max(moduleState.newOrderMaxStep, step);
    $$("[data-wizard-step]", form).forEach((panel) => { const current = Number(panel.dataset.wizardStep) === step; panel.hidden = !current; panel.classList.toggle("is-current", current); });
    $$("[data-wizard-jump]", form).forEach((button) => {
      const index = Number(button.dataset.wizardJump);
      button.disabled = index > moduleState.newOrderMaxStep;
      button.classList.toggle("is-current", index === step);
      button.classList.toggle("is-complete", index < step);
      if (index === step) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
    $("#adminWizardPrevious", form).hidden = step === 0;
    $("#adminWizardNext", form).hidden = step === wizardSteps.length - 1;
    $("#adminWizardCreate", form).hidden = step !== wizardSteps.length - 1;
    $("#adminWizardValidation", form).textContent = "";
    if (step === 4) updateWizardEstimate(form);
    if (step === 5) renderWizardReview(form);
    form.querySelector(".admin-v3-wizard-step.is-current h2")?.focus?.({ preventScroll: true });
  }
  function validateWizardStep(form) {
    const panel = $(".admin-v3-wizard-step.is-current", form);
    const controls = $$("input, select, textarea", panel).filter((control) => !control.disabled);
    const invalid = controls.find((control) => !control.checkValidity());
    if (!invalid) return true;
    $("#adminWizardValidation", form).textContent = invalid.validationMessage || "Complete the required fields before continuing.";
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  function selectExistingWizardCustomer(form) {
    const id = wizardValue(form, "existing_customer_id");
    if (!id) return;
    const customer = wizardCustomers().find((item) => item.id === id);
    if (!customer) return;
    form.elements.first_name.value = customer.first_name || "";
    form.elements.last_name.value = customer.last_name || "";
    form.elements.email.value = customer.email || "";
    form.elements.phone.value = customer.phone || "";
    form.elements.preferred_contact.value = customer.preferred_contact || "email";
  }
  function bindNewOrderWizard(form) {
    moduleState.newOrderStep = 0;
    moduleState.newOrderMaxStep = 0;
    setWizardService(form);
    setWizardWitnessFields(form);
    form.addEventListener("submit", createAdminRequest);
    form.elements.existing_customer_id?.addEventListener("change", () => selectExistingWizardCustomer(form));
    form.elements.service_type.forEach((control) => control.addEventListener("change", () => { setWizardService(form); setWizardWitnessFields(form); }));
    form.addEventListener("input", () => updateWizardEstimate(form));
    form.addEventListener("change", (event) => { if (event.target.name?.endsWith("_witness_need")) setWizardWitnessFields(form); updateWizardEstimate(form); });
    $("#adminWizardNext", form).addEventListener("click", () => { if (validateWizardStep(form)) showWizardStep(form, moduleState.newOrderStep + 1, true); });
    $("#adminWizardPrevious", form).addEventListener("click", () => showWizardStep(form, moduleState.newOrderStep - 1));
    $$('[data-wizard-jump]', form).forEach((button) => button.addEventListener("click", () => { const target = Number(button.dataset.wizardJump); if (target <= moduleState.newOrderMaxStep) showWizardStep(form, target); }));
  }
  async function uploadNewOrderDocuments(requestId, files) {
    for (const file of files) {
      const fileName = String(file.name || "document").replace(/[^a-z0-9._-]+/gi, "-");
      const path = `${requestId}/admin/${crypto.randomUUID()}-${fileName}`;
      const { error: uploadError } = await adminClient.storage.from("service-request-files").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;
      const { error: recordError } = await adminClient.from("request_files").insert({ service_request_id: requestId, file_name: file.name, file_path: path, file_type: file.type, file_size: file.size, uploaded_by: "admin", document_category: "admin-additional", is_active: true });
      if (recordError) throw recordError;
    }
    if (files.length) await adminClient.from("request_timeline_events").insert({ service_request_id: requestId, event_type: "documents_uploaded", title: "Administrator documents uploaded", detail: `${files.length} document(s) uploaded by administrator.`, actor_type: "admin", metadata: { file_count: files.length } });
  }
  async function createAdminRequest(event) {
    event.preventDefault(); const form=event.currentTarget; const status=$("#adminCreateRequestStatus"); const submit=$("#adminWizardCreate", form);
    if (!validateWizardStep(form)) return;
    submit.disabled=true; status.textContent="Creating request…";
    try {
      const service = wizardService(form);
      let customerId = wizardValue(form, "existing_customer_id");
      if (!customerId) {
        const {data:customer,error:customerError}=await adminClient.from("customers").insert({first_name:wizardValue(form,"first_name"),last_name:wizardValue(form,"last_name"),email:wizardValue(form,"email"),phone:wizardValue(form,"phone")||null,preferred_contact:wizardValue(form,"preferred_contact")||"email"}).select("id").single();
        if(customerError) throw customerError;
        customerId = customer.id;
      }
      const estimate = wizardEstimate(form);
      const appointmentDate = wizardValue(form, "appointment_date");
      const appointmentTime = wizardValue(form, "appointment_time");
      const {data:request,error:requestError}=await adminClient.from("service_requests").insert({customer_id:customerId,service_type:service,status:"under_review",workflow_status:"under_review",preferred_date:wizardValue(form,"preferred_date")||null,preferred_time_window:wizardValue(form,"preferred_time_window")||null,notes:wizardValue(form,"notes")||"Created by administrator.",estimated_total:estimate.total,appointment_date:appointmentDate||null,appointment_time:appointmentTime||null,appointment_timezone:(appointmentDate||appointmentTime)?wizardValue(form,"appointment_timezone")||"America/Chicago":null,appointment_location:service==="mobile"?wizardValue(form,"appointment_location")||null:null,appointment_link:service==="ron"?wizardValue(form,"appointment_link")||null:null,appointment_platform:service==="ron"?wizardValue(form,"ron_platform")||null:null,appointment_instructions:wizardValue(form,"appointment_instructions")||null}).select("id").single();
      if(requestError) throw requestError;
      if (service === "ron") {
        const witnesses = wizardWitnessAllocation(form, "ron");
        const rawWitnessCount = wizardValue(form, "ron_witness_count");
        const { error } = await adminClient.from("ron_requests").insert({ service_request_id:request.id,document_type:wizardValue(form,"document_type")||null,number_of_signers:wizardNumber(form,"ron_signer_count",1),number_of_notarizations:wizardNumber(form,"ron_notarization_count",1),ron_platform:wizardValue(form,"ron_platform")||null,tech_ready:wizardChecked(form,"ron_tech_ready"),valid_id_confirmed:wizardChecked(form,"ron_valid_id"),consent_to_recording:wizardChecked(form,"ron_recording_consent"),witness_need:wizardValue(form,"ron_witness_need")||"no",witness_count:rawWitnessCount==="not_sure"?null:witnesses.total,witness_provider:wizardValue(form,"ron_witness_provider")||null,client_witness_count:witnesses.customer,provided_witness_count:witnesses.aps,witness_review_required:["not_sure"].includes(wizardValue(form,"ron_witness_need"))||["not_sure"].includes(wizardValue(form,"ron_witness_provider"))||rawWitnessCount==="not_sure" });
        if (error) throw error;
      }
      if (service === "mobile") {
        const witnesses = wizardWitnessAllocation(form, "mobile");
        const rawWitnessCount = wizardValue(form, "mobile_witness_count");
        const witnessNeed = wizardValue(form, "mobile_witness_need")||"no";
        const { error } = await adminClient.from("mobile_notary_requests").insert({ service_request_id:request.id,street_address:wizardValue(form,"mobile_street")||null,unit:wizardValue(form,"mobile_unit")||null,city:wizardValue(form,"mobile_city")||null,state:wizardValue(form,"mobile_state")||"TX",zip:wizardValue(form,"mobile_zip")||null,number_of_signers:wizardNumber(form,"mobile_signer_count",1),number_of_notarizations:wizardNumber(form,"mobile_notarization_count",1),witnesses_needed:witnessNeed==="yes",witness_need:witnessNeed,witness_count:rawWitnessCount==="not_sure"?null:witnesses.total,witness_provider:wizardValue(form,"mobile_witness_provider")||null,client_witness_count:witnesses.customer,provided_witness_count:witnesses.aps,witness_review_required:witnessNeed==="not_sure"||wizardValue(form,"mobile_witness_provider")==="not_sure"||rawWitnessCount==="not_sure",print_add_on:false,scan_back_needed:false,scan_to_pdf_needed:false,travel_miles:wizardNumber(form,"mobile_travel_miles")||null,travel_fee:(window.ALIGNED_PRICING?.mobile?.appointmentBase||50),dispatch_payment_required:(window.ALIGNED_PRICING?.mobile?.appointmentBase||50) });
        if (error) throw error;
      }
      if (service === "print") {
        const pages = wizardNumber(form,"print_pages"); const copies = Math.max(1,wizardNumber(form,"print_copies",1)); const totalPages = pages*copies; const isColor=wizardValue(form,"print_color")==="color"; const fulfillment=wizardValue(form,"print_fulfillment")||"pickup"; const printTotal=wizardPrintCost(form);
        const { error } = await adminClient.from("print_scan_requests").insert({ service_request_id:request.id,fulfillment_type:fulfillment,delivery_address:wizardValue(form,"print_delivery_address")||null,black_white_pages:isColor?0:totalPages,color_pages:isColor?totalPages:0,paper_size:wizardValue(form,"print_paper_size")||null,print_sides:wizardValue(form,"print_sides")||null,paper_type:wizardValue(form,"print_paper_type")||null,scan_pages:wizardNumber(form,"print_scan_pages"),delivery_fee:fulfillment==="courier"?(window.ALIGNED_PRICING?.documentServices?.courierBase||20):0,print_total:printTotal,courier_requested:fulfillment==="courier",mobile_document_service_requested:fulfillment==="mobile-service",courier_fee:fulfillment==="courier"?(window.ALIGNED_PRICING?.documentServices?.courierBase||20):0,mobile_document_service_fee:fulfillment==="mobile-service"?(window.ALIGNED_PRICING?.documentServices?.mobileDocumentBase||20):0,copy_pages:totalPages });
        if (error) throw error;
      }
      await uploadNewOrderDocuments(request.id, Array.from(form.elements.order_documents?.files||[]));
      const calendarDate=moduleState.newOrderCalendarDate;
      status.textContent="Request created successfully."; await loadRequests();
      if(calendarDate){moduleState.newOrderCalendarDate=null;moduleState.calendarSelectedDate=calendarDate;const selected=dateFromKey(calendarDate);if(selected)moduleState.calendarMonth=new Date(selected.getFullYear(),selected.getMonth(),1,12);showAdminView("calendar");}else{openRequestFromModule(request.id);}
    } catch(error) {status.textContent=`Could not create request: ${error.message||error}`;} finally {submit.disabled=false;}
  }
  async function loadCommunicationData(view) {
    if(view==="messages") {
      const {data}=await adminClient.from("messages").select("id,service_request_id,recipient,subject,delivery_state,sent_at,created_at").order("created_at",{ascending:false}).limit(200);
      moduleState.messages=data||[];
    }
    if(view==="templates") {
      const {data}=await adminClient.from("message_templates").select("id,name,description,associated_status,required_attachment_type,active").eq("active",true).order("name");
      moduleState.templates=data||[];
    }
  }
  async function showAdminView(view) {
    moduleState.activeView=view;
    const isRequests=view==="requests";
    appView.hidden=!isRequests; moduleView.hidden=isRequests;
    if(!isRequests){const labels=moduleTitles[view]||moduleTitles.dashboard;$("#moduleEyebrow").textContent=labels[0];$("#moduleTitle").textContent=labels[1];$("#moduleSubtitle").textContent=labels[2];moduleContent.innerHTML='<div class="admin-v3-module-card"><p>Loading…</p></div>';await loadCommunicationData(view);if(moduleState.activeView!==view)return;moduleContent.innerHTML=renderModule(view);bindModuleActions();}
    $("#adminSidebar")?.classList.remove("is-open");
    $("#adminMenuButton")?.setAttribute("aria-expanded","false");
    $$('[data-admin-view]').forEach(link=>link.classList.toggle("is-active",(view==="dashboard"&&link.textContent.includes("Dashboard"))||link.dataset.adminView===view));
    window.scrollTo({top:0,behavior:"auto"});
  }
  window.addEventListener("aps:requests-loading",()=>{moduleState.requestsState="loading";moduleState.requestsError="";if(moduleState.activeView==="calendar")refreshCalendarView();});
  window.addEventListener("aps:requests-error",event=>{moduleState.requestsState="error";moduleState.requestsError=event.detail?.message||"Requests could not be loaded.";if(moduleState.activeView==="calendar")refreshCalendarView();});
  window.addEventListener("aps:requests-loaded",event=>{moduleState.requests=event.detail.requests||[];moduleState.requestsState="ready";moduleState.requestsError="";if(moduleState.activeView!=="requests")showAdminView(moduleState.activeView);});
  window.addEventListener("aps:support-loaded",event=>{moduleState.supportTickets=event.detail.supportTickets||[];if(moduleState.activeView==="support")showAdminView("support");});
  $("#returnToRequests")?.addEventListener("click",()=>showAdminView("requests"));
  $("#newRequestButton")?.replaceWith($("#newRequestButton").cloneNode(true));
  $("#newRequestButton")?.addEventListener("click",()=>{moduleState.newOrderCalendarDate=null;showAdminView("new");});
  $$('[data-admin-view]').forEach(link=>{const clone=link.cloneNode(true);link.replaceWith(clone);clone.addEventListener("click",event=>{event.preventDefault();const view=clone.dataset.adminView;showAdminView(view==="requests"&&clone.textContent.includes("Dashboard")?"dashboard":view);});});

  /** Public bridge used by admin.js after it resolves a selected request. */
  window.AdminV3 = {
    syncSelectedRequest,
    organizeRequestDetail,
    activateTab,
    filterVisibleRequestCards,
    showAdminView,
    calendarIcs,
    googleCalendarUrl,
    calendarIcsForRequest: (id) => {
      const request=moduleState.requests.find(item=>item.id===id);
      return request?calendarIcs(request):"";
    },
    googleCalendarUrlForRequest: (id) => {
      const request=moduleState.requests.find(item=>item.id===id);
      return request?googleCalendarUrl(request):"";
    },
  };
})();
