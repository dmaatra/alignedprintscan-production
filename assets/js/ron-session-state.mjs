const text = value => String(value ?? "").trim().toLowerCase();
const dateValue = value => { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : 0; };
const latest = values => values.filter(Boolean).sort((a,b)=>dateValue(b)-dateValue(a))[0] || null;
const badge = (key,label) => ({key,label});
const requestRef = id => `APS-${String(id || "").slice(0,8).toUpperCase()}`;

function paymentFor(invoices) {
  const issued = invoices.filter(invoice => !["void","cancelled","draft"].includes(text(invoice.status)));
  if (!issued.length) return badge("not_invoiced","Not Invoiced");
  const due = issued.reduce((total,invoice) => total + Math.max(0,Number(invoice.balance_due ?? (Number(invoice.amount_due||0)-Number(invoice.amount_paid ?? invoice.paid_amount ?? 0)))||0),0);
  return due > 0 ? badge("awaiting_payment","Awaiting Payment") : badge("paid","Paid / Ready");
}

function appointmentFor(request) {
  if (request.appointment_confirmed_at && request.appointment_date && request.appointment_time) return badge("confirmed","Confirmed");
  if (request.appointment_date || request.appointment_time || request.appointment_state === "rescheduling_requested") return badge("needs_confirmation","Needs Confirmation");
  return badge("requested","Requested");
}

function proofFor(transaction) {
  if (!transaction) return badge("not_created","Not Created");
  const states=[transaction.creation_state,transaction.activation_state,transaction.meeting_state,transaction.proof_status,transaction.provider_detailed_status,transaction.aps_status].map(text);
  if (states.some(value=>value.includes("completed_with_rejections")||value.includes("completed with rejections"))) return badge("completed_with_rejections","Completed With Rejections");
  if (transaction.webhook_refresh_required || transaction.last_error_code || transaction.manual_review_reason || transaction.activation_manual_review_reason || transaction.webhook_manual_review_reason || states.some(value=>["failed","rejected","ambiguous","manual_review","requires_attention"].includes(value))) return badge("needs_attention","Failed / Needs Attention");
  if (transaction.completed_at || text(transaction.meeting_state)==="completed" || text(transaction.aps_status)==="completed") return badge("completed","Completed");
  if (text(transaction.meeting_state)==="in_progress" || text(transaction.aps_status)==="in_progress") return badge("in_progress","In Progress");
  if (text(transaction.activation_state)==="activated") return badge("activated","Activated");
  if (text(transaction.activation_state)==="ready") return badge("ready_for_activation","Ready for Activation");
  return badge("draft","Draft");
}

function returnFor(transaction,assets,files) {
  const completedFiles=files.filter(file=>text(file.document_classification)==="completed_notarized_document" && file.is_active !== false);
  if (completedFiles.some(file=>file.customer_visible===true && file.eligible_for_delivery===true)) return badge("released","Released to Customer");
  if (completedFiles.some(file=>file.customer_visible!==true)) return badge("pending_review","Pending Admin Release");
  const completedAssets=assets.filter(asset=>text(asset.asset_type)==="completed_document");
  if (completedAssets.some(asset=>text(asset.retrieval_state)==="retrieved")) return badge("retrieved","Retrieved");
  if (transaction?.completed_assets_available || completedAssets.some(asset=>["available","retrieved"].includes(text(asset.availability_state)))) return badge("retrieval_pending","Retrieval Pending");
  return badge("not_available","Not Available");
}

function signerFor(request,transaction,participants) {
  const expected=Number((Array.isArray(request.ron_requests)?request.ron_requests[0]:request.ron_requests)?.number_of_signers||0);
  const complete=participants.filter(person=>text(person.participant_type)==="signer" && person.full_legal_name && person.email && person.identity_name_confirmed===true).length;
  return (expected>0 && complete>=expected) || text(transaction?.signer_configuration_state)==="configured" ? badge("ready","Ready") : badge("incomplete","Incomplete");
}

function documentsFor(request,assets,files) {
  const source=files.filter(file=>file.is_active!==false && !["completed_notarized_document","proof_audit_trail"].includes(text(file.document_classification)));
  if (!source.length) return badge("missing","Missing");
  const mappedReady=assets.some(asset=>text(asset.asset_type)==="source_document" && ["uploaded","processed"].includes(text(asset.upload_state)));
  const reviewed=source.every(file=>["approved","reviewed","ready"].includes(text(file.review_state)));
  return reviewed || mappedReady || text(request.document_state)==="ready" ? badge("ready","Ready") : badge("pending_review","Pending Review");
}

function nextAction(row) {
  const workflow=text(row.request.workflow_status||row.request.status);
  if (["under_review","new"].includes(workflow)) return {label:"Review Request",tab:"overview"};
  if (["quote_ready","awaiting_approval","changes_requested"].includes(workflow)) return {label:"Build Quote",tab:"quote"};
  if (row.payment.key!=="paid") return {label:row.payment.key==="not_invoiced"?"Build Quote":"Collect Payment",tab:"payments"};
  if (row.appointment.key!=="confirmed") return {label:"Confirm Appointment",tab:"fulfillment"};
  if (row.signers.key!=="ready") return {label:"Complete Signer Information",tab:"fulfillment"};
  if (row.documents.key!=="ready") return {label:row.documents.key==="missing"?"Documents Needed":"Review Documents",tab:"documents"};
  if (row.proof.key==="not_created") return {label:"Create Proof Draft",tab:"fulfillment"};
  if (row.proof.key==="draft") return {label:"Review Proof Draft",tab:"fulfillment"};
  if (row.proof.key==="ready_for_activation") return {label:"Activate Proof Transaction",tab:"fulfillment"};
  if (["activated","in_progress"].includes(row.proof.key)) return {label:"Open Session Controls",tab:"fulfillment"};
  if (["needs_attention","completed_with_rejections"].includes(row.proof.key)) return {label:"Review Proof Status",tab:"fulfillment"};
  if (row.proof.key==="completed" && row.documentReturn.key==="retrieval_pending") return {label:"Retrieve Completed Document",tab:"fulfillment"};
  if (["retrieved","pending_review"].includes(row.documentReturn.key)) return {label:"Review Completed Document",tab:"documents"};
  return {label:"No action required",tab:"fulfillment"};
}

