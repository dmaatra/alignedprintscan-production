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
    const portalLink = $("#workspaceCustomerPortal");
    portalLink.href = `success.html?request_id=${encodeURIComponent(request.id)}&ref=${encodeURIComponent(reference)}`;
    portalLink.setAttribute("aria-disabled", "false");
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
    const normalizedTab = tabName === "communication" ? "messages" : tabName;
    const safeTab = ["overview", "customer", "documents", "quote", "payments", "messages", "fulfillment", "timeline"].includes(normalizedTab) ? normalizedTab : "overview";
    state.activeTab = safeTab;

    if (detailRoot && !detailRoot.querySelector("[data-v3-tab-panel]") && detailRoot.children.length && !state.isOrganizingDetail) {
      organizeRequestDetail();
      return;
    }

    $$("[data-workspace-tab]").forEach((button) => {
      const isActive = button.dataset.workspaceTab === safeTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });

    $$('[data-v3-tab-panel]', detailRoot).forEach((panel) => {
      const isActive = panel.dataset.v3TabPanel === safeTab;
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
  async function syncRequestCount() {
    const count = $$("#requestList .request-row").filter((row) => row.dataset.archived !== "true").length;
    $("#requestCountBadge").textContent = String(count);
    const { data, error } = await adminClient.rpc("admin_unopened_request_count");
    const unopened = error ? 0 : Number(data || 0);
    const badge = $("#navRequestCount");
    if (badge) { badge.textContent = String(unopened); badge.hidden = unopened === 0; }
  }

  /** Wire persistent navigation and controls. */
  function bindShellEvents() {
    $("#workspaceTabs")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-workspace-tab]");
      if (!button) return;
      activateTab(button.dataset.workspaceTab);
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
    invoices: [],
    payments: [],
    reviewItems: [],
    financialView: { search:"", state:"all", service:"all", from:"", to:"", sortKey:"date", sortDirection:"desc" },
    customerView: { search:"", service:"all", history:"all", sort:"recent_desc" },
    reviewView: { sort:"priority" },
    ronInventory: null,
    ronError: "",
    ronView: { search:"", session:"all", payment:"all", appointment:"all", proof:"all", returnState:"all", sort:"operational" },
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
  let financialTools = null;
  let ronTools = null;
  const moduleTitles = {
    dashboard: ["Overview", "Operations Dashboard", "Live request, schedule, and revenue indicators."],
    calendar: ["Operations", "Scheduling Center", "Plan and export requested and confirmed APS appointments."],
    review: ["Operations", "Review Queue", "Requests that require a specific administrator decision or correction."],
    sessions: ["Operations", "RON Sessions", "Manage Remote Online Notary sessions, Proof readiness, appointments, signer access, and completed notarized documents."],
    invoices: ["Financial", "Invoices", "Request-level invoice status and outstanding balances."],
    payments: ["Financial", "Payments", "Paid-to-date and remaining balance visibility."],
    customers: ["Clients", "Customers", "Canonical customer profiles and complete APS request history."],
    messages: ["Communications", "Messages", "Cross-order customer communication and delivery history."],
    templates: ["Communications", "Templates", "Master APS branded communication templates."],
    scripts: ["Communications", "Scripts", "Admin-only operator scripts, stop guidance, and service checklists."],
    support: ["Support", "Support Tickets", "Current customer support workload."],
    settings: ["System", "Settings", "Portal configuration and integration status."],
    new: ["Operations", "New Order", "Create an order received by phone, email, or in person."],
  };
  const getCustomer = (request) => Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const displayMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function requestStatus(request) { return request.workflow_status || request.status || "under_review"; }
  function activeRequests() { return moduleState.requests.filter((request) => !request.archived_at); }
  async function openRequestFromModule(id, tab = "overview", documentId = null) {
    if (documentId) sessionStorage.setItem(`aps:focus-document:${id}`, documentId);
    await showAdminView("requests");
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
    const terminal=["completed","cancelled","declined","refunded"].includes(requestStatus(request));
    if(["pending","re_review_required"].includes(request.document_state)) blockers.push({title:request.document_state==="re_review_required"?"Document re-review required":"Document pending",tab:"documents",priority:request.document_state==="re_review_required"?"action":"waiting"});
    if(!terminal&&["ron","mobile"].includes(request.service_type)){
      const signers=(request.request_participants||[]).filter(item=>item.participant_type==="signer");
      const missing=[];
      if(!signers.length)missing.push("signer");
      signers.forEach((signer,index)=>{
        const label=`Signer ${index+1}`;
        if(!String(signer.first_name||"").trim())missing.push(`${label} first name`);
        if(!String(signer.last_name||"").trim())missing.push(`${label} last name`);
        if(request.service_type==="ron"&&!String(signer.email||"").trim())missing.push(`${label} email`);
      });
      if(missing.length)blockers.push({title:"Signer information incomplete",detail:`Missing: ${missing.join(", ")}.`,tab:"customer",priority:"action"});
    }
    if(Number(request.balance_due||0)>0) blockers.push({title:"Payment pending",tab:"payments",priority:"waiting"});
    if(request.workflow_status==="quote_ready") blockers.push({title:"Quote review required",tab:"quote",priority:"action"});
    if(request.appointment_state==="rescheduling_requested") blockers.push({title:"Appointment needs confirmation",tab:"fulfillment",priority:"urgent"});
    moduleState.reviewItems.filter(item=>item.service_request_id===request.id&&item.state==="open").forEach(item=>{
      if(!blockers.some(blocker=>blocker.title===item.title))blockers.push({title:item.title,detail:item.detail,tab:item.target_tab||"overview",priority:item.blocker_key==="possible_existing_customer"?"action":"action",created_at:item.created_at});
    });
    return blockers;
  }
  function reviewAge(value) { const ms=Math.max(0,Date.now()-new Date(value).getTime());const hours=Math.floor(ms/3600000);const minutes=Math.floor((ms%3600000)/60000);return hours>=24?`Waiting ${Math.floor(hours/24)}d ${hours%24}h`:`Waiting ${hours}h ${minutes}m`; }
  function requestAppointmentTimestamp(request){const date=appointmentDate(request);if(!date)return Number.POSITIVE_INFINITY;const time=appointmentTimeRange(appointmentTime(request))?.start||0;return new Date(`${date}T00:00:00`).getTime()+time*60000;}
  function reviewPriority(request,blockers){const appointment=requestAppointmentTimestamp(request);if(appointment-Date.now()<24*3600000&&blockers.some(item=>item.priority==="action"||item.priority==="urgent"))return "urgent";if(blockers.some(item=>item.priority==="urgent"))return "urgent";if(blockers.some(item=>item.priority==="action"))return "action";if(blockers.some(item=>item.priority==="waiting"))return "waiting";return "info";}
  function reviewRows(){return activeRequests().map(request=>{const blockers=requestBlockers(request);return {request,blockers,priority:reviewPriority(request,blockers),oldest:Math.min(...blockers.map(item=>new Date(item.created_at||request.created_at).getTime()))};}).filter(item=>item.blockers.length);}
  function renderReviewQueue() {
    const rank={urgent:0,action:1,waiting:2,info:3};let items=reviewRows();
    items.sort((a,b)=>moduleState.reviewView.sort==="appointment"?requestAppointmentTimestamp(a.request)-requestAppointmentTimestamp(b.request):moduleState.reviewView.sort==="oldest"?a.oldest-b.oldest:moduleState.reviewView.sort==="newest"?b.oldest-a.oldest:moduleState.reviewView.sort==="customer"?`${getCustomer(a.request)?.last_name||""}${getCustomer(a.request)?.first_name||""}`.localeCompare(`${getCustomer(b.request)?.last_name||""}${getCustomer(b.request)?.first_name||""}`):moduleState.reviewView.sort==="reference"?a.request.id.localeCompare(b.request.id):(rank[a.priority]-rank[b.priority]||requestAppointmentTimestamp(a.request)-requestAppointmentTimestamp(b.request)||a.oldest-b.oldest));
    if(!items.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No open review items</h3><p>APS has no loaded requests requiring administrator intervention.</p></div>';
    return `<section class="admin-v3-financial-controls"><label><span>Sort queue</span><select id="reviewSort"><option value="priority">Priority</option><option value="appointment">Appointment soonest</option><option value="oldest">Oldest unresolved</option><option value="newest">Newest unresolved</option><option value="customer">Customer A–Z</option><option value="reference">APS reference</option></select></label></section><div class="admin-v3-review-list">${items.map(item=>{const request=item.request,customer=getCustomer(request)||{},date=appointmentDate(request),tab=item.blockers.find(blocker=>["urgent","action"].includes(blocker.priority))?.tab||item.blockers[0].tab;return `<article class="admin-v3-module-card admin-v3-review-item"><header><div><span class="review-priority review-priority--${item.priority}">${safe(labelFromStatus(item.priority==="action"?"action_required":item.priority))}</span><h3>${safe(`APS-${request.id.slice(0,8).toUpperCase()}`)} · ${safe(`${customer.first_name||""} ${customer.last_name||""}`.trim())}</h3><p>${safe(labelFromStatus(request.service_type))}${date?` · Appointment ${safe(financialDate(date))}${appointmentTime(request)?` · ${safe(appointmentTime(request))}`:""}`:""}</p></div><small>${safe(reviewAge(new Date(item.oldest).toISOString()))}<br>Created ${safe(new Date(request.created_at).toLocaleString())}</small></header><ul>${item.blockers.map(blocker=>`<li><strong>${safe(blocker.title)}</strong>${blocker.detail?`<span>${safe(blocker.detail)}</span>`:""}</li>`).join("")}</ul><button class="admin-v3-button admin-v3-button--navy module-open-request" data-request-id="${safe(request.id)}" data-tab="${safe(tab)}" type="button">Review Request</button></article>`}).join("")}</div>`;
  }
  function financialDate(value) { return value?new Date(value).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Not available"; }
  function financialControls(rows,stateLabel) { const states=[...new Set(rows.map(row=>row.status||row.state).filter(Boolean))].sort();return `<section class="admin-v3-financial-controls" aria-label="Financial search and filters"><label><span>Search</span><input id="financialSearch" type="search" value="${safe(moduleState.financialView.search)}" placeholder="APS reference or customer"></label><label><span>${safe(stateLabel)}</span><select id="financialState"><option value="all">All states</option>${states.map(state=>`<option value="${safe(state)}" ${moduleState.financialView.state===state?"selected":""}>${safe(labelFromStatus(state))}</option>`).join("")}</select></label><label><span>Service</span><select id="financialService"><option value="all">All services</option>${["ron","mobile","print"].map(service=>`<option value="${service}" ${moduleState.financialView.service===service?"selected":""}>${safe(labelFromStatus(service))}</option>`).join("")}</select></label><label><span>From</span><input id="financialFrom" type="date" value="${safe(moduleState.financialView.from)}"></label><label><span>To</span><input id="financialTo" type="date" value="${safe(moduleState.financialView.to)}"></label></section>`; }
  function financialSortHeader(label,key) { const active=moduleState.financialView.sortKey===key;return `<button class="financial-sort" data-financial-sort="${safe(key)}" type="button">${safe(label)} <span aria-hidden="true">${active?(moduleState.financialView.sortDirection==="asc"?"↑":"↓"):"↕"}</span></button>`; }
  function financialRows(view) { return view==="invoices"?financialTools.buildInvoiceRows(activeRequests(),moduleState.invoices):financialTools.buildPaymentRows(activeRequests(),moduleState.invoices,moduleState.payments); }
  function filteredFinancialRows(view) { return financialTools.sortFinancialRows(financialTools.filterFinancialRows(financialRows(view),moduleState.financialView),moduleState.financialView.sortKey,moduleState.financialView.sortDirection); }
  function renderFinancial(view) { const all=financialRows(view),rows=filteredFinancialRows(view),invoiceView=view==="invoices";const summary=invoiceView?financialTools.summarizeInvoices(all):financialTools.summarizePayments(all);const summaryHtml=invoiceView?`<div><span>Total quoted</span><strong>${displayMoney(summary.quoted)}</strong></div><div><span>Issued invoices</span><strong>${displayMoney(summary.invoiced)}</strong></div><div><span>Outstanding receivable</span><strong>${displayMoney(summary.outstanding)}</strong></div><div><span>Open invoices</span><strong>${summary.open}</strong></div>`:`<div><span>Payments recorded</span><strong>${displayMoney(summary.paid)}</strong></div><div><span>Outstanding receivable</span><strong>${displayMoney(summary.outstanding)}</strong></div><div><span>Requests with payments</span><strong>${summary.recorded}</strong></div>`;const headers=invoiceView?[["Request","reference"],["Customer","customer"],["Invoice state","status"],["Quoted","quoted"],["Invoiced","invoiced"],["Balance","balance"],["Relevant date","date"]]:[["Request","reference"],["Customer","customer"],["Paid","paid"],["Remaining balance","balance"],["Payment state","state"],["Relevant date","date"]];return `<div class="admin-v3-financial-summary">${summaryHtml}</div>${financialControls(all,invoiceView?"Invoice state":"Payment state")}<div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table admin-v3-financial-table"><thead><tr>${headers.map(([label,key])=>`<th>${financialSortHeader(label,key)}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr><td><button class="financial-request-link" data-request-id="${safe(row.id)}" data-tab="${invoiceView?"quote":"payments"}" type="button">${safe(row.reference)}</button></td><td>${safe(row.customer)}</td>${invoiceView?`<td>${safe(labelFromStatus(row.status))}</td><td>${displayMoney(row.quoted)}${!row.has_invoice?'<small>Draft quote</small>':""}</td><td>${displayMoney(row.invoiced)}</td><td>${displayMoney(row.balance)}</td>`:`<td>${displayMoney(row.paid)}</td><td>${displayMoney(row.balance)}</td><td>${safe(labelFromStatus(row.state))}</td>`}<td>${safe(financialDate(row.date))}<small>${safe(row.date_kind)}</small></td></tr>`).join(""):`<tr><td colspan="${headers.length}">No financial records match these filters.</td></tr>`}</tbody></table></div>`; }
  function renderMessages() {
    if(!moduleState.messages.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No messages found</h3><p>Sent and failed customer communications will appear here.</p></div>';
    return `<div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Sent</th><th>Recipient</th><th>Subject</th><th>State</th><th></th></tr></thead><tbody>${moduleState.messages.map(message=>`<tr><td>${safe(message.sent_at?new Date(message.sent_at).toLocaleString():"Draft")}</td><td>${safe(message.recipient)}</td><td>${safe(message.subject)}</td><td>${safe(labelFromStatus(message.delivery_state))}</td><td>${message.service_request_id?`<button class="admin-v3-button admin-v3-button--outline module-open-request" data-request-id="${safe(message.service_request_id)}" data-tab="messages" type="button">Open</button>`:""}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderTemplates() {
    if(!moduleState.templates.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No templates loaded</h3><p>Apply the workflow migration to register the complete APS template library.</p></div>';
    const groups=new Map(); moduleState.templates.forEach(template=>{const family=templateCategory(template);if(!groups.has(family))groups.set(family,[]);groups.get(family).push(template);});
    return [...groups].map(([family,templates])=>`<section class="reference-group"><header><p class="small-label">${safe(family)}</p><h2>${safe(family)} templates</h2></header><div class="admin-v3-module-grid">${templates.map(template=>`<button class="admin-v3-module-card template-library-card" data-template-id="${safe(template.id)}" type="button"><p class="small-label">${safe(template.associated_status?labelFromStatus(template.associated_status):family)}</p><h3>${safe(template.name)}</h3><p>${safe(template.description||"")}</p><p><strong>Required attachment:</strong> ${safe(template.required_attachment_type?labelFromStatus(template.required_attachment_type):"None")}</p><span class="template-card-action">View specification &amp; full preview →</span></button>`).join("")}</div></section>`).join("");
  }
  function templateCategory(template){const key=template.template_key||"";if(key.includes("cancel")||key.includes("reschedul"))return "Cancellation / Rescheduling";if(key.includes("refund")||key.includes("retained"))return "Refund";if(key.includes("quote"))return "Quote / Approval";if(key.includes("payment")||key.includes("invoice"))return "Payment";if(key.includes("appointment"))return "Appointment / Scheduling";if(key.includes("ron"))return "RON";if(key.includes("mobile"))return "Mobile";if(key.includes("document")||key.includes("scan"))return "Document Delivery";if(key.includes("completed"))return "Completion";if(key.includes("review"))return "Reviews";if(key.includes("request_received"))return "Request / Intake";return "General";}
  async function openTemplateDetail(templateId) {
    const template=moduleState.templates.find(item=>item.id===templateId); if(!template)return;
    const {TEMPLATE_SPECIFICATIONS,SYNTHETIC_TEMPLATE_CONTEXT,renderFullTemplateEmail}=await import("../../supabase/functions/_shared/template-preview.mjs");
    const spec=TEMPLATE_SPECIFICATIONS[template.template_key]; const rendered=renderFullTemplateEmail({template,context:SYNTHETIC_TEMPLATE_CONTEXT}); const conditional=spec.category==="Appointment"||spec.category==="RON"||spec.category==="Mobile"?"Physical location is shown only for physical service; secure-session details are shown only for RON.":spec.category==="Documents"?"Only intentionally released customer documents are included.":spec.category==="Payment"?"Payment and remaining-balance rows appear only when applicable.":"Request-specific panels populate only from available authoritative fields.";
    const index=moduleState.templates.findIndex(item=>item.id===template.id),previous=moduleState.templates[index-1],next=moduleState.templates[index+1];
    moduleContent.innerHTML=`<nav class="reference-detail-nav" aria-label="Template navigation"><button class="admin-v3-button admin-v3-button--outline" id="previousTemplate" type="button" ${previous?"":"disabled"}>← Previous Template</button><button class="admin-v3-button admin-v3-button--outline" id="backToTemplates" type="button">Back to Templates</button><button class="admin-v3-button admin-v3-button--outline" id="nextTemplate" type="button" ${next?"":"disabled"}>Next Template →</button></nav><article class="admin-v3-module-card template-specification"><p class="small-label">${safe(templateCategory(template))} · ${safe(spec.category)} · ${safe(spec.classification)}</p><h2>${safe(template.name)}</h2><div class="template-spec-grid"><div><strong>Template key</strong><span>${safe(template.template_key)}</span></div><div><strong>Purpose</strong><span>${safe(spec.purpose)}</span></div><div><strong>Trigger / workflow event</strong><span>${safe(spec.trigger)}</span></div><div><strong>Recipient type</strong><span>Customer for the current APS request</span></div><div><strong>Subject format</strong><span>${safe(template.subject_template)}</span></div><div><strong>Eyebrow / title</strong><span>${safe(spec.eyebrow)} · ${safe(spec.title)}</span></div><div><strong>CTA</strong><span>${safe(spec.cta)} → ${safe(labelFromStatus(spec.tab))}</span></div><div><strong>Delivery action</strong><span>${safe(spec.classification)}</span></div><div><strong>Resulting status</strong><span>${safe(template.associated_status?labelFromStatus(template.associated_status):"No automatic status change")}</span></div><div><strong>Required attachment</strong><span>${safe(template.required_attachment_type?labelFromStatus(template.required_attachment_type):"None")}</span></div><div><strong>Optional / conditional fields</strong><span>${safe(conditional)}</span></div><div><strong>Logging path</strong><span>Request → Messages / Communication Log and Timeline after successful delivery</span></div></div><section><h3>Exact maintained body wording</h3><pre class="template-body-copy">${safe(template.html_template)}</pre></section><section><h3>Data this template expects</h3><ul class="template-field-list">${spec.fields.map(field=>`<li>${safe(field)}</li>`).join("")}</ul></section><section><h3>Full Email Preview</h3><p class="admin-muted">Synthetic data only: Jane Sample · APS-DEMO1234. No production customer data is loaded here.</p><iframe class="aps-full-email-preview template-library-preview" title="${safe(template.name)} synthetic full email preview" sandbox srcdoc="${safe(rendered.html)}"></iframe></section></article>`;
    $("#backToTemplates",moduleContent)?.addEventListener("click",()=>{moduleContent.innerHTML=renderTemplates();bindModuleActions();});
    $("#previousTemplate",moduleContent)?.addEventListener("click",()=>previous&&openTemplateDetail(previous.id));
    $("#nextTemplate",moduleContent)?.addEventListener("click",()=>next&&openTemplateDetail(next.id));
  }
  async function renderScripts(){const {scriptsByCategory}=await import("./operator-reference-catalog.mjs");return scriptsByCategory().map(group=>`<section class="reference-group"><header><p class="small-label">${safe(group.category)}</p><h2>${safe(group.category)}</h2></header><div class="admin-v3-module-grid">${group.scripts.map(script=>`<button class="admin-v3-module-card script-library-card" data-script-key="${safe(script.key)}" type="button"><p class="small-label">${safe(script.category)}</p><h3>${safe(script.name)}</h3><p>${safe(script.purpose)}</p><span class="template-card-action">Open operator reference →</span></button>`).join("")}</div></section>`).join("");}
  async function openScriptDetail(key){const {OPERATOR_REFERENCE_SCRIPTS}=await import("./operator-reference-catalog.mjs");const index=OPERATOR_REFERENCE_SCRIPTS.findIndex(item=>item.key===key),script=OPERATOR_REFERENCE_SCRIPTS[index];if(!script)return;const previous=OPERATOR_REFERENCE_SCRIPTS[index-1],next=OPERATOR_REFERENCE_SCRIPTS[index+1],items=(values)=>`<ul class="template-field-list">${values.map(value=>`<li>${safe(value)}</li>`).join("")}</ul>`;moduleContent.innerHTML=`<nav class="reference-detail-nav" aria-label="Script navigation"><button class="admin-v3-button admin-v3-button--outline" id="previousScript" type="button" ${previous?"":"disabled"}>← Previous Script</button><button class="admin-v3-button admin-v3-button--outline" id="backToScripts" type="button">Back to Scripts</button><button class="admin-v3-button admin-v3-button--outline" id="nextScript" type="button" ${next?"":"disabled"}>Next Script →</button></nav><article class="admin-v3-module-card template-specification script-specification"><p class="small-label">${safe(script.category)} · Reference only</p><h2>${safe(script.name)}</h2><div class="template-spec-grid"><div><strong>Purpose</strong><span>${safe(script.purpose)}</span></div><div><strong>When to use</strong><span>${safe(script.when)}</span></div><div><strong>APS next step</strong><span>${safe(script.next)}</span></div><div><strong>Related SOP / service</strong><span>${safe(script.related)}</span></div></div><section class="script-say-this"><p class="small-label">Script — Say This</p><blockquote>${safe(script.say)}</blockquote></section><section><h3>Must Do</h3>${items(script.mustDo)}</section><section><h3>Do Not</h3>${items(script.doNot)}</section><section class="script-stop"><h3>Stop / Refuse</h3><p>${safe(script.stop)}</p></section></article>`;$("#backToScripts",moduleContent)?.addEventListener("click",()=>showAdminView("scripts"));$("#previousScript",moduleContent)?.addEventListener("click",()=>previous&&openScriptDetail(previous.key));$("#nextScript",moduleContent)?.addEventListener("click",()=>next&&openScriptDetail(next.key));}
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
            ${field("How customer found APS (optional)", "customer_reported_source", '<select name="customer_reported_source"><option value="">Not recorded</option><option value="google">Google Search / Google Maps</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="proof">Proof</option><option value="referral">Referral / Word of Mouth</option><option value="returning_customer">Returning Customer</option><option value="other">Other</option></select>', "wide")}
            ${field("Source detail (optional)", "customer_reported_source_detail", '<input name="customer_reported_source_detail" maxlength="120" placeholder="Optional detail">', "wide")}
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
            ${field("Signer count", "ron_signer_count", '<input name="ron_signer_count" type="number" min="1" max="10" value="1" required>')}
            ${field("Notarial acts", "ron_notarization_count", '<input name="ron_notarization_count" type="number" min="1" value="1" required>')}
            <div id="adminRonSignerFields" class="wide"></div>
            <div id="adminRonActFields" class="wide"></div>
            ${field("Are witnesses needed?", "ron_witness_need", '<select name="ron_witness_need"><option value="no">No</option><option value="yes">Yes</option><option value="not_sure">Not sure</option></select>')}
            ${field("Witness count", "ron_witness_count", '<select name="ron_witness_count"><option value="0">None</option><option value="1">1</option><option value="2">2</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Witness provider", "ron_witness_provider", '<select name="ron_witness_provider"><option value="client">Customer</option><option value="aligned">APS</option><option value="shared">Shared</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Customer-provided witnesses", "ron_client_witness_count", '<input name="ron_client_witness_count" type="number" min="0" value="0">', "admin-v3-witness-field")}
            <div id="adminRonWitnessFields" class="wide admin-v3-witness-field"></div>
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
  function customerDirectoryRows(){const map=new Map();moduleState.requests.forEach(request=>{const customer=getCustomer(request);if(!customer?.id)return;const row=map.get(customer.id)||{customer,requests:[]};row.requests.push(request);map.set(customer.id,row);});return [...map.values()].map(row=>{row.requests.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));row.lastRequest=row.requests[0];row.activeCount=row.requests.filter(request=>!request.archived_at&&!['completed','cancelled','declined'].includes(requestStatus(request))).length;return row;});}
  function filteredCustomerRows(){const {search,service,history,sort}=moduleState.customerView;const query=String(search||"").toLowerCase().replace(/\D/g,"");const rawQuery=String(search||"").toLowerCase();const rows=customerDirectoryRows().filter(row=>{const c=row.customer;const haystack=[c.first_name,c.last_name,c.email,c.phone,...row.requests.map(request=>`APS-${request.id.slice(0,8).toUpperCase()}`)].join(" ").toLowerCase();const phone=String(c.phone||"").replace(/\D/g,"");const searchOk=!rawQuery||haystack.includes(rawQuery)||(query.length>=3&&phone.includes(query));const serviceOk=service==="all"||row.requests.some(request=>request.service_type===service);const historyOk=history==="all"||(history==="active"&&row.activeCount>0)||(history==="completed"&&row.activeCount===0&&row.requests.some(request=>requestStatus(request)==="completed"));return searchOk&&serviceOk&&historyOk;});const comparators={name_asc:(a,b)=>`${a.customer.last_name||""}${a.customer.first_name||""}`.localeCompare(`${b.customer.last_name||""}${b.customer.first_name||""}`),name_desc:(a,b)=>`${b.customer.last_name||""}${b.customer.first_name||""}`.localeCompare(`${a.customer.last_name||""}${a.customer.first_name||""}`),newest:(a,b)=>new Date(b.customer.created_at)-new Date(a.customer.created_at),oldest:(a,b)=>new Date(a.customer.created_at)-new Date(b.customer.created_at),recent_desc:(a,b)=>new Date(b.lastRequest.created_at)-new Date(a.lastRequest.created_at),recent_asc:(a,b)=>new Date(a.lastRequest.created_at)-new Date(b.lastRequest.created_at),requests_desc:(a,b)=>b.requests.length-a.requests.length,requests_asc:(a,b)=>a.requests.length-b.requests.length};return rows.sort(comparators[sort]||comparators.recent_desc);}
  function renderCustomers(){const rows=filteredCustomerRows();return `<section class="admin-v3-financial-controls" aria-label="Customer directory controls"><label><span>Search</span><input id="customerSearch" type="search" value="${safe(moduleState.customerView.search)}" placeholder="Name, email, phone, or APS reference"></label><label><span>Service</span><select id="customerService"><option value="all">All services</option>${['ron','mobile','print'].map(value=>`<option value="${value}" ${moduleState.customerView.service===value?'selected':''}>${safe(labelFromStatus(value))}</option>`).join('')}</select></label><label><span>History</span><select id="customerHistory"><option value="all">All customers</option><option value="active" ${moduleState.customerView.history==='active'?'selected':''}>Active requests</option><option value="completed" ${moduleState.customerView.history==='completed'?'selected':''}>Completed-only history</option></select></label><label><span>Sort</span><select id="customerSort">${[['recent_desc','Most recent request'],['recent_asc','Oldest last request'],['name_asc','Customer A–Z'],['name_desc','Customer Z–A'],['newest','Newest customer'],['oldest','Oldest customer'],['requests_desc','Most requests'],['requests_asc','Fewest requests']].map(([value,label])=>`<option value="${value}" ${moduleState.customerView.sort===value?'selected':''}>${label}</option>`).join('')}</select></label></section><div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table customer-directory-table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Requests</th><th>Last request</th><th>Most recent service</th><th></th></tr></thead><tbody>${rows.length?rows.map(row=>{const c=row.customer;return `<tr><td><strong>${safe(`${c.first_name||''} ${c.last_name||''}`.trim()||'Customer')}</strong></td><td>${safe(c.email||'')}</td><td data-phone="${safe(c.phone||'')}">${safe(formatCustomerPhone(c.phone))}</td><td>${row.requests.length} Request${row.requests.length===1?'':'s'}${row.activeCount?`<small>${row.activeCount} active</small>`:''}</td><td data-sort-date="${safe(row.lastRequest.created_at)}">${safe(financialDate(row.lastRequest.created_at))}</td><td>${safe(labelFromStatus(row.lastRequest.service_type))}</td><td><button class="admin-v3-button admin-v3-button--outline customer-history-toggle" data-customer-id="${safe(c.id)}" type="button" aria-expanded="false">Request history</button></td></tr><tr class="customer-history-row" data-customer-history="${safe(c.id)}" hidden><td colspan="7"><ul>${row.requests.map(request=>`<li><button class="customer-request-link" data-request-id="${safe(request.id)}" type="button"><strong>${safe(`APS-${request.id.slice(0,8).toUpperCase()}`)}</strong><span>${safe(labelFromStatus(request.service_type))} · ${safe(financialDate(request.created_at))} · ${safe(labelFromStatus(requestStatus(request)))}${request.archived_at?' · Archived':''}</span></button></li>`).join('')}</ul></td></tr>`}).join(''):'<tr><td colspan="7">No customers match these controls.</td></tr>'}</tbody></table></div>`;}
  function formatCustomerPhone(value){const digits=String(value||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');return digits.length===10?`(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`:String(value||'');}
  function renderCustomerMergeButton(){return `<div class="customer-directory-heading"><p>One row per immutable APS customer ID. Signers and witnesses remain request participants.</p><button id="openCustomerMerge" class="admin-v3-button admin-v3-button--outline" type="button">Merge Customer Profiles</button></div>`;}
  function openCustomerMergeDialog(){const customers=customerDirectoryRows().map(row=>row.customer);if(customers.length<2){alert('At least two active customer profiles are required.');return;}const options=customers.map(c=>`<option value="${safe(c.id)}">${safe(`${c.first_name||''} ${c.last_name||''}`.trim())} · ${safe(c.email||c.phone||c.id)}</option>`).join('');const dialog=document.createElement('dialog');dialog.className='admin-v3-danger-dialog customer-merge-dialog';dialog.innerHTML=`<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><span class="small-label">Administrator-only identity cleanup</span><h2>Merge Customer Profiles</h2><p>Linking a new request and merging existing profiles are separate operations. This merge retires the source profile and preserves its requests under the survivor.</p><label>Source / duplicate customer<select name="source" required><option value="">Select source</option>${options}</select></label><label>Surviving / canonical customer<select name="survivor" required><option value="">Select survivor</option>${options}</select></label><label>Merge reason<input name="reason" required minlength="3"></label><button type="button" class="admin-v3-button admin-v3-button--outline preview-customer-merge">Preview impact</button><div class="customer-merge-preview" role="status"></div><div class="status-actions"><button value="cancel" class="btn secondary">Cancel</button><button type="button" class="btn danger confirm-customer-merge" disabled>Merge Profiles</button></div></form>`;document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();const form=dialog.querySelector('form'),preview=dialog.querySelector('.customer-merge-preview'),confirm=dialog.querySelector('.confirm-customer-merge');dialog.querySelector('.preview-customer-merge').addEventListener('click',async()=>{if(!form.reportValidity()||form.elements.source.value===form.elements.survivor.value){preview.textContent='Choose two different profiles.';return;}const {data,error}=await adminClient.functions.invoke('admin-customer-lifecycle',{body:{command:'merge_preview',source_customer_id:form.elements.source.value,surviving_customer_id:form.elements.survivor.value}});if(error||!data?.ok){preview.textContent=data?.error||error?.message||'Preview failed.';return;}const c=data.counts;preview.innerHTML=`<strong>Impact preview</strong><p>${c.requests} requests · ${c.active} active · ${c.completed} completed · ${c.invoices} invoices · ${c.payments} payments · ${c.messages} messages · ${c.documents} documents · ${c.ron} RON requests</p><p>All request-scoped history remains attached to those requests.</p>`;confirm.disabled=false;});confirm.addEventListener('click',async()=>{if(!form.reportValidity())return;confirm.disabled=true;const {data,error}=await adminClient.functions.invoke('admin-customer-lifecycle',{body:{command:'merge',source_customer_id:form.elements.source.value,surviving_customer_id:form.elements.survivor.value,reason:form.elements.reason.value}});if(error||!data?.ok){alert(data?.error||error?.message||'Merge failed.');confirm.disabled=false;return;}dialog.close();await window.loadRequests?.();showAdminView('customers');});}
  function ronOption(value,label,current){return `<option value="${value}" ${current===value?'selected':''}>${label}</option>`;}
  function ronProofDashboardLink(){return '<div class="ron-proof-global-actions"><a class="admin-v3-button admin-v3-button--outline" href="https://app.proof.com" target="_blank" rel="noopener noreferrer">Open Proof Dashboard ↗</a><span>Proof login and legally sensitive notarization work remain in Proof.</span></div>';}
  function ronBadge(item){return `<span class="ron-state ron-state--${safe(item.key)}">${safe(item.label)}</span>`;}
  function ronAppointment(row){const request=row.request;if(!request.appointment_date&&!request.preferred_date)return "Not scheduled";const date=request.appointment_date||request.preferred_date;const time=request.appointment_time?` · ${request.appointment_time.slice(0,5)}`:"";return `${financialDate(date)}${time}`;}
  function renderRonSessions(){
    if(moduleState.ronError)return `<div class="admin-v3-module-card admin-v3-empty-module"><h3>RON sessions could not load</h3><p>${safe(moduleState.ronError)}</p><button class="admin-v3-button admin-v3-button--outline ron-retry" type="button">Retry</button></div>`;
    if(!moduleState.ronInventory)return '<div class="admin-v3-module-card"><p>Loading synchronized RON session state…</p></div>';
    const all=ronTools.buildRonSessionRows(moduleState.ronInventory), filtered=ronTools.filterRonSessions(all,moduleState.ronView), rows=ronTools.sortRonSessions(filtered,moduleState.ronView.sort), hasSearch=Boolean(moduleState.ronView.search), hasFilters=["session","payment","appointment","proof","returnState"].some(key=>moduleState.ronView[key]!=="all");
    const options=(items,current)=>items.map(([value,label])=>ronOption(value,label,current)).join("");
    const controls=`<section class="ron-session-controls" aria-label="RON session controls"><label><span>Search</span><input id="ronSearch" type="search" value="${safe(moduleState.ronView.search)}" placeholder="APS reference, customer, phone, or Proof ID"></label><label><span>Session status</span><select id="ronSessionFilter">${options([["all","All"],["needs_attention","Needs Attention"],["preparing","Preparing"],["ready","Ready"],["active","Active / In Progress"],["completed","Completed"],["released","Released"]],moduleState.ronView.session)}</select></label><label><span>Payment</span><select id="ronPaymentFilter">${options([["all","All"],["not_invoiced","Not Invoiced"],["awaiting_payment","Awaiting Payment"],["paid","Paid"]],moduleState.ronView.payment)}</select></label><label><span>Appointment</span><select id="ronAppointmentFilter">${options([["all","All"],["needs_confirmation","Needs Confirmation"],["confirmed","Confirmed"]],moduleState.ronView.appointment)}</select></label><label><span>Proof</span><select id="ronProofFilter">${options([["all","All"],["not_created","Not Created"],["draft","Draft"],["ready_for_activation","Ready for Activation"],["activated","Activated"],["in_progress","In Progress"],["completed","Completed"],["completed_with_rejections","Completed With Rejections"]],moduleState.ronView.proof)}</select></label><label><span>Document return</span><select id="ronReturnFilter">${options([["all","All"],["not_available","Not Available"],["retrieval_pending","Retrieval Pending"],["pending_review","Pending Review"],["released","Released"]],moduleState.ronView.returnState)}</select></label><label><span>Sort</span><select id="ronSort">${options([["operational","Needs Attention First"],["appointment_asc","Appointment: Soonest First"],["appointment_desc","Appointment: Latest First"],["created_desc","Created: Newest First"],["created_asc","Created: Oldest First"],["customer_asc","Customer: A–Z"],["customer_desc","Customer: Z–A"],["reference","Request Reference"],["updated_desc","Last Updated: Newest First"],["updated_asc","Last Updated: Oldest First"]],moduleState.ronView.sort)}</select></label></section>`;
    if(!all.length)return `${controls}<div class="admin-v3-module-card admin-v3-empty-module"><h3>No RON sessions yet.</h3></div>`;
    if(!rows.length)return `${controls}<div class="admin-v3-module-card admin-v3-empty-module"><h3>${hasSearch?'No RON sessions found.':hasFilters?'No RON sessions match these filters.':'No RON sessions yet.'}</h3></div>`;
    return `${controls}<div class="ron-session-list">${rows.map(row=>`<article class="admin-v3-module-card ron-session-card ${row.attention?'ron-session-card--attention':''}"><header><div><span class="small-label">${safe(row.reference)}</span><h2>${safe(`${row.customer.first_name||''} ${row.customer.last_name||''}`.trim()||'Customer')}</h2><p>${safe(labelFromStatus(row.request.workflow_status||row.request.status))} · ${safe(ronAppointment(row))}</p></div>${ronBadge(row.sessionStatus)}</header><div class="ron-readiness-grid"><div><span>Payment</span>${ronBadge(row.payment)}</div><div><span>Appointment</span>${ronBadge(row.appointment)}</div><div><span>Signers</span>${ronBadge(row.signers)}</div><div><span>Documents</span>${ronBadge(row.documents)}</div><div><span>Proof</span>${ronBadge(row.proof)}</div><div><span>Document return</span>${ronBadge(row.documentReturn)}</div></div><footer><div><strong>Next action</strong><span>${safe(row.nextAction.label)}</span>${row.transaction?.proof_transaction_id?`<small>Proof ${safe(row.transaction.proof_transaction_id)}</small>`:''}<small>Updated ${safe(financialDate(row.lastUpdated))}</small></div><button class="admin-v3-button admin-v3-button--navy ron-open-session" data-request-id="${safe(row.request.id)}" data-tab="${safe(row.nextAction.tab||'fulfillment')}" type="button">Open Session</button></footer></article>`).join('')}</div>`;
  }
  function renderModule(view) {
    const rows=activeRequests();
    if(view==="dashboard") return renderDashboard();
    if(view==="calendar") return renderCalendar();
    if(view==="review") return renderReviewQueue();
    if(view==="sessions") return renderRonSessions();
    if(view==="new") return renderNewRequest();
    if(view==="invoices"||view==="payments") return renderFinancial(view);
    if(view==="customers") return renderCustomerMergeButton()+renderCustomers();
    if(view==="messages") return renderMessages();
    if(view==="templates") return renderTemplates();
    if(view==="scripts") return '<div class="admin-v3-module-card"><p>Loading operator reference…</p></div>';
    if(view==="support") {const tickets=moduleState.supportTickets;return `<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Open tickets</span><strong>${tickets.length}</strong></article></div><div class="admin-v3-module-card"><h2>Support workspace</h2><p>Open the request workspace to use the full support controls already connected to Supabase.</p><button class="admin-v3-button admin-v3-button--navy" id="openLegacySupport" type="button">Open support controls</button></div>`;}
    if(view==="settings") return '<div class="admin-v3-module-grid"><article class="admin-v3-module-card"><h3>Supabase</h3><p>Request storage, authentication, files, and realtime updates are connected through the existing configuration.</p></article><article class="admin-v3-module-card"><h3>Stripe</h3><p>Invoice checkout and webhook logic remain unchanged.</p></article><article class="admin-v3-module-card"><h3>Resend</h3><p>Transactional email functions remain unchanged.</p></article><article class="admin-v3-module-card"><h3>Proof infrastructure</h3><p>Owner-supervised connection and webhook setup only. No transaction controls are available here.</p><div class="admin-v3-agenda-actions"><button class="admin-v3-button admin-v3-button--navy" id="verifyProofConnection" type="button">Verify Proof Connection</button><button class="admin-v3-button admin-v3-button--outline" id="registerProofWebhook" type="button">Register Proof Webhook</button></div><div id="proofInfrastructureStatus" role="status" aria-live="polite"><p>No infrastructure check has run in this session.</p></div></article></div>';
    return renderDashboard();
  }
  function bindModuleActions() {
    $$(".module-open-request", moduleContent).forEach(button=>button.addEventListener("click",()=>openRequestFromModule(button.dataset.requestId,button.dataset.tab||"overview")));
    $$(".ron-open-session",moduleContent).forEach(button=>button.addEventListener("click",()=>openRequestFromModule(button.dataset.requestId,button.dataset.tab||"fulfillment")));
    [["ronSearch","search","input"],["ronSessionFilter","session","change"],["ronPaymentFilter","payment","change"],["ronAppointmentFilter","appointment","change"],["ronProofFilter","proof","change"],["ronReturnFilter","returnState","change"],["ronSort","sort","change"]].forEach(([id,key,type])=>{$(`#${id}`,moduleContent)?.addEventListener(type,event=>{moduleState.ronView[key]=event.target.value;moduleContent.innerHTML=renderRonSessions();bindModuleActions();if(type==="input"){const input=$("#ronSearch",moduleContent);input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}});});
    $(".ron-retry",moduleContent)?.addEventListener("click",()=>showAdminView("sessions"));
    $("[data-cancel-new]", moduleContent)?.addEventListener("click",()=>{const returnToCalendar=Boolean(moduleState.newOrderCalendarDate);moduleState.newOrderCalendarDate=null;showAdminView(returnToCalendar?"calendar":"requests");});
    const newOrderForm = $("#adminCreateRequestForm", moduleContent);
    if (newOrderForm) bindNewOrderWizard(newOrderForm);
    bindCalendarActions();
    $$(".financial-request-link",moduleContent).forEach(button=>button.addEventListener("click",()=>openRequestFromModule(button.dataset.requestId,button.dataset.tab)));
    $$("[data-financial-sort]",moduleContent).forEach(button=>button.addEventListener("click",()=>{const key=button.dataset.financialSort;moduleState.financialView.sortDirection=moduleState.financialView.sortKey===key&&moduleState.financialView.sortDirection==="asc"?"desc":"asc";moduleState.financialView.sortKey=key;moduleContent.innerHTML=renderFinancial(moduleState.activeView);bindModuleActions();}));
    [["financialSearch","search"],["financialState","state"],["financialService","service"],["financialFrom","from"],["financialTo","to"]].forEach(([id,key])=>{$(`#${id}`,moduleContent)?.addEventListener(id==="financialSearch"?"input":"change",event=>{moduleState.financialView[key]=event.target.value;moduleContent.innerHTML=renderFinancial(moduleState.activeView);bindModuleActions();if(id==="financialSearch"){const input=$("#financialSearch",moduleContent);input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}});});
    [["customerSearch","search"],["customerService","service"],["customerHistory","history"],["customerSort","sort"]].forEach(([id,key])=>{$(`#${id}`,moduleContent)?.addEventListener(id==="customerSearch"?"input":"change",event=>{moduleState.customerView[key]=event.target.value;moduleContent.innerHTML=renderCustomers();bindModuleActions();if(id==="customerSearch"){const input=$("#customerSearch",moduleContent);input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}});});
    $$(".customer-history-toggle",moduleContent).forEach(button=>button.addEventListener("click",()=>{const row=$(`[data-customer-history='${CSS.escape(button.dataset.customerId)}']`,moduleContent);if(!row)return;row.hidden=!row.hidden;button.setAttribute("aria-expanded",String(!row.hidden));}));
    $$(".customer-request-link",moduleContent).forEach(button=>button.addEventListener("click",()=>openRequestFromModule(button.dataset.requestId,"overview")));
    $("#openCustomerMerge",moduleContent)?.addEventListener("click",openCustomerMergeDialog);
    const reviewSort=$("#reviewSort",moduleContent);if(reviewSort){reviewSort.value=moduleState.reviewView.sort;reviewSort.addEventListener("change",()=>{moduleState.reviewView.sort=reviewSort.value;moduleContent.innerHTML=renderReviewQueue();bindModuleActions();});}
    $$(".template-library-card",moduleContent).forEach(card=>card.addEventListener("click",()=>openTemplateDetail(card.dataset.templateId)));
    $$(".script-library-card",moduleContent).forEach(card=>card.addEventListener("click",()=>openScriptDetail(card.dataset.scriptKey)));
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
  function setWizardRonStructuredFields(form) {
    const signerHost=$("#adminRonSignerFields",form),actHost=$("#adminRonActFields",form),witnessHost=$("#adminRonWitnessFields",form);if(!signerHost||!actHost||!witnessHost)return;
    const signerCount=Math.min(10,Math.max(1,wizardNumber(form,"ron_signer_count",1))),actCount=Math.max(1,wizardNumber(form,"ron_notarization_count",1));
    if(Number(signerHost.dataset.count)!==signerCount){signerHost.dataset.count=String(signerCount);signerHost.innerHTML=`<h3>Structured signers</h3>${Array.from({length:signerCount},(_,index)=>`<fieldset><legend>Signer ${index+1} legal ID name</legend><div class="admin-v3-form-grid"><label>First name<input name="ron_signer_first_${index}" required></label><label>Middle name (optional)<input name="ron_signer_middle_${index}"></label><label>Last name<input name="ron_signer_last_${index}" required></label><label>Individual email<input name="ron_signer_email_${index}" type="email" required></label><label>Phone<input name="ron_signer_phone_${index}" type="tel"></label></div></fieldset>`).join("")}`;}
    if(Number(actHost.dataset.count)!==actCount){actHost.dataset.count=String(actCount);actHost.innerHTML=`<h3>Requested notarial acts</h3>${Array.from({length:actCount},(_,index)=>`<label>Act ${index+1}<select name="ron_act_type_${index}" required><option value="acknowledgment">Acknowledgment</option><option value="jurat">Jurat / verification on oath</option><option value="signature_witnessing">Signature witnessing</option><option value="certified_copy">Certified copy (when permitted)</option><option value="unsure">I’m not sure</option></select></label>`).join("")}`;}
    const allocation=wizardWitnessAllocation(form,"ron"),witnessCount=wizardValue(form,"ron_witness_need")==="yes"?allocation.customer:0;
    if(Number(witnessHost.dataset.count)!==witnessCount){witnessHost.dataset.count=String(witnessCount);witnessHost.innerHTML=witnessCount?`<h3>Customer-provided witnesses</h3>${Array.from({length:witnessCount},(_,index)=>`<div class="admin-v3-form-grid"><label>Witness ${index+1} legal name<input name="ron_witness_name_${index}" required></label><label>Witness ${index+1} email<input name="ron_witness_email_${index}" type="email"></label><label>Witness ${index+1} phone<input name="ron_witness_phone_${index}" type="tel"></label></div>`).join("")}`:"";}
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
    setWizardRonStructuredFields(form);
    form.addEventListener("submit", createAdminRequest);
    form.elements.existing_customer_id?.addEventListener("change", () => selectExistingWizardCustomer(form));
    form.elements.service_type.forEach((control) => control.addEventListener("change", () => { setWizardService(form); setWizardWitnessFields(form); }));
    form.addEventListener("input", () => { setWizardRonStructuredFields(form); updateWizardEstimate(form); });
    form.addEventListener("change", (event) => { if (event.target.name?.endsWith("_witness_need")) setWizardWitnessFields(form); setWizardRonStructuredFields(form); updateWizardEstimate(form); });
    $("#adminWizardNext", form).addEventListener("click", () => { if (validateWizardStep(form)) showWizardStep(form, moduleState.newOrderStep + 1, true); });
    $("#adminWizardPrevious", form).addEventListener("click", () => showWizardStep(form, moduleState.newOrderStep - 1));
    $$('[data-wizard-jump]', form).forEach((button) => button.addEventListener("click", () => { const target = Number(button.dataset.wizardJump); if (target <= moduleState.newOrderMaxStep) showWizardStep(form, target); }));
  }
  async function adminFilePayload(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return { name:file.name,type:file.type||"application/octet-stream",size:file.size,category:"admin-intake",base64:btoa(binary) };
  }
  async function createAdminRequest(event) {
    event.preventDefault(); const form=event.currentTarget; const status=$("#adminCreateRequestStatus"); const submit=$("#adminWizardCreate", form);
    if (!validateWizardStep(form)) return;
    submit.disabled=true; status.textContent="Creating request…";
    try {
      const service = wizardService(form);
      const { normalizePersonInput, normalizeState, normalizeZip, collapseWhitespace } = await import("./aps-data-standard.mjs");
      const customerId = wizardValue(form, "existing_customer_id");
      const customerPayload = { ...normalizePersonInput({first_name:wizardValue(form,"first_name"),last_name:wizardValue(form,"last_name"),email:wizardValue(form,"email"),phone:wizardValue(form,"phone")}),preferred_contact:wizardValue(form,"preferred_contact")||"email",customer_id:customerId||null };
      const estimate = wizardEstimate(form);
      const appointmentDate = wizardValue(form, "appointment_date");
      const appointmentTime = wizardValue(form, "appointment_time");
      const requestPayload={service_type:service,status:"under_review",workflow_status:"under_review",preferred_date:wizardValue(form,"preferred_date")||null,preferred_time_window:wizardValue(form,"preferred_time_window")||null,notes:wizardValue(form,"notes")||"Created by administrator.",estimated_total:estimate.total,request_source:"admin",request_completeness:"submitted",document_state:"pending",participant_state:"submitted",fulfillment_state:"not_started",customer_reported_source:wizardValue(form,"customer_reported_source")||null,customer_reported_source_detail:wizardValue(form,"customer_reported_source_detail")||null,first_touch_source:wizardValue(form,"customer_reported_source")||"admin_entered",appointment_date:appointmentDate||null,appointment_time:appointmentTime||null,appointment_timezone:(appointmentDate||appointmentTime)?wizardValue(form,"appointment_timezone")||"America/Chicago":null,appointment_location:service==="mobile"?collapseWhitespace(wizardValue(form,"appointment_location"))||null:null,appointment_link:service==="ron"?wizardValue(form,"appointment_link")||null:null,appointment_platform:service==="ron"?wizardValue(form,"ron_platform")||null:null,appointment_instructions:wizardValue(form,"appointment_instructions")||null};
      let serviceDetail={},participants=[],notarialActs=[];
      if (service === "ron") {
        const witnesses = wizardWitnessAllocation(form, "ron");
        const rawWitnessCount = wizardValue(form, "ron_witness_count");
        serviceDetail={document_type:wizardValue(form,"document_type")||null,number_of_signers:wizardNumber(form,"ron_signer_count",1),number_of_notarizations:wizardNumber(form,"ron_notarization_count",1),ron_platform:wizardValue(form,"ron_platform")||null,tech_ready:wizardChecked(form,"ron_tech_ready"),valid_id_confirmed:wizardChecked(form,"ron_valid_id"),consent_to_recording:wizardChecked(form,"ron_recording_consent"),witness_need:wizardValue(form,"ron_witness_need")||"no",witness_count:rawWitnessCount==="not_sure"?null:witnesses.total,witness_provider:wizardValue(form,"ron_witness_provider")||null,client_witness_count:witnesses.customer,provided_witness_count:witnesses.aps,witness_review_required:wizardValue(form,"ron_witness_need")==="not_sure"||wizardValue(form,"ron_witness_provider")==="not_sure"||rawWitnessCount==="not_sure"};
        const signerCount=Math.min(10,Math.max(1,wizardNumber(form,"ron_signer_count",1)));
        participants=Array.from({length:signerCount},(_,index)=>{const first=wizardValue(form,`ron_signer_first_${index}`),middle=wizardValue(form,`ron_signer_middle_${index}`),last=wizardValue(form,`ron_signer_last_${index}`);return {participant_type:"signer",first_name:first,middle_name:middle||null,last_name:last,full_legal_name:[first,middle,last].filter(Boolean).join(" "),email:wizardValue(form,`ron_signer_email_${index}`).toLowerCase(),mobile_phone:wizardValue(form,`ron_signer_phone_${index}`)||null,identity_name_confirmed:true,sort_order:index};});
        for(let index=0;index<witnesses.customer;index++)participants.push({participant_type:"witness",full_legal_name:wizardValue(form,`ron_witness_name_${index}`),email:wizardValue(form,`ron_witness_email_${index}`).toLowerCase()||null,mobile_phone:wizardValue(form,`ron_witness_phone_${index}`)||null,identity_name_confirmed:Boolean(wizardValue(form,`ron_witness_name_${index}`)),sort_order:signerCount+index});
        const actCount=Math.max(1,wizardNumber(form,"ron_notarization_count",1));
        notarialActs=Array.from({length:actCount},(_,index)=>({act_type:wizardValue(form,`ron_act_type_${index}`)||"unsure"}));
      }
      if (service === "mobile") {
        const witnesses = wizardWitnessAllocation(form, "mobile");
        const rawWitnessCount = wizardValue(form, "mobile_witness_count");
        const witnessNeed = wizardValue(form, "mobile_witness_need")||"no";
        serviceDetail={street_address:collapseWhitespace(wizardValue(form,"mobile_street"))||null,unit:collapseWhitespace(wizardValue(form,"mobile_unit"))||null,city:collapseWhitespace(wizardValue(form,"mobile_city"))||null,state:normalizeState(wizardValue(form,"mobile_state")||"TX"),zip:normalizeZip(wizardValue(form,"mobile_zip"))||null,number_of_signers:wizardNumber(form,"mobile_signer_count",1),number_of_notarizations:wizardNumber(form,"mobile_notarization_count",1),witnesses_needed:witnessNeed==="yes",witness_need:witnessNeed,witness_count:rawWitnessCount==="not_sure"?null:witnesses.total,witness_provider:wizardValue(form,"mobile_witness_provider")||null,client_witness_count:witnesses.customer,provided_witness_count:witnesses.aps,witness_review_required:witnessNeed==="not_sure"||wizardValue(form,"mobile_witness_provider")==="not_sure"||rawWitnessCount==="not_sure",print_add_on:false,scan_back_needed:false,scan_to_pdf_needed:false,travel_miles:wizardNumber(form,"mobile_travel_miles")||null,travel_fee:(window.ALIGNED_PRICING?.mobile?.appointmentBase||50),dispatch_payment_required:(window.ALIGNED_PRICING?.mobile?.appointmentBase||50)};
      }
      if (service === "print") {
        const pages = wizardNumber(form,"print_pages"); const copies = Math.max(1,wizardNumber(form,"print_copies",1)); const totalPages = pages*copies; const isColor=wizardValue(form,"print_color")==="color"; const fulfillment=wizardValue(form,"print_fulfillment")||"pickup"; const printTotal=wizardPrintCost(form);
        serviceDetail={fulfillment_type:fulfillment,delivery_address:wizardValue(form,"print_delivery_address")||null,black_white_pages:isColor?0:totalPages,color_pages:isColor?totalPages:0,paper_size:wizardValue(form,"print_paper_size")||null,print_sides:wizardValue(form,"print_sides")||null,paper_type:wizardValue(form,"print_paper_type")||null,scan_pages:wizardNumber(form,"print_scan_pages"),delivery_fee:fulfillment==="courier"?(window.ALIGNED_PRICING?.documentServices?.courierBase||20):0,print_total:printTotal,courier_requested:fulfillment==="courier",mobile_document_service_requested:fulfillment==="mobile-service",courier_fee:fulfillment==="courier"?(window.ALIGNED_PRICING?.documentServices?.courierBase||20):0,mobile_document_service_fee:fulfillment==="mobile-service"?(window.ALIGNED_PRICING?.documentServices?.mobileDocumentBase||20):0,copy_pages:totalPages};
      }
      const files=await Promise.all(Array.from(form.elements.order_documents?.files||[]).map(adminFilePayload));
      const {data:resolution,error:requestError}=await adminClient.functions.invoke("public-request-submit",{body:{admin_request:true,customer:customerPayload,request:requestPayload,service_detail:serviceDetail,participants,notarial_acts:notarialActs,files}});
      if(requestError||!resolution?.request_id)throw new Error(resolution?.error||requestError?.message||"The request could not be created.");
      const request={id:resolution.request_id};
      if(wizardValue(form,"email")){const reference=`APS-${request.id.slice(0,8).toUpperCase()}`;const {error:messageError}=await adminClient.functions.invoke("send-request-email",{body:{request_id:request.id,reference_number:reference,email:wizardValue(form,"email"),first_name:wizardValue(form,"first_name"),last_name:wizardValue(form,"last_name")}});if(messageError)console.warn("Admin-created request acknowledgment failed",messageError);}
      const calendarDate=moduleState.newOrderCalendarDate;
      status.textContent="Request created successfully."; await loadRequests();
      if(calendarDate){moduleState.newOrderCalendarDate=null;moduleState.calendarSelectedDate=calendarDate;const selected=dateFromKey(calendarDate);if(selected)moduleState.calendarMonth=new Date(selected.getFullYear(),selected.getMonth(),1,12);showAdminView("calendar");}else{openRequestFromModule(request.id);}
    } catch(error) {status.textContent=`Could not create request: ${error.message||error}`;} finally {submit.disabled=false;}
  }
  async function loadCommunicationData(view) {
    if(view==="sessions") {
      ronTools ||= await import("./ron-session-state.mjs");
      moduleState.ronError="";
      const {data,error}=await adminClient.functions.invoke("proof-admin-transaction",{body:{command:"get_session_inventory"}});
      if(error||!data?.ok){moduleState.ronInventory=null;moduleState.ronError=data?.error?.message||data?.error||error?.message||"Synchronized RON state could not be loaded.";}
      else moduleState.ronInventory=data;
    }
    if(view==="review") {
      const {data}=await adminClient.from("review_queue_items").select("id,service_request_id,blocker_key,title,detail,target_tab,state,created_at").eq("state","open").order("created_at",{ascending:true});
      moduleState.reviewItems=data||[];
    }
    if(view==="messages") {
      const {data}=await adminClient.from("messages").select("id,service_request_id,recipient,subject,delivery_state,sent_at,created_at").order("created_at",{ascending:false}).limit(200);
      moduleState.messages=data||[];
    }
    if(view==="templates") {
      const {data}=await adminClient.from("message_templates").select("*").eq("active",true).order("name");
      moduleState.templates=data||[];
    }
    if(view==="invoices"||view==="payments") {
      financialTools ||= await import("./admin-financial-view.mjs");
      const [invoiceResult,paymentResult]=await Promise.all([
        adminClient.from("invoices").select("id,service_request_id,invoice_number,invoice_type,status,payment_status,amount_due,amount_paid,paid_amount,balance_due,created_at,updated_at,paid_at,due_at").order("created_at",{ascending:false}),
        adminClient.from("request_payments").select("id,service_request_id,invoice_id,payment_stage,amount,is_test,received_at,created_at").order("received_at",{ascending:false}),
      ]);
      moduleState.invoices=invoiceResult.data||[]; moduleState.payments=paymentResult.data||[];
      moduleState.financialView={search:"",state:"all",service:"all",from:"",to:"",sortKey:"date",sortDirection:"desc"};
    }
  }
  async function showAdminView(view) {
    moduleState.activeView=view;
    const isRequests=view==="requests";
    appView.hidden=!isRequests; moduleView.hidden=isRequests;
    if(!isRequests){const labels=moduleTitles[view]||moduleTitles.dashboard;$("#moduleEyebrow").textContent=labels[0];$("#moduleTitle").textContent=labels[1];$("#moduleSubtitle").textContent=labels[2];moduleContent.innerHTML='<div class="admin-v3-module-card"><p>Loading…</p></div>';await loadCommunicationData(view);if(moduleState.activeView!==view)return;moduleContent.innerHTML=view==="scripts"?await renderScripts():renderModule(view);if(view==="sessions")moduleContent.insertAdjacentHTML("afterbegin",ronProofDashboardLink());bindModuleActions();}
    $("#adminSidebar")?.classList.remove("is-open");
    $("#adminMenuButton")?.setAttribute("aria-expanded","false");
    $$('[data-admin-view]').forEach(link=>link.classList.toggle("is-active",(view==="dashboard"&&link.textContent.includes("Dashboard"))||link.dataset.adminView===view));
    window.APSAdminInteractions?.syncViewHash(view);
    window.scrollTo({top:0,behavior:"auto"});
  }
  window.addEventListener("aps:requests-loading",()=>{moduleState.requestsState="loading";moduleState.requestsError="";if(moduleState.activeView==="calendar")refreshCalendarView();});
  window.addEventListener("aps:requests-error",event=>{moduleState.requestsState="error";moduleState.requestsError=event.detail?.message||"Requests could not be loaded.";if(moduleState.activeView==="calendar")refreshCalendarView();});
  window.addEventListener("aps:requests-loaded",event=>{moduleState.requests=event.detail.requests||[];moduleState.requestsState="ready";moduleState.requestsError="";if(moduleState.activeView!=="requests")showAdminView(moduleState.activeView);});
  window.addEventListener("aps:support-loaded",event=>{moduleState.supportTickets=event.detail.supportTickets||[];if(moduleState.activeView==="support")showAdminView("support");});
  $("#returnToRequests")?.addEventListener("click",()=>showAdminView("requests"));
  $("#newRequestButton")?.replaceWith($("#newRequestButton").cloneNode(true));
  $("#newRequestButton")?.addEventListener("click",()=>{moduleState.newOrderCalendarDate=null;showAdminView("new");});
  window.APSAdminInteractions?.bindAdminNavigation($("#adminSidebar"), showAdminView);
  window.addEventListener("hashchange",()=>{const view=String(window.location.hash||"").replace(/^#/,"");if((moduleTitles[view]||view==="requests")&&view!==moduleState.activeView)showAdminView(view);});

  /** Public bridge used by admin.js after it resolves a selected request. */
  window.AdminV3 = {
    syncSelectedRequest,
    organizeRequestDetail,
    activateTab,
    filterVisibleRequestCards,
    showAdminView,
    openRequestFromModule,
    calendarIcs,
    googleCalendarUrl,
    syncRequestCount,
    calendarIcsForRequest: (id) => {
      const request=moduleState.requests.find(item=>item.id===id);
      return request?calendarIcs(request):"";
    },
    googleCalendarUrlForRequest: (id) => {
      const request=moduleState.requests.find(item=>item.id===id);
      return request?googleCalendarUrl(request):"";
    },
  };
  const initialView=String(window.location.hash||"").replace(/^#/,"");
  if(moduleTitles[initialView]||initialView==="requests")showAdminView(initialView);
})();
