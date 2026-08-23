(async () => {
  "use strict";
  const path = location.pathname.split("/").filter(Boolean),
    slug = new URLSearchParams(location.search).get("slug") || path.at(-1),
    endpoint =
      "https://sfsdniavqldgbiretply.supabase.co/functions/v1/operator-card-public",
    status = document.querySelector("[data-status]"),
    escV = (value) =>
      String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(
        /,/g,
        "\\,",
      ).replace(/;/g, "\\;");
  try {
    const response = await fetch(
        `${endpoint}?slug=${encodeURIComponent(slug)}&format=json`,
      ),
      profile = await response.json();
    if (!response.ok || !profile?.card_slug) {
      throw new Error("This professional card is unavailable.");
    }
    document.title = `${profile.full_name} | Aligned Print & Scan`;
    document.querySelector("[data-operator-name]").textContent =
      profile.full_name;
    document.querySelector("[data-operator-title]").textContent =
      profile.public_title || "";
    const list = document.querySelector("[data-operator-credentials]");
    list.replaceChildren(...profile.credentials.map((value) => {
      const li = document.createElement("li");
      li.textContent = value;
      return li;
    }));
    document.querySelector("[data-operator-assurance]").textContent = profile
      .assurance_indicators.join(" & ");
    const portrait = document.querySelector("[data-operator-portrait]"),
      placeholder = document.querySelector("[data-portrait-placeholder]");
    portrait.onload = () => {
      portrait.hidden = false;
      placeholder.hidden = true;
    };
    portrait.src = profile.portrait_url;
    portrait.alt = `Professional portrait of ${profile.full_name}`;
    for (
      const [selector, href, label] of [[
        "[data-call]",
        `tel:${profile.company_phone_e164}`,
        profile.company_phone_display,
      ], [
        "[data-text]",
        `sms:${profile.company_phone_e164}`,
        profile.company_phone_display,
      ], [
        "[data-email]",
        `mailto:${profile.professional_email}`,
        profile.professional_email,
      ], [
        "[data-phone]",
        `tel:${profile.company_phone_e164}`,
        profile.company_phone_display,
      ], [
        "[data-email-text]",
        `mailto:${profile.professional_email}`,
        profile.professional_email,
      ]]
    ) {
      const node = document.querySelector(selector);
      node.href = href;
      if (selector.includes("phone]") || selector.includes("email-text")) {
        node.textContent = label;
      }
    }
    document.querySelector("[data-request-service]").href =
      `/pricing.html?utm_source=${
        encodeURIComponent(slug)
      }_professional_card&utm_medium=digital_card#request`;
    const cardUrl =
      `https://alignedprintscan.com/professionals/${profile.card_slug}`;
    document.querySelector("[data-save-contact]").onclick = () => {
        const vcard = [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${escV(profile.full_name)}`,
          `N:${escV(profile.last_name)};${escV(profile.first_name)};${escV(profile.middle_name)};;`,
          `ORG:Aligned Print & Scan`,
          `TITLE:${escV(profile.public_title)}`,
          `TEL;TYPE=CELL,VOICE:${profile.company_phone_e164}`,
          `EMAIL;TYPE=INTERNET,WORK:${profile.professional_email}`,
          `URL:${cardUrl}`,
          "END:VCARD",
          "",
        ].join("\r\n"),
        url = URL.createObjectURL(new Blob([vcard], { type: "text/vcard" })),
        a = document.createElement("a");
      a.href = url;
      a.download = `${profile.card_slug}.vcf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.querySelector("[data-share-card]").onclick = async () => {
      if (navigator.share) {
        await navigator.share({ title: profile.full_name, url: cardUrl });
      } else {
        await navigator.clipboard.writeText(cardUrl);
        status.textContent = "Card link copied.";
      }
    };
    document.querySelector("[data-show-qr]").onclick = async () => {
      const host = document.querySelector("[data-qr]");
      if (!host.dataset.loaded) {
        const qr = await fetch(
          `${endpoint}?slug=${encodeURIComponent(slug)}&format=qr`,
        );
        host.innerHTML = await qr.text();
        host.dataset.loaded = "true";
      }
      host.hidden = !host.hidden;
    };
  } catch (error) {
    status.textContent = error.message;
    document.querySelector(".professional-profile").setAttribute(
      "aria-disabled",
      "true",
    );
  }
})();
