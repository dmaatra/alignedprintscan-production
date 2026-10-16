(function(root) {
  "use strict";
  const PROGRAM = "CAMDEN_PARK";
  const baseKeys = new Set(["mobile:base", "print:courier", "print:mobile_service", "print:mobile_base"]);
  function apply(snapshot, program) {
    const result = JSON.parse(JSON.stringify(snapshot));
    result.components = result.components.filter(line => line.key !== "promotion:CAMDEN_PARK");
    if (program !== PROGRAM || !["mobile", "print"].includes(result.service)) return result;
    const bases = result.components.filter(line => baseKeys.has(line.key));
    if (bases.length !== 1) throw new Error("Neighborhood service requires exactly one applicable travel base.");
    const base = bases[0];
    const mobile = ["mobile:base", "print:mobile_base"].includes(base.key);
    const standard = mobile ? 50 : 20, discount = mobile ? 25 : 16;
    base.quantity = 1; base.unit_amount = standard; base.line_amount = standard;
    result.components.push({key:"promotion:CAMDEN_PARK",label:"Camden Park Promotional Adjustment — Pending Address Review",quantity:1,unit_amount:-discount,line_amount:-discount,billable:true,included:false,review_required:true,note:"Estimated only. APS must approve address eligibility before issuing promotional pricing.",promotion_code:PROGRAM});
    result.total = Math.round(result.components.filter(line=>line.billable).reduce((sum,line)=>sum+Number(line.line_amount),0)*100)/100;
    result.review_required = true;
    result.review_reasons = [...new Set([...(result.review_reasons || []), "Camden Park address eligibility requires APS review."])];
    return result;
  }
  root.APSNeighborhoodPricing = Object.freeze({PROGRAM, apply});
})(typeof window !== "undefined" ? window : globalThis);
