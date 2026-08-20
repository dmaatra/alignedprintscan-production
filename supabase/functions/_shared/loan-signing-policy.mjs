export const DEFAULT_LSA_POLICY = Object.freeze({
  version:"lsa-policy-2026-08-v1",
  cancellation:{before_preparation_percent:0,after_preparation_before_travel_percent:50,after_travel_or_arrival_percent:100,after_signing_started_percent:100},
  wait:{included_minutes:30,increment_minutes:30,amount_per_increment:25},
  automatic_financial_action:false,
});

const time=value=>value?new Date(value).getTime():NaN;
export function cancellationTiming(facts={}){
  if(facts.signing_started_at)return "after_signing_started";
  if(facts.arrival_at)return "after_arrival";
  if(facts.travel_started_at)return "after_travel_started";
  if(facts.print_status&&!["not_required","not_ready","ready_to_print"].includes(facts.print_status))return "after_preparation_before_travel";
  return "before_preparation";
}
export function suggestedCancellationCharge({agreedFee=0,facts={},policy=DEFAULT_LSA_POLICY}={}){
  const timing=cancellationTiming(facts),rules=policy.cancellation||DEFAULT_LSA_POLICY.cancellation;
  const percent=timing==="before_preparation"?rules.before_preparation_percent:timing==="after_preparation_before_travel"?rules.after_preparation_before_travel_percent:timing==="after_signing_started"?rules.after_signing_started_percent:rules.after_travel_or_arrival_percent;
  return {timing,percent,suggested_amount:Math.round(Math.max(0,Number(agreedFee)||0)*percent)/100,requires_admin_review:true};
}
export function waitReview({arrival_at,signing_started_at,departure_at,aps_caused_delay=false,policy=DEFAULT_LSA_POLICY}={}){
  const start=time(arrival_at),end=time(signing_started_at||departure_at); if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return {wait_minutes:null,suggested_amount:0,requires_review:false};
  const wait_minutes=Math.floor((end-start)/60000),rule=policy.wait||DEFAULT_LSA_POLICY.wait;
  const increments=aps_caused_delay?0:Math.max(0,Math.ceil((wait_minutes-rule.included_minutes)/rule.increment_minutes));
  return {wait_minutes,suggested_amount:increments*rule.amount_per_increment,requires_review:increments>0,excluded_for_aps_cause:Boolean(aps_caused_delay)};
}
export function customerSafeException(outcome,status="review_required"){
  if(["resolved","closed"].includes(status))return "Resolved";
  if(outcome==="cancelled")return "Cancellation Under Review";
  if(["resign_required","return_visit_required"].includes(outcome))return "Additional Signing Appointment Needed";
  if(["no_sign","partial_incomplete"].includes(outcome))return "Signing Could Not Be Completed — Additional Review Needed";
  return "Additional Review Needed";
}
