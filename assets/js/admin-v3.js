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
      under_review: { label: "Build Quote", tab: "payments" },
      quote_ready: { label: "Review & Send Quote", tab: "payments" },
      awaiting_approval: { label: "Review Quote", tab: "payments" },
      changes_requested: { label: "Revise Quote", tab: "payments" },
      awaiting_payment: { label: "Open Invoice #1", tab: "payments" },
      payment_pending: { label: "Review Payment", tab: "payments" },
      payment_received: { label: "Schedule Appointment", tab: "appointment" },
      appointment_confirmed: { label: "Open Appointment", tab: "appointment" },
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
    const heading = $("h3", node)?.textContent?.trim().toLowerCase() || "";
    const text = node.textContent?.trim().toLowerCase() || "";

    if (index === 0 && node.classList.contains("admin-detail-grid")) {
      return "overview";
    }
    if (text.includes("workflow") && text.includes("recommended action")) {
      return "overview";
    }
    if (heading.includes("quote builder")) return "payments";
    if (heading.includes("invoice payment")) return "payments";
    if (heading.includes("appointment")) return "appointment";
    if (heading.includes("service details")) return "customer";
    if (heading.includes("uploaded files")) return "documents";
    if (heading.includes("communication log")) return "communication";
    if (heading.includes("automatic timeline")) return "timeline";
    if (heading.includes("cancellation") || heading.includes("reschedule")) return "overview";
    if (heading.includes("status update")) return "notes";

    return "overview";
  }

  /** Create a helpful empty panel for modules planned for later integration. */
  function createPlaceholder(tabName) {
    const copy = {
      ron: [
        "RON Session",
        "Proof session creation, participant invitations, identity status, recording, audit trail, and completion records will live here.",
      ],
      communication: [
        "Communication",
        "Customer emails, reminders, support messages, and delivery history will appear in one unified conversation timeline.",
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
      "payments",
      "appointment",
      "ron",
      "communication",
      "timeline",
      "notes",
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

    ["ron", "communication", "timeline"].forEach((tabName) => {
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
  const moduleState = { requests: [], supportTickets: [], activeView: "requests" };
  const appView = $("#requests");
  const moduleView = $("#adminModuleView");
  const moduleContent = $("#adminModuleContent");
  const moduleTitles = {
    dashboard: ["Overview", "Operations Dashboard", "Live request, schedule, and revenue indicators."],
    calendar: ["Operations", "Calendar", "Upcoming requested and confirmed appointment dates."],
    invoices: ["Financial", "Invoices", "Request-level invoice status and outstanding balances."],
    payments: ["Financial", "Payments", "Paid-to-date and remaining balance visibility."],
    customers: ["Clients", "Customers", "Customer directory built from active service requests."],
    documents: ["Documents", "Document Manager", "Open a request to review or upload its documents."],
    templates: ["Documents", "Templates", "Reusable operational templates and quick-start resources."],
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
  function renderCalendar() {
    const rows=activeRequests().filter(r=>r.appointment_date||r.preferred_date).sort((a,b)=>String(a.appointment_date||a.preferred_date).localeCompare(String(b.appointment_date||b.preferred_date)));
    if(!rows.length)return '<div class="admin-v3-module-card admin-v3-empty-module"><h3>No scheduled dates</h3><p>Requested and confirmed appointment dates will appear here.</p></div>';
    return `<div class="admin-v3-calendar-list">${rows.map(r=>{const c=getCustomer(r)||{};const date=r.appointment_date||r.preferred_date;const time=r.appointment_time||r.preferred_time_window||"Time not set";return `<article class="admin-v3-calendar-item"><strong>${safe(new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}))}</strong><div><h3>${safe(`${c.first_name||""} ${c.last_name||""}`.trim()||"Client")}</h3><p>${safe(time)} · ${safe(labelFromStatus(r.service_type))}</p></div><button class="admin-v3-button admin-v3-button--outline module-open-request" data-request-id="${safe(r.id)}" data-tab="appointment" type="button">Open</button></article>`}).join("")}</div>`;
  }
  function renderNewRequest() {
    return `<form id="adminCreateRequestForm" class="admin-v3-module-card"><div class="admin-v3-form-grid"><label>First name<input name="first_name" required autocomplete="given-name"></label><label>Last name<input name="last_name" required autocomplete="family-name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label><label>Service<select name="service_type" required><option value="ron">Remote Online Notary</option><option value="mobile">Mobile Notary</option><option value="print">Print & Scan</option></select></label><label>Preferred contact<select name="preferred_contact"><option value="email">Email</option><option value="phone">Phone</option><option value="text">Text</option></select></label><label>Requested date<input name="preferred_date" type="date"></label><label>Time window<input name="preferred_time_window" placeholder="Example: 3–4 PM"></label><label class="wide">Internal/order notes<textarea name="notes" rows="5" placeholder="How the order was received, document type, special instructions, and follow-up needed."></textarea></label></div><div class="admin-v3-form-actions"><button class="admin-v3-button admin-v3-button--outline" data-cancel-new type="button">Cancel</button><button class="admin-v3-button admin-v3-button--gold" type="submit">Create Order</button></div><p id="adminCreateRequestStatus" aria-live="polite"></p></form>`;
  }
  function renderModule(view) {
    const rows=activeRequests();
    if(view==="dashboard") return renderDashboard();
    if(view==="calendar") return renderCalendar();
    if(view==="new") return renderNewRequest();
    if(view==="invoices") return table(rows,[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Invoice status",render:r=>safe(labelFromStatus(r.invoice_status||r.payment_status||"not_created"))},{label:"Quoted",render:r=>displayMoney(r.quote_amount||r.estimated_total)},{label:"Balance",render:r=>displayMoney(r.balance_due)}]);
    if(view==="payments") return table(rows,[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Paid",render:r=>displayMoney(r.paid_amount)},{label:"Balance",render:r=>displayMoney(r.balance_due)},{label:"State",render:r=>safe(labelFromStatus(r.payment_state||r.payment_status||"not_started"))}]);
    if(view==="customers") return table(rows,[{label:"Customer",render:r=>{const c=getCustomer(r)||{};return safe(`${c.first_name||""} ${c.last_name||""}`.trim()||"Client");}},{label:"Email",render:r=>safe((getCustomer(r)||{}).email||"")},{label:"Phone",render:r=>safe((getCustomer(r)||{}).phone||"")},{label:"Service",render:r=>safe(labelFromStatus(r.service_type))}]);
    if(view==="documents") return `<div class="admin-v3-module-card"><h2>Request document workspace</h2><p>Document access remains securely scoped to each request. Open a request directly in its Documents tab.</p></div>${table(rows,[{label:"Request",render:r=>safe(`APS-${String(r.id).slice(0,8).toUpperCase()}`)},{label:"Customer",render:r=>{const c=getCustomer(r)||{};return safe(`${c.first_name||""} ${c.last_name||""}`.trim()||"Client");}},{label:"Service",render:r=>safe(labelFromStatus(r.service_type))},{label:"Pages detected",render:r=>safe(r.detected_pdf_page_count||"—")}])}`;
    if(view==="templates") return '<div class="admin-v3-module-grid"><article class="admin-v3-module-card"><h3>Quote & invoice items</h3><p>Use the request Payments tab to build a quote from centralized APS pricing.</p></article><article class="admin-v3-module-card"><h3>Customer status emails</h3><p>Approved status messages remain connected to the existing Resend functions.</p></article><article class="admin-v3-module-card"><h3>Appointment instructions</h3><p>Store appointment links, location, platform, and preparation notes in each request.</p></article><article class="admin-v3-module-card"><h3>Support responses</h3><p>Use the Support module to track customer follow-up and internal notes.</p></article></div>';
    if(view==="support") {const tickets=moduleState.supportTickets;return `<div class="admin-v3-module-grid"><article class="admin-v3-module-card admin-v3-kpi"><span>Open tickets</span><strong>${tickets.length}</strong></article></div><div class="admin-v3-module-card"><h2>Support workspace</h2><p>Open the request workspace to use the full support controls already connected to Supabase.</p><button class="admin-v3-button admin-v3-button--navy" id="openLegacySupport" type="button">Open support controls</button></div>`;}
    if(view==="settings") return '<div class="admin-v3-module-grid"><article class="admin-v3-module-card"><h3>Supabase</h3><p>Request storage, authentication, files, and realtime updates are connected through the existing configuration.</p></article><article class="admin-v3-module-card"><h3>Stripe</h3><p>Invoice checkout and webhook logic remain unchanged by this milestone.</p></article><article class="admin-v3-module-card"><h3>Resend</h3><p>Transactional email functions remain unchanged by this milestone.</p></article><article class="admin-v3-module-card"><h3>Proof</h3><p>Live RON session integration remains deferred to a later milestone.</p></article></div>';
    return renderDashboard();
  }
  function bindModuleActions() {
    $$(".module-open-request", moduleContent).forEach(button=>button.addEventListener("click",()=>openRequestFromModule(button.dataset.requestId,button.dataset.tab||"overview")));
    $("[data-cancel-new]", moduleContent)?.addEventListener("click",()=>showAdminView("requests"));
    $("#adminCreateRequestForm", moduleContent)?.addEventListener("submit", createAdminRequest);
    $("#openLegacySupport", moduleContent)?.addEventListener("click",()=>showAdminView("requests"));
  }
  async function createAdminRequest(event) {
    event.preventDefault(); const form=event.currentTarget; const status=$("#adminCreateRequestStatus"); const submit=form.querySelector('[type="submit"]');
    submit.disabled=true; status.textContent="Creating request…";
    try { const values=Object.fromEntries(new FormData(form).entries());
      const {data:customer,error:customerError}=await adminClient.from("customers").insert({first_name:values.first_name.trim(),last_name:values.last_name.trim(),email:values.email.trim(),phone:values.phone.trim()||null,preferred_contact:values.preferred_contact||"email"}).select("id").single();
      if(customerError) throw customerError;
      const {data:request,error:requestError}=await adminClient.from("service_requests").insert({customer_id:customer.id,service_type:values.service_type,status:"under_review",workflow_status:"under_review",preferred_date:values.preferred_date||null,preferred_time_window:values.preferred_time_window.trim()||null,notes:values.notes.trim()||"Created by administrator."}).select("id").single();
      if(requestError) throw requestError;
      status.textContent="Request created successfully."; await loadRequests(); openRequestFromModule(request.id);
    } catch(error) {status.textContent=`Could not create request: ${error.message||error}`;} finally {submit.disabled=false;}
  }
  function showAdminView(view) {
    moduleState.activeView=view;
    const isRequests=view==="requests";
    appView.hidden=!isRequests; moduleView.hidden=isRequests;
    if(!isRequests){const labels=moduleTitles[view]||moduleTitles.dashboard;$("#moduleEyebrow").textContent=labels[0];$("#moduleTitle").textContent=labels[1];$("#moduleSubtitle").textContent=labels[2];moduleContent.innerHTML=renderModule(view);bindModuleActions();}
    $$('[data-admin-view]').forEach(link=>link.classList.toggle("is-active",(view==="dashboard"&&link.textContent.includes("Dashboard"))||link.dataset.adminView===view));
    window.scrollTo({top:0,behavior:"auto"});
  }
  window.addEventListener("aps:requests-loaded",event=>{moduleState.requests=event.detail.requests||[];if(moduleState.activeView!=="requests")showAdminView(moduleState.activeView);});
  window.addEventListener("aps:support-loaded",event=>{moduleState.supportTickets=event.detail.supportTickets||[];if(moduleState.activeView==="support")showAdminView("support");});
  $("#returnToRequests")?.addEventListener("click",()=>showAdminView("requests"));
  $("#newRequestButton")?.replaceWith($("#newRequestButton").cloneNode(true));
  $("#newRequestButton")?.addEventListener("click",()=>showAdminView("new"));
  $$('[data-admin-view]').forEach(link=>{const clone=link.cloneNode(true);link.replaceWith(clone);clone.addEventListener("click",event=>{event.preventDefault();const view=clone.dataset.adminView;showAdminView(view==="requests"&&clone.textContent.includes("Dashboard")?"dashboard":view);});});

  /** Public bridge used by admin.js after it resolves a selected request. */
  window.AdminV3 = {
    syncSelectedRequest,
    organizeRequestDetail,
    activateTab,
    filterVisibleRequestCards,
    showAdminView,
  };
})();
