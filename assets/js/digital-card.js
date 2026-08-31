(function (global) {
  "use strict";

  const COMPANY_SOCIALS = Object.freeze([
    "https://www.instagram.com/aligned.printscan",
    "https://www.facebook.com/profile.php?id=61593146406891",
    "https://www.youtube.com/@alignedprintscan",
  ]);

  const CARD_PROFILES = Object.freeze({
    company: Object.freeze({
      kind: "company",
      displayName: "Aligned Print & Scan",
      organization: "Aligned Print & Scan",
      primaryTitles: Object.freeze(["Online & Mobile Notary and Document Services"]),
      phoneDisplay: "469-383-8879",
      phoneE164: "+14693838879",
      email: "hello@alignedprintscan.com",
      primaryUrl: "https://alignedprintscan.com/",
      secondaryUrls: COMPANY_SOCIALS,
      note: "Online when you can. Mobile when you need it.",
    }),
    doneisha: Object.freeze({
      kind: "professional",
      slug: "doneisha",
      displayName: "Doneisha Maat Ra",
      portrait: "assets/images/professionals/doneisha-approved-portrait.png",
      portraitAlt: "Professional portrait of Doneisha Maat Ra",
      credentials: Object.freeze([
        "Texas Notary Public",
        "Online Notary Public",
        "Loan Signing Agent",
      ]),
      supportingCredentials: Object.freeze([
        "NNA Certified Notary Signing Agent",
        "Bonded & Insured",
      ]),
      organization: "Aligned Print & Scan",
      professionalEmail: "doneisha@alignedprintscan.com",
      phoneDisplay: "469-383-8879",
      phoneE164: "+14693838879",
      primaryUrl: "https://alignedprintscan.com/doneisha",
      secondaryUrls: Object.freeze(["https://alignedprintscan.com/", ...COMPANY_SOCIALS]),
      services: Object.freeze([
        "Remote Online Notarization",
        "Mobile Notary Services",
        "Loan Signing Services",
        "Print / Scan / Document Services",
      ]),
      requestUrl: "pricing.html?utm_source=doneisha_professional_card&utm_medium=digital_card#request",
      note: "NNA Certified Notary Signing Agent | Bonded & Insured",
    }),
  });
  const PROFESSIONALS = Object.freeze({ doneisha: CARD_PROFILES.doneisha });

  function textList(element, values) {
    if (!element) return;
    element.replaceChildren(...values.map((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      return item;
    }));
  }

  function escapeVCard(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function vCardFor(profile) {
    const titles = profile.primaryTitles || profile.credentials || [];
    const familyName = profile.kind === "professional" ? "Maat Ra" : "";
    const givenName = profile.kind === "professional" ? "Doneisha" : profile.displayName;
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${escapeVCard(familyName)};${escapeVCard(givenName)};;;`,
      `FN:${escapeVCard(profile.displayName)}`,
      `ORG:${escapeVCard(profile.organization)}`,
      `TITLE:${escapeVCard(titles.join(" | "))}`,
      `TEL;TYPE=CELL,VOICE:${profile.phoneE164}`,
      `EMAIL;TYPE=INTERNET,WORK:${escapeVCard(profile.email || profile.professionalEmail)}`,
      `URL;TYPE=WORK:${profile.primaryUrl}`,
      ...(profile.secondaryUrls || []).map((url) => `URL:${url}`),
      `NOTE:${escapeVCard(profile.note)}`,
      "END:VCARD",
      "",
    ].join("\r\n");
  }

  function analyticsEvent(action, cardType) {
    global.APSGrowth?.event("digital_card_action", { action, card_type: cardType });
  }

  function bindActionEvents(cardType) {
    document.querySelectorAll("[data-card-action]").forEach((control) => {
      control.addEventListener("click", () => analyticsEvent(control.dataset.cardAction, cardType));
    });
  }

  function renderProfessional(profile) {
    document.querySelector("[data-professional-name]").textContent = profile.displayName;
    textList(document.querySelector("[data-professional-credentials]"), profile.credentials);
    const supporting = document.querySelector("[data-professional-supporting]");
    if (supporting) supporting.textContent = profile.supportingCredentials.join(" | ");

    const portrait = document.querySelector("[data-professional-portrait]");
    const placeholder = document.querySelector("[data-portrait-placeholder]");
    portrait.alt = profile.portraitAlt;
    portrait.addEventListener("load", () => { portrait.hidden = false; placeholder.hidden = true; });
    portrait.addEventListener("error", () => { portrait.hidden = true; placeholder.hidden = false; });
    portrait.src = profile.portrait;

    document.querySelector("[data-contact-call]").href = `tel:${profile.phoneE164}`;
    document.querySelector("[data-contact-text]").href = `sms:${profile.phoneE164}`;
    document.querySelector("[data-contact-email]").href = `mailto:${profile.professionalEmail}`;
    document.querySelector("[data-contact-phone]").href = `tel:${profile.phoneE164}`;
    document.querySelector("[data-contact-phone]").textContent = profile.phoneDisplay;
    document.querySelector("[data-contact-email-text]").href = `mailto:${profile.professionalEmail}`;
    document.querySelector("[data-contact-email-text]").textContent = profile.professionalEmail;
    document.querySelector("[data-request-service]").href = profile.requestUrl;

    document.querySelector("[data-save-contact]").addEventListener("click", () => {
      document.querySelector("[data-card-status]").textContent = "Contact card ready to open or save.";
    });
  }

  const cardType = document.body.dataset.digitalCard;
  if (cardType === "professional") {
    const profile = PROFESSIONALS[document.body.dataset.professionalSlug];
    if (profile) renderProfessional(profile);
  }
  bindActionEvents(cardType);
  global.APSGrowth?.event("digital_card_view", { card_type: cardType }, `digital_card_view:${cardType}`);

  global.APSDigitalCards = Object.freeze({ CARD_PROFILES, PROFESSIONALS, vCardFor });
})(window);
