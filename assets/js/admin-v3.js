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
        $$('[data-quick-filter]').forEach((item) =>
          item.classList.toggle("is-active", item === button),
        );
        window.APSAdminRequestFilters?.setQuickFilter(
          button.dataset.quickFilter || "all",
        );
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
    templateView: { search:"", category:"all", service:"all" },
    templateSpecifications: {},
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
    travelOrigins: [],
    travelConfigured: false,
    businessFoundation: { organizations:[], applications:[], members:[], locations:[], activities:[], staff:[], staff_activity:[] },
    resources: { articles:[],categories:[],assets:[],feedback:[],helpfulness:[],views:[],tab:"articles" },
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
    "loan-signings": ["Operations", "Loan Signings", "Manage assignment intake, packages, pricing, appointments, scanbacks, and authorized return requirements."],
    invoices: ["Financial", "Invoices", "Request-level invoice status and outstanding balances."],
    payments: ["Financial", "Payments", "Paid-to-date and remaining balance visibility."],
    customers: ["Clients", "Customers", "Canonical customer profiles and complete APS request history."],
    organizations: ["Clients", "Organizations", "Business account profiles, users, locations, policies, and activity."],
    "business-applications": ["Clients", "Business Applications", "Review and approve business account applications without granting requested credit terms automatically."],
    messages: ["Communications", "Messages", "Cross-order customer communication and delivery history."],
    templates: ["Communications", "Templates", "Master APS branded communication templates."],
    scripts: ["Communications", "Scripts", "Admin-only operator scripts, stop guidance, and service checklists."],
    support: ["Support", "Support Tickets", "Current customer support workload."],
    settings: ["System", "Settings", "Portal configuration and integration status."],
    "staff-access": ["System", "Staff & Access", "Secure APS staff invitations, roles, permissions, and access status."],
    resources: ["Website", "Resource Center", "Manage published guidance, private questions, helpfulness, and article analytics."],
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
  function renderLoanSignings() {
    const rows = activeRequests().filter((request) => request.service_type === "loan_signing");
    const enrichmentFailures = rows.filter((request) => request.loan_signing_enrichment_error).length;
    const assignment = (request) => Array.isArray(request.loan_signing_assignments)
      ? request.loan_signing_assignments[0]
      : request.loan_signing_assignments;
    const indicators=request=>{const d=assignment(request)||{},items=[];if(!d.instructions_reviewed_at)items.push("Instructions Review Needed");if(["not_provided","awaiting_package"].includes(d.package_status))items.push("Package Missing");if(d.printing_required===true&&d.print_qc_status!=="passed")items.push("Print QC Needed");if(d.signer_confirmation_required&&d.signer_confirmation_status!=="confirmed")items.push("Signer Confirmation Needed");if(d.scanbacks_required==="yes"&&!["post_signing_requirements","return","completed"].includes(d.lsa_stage))items.push("Scanbacks Required");if(d.approval_before_return_required==="yes"&&d.lsa_stage==="return")items.push("Approval Pending");if(d.physical_return_required==="yes"&&d.lsa_stage==="return")items.push("Return Due");if(d.scope_review_required)items.push("Completion Blocked");const exceptionLabels={cancelled:"Cancellation Review",no_sign:"No Sign",partial_incomplete:"Partial Signing",resign_required:"Resign Required",excessive_wait_review:"Wait Review"};if(exceptionLabels[d.exception_attention_state])items.push(exceptionLabels[d.exception_attention_state]);if(d.exception_financial_state==="refund_due")items.push("Refund Due");if(d.exception_financial_state==="additional_amount_due")items.push("Additional Amount Due");if(d.exception_financial_state==="communication_needed")items.push("Exception Unresolved");return items};
    const attention=rows.filter(request=>indicators(request).length).length;
    const filters=["Instructions Review","Awaiting Package","Package Preparation","Print QC","Ready for Appointment","Signing Today","Post-Signing","Scanbacks","Approval Pending","Return Pending","Tracking Missing","Completion Blocked","Cancellation Review","No Sign","Partial Signing","Resign Required","Wait Review","Refund Due","Additional Amount Due","Exception Resolved","Completed"];
    return `${enrichmentFailures?'<div class="admin-v3-module-card admin-v3-calendar-state" role="alert"><h2>Some Loan Signing details could not be loaded</h2><p>Core requests remain available. Retry after refreshing the authenticated session.</p></div>':''}<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Active assignments</span><strong>${rows.length}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Needs attention</span><strong>${attention}</strong></article></div><section class="admin-v3-financial-controls" aria-label="Loan Signing filters"><label><span>Operational filter</span><select id="loanSigningFilter"><option value="all">All assignments</option>${filters.map(value=>`<option value="${safe(value.toLowerCase().replaceAll(" ","_"))}">${safe(value)}</option>`).join("")}</select></label></section>${table(rows,[{label:"Assignment",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Customer",render:r=>{const c=getCustomer(r)||{};return safe(`${c.first_name||""} ${c.last_name||""}`.trim()||"Client");}},{label:"Signing",render:r=>safe(labelFromStatus((assignment(r)||{}).signing_type||"Needs review"))},{label:"Stage",render:r=>safe(labelFromStatus((assignment(r)||{}).lsa_stage||"Assignment received"))},{label:"Attention",render:r=>safe(indicators(r).join(" · ")||"Ready")},{label:"Package",render:r=>safe(labelFromStatus((assignment(r)||{}).package_status||"Not provided"))}])}`;
  }
  function requestBlockers(request) {
    const blockers=[];
    const terminal=[request.status,request.workflow_status].some(value=>["completed","cancelled","declined","refunded"].includes(String(value||"").toLowerCase()));
    if(terminal)return blockers;
    if(["pending","re_review_required"].includes(request.document_state)) blockers.push({title:request.document_state==="re_review_required"?"Document re-review required":"Document pending",tab:"documents",priority:request.document_state==="re_review_required"?"action":"waiting"});
    if(["ron","mobile"].includes(request.service_type)){
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
    const conversations=moduleState.conversations||[],threadMessages=moduleState.conversationMessages||[];
    return `<section class="admin-v3-module-card"><p class="small-label">General / Business Correspondence</p><h2>Compose APS Email</h2><p>Send branded professional correspondence without creating an order.</p><form id="generalCorrespondenceForm"><div class="admin-detail-grid"><label>To<input name="to" type="email" required></label><label>Subject<input name="subject" required maxlength="300"></label><label class="wide">Message<textarea name="message" required rows="8"></textarea></label></div><button class="admin-v3-button admin-v3-button--navy" type="submit">Send Email</button><p data-message-status role="status"></p></form></section>${conversations.map(conversation=>`<article class="admin-v3-module-card"><header><h3>${safe(conversation.subject)}</h3><p>${safe(conversation.contact_email)} · ${conversation.service_request_id?`Request ${safe(`APS-${conversation.service_request_id.slice(0,8).toUpperCase()}`)}`:"General correspondence"} · ${conversation.unread_count?`${conversation.unread_count} unread`:"Up to date"}</p></header><ol class="communication-thread">${threadMessages.filter(message=>message.conversation_id===conversation.id).map(message=>`<li class="message-${safe(message.direction)}"><strong>${message.direction==="inbound"?"Customer → APS":"APS → Customer"}</strong><small>${safe(new Date(message.received_at||message.sent_at||message.created_at).toLocaleString())} · ${safe(labelFromStatus(message.delivery_state))}</small><p>${safe(message.rendered_text||"")}</p></li>`).join("")}</ol><form class="conversationReplyForm" data-conversation-id="${safe(conversation.id)}"><input name="to" type="hidden" value="${safe(conversation.contact_email)}"><input name="subject" type="hidden" value="${safe(conversation.subject)}"><label>Reply<textarea name="message" required rows="4"></textarea></label><button class="admin-v3-button admin-v3-button--outline">Reply</button></form></article>`).join("")||'<div class="admin-v3-module-card admin-v3-empty-module"><h3>No conversations yet</h3><p>Compose the first general APS email above.</p></div>'}`;
  }
  function renderTemplates() {
    if(!moduleState.templates.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No templates loaded</h3><p>Apply the workflow migration to register the complete APS template library.</p></div>';
    const categories=[...new Set(moduleState.templates.map(templateCategory))].sort(),services=["ron","mobile","print","loan_signing","business"];
    const rows=moduleState.templates.filter(template=>{const spec=moduleState.templateSpecifications[template.template_key]||{},service=templateService(template),haystack=`${template.template_key} ${template.name} ${template.description||""} ${spec.purpose||""} ${spec.trigger||""} ${service} ${template.associated_status||""}`.toLowerCase();return(!moduleState.templateView.search||haystack.includes(moduleState.templateView.search.toLowerCase()))&&(moduleState.templateView.category==="all"||templateCategory(template)===moduleState.templateView.category)&&(moduleState.templateView.service==="all"||service===moduleState.templateView.service);});
    const groups=new Map(); rows.forEach(template=>{const family=templateCategory(template);if(!groups.has(family))groups.set(family,[]);groups.get(family).push(template);});
    const controls=`<section class="admin-v3-financial-controls" aria-label="Template search and filters"><label><span>Search</span><input id="templateSearch" type="search" value="${safe(moduleState.templateView.search)}" placeholder="Title, key, or purpose"></label><label><span>Category</span><select id="templateCategory"><option value="all">All categories</option>${categories.map(value=>`<option value="${safe(value)}" ${moduleState.templateView.category===value?"selected":""}>${safe(value)}</option>`).join("")}</select></label><label><span>Service</span><select id="templateService"><option value="all">All services</option>${services.map(value=>`<option value="${value}" ${moduleState.templateView.service===value?"selected":""}>${safe(labelFromStatus(value))}</option>`).join("")}</select></label></section>`;
    return controls+([...groups].map(([family,templates])=>`<section class="reference-group"><header><p class="small-label">${safe(family)}</p><h2>${safe(family)} templates</h2></header><div class="admin-v3-module-grid">${templates.map(template=>`<button class="admin-v3-module-card template-library-card" data-template-id="${safe(template.id)}" type="button"><p class="small-label">${safe(template.associated_status?labelFromStatus(template.associated_status):family)}</p><h3>${safe(template.name)}</h3><p>${safe(template.description||"")}</p><p><strong>Required attachment:</strong> ${safe(template.required_attachment_type?labelFromStatus(template.required_attachment_type):"None")}</p><span class="template-card-action">View specification &amp; full preview →</span></button>`).join("")}</div></section>`).join("")||'<div class="admin-v3-module-card"><p>No templates match these filters.</p></div>');
  }
  function templateCategory(template){const key=template.template_key||"";if(key.startsWith("lsa_"))return "Loan Signing";if(key.includes("cancel")||key.includes("refund")||key.includes("retained")||key.includes("reschedul"))return "Cancellation / Refund";if(key.includes("quote"))return "Quote & Approval";if(key.includes("payment")||key.includes("invoice"))return "Payments & Billing";if(key.includes("appointment"))return "Appointments";if(key.includes("ron"))return "RON";if(key.includes("mobile"))return "Mobile Notary";if(key.includes("document")||key.includes("scan"))return "Documents & Delivery";if(key.includes("business"))return "Business Accounts";if(key.includes("request")||key.includes("review"))return "Request & Review";if(key.includes("security")||key.includes("account"))return "Account / Security";return "System / Other";}
  function templateService(template){const key=String(template.template_key||"");if(key.startsWith("lsa_"))return "loan_signing";if(key.includes("ron"))return "ron";if(key.includes("mobile"))return "mobile";if(key.includes("print")||key.includes("scan"))return "print";if(key.includes("business"))return "business";return "all";}
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
  const serviceLabels = { ron: "Remote Online Notary", mobile: "Mobile Notary", print: "Print & Scan", loan_signing: "Loan Signing" };
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
            <label><input type="radio" name="service_type" value="loan_signing" required><span><strong>Loan Signing</strong><small>Structured closing-package assignment intake.</small></span></label>
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
            <div id="adminMobileSignerFields" class="wide"></div>
            <div id="adminMobileActFields" class="wide"></div>
            ${field("Are witnesses needed?", "mobile_witness_need", '<select name="mobile_witness_need"><option value="no">No</option><option value="yes">Yes</option><option value="not_sure">Not sure</option></select>')}
            ${field("Witness count", "mobile_witness_count", '<select name="mobile_witness_count"><option value="0">None</option><option value="1">1</option><option value="2">2</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Witness provider", "mobile_witness_provider", '<select name="mobile_witness_provider"><option value="client">Customer</option><option value="aligned">APS</option><option value="shared">Shared</option><option value="not_sure">Not sure</option></select>', "admin-v3-witness-field")}
            ${field("Customer-provided witnesses", "mobile_client_witness_count", '<input name="mobile_client_witness_count" type="number" min="0" value="0">', "admin-v3-witness-field")}
            <div id="adminMobileWitnessFields" class="wide admin-v3-witness-field"></div>
            ${field("Add print preparation", "mobile_print_addon", '<input name="mobile_print_addon" type="checkbox" class="admin-v3-check">')}
            ${field("Add scan-to-PDF support", "mobile_scan_addon", '<input name="mobile_scan_addon" type="checkbox" class="admin-v3-check">')}
            ${field("Print pages", "mobile_pages", '<input name="mobile_pages" type="number" min="0" value="0">', "admin-v3-mobile-print-field")}
            ${field("Copies", "mobile_copies", '<input name="mobile_copies" type="number" min="1" value="1">', "admin-v3-mobile-print-field")}
            ${field("Print color", "mobile_color", '<select name="mobile_color"><option value="bw">Black &amp; white</option><option value="color">Color</option></select>', "admin-v3-mobile-print-field")}
            ${field("Print sides", "mobile_sides", '<select name="mobile_sides"><option value="single">Single-sided</option><option value="double">Double-sided</option></select>', "admin-v3-mobile-print-field")}
            ${field("Paper size", "mobile_paper_size", '<select name="mobile_paper_size"><option value="letter">Letter</option><option value="legal">Legal</option></select>', "admin-v3-mobile-print-field")}
            ${field("Paper type", "mobile_paper_type", '<select name="mobile_paper_type"><option value="standard">Standard</option><option value="resume">Résumé</option><option value="cardstock">Cardstock</option><option value="color-paper">Color paper</option></select>', "admin-v3-mobile-print-field")}
            ${field("Approximate scan pages", "mobile_scan_pages", '<input name="mobile_scan_pages" type="number" min="0" value="0">', "admin-v3-mobile-scan-field")}
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
          <div class="admin-v3-service-fields" data-service-fields="loan_signing" hidden><div class="admin-v3-form-grid">
            ${field("Signing type", "lsa_signing_type", '<select name="lsa_signing_type" required><option value="buyer_purchase">Buyer / Purchase</option><option value="seller">Seller</option><option value="refinance">Refinance</option><option value="heloc">HELOC</option><option value="loan_modification">Loan Modification / Small Package</option><option value="reverse_mortgage">Reverse Mortgage</option><option value="commercial">Commercial / Complex</option><option value="other_custom">Other / Custom</option></select>')}
            ${field("Signing method", "lsa_signing_method", '<select name="lsa_signing_method" required><option value="in_person_mobile">Mobile / Physical Location</option><option value="ron">Remote Online (subject to eligibility)</option><option value="either_tbd">Either / To Be Determined</option></select>')}
            ${field("Ordering party", "lsa_ordering_party_name", '<input name="lsa_ordering_party_name">')}
            ${field("Company file / order number", "lsa_company_file_number", '<input name="lsa_company_file_number">')}
            ${field("Escrow / transaction number", "lsa_escrow_number", '<input name="lsa_escrow_number">')}
            ${field("Signer count", "lsa_signer_count", '<input name="lsa_signer_count" type="number" min="1" max="10" value="1" required>')}
            <div id="adminLoanSigningSignerFields" class="wide"></div>
            ${field("Property address", "lsa_property_address", '<input name="lsa_property_address">', "wide")}
            ${field("Signing address", "lsa_signing_address", '<input name="lsa_signing_address">', "wide")}
            ${field("Package status", "lsa_package_status", '<select name="lsa_package_status"><option value="not_provided">Not provided</option><option value="awaiting_package">Awaiting package</option><option value="package_received">Package received</option><option value="replacement_received">Replacement received</option><option value="package_ready">Package ready</option></select>')}
            ${field("Return method", "lsa_return_method", '<select name="lsa_return_method"><option value="">To be determined</option><option value="prepaid_carrier_label">Prepaid carrier label</option><option value="fedex">FedEx</option><option value="ups">UPS</option><option value="usps">USPS</option><option value="direct_title_escrow">Direct title / escrow</option><option value="other_authorized">Other authorized return</option></select>')}
            ${field("Stipulations", "lsa_stipulations", '<textarea name="lsa_stipulations" rows="4"></textarea>', "wide")}
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
            ${field("Fulfillment method", "print_fulfillment", '<select name="print_fulfillment"><option value="courier">Courier delivery</option><option value="mobile-service">Mobile document service</option><option value="mobile-notary">Mobile notary add-on</option></select>', "admin-v3-print-schedule")}
            ${field("Appointment / fulfillment instructions", "appointment_instructions", '<textarea name="appointment_instructions" rows="4" placeholder="Access details, timing, or fulfillment instructions."></textarea>', "wide")}
          </div>
        </section>
        <section class="admin-v3-wizard-step" data-wizard-step="4" aria-labelledby="wizardPricingHeading" hidden>
          <div class="admin-v3-wizard-heading"><span>Step 5 of 6</span><h2 id="wizardPricingHeading">Pricing &amp; Documents</h2><p>Review the APS estimate and attach any documents supplied with the order.</p></div>
          <div class="admin-v3-wizard-pricing-grid">
            <article class="admin-v3-quote-summary"><span>Estimated quote</span><strong id="adminWizardEstimate">$0.00</strong><div id="adminWizardLineItems"></div><small>This estimate uses the existing APS pricing configuration. Invoices are created separately in Payments.</small></article>
            <div class="admin-v3-document-control">${field("Order documents (optional)", "order_documents", '<input name="order_documents" type="file" multiple>')}<p>Documents will be stored with this request when the order is created.</p></div>
          </div>
          ${field("If no document is attached", "document_upload_exception_reason", '<select name="document_upload_exception_reason"><option value="">Document attached / not applicable</option><option value="customer_will_upload_later">Customer will upload later</option><option value="document_not_available_yet">Document is not available yet</option><option value="physical_original_at_appointment">Physical original will be provided at appointment</option><option value="no_document_required">No document is required for this service</option></select>', "admin-v3-wizard-notes")}
          ${field("No-document detail", "document_upload_exception_detail", '<input name="document_upload_exception_detail" maxlength="240" placeholder="Optional clarification">', "admin-v3-wizard-notes")}
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
    if(view==="loan-signings") return renderLoanSignings();
    if(view==="new") return renderNewRequest();
    if(view==="invoices"||view==="payments") return renderFinancial(view);
    if(view==="customers") return renderCustomerMergeButton()+renderCustomers();
    if(view==="organizations") return renderOrganizations();
    if(view==="business-applications") return renderBusinessApplications();
    if(view==="staff-access") return (renderOperators()+renderOperatorProfileEditors()).replace(/href="\/([a-z][a-z0-9-]+)"/g,'href="/professionals/$1"');
    if(view==="messages") return renderMessages();
    if(view==="templates") return renderTemplates();
    if(view==="scripts") return '<div class="admin-v3-module-card"><p>Loading operator reference…</p></div>';
    if(view==="resources") return renderResources();
    if(view==="support") {const tickets=moduleState.supportTickets;return `<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Open tickets</span><strong>${tickets.length}</strong></article></div><div class="admin-v3-module-card"><h2>Support workspace</h2><p>Open the request workspace to use the full support controls already connected to Supabase.</p><button class="admin-v3-button admin-v3-button--navy" id="openLegacySupport" type="button">Open support controls</button></div>`;}
    if(view==="settings") return renderSettings();
    return renderDashboard();
  }
  async function resourceCommand(command,payload={}){const {data,error}=await adminClient.functions.invoke("admin-resource-center",{body:{command,...payload}});if(error||data?.error)throw new Error(data?.error||error?.message||"Resource action failed.");return data;}
  function renderResources(){const r=moduleState.resources,tab=r.tab;const tabs=`<nav class="admin-v3-workspace-tabs"><button data-resource-admin-tab="articles" class="${tab==='articles'?'is-active':''}">Articles</button><button data-resource-admin-tab="feedback" class="${tab==='feedback'?'is-active':''}">Feedback</button><button data-resource-admin-tab="analytics" class="${tab==='analytics'?'is-active':''}">Analytics</button></nav>`;
    if(tab==='feedback')return `${tabs}<div class="admin-v3-module-card admin-v3-table-wrap"><div class="status-actions"><button class="admin-v3-button admin-v3-button--outline resourceBulk" data-status="read">Mark selected read</button><button class="admin-v3-button admin-v3-button--outline resourceBulk" data-status="resolved">Resolve selected</button><button class="admin-v3-button admin-v3-button--outline resourceBulk" data-status="archive">Archive selected</button></div><table class="admin-v3-table"><thead><tr><th></th><th>Article / sender</th><th>Private message</th><th>Status</th><th>Actions</th></tr></thead><tbody>${r.feedback.map(f=>`<tr><td><input type="checkbox" data-feedback-select value="${safe(f.id)}" aria-label="Select feedback"></td><td><strong>${safe(f.resource_articles?.title||'Article')}</strong><small>${safe(f.name)} · ${safe(f.email)} · ${financialDate(f.created_at)}</small></td><td>${safe(f.message)}</td><td>${safe(labelFromStatus(f.status))}</td><td><button class="admin-v3-button admin-v3-button--outline resourceReply" data-id="${safe(f.id)}">Reply</button> <button class="admin-v3-button admin-v3-button--outline resourceFeedbackStatus" data-id="${safe(f.id)}" data-status="resolved">Resolve</button> <button class="admin-v3-button admin-v3-button--outline resourceFeedbackStatus" data-id="${safe(f.id)}" data-status="spam">Spam</button> <button class="admin-v3-button admin-v3-button--outline resourceDelete" data-id="${safe(f.id)}">Delete</button></td></tr>`).join('')||'<tr><td colspan="5">No private article questions.</td></tr>'}</tbody></table></div>`;
    if(tab==='analytics'){const yes=r.helpfulness.filter(x=>x.helpful).length,no=r.helpfulness.filter(x=>!x.helpful).length,percentage=yes+no?Math.round(yes/(yes+no)*100):0;return `${tabs}<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Published</span><strong>${r.articles.filter(x=>x.status==='published').length}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Private questions</span><strong>${r.feedback.length}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Helpful</span><strong>${yes}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Needs improvement</span><strong>${no}</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Helpful percentage</span><strong>${percentage}%</strong></article><article class="admin-v3-module-card admin-v3-kpi"><span>Privacy-safe daily views</span><strong>${r.views.length}</strong></article></div>`;}
    return `${tabs}<section class="admin-v3-module-card"><h2>Create or Edit Article</h2><p>Use the safe structured editor. Blocks accept JSON pairs such as [\"h2\",\"Heading\"], [\"p\",\"Paragraph\"], or [\"ul\",[\"Item\"]]. Unrestricted HTML is not accepted.</p><form id="resourceArticleForm"><input name="article_id" type="hidden"><div class="admin-detail-grid"><label>Title<input name="title" required></label><label>Slug<input name="slug" required pattern="[a-z0-9-]+"></label><label>Category<select name="category_id">${r.categories.map(c=>`<option value="${c.id}">${safe(c.name)}</option>`).join('')}</select></label><label>Featured image<select name="featured_asset_id"><option value="">None</option>${r.assets.map(a=>`<option value="${a.id}">${safe(a.alt_text)}</option>`).join('')}</select></label><label class="wide">Summary<textarea name="dek" required></textarea></label><label class="wide">Structured body<textarea name="body_blocks" required>[["h2","Article heading"],["p","Article paragraph"]]</textarea></label><label>SEO title<input name="seo_title" required></label><label>SEO description<textarea name="seo_description" required></textarea></label><label class="wide">Related resources<select name="related_article_ids" multiple>${r.articles.map(a=>`<option value="${a.id}">${safe(a.title)}</option>`).join('')}</select></label><label class="check"><input name="is_featured" type="checkbox"> Featured article</label></div><button class="admin-v3-button admin-v3-button--navy">Save Article</button><p data-resource-status role="status"></p></form></section><div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Article</th><th>Category</th><th>Status</th><th>Updated</th><th>Manage</th></tr></thead><tbody>${r.articles.map(a=>`<tr><td><strong>${safe(a.title)}</strong><small>/resources/${safe(a.slug)}/</small></td><td>${safe(a.resource_categories?.name||'Uncategorized')}</td><td>${safe(labelFromStatus(a.status))}</td><td>${financialDate(a.updated_at)}</td><td><button class="admin-v3-button admin-v3-button--outline resourceEdit" data-id="${a.id}">Edit</button> <a class="admin-v3-button admin-v3-button--outline" href="resources/${safe(a.slug)}/" target="_blank" rel="noopener">Preview</a> ${a.status!=='published'?`<button class="admin-v3-button admin-v3-button--navy resourceStatus" data-id="${a.id}" data-status="published">Publish</button>`:`<button class="admin-v3-button admin-v3-button--outline resourceStatus" data-id="${a.id}" data-status="unpublished">Unpublish</button>`} <button class="admin-v3-button admin-v3-button--outline resourceStatus" data-id="${a.id}" data-status="archived">Archive</button></td></tr>`).join('')}</tbody></table></div>`;}
  function bindResourceActions(){$$('[data-resource-admin-tab]',moduleContent).forEach(b=>b.addEventListener('click',()=>{moduleState.resources.tab=b.dataset.resourceAdminTab;moduleContent.innerHTML=renderResources();bindModuleActions();}));const form=$('#resourceArticleForm',moduleContent);form?.addEventListener('submit',async e=>{e.preventDefault();const status=$('[data-resource-status]',form);try{const saved=await resourceCommand('save_article',{article_id:form.article_id.value||null,title:form.title.value,slug:form.slug.value,category_id:form.category_id.value,featured_asset_id:form.featured_asset_id.value,dek:form.dek.value,body_blocks:JSON.parse(form.body_blocks.value),faq_items:[],source_links:[],seo_title:form.seo_title.value,seo_description:form.seo_description.value,is_featured:form.is_featured.checked});await resourceCommand('save_relations',{article_id:saved.article.id,related_article_ids:[...form.related_article_ids.selectedOptions].map(option=>option.value)});status.textContent='Article saved.';await loadCommunicationData('resources');moduleContent.innerHTML=renderResources();bindModuleActions();}catch(error){status.textContent=error.message;}});$$('.resourceEdit',moduleContent).forEach(b=>b.addEventListener('click',()=>{const a=moduleState.resources.articles.find(x=>x.id===b.dataset.id);if(!a||!form)return;for(const key of ['article_id','title','slug','category_id','featured_asset_id','dek','seo_title','seo_description'])form.elements[key].value=a[key]||'';form.body_blocks.value=JSON.stringify(a.body_blocks,null,2);form.is_featured.checked=Boolean(a.is_featured);const related=new Set(moduleState.resources.relations.filter(x=>x.article_id===a.id).map(x=>x.related_article_id));[...form.related_article_ids.options].forEach(option=>option.selected=related.has(option.value));form.scrollIntoView({behavior:'smooth'});}));$$('.resourceStatus',moduleContent).forEach(b=>b.addEventListener('click',async()=>{if(!confirm(`${labelFromStatus(b.dataset.status)} this article?`))return;await resourceCommand('change_status',{article_id:b.dataset.id,status:b.dataset.status});await loadCommunicationData('resources');moduleContent.innerHTML=renderResources();bindModuleActions();}));$$('.resourceFeedbackStatus',moduleContent).forEach(b=>b.addEventListener('click',async()=>{await resourceCommand('feedback_status',{feedback_id:b.dataset.id,status:b.dataset.status});await loadCommunicationData('resources');moduleContent.innerHTML=renderResources();bindModuleActions();}));$$('.resourceBulk',moduleContent).forEach(b=>b.addEventListener('click',async()=>{const ids=$$('[data-feedback-select]:checked',moduleContent).map(x=>x.value);if(!ids.length)return;await resourceCommand('feedback_status',{ids,status:b.dataset.status==='archive'?'archived':b.dataset.status});await loadCommunicationData('resources');moduleContent.innerHTML=renderResources();bindModuleActions();}));$$('.resourceReply',moduleContent).forEach(b=>b.addEventListener('click',async()=>{const reply=prompt('Reply text (a preview is generated before sending):');if(!reply)return;await resourceCommand('reply_feedback',{feedback_id:b.dataset.id,reply,preview:true});if(confirm(`Send this branded email reply?\n\n${reply}`)){await resourceCommand('reply_feedback',{feedback_id:b.dataset.id,reply});await loadCommunicationData('resources');moduleContent.innerHTML=renderResources();bindModuleActions();}}));$$('.resourceDelete',moduleContent).forEach(b=>b.addEventListener('click',async()=>{if(prompt('Permanent deletion cannot be undone. Type DELETE to confirm:')!=='DELETE')return;await resourceCommand('feedback_delete',{feedback_id:b.dataset.id,confirmation:'DELETE'});await loadCommunicationData('resources');moduleContent.innerHTML=renderResources();bindModuleActions();}));}
  const businessLabel=(value)=>safe(labelFromStatus(value||""));
  function renderOperators(){const profiles=moduleState.businessFoundation.staff||[];return `<section class="admin-v3-module-card"><p class="small-label">Protected professional accounts</p><h2>Add APS Operator</h2><p>The Operator establishes a password through the secure Supabase invitation. Public identity remains Owner-controlled.</p><form id="operatorInviteForm"><input type="hidden" name="role" value="operations"><input type="hidden" name="account_classification" value="operator"><div class="admin-detail-grid"><label>First name<input name="first_name" required></label><label>Middle name<input name="middle_name"></label><label>Last name<input name="last_name" required></label><label>Login email<input name="email" type="email" required></label><label>Public title<select name="public_title"><option>Notary Public</option><option>Owner</option><option>Co-Owner</option><option>Managing Member</option></select></label><label>Professional APS email<input name="professional_email" type="email" required placeholder="firstname@alignedprintscan.com"></label><label>Permanent card slug<input name="card_slug" required pattern="[a-z][a-z0-9-]{1,31}"></label><label class="check"><input name="card_enabled" type="checkbox"> Enable public digital card</label></div><fieldset><legend>Fixed permissions</legend>${['view_manage_requests','create_admin_orders','edit_participants','communications','documents','quotes_invoices','appointments_fulfillment','loan_signing_workflows','ron_workflows','business_accounts'].map(permission=>`<label class="check"><input type="checkbox" name="permission_${permission}"> ${businessLabel(permission)}</label>`).join('')}</fieldset><button class="admin-v3-button admin-v3-button--navy">Send Secure Operator Invitation</button><p data-operator-status role="status"></p></form></section><div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Account</th><th>Classification</th><th>Status</th><th>Professional identity</th><th>Card</th></tr></thead><tbody>${profiles.map(profile=>`<tr><td><strong>${safe(profile.full_name)}</strong><small>${safe(profile.email)}</small></td><td>${profile.role==='owner'?'Protected Owner':businessLabel(profile.account_classification)}</td><td>${businessLabel(profile.status)}</td><td>${safe(profile.public_title||'Not configured')}<small>${safe(profile.professional_email||'No public email')}</small></td><td>${profile.card_enabled&&profile.card_slug?`<a href="/${safe(profile.card_slug)}" target="_blank" rel="noopener">/${safe(profile.card_slug)}</a>`:'Disabled'}</td></tr>`).join('')}</tbody></table></div>`;}
  function renderOperatorProfileEditors(){return (moduleState.businessFoundation.staff||[]).filter(profile=>profile.account_classification==='operator'||profile.role==='owner').map(profile=>`<section class="admin-v3-module-card"><p class="small-label">Admin-controlled professional identity</p><h2>${safe(profile.full_name)}</h2><form class="operatorProfileForm" data-profile-id="${safe(profile.id)}"><div class="admin-detail-grid"><label>First name<input name="first_name" value="${safe(profile.first_name||'')}" required></label><label>Middle name<input name="middle_name" value="${safe(profile.middle_name||'')}"></label><label>Last name<input name="last_name" value="${safe(profile.last_name||'')}" required></label><label>Public title<select name="public_title">${['Owner','Co-Owner','Managing Member','Notary Public'].map(value=>`<option ${profile.public_title===value?'selected':''}>${value}</option>`).join('')}</select></label><label>Professional email<input name="professional_email" type="email" value="${safe(profile.professional_email||'')}"></label><label>Portrait asset path<input name="portrait_path" value="${safe(profile.portrait_path||'')}" placeholder="assets/images/professionals/name.png"></label><label>Permanent card slug<input name="card_slug" value="${safe(profile.card_slug||'')}" pattern="[a-z][a-z0-9-]{1,31}"></label><label class="check"><input name="card_enabled" type="checkbox" ${profile.card_enabled?'checked':''}> Digital card enabled</label></div><fieldset><legend>Approved credentials</legend>${['Texas Notary Public','Online Notary Public','Loan Signing Agent','NNA Certified Loan Signing Agent'].map(value=>`<label class="check"><input type="checkbox" name="credential" value="${value}" ${profile.credentials?.includes(value)?'checked':''}> ${value}</label>`).join('')}</fieldset><fieldset><legend>Assurance indicators</legend>${['Bonded','Insured'].map(value=>`<label class="check"><input type="checkbox" name="assurance" value="${value}" ${profile.assurance_indicators?.includes(value)?'checked':''}> ${value}</label>`).join('')}</fieldset><button class="admin-v3-button admin-v3-button--outline">Save Professional Profile</button><p data-profile-status role="status"></p></form></section>`).join('');}
  const formatReference=(id)=>`APS-${String(id).slice(0,8).toUpperCase()}`;
  const portalPreviewMarkup=(org)=>`<section><h3>Portal Preview</h3><p>Read-only customer-safe projection.</p><div class="status-actions">${['organization_admin','order_creator','billing','viewer'].map(role=>`<a class="admin-v3-button admin-v3-button--outline" target="_blank" rel="noopener" href="business.html?preview_org=${encodeURIComponent(org.id)}&role=${role}">Preview ${businessLabel(role)}</a>`).join('')}</div></section>`;
  const closureReviewMarkup=(org)=>{const data=moduleState.businessFoundation,closures=(data.closure_requests||[]).filter(r=>r.organization_id===org.id),privacy=(data.privacy_requests||[]).filter(r=>r.organization_id===org.id);return `<section><h3>Account & Privacy Review</h3>${closures.map(r=>`<p><strong>Closure: ${businessLabel(r.status)}</strong><br>${safe(r.reason||'No reason supplied')}<br><button class="admin-v3-button admin-v3-button--outline closureReview" data-id="${r.id}" data-status="under_review">Review</button> <button class="admin-v3-button admin-v3-button--outline closureReview" data-id="${r.id}" data-status="completed">Complete Closure</button></p>`).join('')||'<p>No closure requests.</p>'}${privacy.map(r=>`<p><strong>Privacy: ${businessLabel(r.request_type)}</strong> · ${businessLabel(r.status)}<br><button class="admin-v3-button admin-v3-button--outline privacyReview" data-id="${r.id}" data-status="under_review">Review</button> <button class="admin-v3-button admin-v3-button--outline privacyReview" data-id="${r.id}" data-status="resolved">Resolve</button></p>`).join('')||'<p>No privacy requests.</p>'}</section>`};
  const businessBillingMarkup=(org)=>{const data=moduleState.businessFoundation,invoices=(data.invoices||[]).filter(i=>i.organization_id===org.id),payments=(data.payments||[]).filter(p=>p.organization_id===org.id),refunds=(data.refunds||[]).filter(r=>invoices.some(i=>i.id===r.invoice_id)),active=invoices.filter(i=>!['draft','void','voided','cancelled'].includes(String(i.status))),invoiced=active.reduce((s,i)=>s+Number(i.amount_due||0),0),paid=payments.reduce((s,p)=>s+Number(p.amount||0),0),refunded=refunds.filter(r=>r.status==='succeeded').reduce((s,r)=>s+Number(r.amount||0),0),outstanding=active.reduce((s,i)=>s+Number(i.balance_due||0),0),pastDue=active.filter(i=>i.financial_status==='past_due').reduce((s,i)=>s+Number(i.balance_due||0),0),requests=moduleState.requests.filter(r=>r.organization_id===org.id);return `<section class="business-billing-admin"><h3>Organization Billing</h3><div class="admin-detail-grid"><div><span class="small-label">Total Invoiced</span><strong>${money(invoiced)}</strong></div><div><span class="small-label">Paid</span><strong>${money(paid)}</strong></div><div><span class="small-label">Refunded</span><strong>${money(refunded)}</strong></div><div><span class="small-label">Net Retained</span><strong>${money(Math.max(0,paid-refunded))}</strong></div><div><span class="small-label">Outstanding</span><strong>${money(outstanding)}</strong></div><div><span class="small-label">Past Due</span><strong>${money(pastDue)}</strong></div></div><form class="businessTermsForm" data-organization-id="${org.id}"><label>Payment Terms<select name="payment_terms">${['prepaid','due_on_receipt','net_15','net_30'].map(v=>`<option value="${v}" ${org.payment_terms===v?'selected':''}>${businessLabel(v)}</option>`).join('')}</select></label><button class="admin-v3-button admin-v3-button--outline">Save Terms</button></form><form class="creditHoldForm" data-organization-id="${org.id}"><label class="check"><input name="credit_hold" type="checkbox" ${org.credit_hold?'checked':''}> Credit Hold</label><label>Internal reason<input name="reason" value="${safe(org.credit_hold_reason||'')}"></label><button class="admin-v3-button admin-v3-button--outline">${org.credit_hold?'Update / Remove Hold':'Apply Hold'}</button></form>${requests.length?`<form class="businessInvoiceForm" data-organization-id="${org.id}"><h4>Create APS Business Invoice</h4><label>Request<select name="request_id">${requests.map(r=>`<option value="${r.id}">${formatReference(r.id)} · ${businessLabel(r.service_type)}</option>`).join('')}</select></label><label>Description<input name="description" required></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Memo<textarea name="note"></textarea></label><button class="admin-v3-button admin-v3-button--navy">Create Draft Invoice</button></form>`:'<p>No linked request is available for a business invoice.</p>'}<h4>Invoices</h4>${invoices.map(i=>`<p><strong>${safe(i.invoice_number)}</strong> · ${businessLabel(i.financial_status||i.status)} · ${money(i.balance_due)} due<br>${businessLabel(i.payment_terms)} · due ${financialDate(i.due_at)} ${i.status==='draft'?`<button type="button" class="admin-v3-button admin-v3-button--outline finalizeBusinessInvoice" data-invoice-id="${i.id}">Finalize with Stripe</button>`:''}</p>`).join('')||'<p>No business invoices.</p>'}</section>`};
  function renderOrganizations(){const data=moduleState.businessFoundation,orgs=data.organizations||[];return `<section class="admin-v3-module-card"><h2>Create Organization</h2><p>Organizations remain separate from customers, signers, and APS staff. New accounts default to Prepaid.</p><form id="organizationForm"><div class="admin-detail-grid"><label>Name<input name="organization_name" required></label><label>Business type<select name="business_type">${['title_escrow','signing_service','lender','law_office','real_estate','property_management','corporate_business','other'].map(v=>`<option value="${v}">${businessLabel(v)}</option>`).join('')}</select></label><label>Primary email<input name="primary_email" type="email"></label><label>Phone<input name="primary_phone"></label></div><button class="admin-v3-button admin-v3-button--navy" type="submit">Create Organization</button><p data-business-status role="status"></p></form></section>${orgs.length?orgs.map(org=>{const members=data.members.filter(m=>m.organization_id===org.id),locations=data.locations.filter(l=>l.organization_id===org.id),activityRows=data.activities.filter(a=>a.organization_id===org.id).slice(0,8);return `<article class="admin-v3-module-card organization-card"><header><p class="small-label">${businessLabel(org.business_type)}</p><h2>${safe(org.organization_name)}</h2><p>${businessLabel(org.status)} · ${businessLabel(org.payment_terms)}${org.credit_hold?' · Credit Hold':''}</p></header><form class="organizationPolicyForm" data-organization-id="${org.id}"><input type="hidden" name="organization_name" value="${safe(org.organization_name)}"><div class="admin-detail-grid"><label>Status<select name="status">${['pending','active','suspended','declined','closed','archived'].map(v=>`<option value="${v}" ${org.status===v?'selected':''}>${businessLabel(v)}</option>`).join('')}</select></label><label>Payment terms<select name="payment_terms">${['prepaid','due_on_receipt','net_15','net_30'].map(v=>`<option value="${v}" ${org.payment_terms===v?'selected':''}>${businessLabel(v)}</option>`).join('')}</select></label><label class="check"><input name="credit_hold" type="checkbox" ${org.credit_hold?'checked':''}> Credit hold</label><label class="check"><input name="service_ron_enabled" type="checkbox" ${org.service_ron_enabled?'checked':''}> RON eligible</label><label class="check"><input name="service_mobile_enabled" type="checkbox" ${org.service_mobile_enabled?'checked':''}> Mobile eligible</label><label class="check"><input name="service_print_enabled" type="checkbox" ${org.service_print_enabled?'checked':''}> Print eligible</label><label class="check"><input name="service_loan_signing_enabled" type="checkbox" ${org.service_loan_signing_enabled?'checked':''}> Loan Signing eligibility placeholder</label></div><button class="admin-v3-button admin-v3-button--outline" type="submit">Save Organization Policy</button></form><div class="admin-v3-module-grid"><section><h3>Overview</h3><p>${safe(org.primary_email||'No primary email')}<br>${safe(org.primary_phone||'')}</p></section><section><h3>Users</h3>${members.length?members.map(m=>`<p><strong>${safe(m.full_name)}</strong><br>${safe(m.email)} · ${businessLabel(m.role)} · ${businessLabel(m.status)}<br><button type="button" class="admin-v3-button admin-v3-button--outline memberStatus" data-member-id="${m.id}" data-status="${m.status==='active'?'suspended':'active'}">${m.status==='active'?'Suspend':'Activate'}</button>${!['removed','revoked'].includes(m.status)?` <button type="button" class="admin-v3-button admin-v3-button--outline memberStatus" data-member-id="${m.id}" data-status="removed">Remove</button>`:''}</p>`).join(''):'<p>No members.</p>'}<form class="memberInviteForm" data-organization-id="${org.id}"><input name="full_name" required placeholder="Name"><input name="email" type="email" required placeholder="Email"><select name="role"><option value="organization_admin">Organization Admin</option><option value="order_creator">Order Creator</option><option value="billing">Billing</option><option value="viewer">Viewer</option></select><button class="admin-v3-button admin-v3-button--outline" type="submit">Send Secure Invite</button></form></section><section><h3>Locations</h3>${locations.length?locations.map(l=>`<p><strong>${safe(l.location_name)}</strong><br>${safe([l.address_line1,l.city,l.state,l.zip].filter(Boolean).join(', '))} · ${l.is_active?'Active':'Inactive'}${l.is_active?`<br><button type="button" class="admin-v3-button admin-v3-button--outline locationDeactivate" data-location-id="${l.id}" data-organization-id="${org.id}" data-location-name="${safe(l.location_name)}">Deactivate</button>`:''}</p>`).join(''):'<p>No locations.</p>'}<form class="locationForm" data-organization-id="${org.id}"><input name="location_name" required placeholder="Location name"><input name="address_line1" required placeholder="Street"><input name="city" required placeholder="City"><input name="state" required value="TX" placeholder="State"><input name="zip" required placeholder="ZIP"><label class="check"><input name="is_default" type="checkbox"> Default</label><button class="admin-v3-button admin-v3-button--outline" type="submit">Add Location</button></form></section><section><h3>Billing</h3><p>Payment terms: ${businessLabel(org.payment_terms)}<br>Credit hold: ${org.credit_hold?'Yes':'No'}</p><p class="admin-muted">Stripe Invoicing and Net collection flows are not launched.</p></section><section><h3>Requests</h3><p>${moduleState.requests.filter(r=>r.organization_id===org.id).length} linked requests.</p></section><section><h3>Activity</h3>${activityRows.length?activityRows.map(a=>`<p><strong>${safe(a.title)}</strong><br><small>${safe(financialDate(a.created_at))}</small></p>`).join(''):'<p>No activity yet.</p>'}</section></div><p class="admin-muted">Business Portal not yet launched.</p></article>`}).join(''):'<div class="admin-v3-module-card"><p>No organizations yet.</p></div>'}`;}
  function renderBusinessApplications(){const apps=moduleState.businessFoundation.applications||[];return apps.length?`<div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Applicant</th><th>Contact</th><th>Services</th><th>Requested terms</th><th>Status</th><th>Actions</th></tr></thead><tbody>${apps.map(app=>`<tr><td><strong>${safe(app.organization_name)}</strong><small>${businessLabel(app.business_type)} · ${safe(financialDate(app.submitted_at))}</small></td><td>${safe(app.primary_contact_name)}<small>${safe(app.business_email)}</small></td><td>${safe((app.services_interested||[]).map(labelFromStatus).join(', '))}</td><td>${businessLabel(app.requested_payment_terms)}</td><td>${businessLabel(app.status)}${app.duplicate_signals?.review_required?'<small>Possible duplicate — review</small>':''}</td><td><button class="admin-v3-button admin-v3-button--navy approveBusinessApplication" data-application-id="${app.id}" type="button" ${app.status==='approved'?'disabled':''}>Approve as Prepaid</button><button class="admin-v3-button admin-v3-button--outline updateBusinessApplication" data-application-id="${app.id}" data-status="information_requested" type="button">Request Information</button><button class="admin-v3-button admin-v3-button--outline updateBusinessApplication" data-application-id="${app.id}" data-status="declined" type="button">Decline</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-v3-module-card"><h2>Business Applications</h2><p>No applications yet.</p></div>';}
  function renderStaffAccess(){const staff=moduleState.businessFoundation.staff||[];return `<section class="admin-v3-module-card"><h2>Invite APS Staff</h2><p>Invited staff establish their own credentials. APS never creates or views passwords.</p><form id="staffInviteForm"><div class="admin-detail-grid"><label>Name<input name="full_name" required></label><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option value="administrator">Administrator</option><option value="operations">Operations</option><option value="billing">Billing</option><option value="support_read_only">Support Read Only</option></select></label></div><button class="admin-v3-button admin-v3-button--navy" type="submit">Send Secure Invitation</button><p data-business-status role="status"></p></form></section><div class="admin-v3-module-card admin-v3-table-wrap"><table class="admin-v3-table"><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>High-risk permissions</th><th>Manage</th></tr></thead><tbody>${staff.map(s=>`<tr><td><strong>${safe(s.full_name)}</strong><small>${safe(s.email)}</small></td><td>${businessLabel(s.role)}</td><td>${businessLabel(s.status)}</td><td>${s.role==='owner'?'Owner protected · all':safe(Object.keys(s.permissions||{}).filter(k=>s.permissions[k]).map(labelFromStatus).join(', ')||'None')}</td><td>${s.role==='owner'?'Protected':`<select class="staffRole" data-staff-id="${s.id}">${['administrator','operations','billing','support_read_only'].map(v=>`<option value="${v}" ${s.role===v?'selected':''}>${businessLabel(v)}</option>`).join('')}</select> <button class="admin-v3-button admin-v3-button--outline staffStatus" data-staff-id="${s.id}" data-status="${s.status==='active'?'suspended':'active'}" type="button">${s.status==='active'?'Suspend':'Activate'}</button>${s.status!=='removed'?` <button class="admin-v3-button admin-v3-button--outline staffStatus" data-staff-id="${s.id}" data-status="removed" type="button">Remove</button>`:''}`}</td></tr>`).join('')}</tbody></table></div>`;}
  async function businessCommand(command,body={}){const {data,error}=await adminClient.functions.invoke('admin-business-foundation',{body:{command,...body}});if(error||!data?.ok)throw new Error(data?.error||error?.message||'Business foundation operation failed.');return data;}
  async function refreshBusinessFoundation(){const data=await businessCommand('snapshot');moduleState.businessFoundation=data;}
  function businessFormBody(form){return Object.fromEntries([...new FormData(form).entries()].map(([key,value])=>[key,value]));}
  function bindBusinessActions(){const status=(root)=>$('[data-business-status]',root||moduleContent);const organizationForm=$('#organizationForm',moduleContent);organizationForm?.addEventListener('submit',async event=>{event.preventDefault();try{await businessCommand('save_organization',businessFormBody(organizationForm));await refreshBusinessFoundation();moduleContent.innerHTML=renderOrganizations();bindModuleActions();}catch(error){status(organizationForm).textContent=error.message;}});$$('.locationForm',moduleContent).forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();try{await businessCommand('save_location',{organization_id:form.dataset.organizationId,...businessFormBody(form),is_default:form.elements.is_default.checked});await refreshBusinessFoundation();moduleContent.innerHTML=renderOrganizations();bindModuleActions();}catch(error){alert(error.message);}}));$$('.memberInviteForm',moduleContent).forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();if(!confirm('Send this secure organization invitation email?'))return;try{await businessCommand('invite_member',{organization_id:form.dataset.organizationId,...businessFormBody(form)});await refreshBusinessFoundation();moduleContent.innerHTML=renderOrganizations();bindModuleActions();}catch(error){alert(error.message);}}));$$('.approveBusinessApplication',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Approve this application with APS-selected Prepaid terms?'))return;try{await businessCommand('approve_application',{application_id:button.dataset.applicationId,payment_terms:'prepaid'});await refreshBusinessFoundation();moduleContent.innerHTML=renderBusinessApplications();bindModuleActions();}catch(error){alert(error.message);}}));$$('.updateBusinessApplication',moduleContent).forEach(button=>button.addEventListener('click',async()=>{try{await businessCommand('update_application',{application_id:button.dataset.applicationId,status:button.dataset.status});await refreshBusinessFoundation();moduleContent.innerHTML=renderBusinessApplications();bindModuleActions();}catch(error){alert(error.message);}}));const staffForm=$('#staffInviteForm',moduleContent);staffForm?.addEventListener('submit',async event=>{event.preventDefault();if(!confirm('Send this secure APS staff invitation email?'))return;try{await businessCommand('invite_staff',businessFormBody(staffForm));await refreshBusinessFoundation();moduleContent.innerHTML=renderStaffAccess();bindModuleActions();}catch(error){status(staffForm).textContent=error.message;}});}
  function bindRelease2ManagementActions() {
    $$('.organization-card .admin-muted',moduleContent).forEach(message=>{if(/not (yet )?launched/i.test(message.textContent))message.remove();});
    $$('.organizationPolicyForm',moduleContent).forEach(form=>{const org=moduleState.businessFoundation.organizations.find(item=>item.id===form.dataset.organizationId);if(!org)return;const name=form.elements.organization_name;name.type='text';name.required=true;name.insertAdjacentHTML('beforebegin','<span>Organization name</span>');const grid=$('.admin-detail-grid',form);grid.insertAdjacentHTML('afterbegin',`<label>Primary email<input name="primary_email" type="email" value="${safe(org.primary_email||'')}"></label><label>Phone<input name="primary_phone" value="${safe(org.primary_phone||'')}"></label>`);});
    $$('.memberStatus',moduleContent).forEach(button=>{const member=moduleState.businessFoundation.members.find(item=>item.id===button.dataset.memberId);if(!member||button.parentElement.querySelector('.memberRole'))return;button.insertAdjacentHTML('beforebegin',`<select class="memberRole" data-member-id="${member.id}">${['organization_admin','order_creator','billing','viewer'].map(role=>`<option value="${role}" ${member.role===role?'selected':''}>${businessLabel(role)}</option>`).join('')}</select> `);if(member.status==='invited')button.parentElement.insertAdjacentHTML('beforeend',` <button type="button" class="admin-v3-button admin-v3-button--outline memberResend" data-member-id="${member.id}">Resend Invite</button>`);});
    $$('.staffRole',moduleContent).forEach(select=>{const profile=moduleState.businessFoundation.staff.find(item=>item.id===select.dataset.staffId);if(!profile||select.parentElement.querySelector('.staffPermissions'))return;select.parentElement.insertAdjacentHTML('beforeend',`<fieldset class="staffPermissions" data-staff-id="${profile.id}"><legend>Permissions</legend>${['issue_refunds','release_documents','manage_proof','approve_business_accounts','change_organization_payment_terms','manage_staff'].map(permission=>`<label class="check"><input type="checkbox" name="${permission}" ${profile.permissions?.[permission]?'checked':''}> ${businessLabel(permission)}</label>`).join('')}<button type="button" class="admin-v3-button admin-v3-button--outline saveStaffPermissions" data-staff-id="${profile.id}">Save Permissions</button></fieldset>`);});
    $$('.organization-card',moduleContent).forEach((card,index)=>{const org=moduleState.businessFoundation.organizations[index];if(org)card.insertAdjacentHTML('beforeend',`<div class="admin-v3-module-grid">${businessBillingMarkup(org)}${portalPreviewMarkup(org)}${closureReviewMarkup(org)}</div>`);});
    $$('.business-billing-admin',moduleContent).forEach(section=>section.insertAdjacentHTML('beforeend','<button type="button" class="admin-v3-button admin-v3-button--outline runBusinessReminders">Run Due Reminders</button>'));
    const redrawOrganizations=async()=>{await refreshBusinessFoundation();moduleContent.innerHTML=renderOrganizations();bindModuleActions();};
    const redrawStaff=async()=>{await refreshBusinessFoundation();moduleContent.innerHTML=renderStaffAccess();bindModuleActions();};
    $$('.organizationPolicyForm',moduleContent).forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const body=businessFormBody(form);delete body.payment_terms;delete body.credit_hold;for(const key of ['service_ron_enabled','service_mobile_enabled','service_print_enabled','service_loan_signing_enabled'])body[key]=form.elements[key].checked;try{await businessCommand('save_organization',{organization_id:form.dataset.organizationId,...body});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.businessTermsForm',moduleContent).forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();try{await businessCommand('set_payment_terms',{organization_id:form.dataset.organizationId,payment_terms:form.elements.payment_terms.value});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.creditHoldForm',moduleContent).forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const current=moduleState.businessFoundation.organizations.find(o=>o.id===form.dataset.organizationId);try{await businessCommand('set_credit_hold',{organization_id:form.dataset.organizationId,credit_hold:!current.credit_hold,reason:form.elements.reason.value});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.businessInvoiceForm',moduleContent).forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();try{const {data,error}=await adminClient.functions.invoke('business-invoice',{body:{command:'create',organization_id:form.dataset.organizationId,request_id:form.elements.request_id.value,note:form.elements.note.value,items:[{description:form.elements.description.value,quantity:1,unit_price:Number(form.elements.amount.value)}]}});if(error||data?.error)throw new Error(data?.error||error.message);await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.finalizeBusinessInvoice',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Finalize this APS invoice with Stripe? Line items become immutable and APS will retain the authoritative ledger record.'))return;try{const {data,error}=await adminClient.functions.invoke('business-invoice',{body:{command:'finalize',invoice_id:button.dataset.invoiceId}});if(error||data?.error)throw new Error(data?.error||error.message);await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.runBusinessReminders',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Send all due APS business payment reminders now? Each invoice milestone is provider-idempotent and will be logged once.'))return;try{const {data,error}=await adminClient.functions.invoke('business-invoice',{body:{command:'run_reminders'}});if(error||data?.error)throw new Error(data?.error||error.message);alert(`Reminder run complete: ${data.sent} sent, ${data.skipped} skipped, ${data.failed} failed.`);await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.memberStatus',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`${businessLabel(button.dataset.status)} this organization member?`))return;try{await businessCommand('update_member',{member_id:button.dataset.memberId,status:button.dataset.status});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.memberRole',moduleContent).forEach(select=>select.addEventListener('change',async()=>{try{await businessCommand('update_member',{member_id:select.dataset.memberId,role:select.value});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.memberResend',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Resend this secure invitation email?'))return;try{await businessCommand('resend_member_invitation',{member_id:button.dataset.memberId});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.locationDeactivate',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Deactivate this location?'))return;try{await businessCommand('save_location',{location_id:button.dataset.locationId,organization_id:button.dataset.organizationId,location_name:button.dataset.locationName,is_active:false});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.closureReview',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`${businessLabel(button.dataset.status)} this closure request?`))return;try{await businessCommand('review_closure',{closure_id:button.dataset.id,status:button.dataset.status});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.privacyReview',moduleContent).forEach(button=>button.addEventListener('click',async()=>{try{await businessCommand('review_privacy',{privacy_request_id:button.dataset.id,status:button.dataset.status});await redrawOrganizations();}catch(error){alert(error.message);}}));
    $$('.staffRole',moduleContent).forEach(select=>select.addEventListener('change',async()=>{try{await businessCommand('update_staff',{staff_profile_id:select.dataset.staffId,role:select.value});await redrawStaff();}catch(error){alert(error.message);}}));
    $$('.staffStatus',moduleContent).forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`${businessLabel(button.dataset.status)} this APS staff profile?`))return;try{await businessCommand('update_staff',{staff_profile_id:button.dataset.staffId,status:button.dataset.status});await redrawStaff();}catch(error){alert(error.message);}}));
    $$('.saveStaffPermissions',moduleContent).forEach(button=>button.addEventListener('click',async()=>{const fieldset=button.closest('.staffPermissions'),permissions={};$$('input[type="checkbox"]',fieldset).forEach(input=>permissions[input.name]=input.checked);try{await businessCommand('update_staff',{staff_profile_id:button.dataset.staffId,permissions});await redrawStaff();}catch(error){alert(error.message);}}));
  }
  function renderSettings(){const origins=moduleState.travelOrigins;return `<section class="admin-v3-module-card travel-origin-settings"><p class="small-label">Private administrator configuration</p><h2>Saved Travel Origins</h2><p>These starting locations are used only for Mobile route calculations and are never shown to customers. ${moduleState.travelConfigured?"Automatic OpenRouteService routing is configured.":"Automatic routing needs its server secret; manual travel entry remains available."}</p><div class="travel-origin-list">${origins.length?origins.map(origin=>`<article class="travel-origin-row ${origin.is_active?"":"is-inactive"}"><div><strong>${safe(origin.label)}</strong>${origin.is_default?'<span class="review-priority review-priority--info">Default</span>':""}<small>${safe([origin.street_address,origin.city,origin.state,origin.zip].filter(Boolean).join(", "))} · ${origin.is_active?"Active":"Inactive"}</small></div><div class="status-actions"><button class="admin-v3-button admin-v3-button--outline edit-travel-origin" data-origin-id="${safe(origin.id)}" type="button">Edit</button>${origin.is_active&&!origin.is_default?`<button class="admin-v3-button admin-v3-button--outline default-travel-origin" data-origin-id="${safe(origin.id)}" type="button">Set Default</button>`:""}${origin.is_active?`<button class="admin-v3-button admin-v3-button--outline deactivate-travel-origin" data-origin-id="${safe(origin.id)}" type="button">Deactivate</button>`:""}</div></article>`).join(""):"<p>No saved origins yet. Add the first active origin; APS will make it the default.</p>"}</div><form id="travelOriginForm"><input name="origin_id" type="hidden"><div class="admin-detail-grid"><label>Label<input name="label" required minlength="2" placeholder="Home Office"></label><label>Street<input name="street_address" required></label><label>City<input name="city" required></label><label>State<input name="state" required></label><label>ZIP<input name="zip" required></label><label class="check"><input name="is_default" type="checkbox"> Set as Default</label></div><div class="status-actions"><button class="admin-v3-button admin-v3-button--navy" type="submit">Save Origin</button><button class="admin-v3-button admin-v3-button--outline" id="clearTravelOrigin" type="button">Clear</button></div><p id="travelOriginStatus" role="status" aria-live="polite"></p></form></section><div class="admin-v3-module-grid"><article class="admin-v3-module-card"><h3>Supabase</h3><p>Request storage, authentication, files, and realtime updates are connected through the existing configuration.</p></article><article class="admin-v3-module-card"><h3>Stripe</h3><p>Invoice checkout and webhook logic remain unchanged.</p></article><article class="admin-v3-module-card"><h3>Resend</h3><p>Transactional email functions remain unchanged.</p></article><article class="admin-v3-module-card"><h3>Proof infrastructure</h3><p>Owner-supervised connection and webhook setup only.</p><div class="admin-v3-agenda-actions"><button class="admin-v3-button admin-v3-button--navy" id="verifyProofConnection" type="button">Verify Proof Connection</button><button class="admin-v3-button admin-v3-button--outline" id="registerProofWebhook" type="button">Register Proof Webhook</button></div><div id="proofInfrastructureStatus" role="status" aria-live="polite"><p>No infrastructure check has run in this session.</p></div></article></div>`;}
  async function travelOriginCommand(command,body={}){const {data,error}=await adminClient.functions.invoke("admin-route-distance",{body:{command,...body}});if(error||!data?.ok)throw new Error(data?.error||error?.message||"Travel origin update failed.");moduleState.travelOrigins=data.origins||moduleState.travelOrigins;return data;}
  function bindTravelOriginActions(){const form=$("#travelOriginForm",moduleContent),status=$("#travelOriginStatus",moduleContent);if(!form)return;form.addEventListener("submit",async event=>{event.preventDefault();if(!form.reportValidity())return;try{await travelOriginCommand("save_origin",{origin_id:form.elements.origin_id.value||null,origin:{label:form.elements.label.value,street_address:form.elements.street_address.value,city:form.elements.city.value,state:form.elements.state.value,zip:form.elements.zip.value},is_default:form.elements.is_default.checked});moduleContent.innerHTML=renderSettings();bindModuleActions();}catch(error){status.textContent=error.message;}});$("#clearTravelOrigin",moduleContent)?.addEventListener("click",()=>form.reset());$$('.edit-travel-origin',moduleContent).forEach(button=>button.addEventListener("click",()=>{const origin=moduleState.travelOrigins.find(item=>item.id===button.dataset.originId);if(!origin)return;["origin_id","label","street_address","city","state","zip"].forEach(key=>form.elements[key].value=origin[key]||"");form.elements.is_default.checked=origin.is_default;form.scrollIntoView({behavior:"smooth"});}));$$('.default-travel-origin',moduleContent).forEach(button=>button.addEventListener("click",async()=>{try{await travelOriginCommand("set_default",{origin_id:button.dataset.originId});moduleContent.innerHTML=renderSettings();bindModuleActions();}catch(error){status.textContent=error.message;}}));$$('.deactivate-travel-origin',moduleContent).forEach(button=>button.addEventListener("click",async()=>{if(!confirm("Deactivate this origin? Historical calculations remain unchanged."))return;try{await travelOriginCommand("deactivate_origin",{origin_id:button.dataset.originId});moduleContent.innerHTML=renderSettings();bindModuleActions();}catch(error){status.textContent=error.message;}}));}
  function bindResourcePreviews() {
    $$('a[href^="resources/"]', moduleContent).forEach((link) => link.addEventListener("click", (event) => {
      const article = moduleState.resources.articles.find((item) => link.getAttribute("href") === `resources/${item.slug}/`);
      if (!article || article.status === "published") return;
      event.preventDefault();
      const blockMarkup = (article.body_blocks || []).map(([type, content]) => {
        if (["ul", "ol"].includes(type) && Array.isArray(content)) return `<${type}>${content.map((item) => `<li>${safe(item)}</li>`).join("")}</${type}>`;
        if (type === "h2") return `<h2>${safe(content)}</h2>`;
        if (type === "callout") return `<aside class="resource-callout">${safe(content)}</aside>`;
        return `<p>${safe(content)}</p>`;
      }).join("");
      const dialog = document.createElement("dialog");
      dialog.className = "admin-v3-danger-dialog";
      dialog.innerHTML = `<article><button class="dialog-close" type="button" aria-label="Close">×</button><p class="small-label">Private Draft Preview</p><h1>${safe(article.title)}</h1><p>${safe(article.dek)}</p>${blockMarkup}</article>`;
      dialog.querySelector("button").addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog); dialog.showModal();
    }));
  }
  function bindModuleActions() {
    bindResourcePreviews();
    bindResourceActions();
    bindTravelOriginActions();
    bindRelease2ManagementActions();
    bindBusinessActions();
    const operatorForm=$("#operatorInviteForm",moduleContent);operatorForm?.addEventListener("submit",async event=>{event.preventDefault();const status=$("[data-operator-status]",operatorForm);try{const body=businessFormBody(operatorForm);body.card_enabled=operatorForm.elements.card_enabled.checked;body.permissions=Object.fromEntries([...operatorForm.querySelectorAll('[name^="permission_"]')].map(input=>[input.name.replace('permission_',''),input.checked]));await businessCommand("invite_staff",body);await refreshBusinessFoundation();moduleContent.innerHTML=renderOperators()+renderOperatorProfileEditors();bindModuleActions();}catch(error){status.textContent=error.message;}});
    $$(".operatorProfileForm",moduleContent).forEach(form=>form.addEventListener("submit",async event=>{event.preventDefault();const status=$("[data-profile-status]",form);try{const body=businessFormBody(form);body.staff_profile_id=form.dataset.profileId;body.card_enabled=form.elements.card_enabled.checked;body.credentials=$$('input[name="credential"]:checked',form).map(input=>input.value);body.assurance_indicators=$$('input[name="assurance"]:checked',form).map(input=>input.value);await businessCommand("update_staff",body);await refreshBusinessFoundation();moduleContent.innerHTML=renderOperators()+renderOperatorProfileEditors();bindModuleActions();}catch(error){status.textContent=error.message;}}));
    const sendCorrespondence=async(form)=>{const status=$("[data-message-status]",form)||form.querySelector("button");try{const payload=Object.fromEntries(new FormData(form));payload.command="send";payload.conversation_id=form.dataset.conversationId||null;const {data,error}=await adminClient.functions.invoke("operator-correspondence",{body:payload});if(error||!data?.ok)throw new Error(data?.error||error?.message||"Email could not be sent.");await loadCommunicationData("messages");moduleContent.innerHTML=renderMessages();bindModuleActions();}catch(error){status.textContent=error.message;}};
    $("#generalCorrespondenceForm",moduleContent)?.addEventListener("submit",event=>{event.preventDefault();sendCorrespondence(event.currentTarget);});
    $$(".conversationReplyForm",moduleContent).forEach(form=>form.addEventListener("submit",event=>{event.preventDefault();sendCorrespondence(form);}));
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
    [["templateSearch","search","input"],["templateCategory","category","change"],["templateService","service","change"]].forEach(([id,key,type])=>{$(`#${id}`,moduleContent)?.addEventListener(type,event=>{moduleState.templateView[key]=event.target.value;moduleContent.innerHTML=renderTemplates();bindModuleActions();if(type==="input"){const input=$("#templateSearch",moduleContent);input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}});});
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
      if (wizardChecked(form, "mobile_print_addon")) add("Print preparation estimate", wizardPrintCost(form, "mobile"));
      if (wizardChecked(form, "mobile_scan_addon")) add("Scan to PDF estimate", wizardNumber(form, "mobile_scan_pages") * (pricing.documentServices?.scanPerPage || 1));
    } else if (service === "loan_signing") {
      add("Standard Loan Signing package", Number(pricing.loanSigning?.standardPackages?.[wizardValue(form, "lsa_signing_type")]) || 0);
    } else {
      add("Printing / copies estimate", wizardPrintCost(form));
      add("Scan to PDF estimate", wizardNumber(form, "print_scan_pages") * (pricing.documentServices?.scanPerPage || 1));
      const fulfillment = wizardValue(form, "print_fulfillment") || "courier";
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
      $$('input, select, textarea', section).forEach((control) => {
        let hiddenWithinService = false;
        for (let parent = control.parentElement; parent && parent !== section; parent = parent.parentElement) {
          if (parent.hidden) { hiddenWithinService = true; break; }
        }
        control.disabled = !active || hiddenWithinService;
      });
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
  function setWizardMobileAddonFields(form) {
    const printActive=wizardChecked(form,"mobile_print_addon"),scanActive=wizardChecked(form,"mobile_scan_addon");
    $$(".admin-v3-mobile-print-field",form).forEach(field=>{field.hidden=!printActive;$$('input, select, textarea',field).forEach(control=>{control.disabled=!printActive;});});
    $$(".admin-v3-mobile-scan-field",form).forEach(field=>{field.hidden=!scanActive;$$('input, select, textarea',field).forEach(control=>{control.disabled=!scanActive;});});
  }
  function setWizardRonStructuredFields(form) {
    const signerHost=$("#adminRonSignerFields",form),actHost=$("#adminRonActFields",form),witnessHost=$("#adminRonWitnessFields",form);if(!signerHost||!actHost||!witnessHost)return;
    const signerCount=Math.min(10,Math.max(1,wizardNumber(form,"ron_signer_count",1))),actCount=Math.max(1,wizardNumber(form,"ron_notarization_count",1));
    if(Number(signerHost.dataset.count)!==signerCount){signerHost.dataset.count=String(signerCount);signerHost.innerHTML=`<h3>Structured signers</h3>${Array.from({length:signerCount},(_,index)=>`<fieldset><legend>Signer ${index+1} legal ID name</legend><div class="admin-v3-form-grid"><label>First name<input name="ron_signer_first_${index}" required></label><label>Middle name (optional)<input name="ron_signer_middle_${index}"></label><label>Last name<input name="ron_signer_last_${index}" required></label><label>Individual email<input name="ron_signer_email_${index}" type="email" required></label><label>Phone<input name="ron_signer_phone_${index}" type="tel"></label></div></fieldset>`).join("")}`;}
    if(Number(actHost.dataset.count)!==actCount){actHost.dataset.count=String(actCount);actHost.innerHTML=`<h3>Requested notarial acts</h3>${Array.from({length:actCount},(_,index)=>`<label>Act ${index+1}<select name="ron_act_type_${index}" required><option value="acknowledgment">Acknowledgment</option><option value="jurat">Jurat / verification on oath</option><option value="signature_witnessing">Signature witnessing</option><option value="certified_copy">Certified copy (when permitted)</option><option value="unsure">I’m not sure</option></select></label>`).join("")}`;}
    const allocation=wizardWitnessAllocation(form,"ron"),witnessCount=wizardValue(form,"ron_witness_need")==="yes"?allocation.customer:0;
    if(Number(witnessHost.dataset.count)!==witnessCount){witnessHost.dataset.count=String(witnessCount);witnessHost.innerHTML=witnessCount?`<h3>Customer-provided witnesses</h3>${Array.from({length:witnessCount},(_,index)=>`<div class="admin-v3-form-grid"><label>Witness ${index+1} legal name<input name="ron_witness_name_${index}" required></label><label>Witness ${index+1} email<input name="ron_witness_email_${index}" type="email"></label><label>Witness ${index+1} phone<input name="ron_witness_phone_${index}" type="tel"></label></div>`).join("")}`:"";}
    setWizardMobileStructuredFields(form);
  }
  function setWizardMobileStructuredFields(form) {
    const signerHost=$("#adminMobileSignerFields",form),actHost=$("#adminMobileActFields",form),witnessHost=$("#adminMobileWitnessFields",form);if(!signerHost||!actHost||!witnessHost)return;
    const signerCount=Math.min(10,Math.max(1,wizardNumber(form,"mobile_signer_count",1))),actCount=Math.max(1,wizardNumber(form,"mobile_notarization_count",1));
    if(Number(signerHost.dataset.count)!==signerCount){signerHost.dataset.count=String(signerCount);signerHost.innerHTML=`<h3>Structured signers</h3>${Array.from({length:signerCount},(_,index)=>`<fieldset><legend>Signer ${index+1} legal ID name</legend><div class="admin-v3-form-grid"><label>First name<input name="mobile_signer_first_${index}" required></label><label>Middle name (optional)<input name="mobile_signer_middle_${index}"></label><label>Last name<input name="mobile_signer_last_${index}" required></label><label>Email (optional)<input name="mobile_signer_email_${index}" type="email"></label><label>Phone (optional)<input name="mobile_signer_phone_${index}" type="tel"></label></div></fieldset>`).join("")}`;}
    if(Number(actHost.dataset.count)!==actCount){actHost.dataset.count=String(actCount);actHost.innerHTML=`<h3>Requested notarial acts</h3>${Array.from({length:actCount},(_,index)=>`<label>Act ${index+1}<select name="mobile_act_type_${index}" required><option value="acknowledgment">Acknowledgment</option><option value="jurat">Jurat / verification on oath</option><option value="signature_witnessing">Signature witnessing</option><option value="certified_copy">Certified copy (when permitted)</option><option value="unsure">I’m not sure</option></select></label>`).join("")}`;}
    const allocation=wizardWitnessAllocation(form,"mobile"),witnessCount=wizardValue(form,"mobile_witness_need")==="yes"?allocation.customer:0;
    if(Number(witnessHost.dataset.count)!==witnessCount){witnessHost.dataset.count=String(witnessCount);witnessHost.innerHTML=witnessCount?`<h3>Customer-provided witnesses</h3>${Array.from({length:witnessCount},(_,index)=>`<div class="admin-v3-form-grid"><label>Witness ${index+1} legal name<input name="mobile_witness_name_${index}" required></label><label>Witness ${index+1} email<input name="mobile_witness_email_${index}" type="email"></label><label>Witness ${index+1} phone<input name="mobile_witness_phone_${index}" type="tel"></label></div>`).join("")}`:"";}
  }
  function setWizardLoanSigningFields(form) {
    const host=$("#adminLoanSigningSignerFields",form);if(!host)return;
    const count=Math.min(10,Math.max(1,wizardNumber(form,"lsa_signer_count",1))),method=wizardValue(form,"lsa_signing_method");
    if(host.dataset.signature===`${count}:${method}`)return;
    const retained={};
    $$('input, select, textarea',host).forEach(control=>{retained[control.name]={value:control.value,checked:control.checked};});
    host.dataset.signature=`${count}:${method}`;
    host.innerHTML=`<h3>Structured signers</h3>${Array.from({length:count},(_,index)=>`<fieldset><legend>Signer ${index+1}</legend><div class="admin-v3-form-grid"><label>First name<input name="lsa_signer_first_${index}" required></label><label>Middle name (optional)<input name="lsa_signer_middle_${index}"></label><label>Last name<input name="lsa_signer_last_${index}" required></label><label>Individual email${method==="ron"?"":" (optional)"}<input name="lsa_signer_email_${index}" type="email" ${method==="ron"?"required":""}></label><label>Phone (optional)<input name="lsa_signer_phone_${index}" type="tel"></label></div>${index?`<label class="check"><input name="lsa_signer_same_address_${index}" type="checkbox"> Same address as Signer 1</label>`:""}<div class="admin-v3-form-grid" data-admin-lsa-address="${index}"><label>Signer address<input name="lsa_signer_street_${index}" required></label><label>City<input name="lsa_signer_city_${index}" required></label><label>State<input name="lsa_signer_state_${index}" value="TX" maxlength="2" required></label><label>ZIP<input name="lsa_signer_zip_${index}" required></label></div></fieldset>`).join("")}`;
    $$('input, select, textarea',host).forEach(control=>{const prior=retained[control.name];if(!prior)return;if(control.type==="checkbox")control.checked=prior.checked;else control.value=prior.value;});
    for(let index=1;index<count;index++){
      const shared=wizardChecked(form,`lsa_signer_same_address_${index}`),group=$(`[data-admin-lsa-address="${index}"]`,host);
      if(group){group.hidden=shared;$$('input, select, textarea',group).forEach(control=>{control.disabled=shared;});}
    }
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
    if (service === "loan_signing") details = `${labelFromStatus(wizardValue(form,"lsa_signing_type"))}; ${labelFromStatus(wizardValue(form,"lsa_signing_method"))}; ${wizardNumber(form,"lsa_signer_count",1)} signer(s)`;
    const signerPrefix=service==="ron"?"ron":service==="mobile"?"mobile":service==="loan_signing"?"lsa":null;
    const signerCount=signerPrefix?Math.max(1,wizardNumber(form,`${signerPrefix}_signer_count`,1)):0;
    const signerReview=signerPrefix?Array.from({length:signerCount},(_,index)=>[wizardValue(form,`${signerPrefix}_signer_first_${index}`),wizardValue(form,`${signerPrefix}_signer_middle_${index}`),wizardValue(form,`${signerPrefix}_signer_last_${index}`)].filter(Boolean).join(" ")).join("; "):"Not applicable";
    const actPrefix=service==="ron"?"ron":service==="mobile"?"mobile":null;
    const actCount=actPrefix?Math.max(1,wizardNumber(form,`${actPrefix}_notarization_count`,1)):0;
    const actReview=actPrefix?Array.from({length:actCount},(_,index)=>labelFromStatus(wizardValue(form,`${actPrefix}_act_type_${index}`)||"unsure")).join("; "):"Not applicable";
    const witnessReview=actPrefix?labelFromStatus(wizardValue(form,`${actPrefix}_witness_need`)||"no"):"Not applicable";
    const mobileOptions=service==="mobile"?[wizardChecked(form,"mobile_print_addon")?"Print preparation":null,wizardChecked(form,"mobile_scan_addon")?"Scan to PDF":null].filter(Boolean).join("; ")||"None":"Not applicable";
    const appointment = [wizardValue(form, "appointment_date") || wizardValue(form, "preferred_date"), wizardValue(form, "appointment_time") || wizardValue(form, "preferred_time_window")].filter(Boolean).join(" · ") || "Not scheduled";
    $("#adminWizardReview", form).innerHTML = `
      <article><h3>Customer</h3><dl>${reviewItem("Name", customer)}${reviewItem("Email", wizardValue(form, "email"))}${reviewItem("Phone", wizardValue(form, "phone"))}${reviewItem("Preferred contact", labelFromStatus(wizardValue(form, "preferred_contact")))}</dl></article>
      <article><h3>Service</h3><dl>${reviewItem("Service", serviceLabels[service])}${reviewItem("Details", details)}${reviewItem("Signers", signerReview)}${reviewItem("Requested acts", actReview)}${reviewItem("Witnesses", witnessReview)}${service==="mobile"?reviewItem("Mobile add-ons",mobileOptions):""}</dl></article>
      <article><h3>Appointment</h3><dl>${reviewItem("Requested / confirmed", appointment)}${reviewItem("Platform / location", service === "ron" ? wizardValue(form, "ron_platform") : service === "mobile" ? wizardValue(form, "appointment_location") : service === "loan_signing" ? labelFromStatus(wizardValue(form, "lsa_signing_method")) : labelFromStatus(wizardValue(form, "print_fulfillment")))}</dl></article>
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
    setWizardRonStructuredFields(form);
    setWizardMobileAddonFields(form);
    setWizardService(form);
    setWizardLoanSigningFields(form);
    setWizardWitnessFields(form);
    form.addEventListener("submit", createAdminRequest);
    form.elements.existing_customer_id?.addEventListener("change", () => selectExistingWizardCustomer(form));
    form.elements.service_type.forEach((control) => control.addEventListener("change", () => { setWizardService(form); setWizardWitnessFields(form); }));
    form.addEventListener("input", () => { setWizardRonStructuredFields(form); setWizardMobileAddonFields(form); setWizardService(form); setWizardLoanSigningFields(form); updateWizardEstimate(form); });
    form.addEventListener("change", (event) => { if (event.target.name?.endsWith("_witness_need")) setWizardWitnessFields(form); const match=String(event.target.name||"").match(/^lsa_signer_same_address_(\d+)$/);if(match){const group=$(`[data-admin-lsa-address="${match[1]}"]`,form);if(group){group.hidden=event.target.checked;$$('input',group).forEach(input=>input.disabled=event.target.checked);}} setWizardRonStructuredFields(form); setWizardMobileAddonFields(form); setWizardService(form); setWizardLoanSigningFields(form); updateWizardEstimate(form); });
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
      const mobileAddress=[collapseWhitespace(wizardValue(form,"mobile_street")),collapseWhitespace(wizardValue(form,"mobile_unit")),[collapseWhitespace(wizardValue(form,"mobile_city")),normalizeState(wizardValue(form,"mobile_state")||"TX")].filter(Boolean).join(", ")+` ${normalizeZip(wizardValue(form,"mobile_zip"))}`].filter(Boolean).join(", ");
      const requestPayload={service_type:service,status:"under_review",workflow_status:"under_review",preferred_date:wizardValue(form,"preferred_date")||null,preferred_time_window:wizardValue(form,"preferred_time_window")||null,notes:wizardValue(form,"notes")||"Created by administrator.",estimated_total:estimate.total,request_source:"admin",request_completeness:"submitted",document_state:"pending",participant_state:service==="print"?"not_applicable":"submitted",fulfillment_state:"not_started",document_upload_exception_reason:wizardValue(form,"document_upload_exception_reason")||null,document_upload_exception_detail:wizardValue(form,"document_upload_exception_detail")||null,customer_reported_source:wizardValue(form,"customer_reported_source")||null,customer_reported_source_detail:wizardValue(form,"customer_reported_source_detail")||null,first_touch_source:wizardValue(form,"customer_reported_source")||"admin_entered",appointment_date:appointmentDate||null,appointment_time:appointmentTime||null,appointment_timezone:(appointmentDate||appointmentTime)?wizardValue(form,"appointment_timezone")||"America/Chicago":null,appointment_location:service==="mobile"?mobileAddress||collapseWhitespace(wizardValue(form,"appointment_location"))||null:null,appointment_link:service==="ron"?wizardValue(form,"appointment_link")||null:null,appointment_platform:service==="ron"?wizardValue(form,"ron_platform")||null:null,appointment_instructions:wizardValue(form,"appointment_instructions")||null};
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
        serviceDetail={street_address:collapseWhitespace(wizardValue(form,"mobile_street"))||null,unit:collapseWhitespace(wizardValue(form,"mobile_unit"))||null,city:collapseWhitespace(wizardValue(form,"mobile_city"))||null,state:normalizeState(wizardValue(form,"mobile_state")||"TX"),zip:normalizeZip(wizardValue(form,"mobile_zip"))||null,number_of_signers:wizardNumber(form,"mobile_signer_count",1),number_of_notarizations:wizardNumber(form,"mobile_notarization_count",1),witnesses_needed:witnessNeed==="yes",witness_need:witnessNeed,witness_count:rawWitnessCount==="not_sure"?null:witnesses.total,witness_provider:wizardValue(form,"mobile_witness_provider")||null,client_witness_count:witnesses.customer,provided_witness_count:witnesses.aps,witness_review_required:witnessNeed==="not_sure"||wizardValue(form,"mobile_witness_provider")==="not_sure"||rawWitnessCount==="not_sure",print_add_on:wizardChecked(form,"mobile_print_addon"),scan_back_needed:false,scan_to_pdf_needed:wizardChecked(form,"mobile_scan_addon"),travel_miles:wizardNumber(form,"mobile_travel_miles")||null,travel_fee:(window.ALIGNED_PRICING?.mobile?.appointmentBase||50),dispatch_payment_required:(window.ALIGNED_PRICING?.mobile?.appointmentBase||50)};
        const signerCount=Math.min(10,Math.max(1,wizardNumber(form,"mobile_signer_count",1)));
        participants=Array.from({length:signerCount},(_,index)=>{const first=wizardValue(form,`mobile_signer_first_${index}`),middle=wizardValue(form,`mobile_signer_middle_${index}`),last=wizardValue(form,`mobile_signer_last_${index}`);return {participant_type:"signer",first_name:first,middle_name:middle||null,last_name:last,full_legal_name:[first,middle,last].filter(Boolean).join(" "),email:wizardValue(form,`mobile_signer_email_${index}`).toLowerCase()||null,mobile_phone:wizardValue(form,`mobile_signer_phone_${index}`)||null,identity_name_confirmed:true,sort_order:index};});
        for(let index=0;index<witnesses.customer;index++)participants.push({participant_type:"witness",full_legal_name:wizardValue(form,`mobile_witness_name_${index}`),email:wizardValue(form,`mobile_witness_email_${index}`).toLowerCase()||null,mobile_phone:wizardValue(form,`mobile_witness_phone_${index}`)||null,identity_name_confirmed:Boolean(wizardValue(form,`mobile_witness_name_${index}`)),sort_order:signerCount+index});
        const actCount=Math.max(1,wizardNumber(form,"mobile_notarization_count",1));
        notarialActs=Array.from({length:actCount},(_,index)=>({act_type:wizardValue(form,`mobile_act_type_${index}`)||"unsure"}));
      }
      if (service === "loan_signing") {
        serviceDetail={ordering_party_type:"individual",ordering_party_name:wizardValue(form,"lsa_ordering_party_name")||null,company_file_number:wizardValue(form,"lsa_company_file_number")||null,escrow_transaction_number:wizardValue(form,"lsa_escrow_number")||null,signing_type:wizardValue(form,"lsa_signing_type"),signing_method:wizardValue(form,"lsa_signing_method"),property_address_line1:wizardValue(form,"lsa_property_address")||null,signing_address_line1:wizardValue(form,"lsa_signing_address")||null,package_status:wizardValue(form,"lsa_package_status")||"not_provided",borrower_copy_required:"unknown",scanbacks_required:"unknown",approval_before_return_required:"unknown",physical_return_required:"unknown",return_method:wizardValue(form,"lsa_return_method")||null,stipulations:wizardValue(form,"lsa_stipulations")||null,lsa_stage:"assignment_received",pricing_source:"standard_aps",base_assignment_fee:estimate.total,agreed_fee:null,pricing_status:"draft",payment_terms:"prepaid"};
        const count=Math.min(10,Math.max(1,wizardNumber(form,"lsa_signer_count",1)));
        participants=Array.from({length:count},(_,index)=>{const first=wizardValue(form,`lsa_signer_first_${index}`),middle=wizardValue(form,`lsa_signer_middle_${index}`),last=wizardValue(form,`lsa_signer_last_${index}`),shared=index>0&&wizardChecked(form,`lsa_signer_same_address_${index}`),source=shared?0:index;return {participant_type:"signer",first_name:first,middle_name:middle||null,last_name:last,full_legal_name:[first,middle,last].filter(Boolean).join(" "),email:wizardValue(form,`lsa_signer_email_${index}`).toLowerCase()||null,mobile_phone:wizardValue(form,`lsa_signer_phone_${index}`)||null,address:{line1:wizardValue(form,`lsa_signer_street_${source}`),city:wizardValue(form,`lsa_signer_city_${source}`),state:wizardValue(form,`lsa_signer_state_${source}`),zip:wizardValue(form,`lsa_signer_zip_${source}`),...(shared?{shared_from_signer:1}:{})},identity_name_confirmed:true,sort_order:index};});
      }
      if (service === "print") {
        const pages = wizardNumber(form,"print_pages"); const copies = Math.max(1,wizardNumber(form,"print_copies",1)); const totalPages = pages*copies; const isColor=wizardValue(form,"print_color")==="color"; const fulfillment=wizardValue(form,"print_fulfillment")||"courier"; const printTotal=wizardPrintCost(form);
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
    if(view==="resources"){const data=await resourceCommand("snapshot");moduleState.resources={...moduleState.resources,...data};}
    if(["organizations","business-applications","staff-access"].includes(view)) await refreshBusinessFoundation();
    if(view==="settings") {const {data,error}=await adminClient.functions.invoke("admin-route-distance",{body:{command:"list_origins"}});moduleState.travelOrigins=data?.origins||[];moduleState.travelConfigured=Boolean(data?.configured&&!error);}
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
      const {data,error}=await adminClient.functions.invoke("operator-correspondence",{body:{command:"snapshot"}});
      moduleState.conversations=!error&&data?.ok?data.conversations||[]:[];
      moduleState.conversationMessages=!error&&data?.ok?data.messages||[]:[];
      moduleState.messages=moduleState.conversationMessages;
    }
    if(view==="templates") {
      const [{data},{TEMPLATE_SPECIFICATIONS}]=await Promise.all([
        adminClient.from("message_templates").select("*").eq("active",true).order("name"),
        import("../../supabase/functions/_shared/template-preview.mjs"),
      ]);
      moduleState.templates=data||[];
      moduleState.templateSpecifications=TEMPLATE_SPECIFICATIONS;
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
