(function (root) {
  "use strict";

  const SNAPSHOT_VERSION = "aps-estimate-components-v1";
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function component(key, label, quantity, unitAmount, options = {}) {
    const qty = Math.max(0, number(quantity));
    const rate = roundMoney(unitAmount);
    return {
      key,
      label,
      quantity: qty,
      unit_amount: rate,
      line_amount: roundMoney(qty * rate),
      billable: options.billable !== false,
      included: options.included === true,
      review_required: options.reviewRequired === true,
      note: options.note || null,
    };
  }

  const actLabels = {
    acknowledgment: "Acknowledgment",
    jurat: "Jurat",
    signature_witnessing: "Signature Witnessing",
    certified_copy: "Certified Copy — When Authorized",
    oath_affirmation: "Oath or Affirmation",
    unsure: "Notarial Act — Type Review Required",
  };

  function notarialActComponents(acts, fallbackCount, rate) {
    const normalized = Array.isArray(acts) && acts.length
      ? acts.map((act) => String(act?.act_type || act || "unsure"))
      : Array.from({ length: Math.max(1, number(fallbackCount, 1)) }, () => "unsure");
    const counts = normalized.reduce((result, type) => {
      result[type] = (result[type] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).map(([type, quantity]) =>
      component(
        `notarial_act:${type}`,
        actLabels[type] || "Notarial Act",
        quantity,
        rate,
        { reviewRequired: type === "unsure" },
      )
    );
  }

  function printComponents(input, pricing, prefix = "print") {
    const pages = Math.max(0, number(input.pages));
    const copies = Math.max(1, number(input.copies, 1));
    const quantity = pages * copies;
    if (!quantity) return [];
    const color = input.color === "color" ? "color" : "bw";
    const sides = input.sides === "double" ? "double" : "single";
    const paperSize = input.paperSize === "legal" ? "legal" : "letter";
    const paperType = String(input.paperType || "standard");
    const baseRate = color === "color"
      ? (sides === "double" ? 0.6 : pricing.documentServices.colorLetter)
      : (sides === "double" ? 0.35 : pricing.documentServices.bwLetter);
    const lines = [
      component(
        `${prefix}:${color}:${paperSize}:${sides}`,
        `${color === "color" ? "Color" : "B&W"} Printing / Copies — ${paperSize === "legal" ? "Legal" : "Letter"} — ${sides === "double" ? "Double-Sided" : "Single-Sided"}`,
        quantity,
        roundMoney(baseRate + (paperSize === "legal" ? 0.1 : 0)),
      ),
    ];
    const addOn = {
      resume: { label: "Resume Paper Add-on", rate: 0.25 },
      cardstock: { label: "Cardstock Add-on", rate: pricing.documentServices.cardstockAddOn },
      "color-paper": { label: "Color Paper Add-on", rate: pricing.documentServices.colorPaperAddOn },
    }[paperType];
    if (addOn) lines.push(component(`${prefix}:paper:${paperType}`, addOn.label, quantity, addOn.rate));
    return lines;
  }

  function loanSigningTravel(roundTripMiles) {
    if (roundTripMiles === null || roundTripMiles === undefined || roundTripMiles === "") {
      return { band: "review", charge: 0, reviewRequired: true, label: "Round-Trip Mileage — Operator Review Required" };
    }
    const miles = Math.max(0, number(roundTripMiles));
    if (miles <= 30) return { band: "included", charge: 0, reviewRequired: false, label: `Local Travel — ${miles} RT Miles` };
    if (miles <= 40) return { band: "extended", charge: 25, reviewRequired: false, label: "Extended Travel — 31–40 RT Miles" };
    return { band: "review", charge: 0, reviewRequired: true, label: `Extended Travel — ${miles} RT Miles — Review Required` };
  }

  function build(service, input = {}, pricing = root.ALIGNED_PRICING || {}) {
    const components = [];
    const reviewReasons = [];
    const add = (line) => {
      components.push(line);
      if (line.review_required) reviewReasons.push(line.note || line.label);
    };

    if (service === "ron") {
      add(component("ron:service", "Online Notarization Service Fee", 1, pricing.ron.onlineServiceFee));
      notarialActComponents(input.notarialActs, input.notarialActCount, pricing.ron.notarialAct).forEach(add);
      const witnesses = Math.max(0, number(input.providedWitnessCount));
      if (witnesses) add(component("ron:witness", "Remote Witness — Aligned Print & Scan Provided", witnesses, pricing.ron.providedWitness));
    } else if (service === "mobile") {
      add(component("mobile:base", "Mobile Notary Appointment Base", 1, pricing.mobile.appointmentBase));
      notarialActComponents(input.notarialActs, input.notarialActCount, pricing.mobile.notarialAct).forEach(add);
      const witnesses = Math.max(0, number(input.providedWitnessCount));
      if (witnesses) add(component("mobile:witness", "Mobile Witness — Aligned Print & Scan Provided", witnesses, pricing.mobile.providedWitness));
      if (input.print?.enabled) printComponents(input.print, pricing, "mobile_print").forEach(add);
      if (number(input.scanPages) > 0) add(component("mobile:scan", "Scan to PDF", number(input.scanPages), pricing.documentServices.scanPerPage));
    } else if (service === "print") {
      printComponents(input.print || input, pricing).forEach(add);
      if (number(input.scanPages) > 0) add(component("print:scan", "Scan to PDF", number(input.scanPages), pricing.documentServices.scanPerPage));
      if (input.fulfillment === "courier") add(component("print:courier", "Courier Delivery Base", 1, pricing.documentServices.courierBase));
      if (input.fulfillment === "mobile-service") add(component("print:mobile_service", "Mobile Document Service Base", 1, pricing.documentServices.mobileDocumentBase));
      if (input.fulfillment === "mobile-notary") {
        add(component("print:mobile_base", "Mobile Notary Appointment Base", 1, pricing.mobile.appointmentBase));
        add(component("print:notarial_act", "Notarial Act / Signature Add-on", Math.max(1, number(input.notarialActCount, 1)), pricing.mobile.notarialAct));
      }
    } else if (service === "loan_signing") {
      const signingType = String(input.signingType || "other_custom");
      const labels = {
        seller: "Seller / Simple Loan Signing Service",
        loan_modification: "Loan Modification Signing Service",
        buyer_purchase: "Buyer / Purchase Loan Signing Service",
        refinance: "Refinance Loan Signing Service",
        heloc: "HELOC Loan Signing Service",
        reverse_mortgage: "Reverse Mortgage Loan Signing Service",
        commercial: "Commercial Loan Signing — Review Required",
        other_custom: "Custom / Unusual Loan Signing — Review Required",
      };
      const base = pricing.loanSigning.standardPackages[signingType];
      add(component(`loan_signing:base:${signingType}`, labels[signingType] || labels.other_custom, 1, Number.isFinite(base) ? base : 0, {
        reviewRequired: !Number.isFinite(base),
        note: !Number.isFinite(base) ? "Commercial, custom, or unusual assignment pricing requires operator review." : null,
      }));
      add(component("loan_signing:printing", "Standard E-Doc Package Printing", 1, 0, { billable: false, included: true }));
      add(component("loan_signing:signer_copy", "One Standard Signer / Borrower Copy", 1, 0, { billable: false, included: true }));
      const scanbacks = String(input.scanbacks || "unknown");
      add(component("loan_signing:scanbacks", scanbacks === "yes" ? "Required Scanbacks" : scanbacks === "no" ? "Scanbacks Not Required" : "Scanback Instructions — Review Required", 1, 0, {
        billable: false,
        included: scanbacks !== "unknown",
        reviewRequired: scanbacks === "unknown",
        note: scanbacks === "unknown" ? "Verify assignment scanback instructions before final quote and fulfillment." : null,
      }));
      add(component("loan_signing:return", "Normal Package Return Preparation", 1, 0, { billable: false, included: true }));
      const travel = loanSigningTravel(input.roundTripMiles);
      add(component(`loan_signing:travel:${travel.band}`, travel.label, 1, travel.charge, {
        billable: travel.charge > 0,
        included: travel.band === "included",
        reviewRequired: travel.reviewRequired,
        note: travel.reviewRequired ? "Loan Signing travel is priced by round-trip mileage and must be reviewed." : null,
      }));
    }

    const total = roundMoney(components.filter((line) => line.billable).reduce((sum, line) => sum + line.line_amount, 0));
    return {
      snapshot_version: SNAPSHOT_VERSION,
      pricing_version: service === "loan_signing" ? pricing.loanSigning.policyVersion : "aps-central-pricing-2026-08",
      service,
      components,
      total,
      review_required: components.some((line) => line.review_required),
      review_reasons: [...new Set(reviewReasons)],
    };
  }

  function quoteRows(snapshot) {
    if (!snapshot || snapshot.snapshot_version !== SNAPSHOT_VERSION || !Array.isArray(snapshot.components)) return [];
    return snapshot.components
      .filter((line) => line.billable && number(line.line_amount) > 0)
      .map((line) => ({
        item_type: "service",
        description: String(line.label || "Service"),
        quantity: Math.max(0, number(line.quantity, 1)),
        unit_price: roundMoney(line.unit_amount),
        line_total: roundMoney(line.line_amount),
      }));
  }

  root.APSEstimateComponents = Object.freeze({ SNAPSHOT_VERSION, build, quoteRows, loanSigningTravel, roundMoney });
})(typeof window !== "undefined" ? window : globalThis);
