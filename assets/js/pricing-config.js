/* Aligned Print & Scan centralized pricing configuration.
   Customer-facing pricing should be derived from this object instead of
   repeated hard-coded values across public and admin interfaces. */
window.ALIGNED_PRICING = Object.freeze({
  ron: Object.freeze({
    onlineServiceFee: 25,
    notarialAct: 10,
    providedWitness: 25
  }),
  mobile: Object.freeze({
    appointmentBase: 50,
    notarialAct: 10,
    providedWitness: 50,
    afterHours: Object.freeze({
      after7pm: 25,
      after9pm: 50
    }),
    travelTiers: Object.freeze({
      '0-15': 0,
      '16-20': 10,
      '21-25': 20,
      '26-30': 30,
      '31-40': 45
    })
  }),
  documentServices: Object.freeze({
    bwLetterSingle: 0.25,
    bwLetterDouble: 0.35,
    colorLetterSingle: 0.50,
    colorLetterDouble: 0.65,
    legalAddOn: 0.10,
    resumePaperAddOn: 0.25,
    cardstockAddOn: 0.40,
    colorPaperAddOn: 0.15,
    scanPerPage: 1.00,
    pdfMerge: 5,
    courierBase: 20,
    courierTiers: Object.freeze({
      '0-15': 20,
      '16-20': 30,
      '21-25': 40,
      '26-30': 50
    }),
    mobileDocumentBase: 20
  })
});
