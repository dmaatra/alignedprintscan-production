import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const interactionsSource = await readFile(
  new URL("../assets/js/admin-interactions.js", import.meta.url),
  "utf8",
);
const adminSource = await readFile(
  new URL("../assets/js/admin.js", import.meta.url),
  "utf8",
);
const adminV3Source = await readFile(
  new URL("../assets/js/admin-v3.js", import.meta.url),
  "utf8",
);

function loadInteractions() {
  const window = {
    location: { pathname: "/admin-dashboard.html", search: "?release=test", hash: "#requests" },
    history: {
      replaceState(_state, _title, url) {
        window.lastRoute = url;
        window.location.hash = url.slice(url.indexOf("#"));
      },
    },
  };
  vm.runInNewContext(interactionsSource, { window, WeakMap, Set });
  return window;
}

class StableRoot {
  constructor() {
    this.listeners = [];
  }

  addEventListener(type, listener) {
    if (type === "click") this.listeners.push(listener);
  }

  contains(target) {
    return target.inside !== false;
  }

  click(target) {
    const event = {
      target,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    this.listeners.forEach((listener) => listener(event));
    return event;
  }
}

function target(selector, { id, view, text = "" } = {}) {
  const node = {
    dataset: { id, adminView: view },
    textContent: text,
    inside: true,
    closest(candidate) { return candidate === selector ? node : null; },
  };
  return node;
}

test("Customers sidebar activation executes the production routing handler", () => {
  const { APSAdminInteractions } = loadInteractions();
  const sidebar = new StableRoot();
  const rendered = [];
  APSAdminInteractions.bindAdminNavigation(sidebar, (view) => rendered.push(view));
  const event = sidebar.click(target("[data-admin-view]", { view: "customers", text: "Customers" }));
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(rendered, ["customers"]);
});

test("Review Queue sidebar activation executes the production routing handler", () => {
  const { APSAdminInteractions } = loadInteractions();
  const sidebar = new StableRoot();
  const rendered = [];
  APSAdminInteractions.bindAdminNavigation(sidebar, (view) => rendered.push(view));
  sidebar.click(target("[data-admin-view]", { view: "review", text: "Review Queue" }));
  assert.deepEqual(rendered, ["review"]);
});

test("Templates and Payments retain normal module routing", () => {
  const { APSAdminInteractions } = loadInteractions();
  const sidebar = new StableRoot();
  const rendered = [];
  APSAdminInteractions.bindAdminNavigation(sidebar, (view) => rendered.push(view));
  sidebar.click(target("[data-admin-view]", { view: "templates", text: "Templates" }));
  sidebar.click(target("[data-admin-view]", { view: "payments", text: "Payments" }));
  assert.deepEqual(rendered, ["templates", "payments"]);
});

test("Requests and Dashboard links with the shared data value resolve distinctly", () => {
  const { APSAdminInteractions } = loadInteractions();
  assert.equal(APSAdminInteractions.adminViewFor(target("[data-admin-view]", { view: "requests", text: "Requests" })), "requests");
  assert.equal(APSAdminInteractions.adminViewFor(target("[data-admin-view]", { view: "requests", text: "Dashboard" })), "dashboard");
});

test("request A to request B selection updates selected row and workspace content", () => {
  const { APSAdminInteractions } = loadInteractions();
  const list = new StableRoot();
  const state = { selectedId: null, workspaceReference: null };
  APSAdminInteractions.bindRequestSelection(list, (id) => {
    state.selectedId = id;
    state.workspaceReference = `APS-${id.toUpperCase()}`;
  });
  list.click(target(".request-row", { id: "request-a" }));
  assert.deepEqual(state, { selectedId: "request-a", workspaceReference: "APS-REQUEST-A" });
  list.click(target(".request-row", { id: "request-b" }));
  assert.deepEqual(state, { selectedId: "request-b", workspaceReference: "APS-REQUEST-B" });
});

test("request selection survives list rerenders and search/filter refreshes", () => {
  const { APSAdminInteractions } = loadInteractions();
  const list = new StableRoot();
  const selected = [];
  APSAdminInteractions.bindRequestSelection(list, (id) => selected.push(id));
  list.click(target(".request-row", { id: "before-render" }));
  const replacementRow = target(".request-row", { id: "after-render" });
  list.click(replacementRow);
  replacementRow.dataset.id = "after-filter";
  list.click(replacementRow);
  assert.deepEqual(selected, ["before-render", "after-render", "after-filter"]);
});

test("duplicate initialization does not produce duplicate actions", () => {
  const { APSAdminInteractions } = loadInteractions();
  const sidebar = new StableRoot();
  let actions = 0;
  const showView = () => { actions += 1; };
  APSAdminInteractions.bindAdminNavigation(sidebar, showView);
  APSAdminInteractions.bindAdminNavigation(sidebar, showView);
  sidebar.click(target("[data-admin-view]", { view: "customers", text: "Customers" }));
  assert.equal(sidebar.listeners.length, 1);
  assert.equal(actions, 1);
});

test("module hash stays synchronized without discarding query state", () => {
  const window = loadInteractions();
  window.APSAdminInteractions.syncViewHash("review");
  assert.equal(window.lastRoute, "/admin-dashboard.html?release=test#review");
  assert.equal(window.location.hash, "#review");
});

test("mobile-width navigation uses the same stable delegated path", () => {
  const { APSAdminInteractions } = loadInteractions();
  const sidebar = new StableRoot();
  sidebar.viewportWidth = 390;
  const rendered = [];
  APSAdminInteractions.bindAdminNavigation(sidebar, (view) => rendered.push(view));
  sidebar.click(target("[data-admin-view]", { view: "customers", text: "Customers" }));
  assert.deepEqual(rendered, ["customers"]);
});

test("production files use delegated bindings and preserve PR #12 action paths", () => {
  assert.match(adminSource, /bindRequestSelection\(/);
  assert.doesNotMatch(adminSource, /\$\$\("\.request-row", list\)\.forEach/);
  assert.match(adminV3Source, /bindAdminNavigation\(/);
  assert.doesNotMatch(adminV3Source, /clone\.addEventListener\("click"/);
  assert.match(adminV3Source, /if\(view==="customers"\) return renderCustomerMergeButton\(\)\+renderCustomers\(\)/);
  assert.match(adminV3Source, /if\(view==="review"\) return renderReviewQueue\(\)/);
  assert.match(adminV3Source, /customer-history-toggle/);
  assert.match(adminV3Source, /module-open-request/);
  assert.match(adminSource, /archiveRequestBtn/);
  assert.match(adminSource, /permanentDeleteRequestBtn/);
});
