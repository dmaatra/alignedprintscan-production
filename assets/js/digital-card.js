(function (global) {
  "use strict";

  const PROFESSIONALS = Object.freeze({
    doneisha: Object.freeze({
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
        "NNA Certified Loan Signing Agent",
        "Bonded & Insured",
      ]),
      organization: "Aligned Print & Scan",
      professionalEmail: "doneisha@alignedprintscan.com",
      phoneDisplay: "469-383-8879",
      phoneE164: "+14693838879",
      website: "https://alignedprintscan.com/",
      services: Object.freeze([
        "Remote Online Notarization",
        "Mobile Notary Services",
        "Loan Signing Services",
        "Print / Scan / Document Services",
      ]),
      requestUrl: "pricing.html?utm_source=doneisha_professional_card&utm_medium=digital_card#request",
      vcardTitle: "Texas Notary Public",
    }),
  });

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
    const credentials = [...profile.credentials, ...profile.supportingCredentials].join(", ");
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${escapeVCard("Maat Ra")};${escapeVCard("Doneisha")};;;`,
      `FN:${escapeVCard(profile.displayName)}`,
      `ORG:${escapeVCard(profile.organization)}`,
      `TITLE:${escapeVCard(profile.vcardTitle)}`,
      `ROLE:${escapeVCard(credentials)}`,
      `TEL;TYPE=CELL,VOICE:${profile.phoneE164}`,
      `EMAIL;TYPE=INTERNET,WORK:${escapeVCard(profile.professionalEmail)}`,
      `URL:${profile.website}`,
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
    if (supporting) supporting.textContent = profile.supportingCredentials.join(" • ");

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
      analyticsEvent("save_contact", "professional");
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

  global.APSDigitalCards = Object.freeze({ PROFESSIONALS, vCardFor });
})(window);
