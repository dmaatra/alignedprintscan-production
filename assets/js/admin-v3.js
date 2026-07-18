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

    $("#workspacePrimaryAction").disabled = false;
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
      button.classList.toggle(
        "is-active",
        button.dataset.workspaceTab === tabName,
      );
    });

    $$('[data-v3-tab-panel]', detailRoot).forEach((panel) => {
      panel.classList.toggle(
        "is-active",
        panel.dataset.v3TabPanel === tabName,
      );
    });

    resetWorkspaceScroll();
  }

  /** Filter the rendered request queue without another database request. */
  function filterVisibleRequestCards(searchTerm) {
    const normalized = String(searchTerm || "").trim().toLowerCase();

    $$("#requestList .request-card").forEach((card) => {
      card.hidden = normalized && !card.textContent.toLowerCase().includes(normalized);
    });
  }

  /** Keep request counters in the new shell synchronized with rendered cards. */
  function syncRequestCount() {
    const count = $$("#requestList .request-card").length;
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
      filterVisibleRequestCards(event.target.value);
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

    $("#workspacePrimaryAction")?.addEventListener("click", () => {
      const status = $("#workspaceStatus")?.textContent?.toLowerCase() || "";
      activateTab(status.includes("payment") ? "payments" : "overview");
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

  /** Public bridge used by admin.js after it resolves a selected request. */
  window.AdminV3 = {
    syncSelectedRequest,
    organizeRequestDetail,
    activateTab,
  };
})();
