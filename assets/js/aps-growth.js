(function (global) {
  "use strict";

  const STORAGE_KEY = "aps_first_touch_v1";
  const SESSION_KEY = "aps_request_touch_v1";
  const SENT_KEY = "aps_analytics_events_v1";
  const SAFE = /^[a-z0-9._-]{1,100}$/i;
  const PUBLIC_PATHS = new Set(["/", "/index.html", "/pricing.html", "/remote-online-notary.html", "/mobile-notary.html", "/print-scan.html", "/faq.html", "/terms.html", "/privacy.html", "/accessibility.html", "/support.html"]);
  const ANALYTICS_PATHS = new Set([...PUBLIC_PATHS, "/success.html"]);

  function clean(value) {
    const text = String(value || "").trim().slice(0, 100);
    return SAFE.test(text) ? text.toLowerCase() : null;
  }
  function safeLanding() {
    return ANALYTICS_PATHS.has(location.pathname) ? location.pathname : "/";
  }
  function safeReferrer() {
    if (!document.referrer) return null;
    try {
      const url = new URL(document.referrer);
      return url.origin === location.origin ? "internal" : clean(url.hostname);
    } catch { return null; }
  }
  function touch() {
    const params = new URLSearchParams(location.search);
    if (!PUBLIC_PATHS.has(location.pathname)) return read(SESSION_KEY);
    const value = {
      landing_page: safeLanding(),
      referrer_host: safeReferrer(),
      utm_source: clean(params.get("utm_source")),
      utm_medium: clean(params.get("utm_medium")),
      utm_campaign: clean(params.get("utm_campaign")),
      utm_content: clean(params.get("utm_content")),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return value;
  }
  function read(key) { try { return JSON.parse((key === STORAGE_KEY ? localStorage : sessionStorage).getItem(key) || "null"); } catch { return null; } }
  function attribution() { return { first_touch: read(STORAGE_KEY) || touch(), request_touch: read(SESSION_KEY) || touch() }; }
  function serviceCategory(value) { return ({ ron: "RON", mobile: "Mobile Notary", print: "Print & Scan" })[value] || null; }
  function measurementId() {
    const value = String(global.APS_ANALYTICS_MEASUREMENT_ID || "");
    return /^G-[A-Z0-9]+$/.test(value) ? value : null;
  }
  function loadAnalytics() {
    const id = measurementId();
    if (!id || !ANALYTICS_PATHS.has(location.pathname)) return false;
    global.dataLayer = global.dataLayer || [];
    global.gtag = global.gtag || function () { global.dataLayer.push(arguments); };
    global.gtag("js", new Date());
    global.gtag("config", id, { page_location: `${location.origin}${safeLanding()}`, page_referrer: safeReferrer() || "", allow_google_signals: false, allow_ad_personalization_signals: false });
    const script = document.createElement("script"); script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`; document.head.append(script);
    return true;
  }
  function event(name, params = {}, onceKey = "") {
    if (!/^(request_service_view|request_started|service_selected|request_submitted|quote_viewed|quote_approved|payment_checkout_started|customer_portal_opened)$/.test(name)) return false;
    const sent = new Set(JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]"));
    const key = onceKey || name;
    if (sent.has(key)) return false;
    const payload = {};
    if (params.service_category && ["RON", "Mobile Notary", "Print & Scan"].includes(params.service_category)) payload.service_category = params.service_category;
    if (typeof global.gtag === "function") global.gtag("event", name, payload);
    sent.add(key); sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent]));
    return true;
  }

  if (PUBLIC_PATHS.has(location.pathname)) touch();
  loadAnalytics();
  global.APSGrowth = Object.freeze({ attribution, event, serviceCategory, safeLanding, safeReferrer });
})(window);