export function buildRonSessionRows(payload={}) {
  const requests=(payload.requests||[]).filter(request=>text(request.service_type)==="ron" && !request.archived_at);
  return requests.map(request=>{
    const transaction=(payload.transactions||[]).find(item=>item.service_request_id===request.id && item.is_active!==false) || null;
    const transactionId=transaction?.id;
    const participants=(payload.participants||[]).filter(item=>item.service_request_id===request.id);
    const files=(payload.files||[]).filter(item=>item.service_request_id===request.id);
    const invoices=(payload.invoices||[]).filter(item=>item.service_request_id===request.id);
    const assets=(payload.assets||[]).filter(item=>item.proof_transaction_record_id===transactionId);
    const customer=Array.isArray(request.customers)?request.customers[0]:request.customers||{};
    const row={request,customer,transaction,reference:requestRef(request.id),payment:paymentFor(invoices),appointment:appointmentFor(request),signers:signerFor(request,transaction,participants),documents:documentsFor(request,assets,files),proof:proofFor(transaction),documentReturn:returnFor(transaction,assets,files)};
    const completedWorkflow=["completed","archived","cancelled"].includes(text(request.workflow_status||request.status));
    const postCompletionException=["needs_attention","completed_with_rejections"].includes(row.proof.key)||["retrieved","pending_review"].includes(row.documentReturn.key);
    row.attention=completedWorkflow?postCompletionException:[row.payment.key!=="paid",row.appointment.key!=="confirmed",row.signers.key!=="ready",row.documents.key!=="ready",postCompletionException].some(Boolean);
    row.sessionStatus=row.documentReturn.key==="released"?badge("released","Released"):row.attention?badge("needs_attention","Needs Attention"):completedWorkflow||row.proof.key==="completed"?badge("completed","Completed"):["activated","in_progress"].includes(row.proof.key)?badge("active","Active / In Progress"):row.proof.key==="ready_for_activation"?badge("ready","Ready"):badge("preparing","Preparing");
    row.appointmentAt=request.appointment_date?`${request.appointment_date}T${request.appointment_time||"12:00:00"}${request.appointment_timezone?"":""}`:request.preferred_date?`${request.preferred_date}T12:00:00`:null;
    row.lastUpdated=latest([request.updated_at,request.created_at,transaction?.updated_at,transaction?.last_synced_at,...assets.map(item=>item.updated_at),...files.map(item=>item.updated_at),...participants.map(item=>item.updated_at)]);
    row.nextAction=nextAction(row);
    return row;
  });
}

export function filterRonSessions(rows,view={}) {
  const query=text(view.search);
  return rows.filter(row=>{
    const haystack=[row.reference,row.customer.first_name,row.customer.last_name,row.customer.email,row.customer.phone,row.transaction?.proof_transaction_id].map(text).join(" ");
    return (!query||haystack.includes(query)) && (!view.session||view.session==="all"||row.sessionStatus.key===view.session) && (!view.payment||view.payment==="all"||row.payment.key===view.payment) && (!view.appointment||view.appointment==="all"||row.appointment.key===view.appointment) && (!view.proof||view.proof==="all"||row.proof.key===view.proof) && (!view.returnState||view.returnState==="all"||row.documentReturn.key===view.returnState);
  });
}

export function sortRonSessions(rows,sort="operational") {
  const copy=[...rows];
  const name=row=>`${row.customer.last_name||""} ${row.customer.first_name||""}`;
  const operational=row=>({needs_attention:0,ready:1,active:2,preparing:3,completed:4,released:5}[row.sessionStatus.key]??6);
  const compare={appointment_asc:(a,b)=>(dateValue(a.appointmentAt)||Infinity)-(dateValue(b.appointmentAt)||Infinity),appointment_desc:(a,b)=>dateValue(b.appointmentAt)-dateValue(a.appointmentAt),created_desc:(a,b)=>dateValue(b.request.created_at)-dateValue(a.request.created_at),created_asc:(a,b)=>dateValue(a.request.created_at)-dateValue(b.request.created_at),customer_asc:(a,b)=>name(a).localeCompare(name(b)),customer_desc:(a,b)=>name(b).localeCompare(name(a)),reference:(a,b)=>a.reference.localeCompare(b.reference),updated_desc:(a,b)=>dateValue(b.lastUpdated)-dateValue(a.lastUpdated),updated_asc:(a,b)=>dateValue(a.lastUpdated)-dateValue(b.lastUpdated),operational:(a,b)=>operational(a)-operational(b)||dateValue(a.appointmentAt)-dateValue(b.appointmentAt)};
  return copy.sort(compare[sort]||compare.operational);
}
