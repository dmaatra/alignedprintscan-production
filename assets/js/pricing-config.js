/**
 * Aligned Print & Scan centralized pricing configuration.
 *
 * Customer-facing estimates, admin quote presets, and invoice defaults should
 * reference this object rather than repeating hard-coded prices.
 */
window.ALIGNED_PRICING = Object.freeze({
  ron: Object.freeze({
    onlineServiceFee: 25,
    notarialAct: 10,
    providedWitness: 25,
  }),

  mobile: Object.freeze({
    appointmentBase: 50,
    notarialAct: 10,
    providedWitness: 50,

    afterHours: Object.freeze({
      after7pm: 25,
      after9pm: 50,
    }),

    travelTiers: Object.freeze({
      "0-15": 0,
      "16-20": 10,
      "21-25": 20,
      "26-30": 30,
      "31-40": 45,
    }),
  }),

  documentServices: Object.freeze({
    bwLetter: 0.25,
    bwLegal: 0.35,
    colorLetter: 0.5,
    colorLegal: 0.6,
    colorPaperAddOn: 0.15,
    cardstockAddOn: 0.4,
    scanPerPage: 1.0,
    pdfMerge: 5,
    courierBase: 20,
    mobileDocumentBase: 20,

    courierTiers: Object.freeze({
      "0-15": 20,
      "16-20": 30,
      "21-25": 40,
      "26-30": 50,
    }),
  }),
});
