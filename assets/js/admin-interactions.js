/** Stable delegated interaction bindings for the APS admin application. */
((global) => {
  "use strict";

  const bindings = new WeakMap();

  function bindOnce(root, key, selector, handler, options) {
    if (!root) return;
    const rootBindings = bindings.get(root) || new Set();
    if (rootBindings.has(key)) return;
    rootBindings.add(key);
    bindings.set(root, rootBindings);
    root.addEventListener("click", (event) => {
      const target = event.target.closest(selector);
      if (!target || !root.contains(target)) return;
      handler(event, target);
    }, options);
  }

  function adminViewFor(link) {
    const view = link?.dataset?.adminView || "requests";
    return view === "requests" && link.textContent.includes("Dashboard")
      ? "dashboard"
      : view;
  }

  function bindAdminNavigation(root, showView) {
    bindOnce(root, "admin-navigation", "[data-admin-view]", (event, link) => {
      event.preventDefault();
      showView(adminViewFor(link));
    });
  }

  function bindRequestSelection(root, selectRequest) {
    bindOnce(root, "request-selection", ".request-row", (_event, row) => {
      selectRequest(row.dataset.id);
    }, { capture: true });
  }

  function syncViewHash(view, locationObject = global.location, historyObject = global.history) {
    if (!locationObject || !historyObject || !view) return;
    const hash = `#${view}`;
    if (locationObject.hash === hash) return;
    historyObject.replaceState(null, "", `${locationObject.pathname}${locationObject.search}${hash}`);
  }

  global.APSAdminInteractions = {
    adminViewFor,
    bindAdminNavigation,
    bindRequestSelection,
    syncViewHash,
  };
})(window);
