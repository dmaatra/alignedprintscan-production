import { requireRelease2Staff, serviceRows } from "../_shared/release2-auth.ts";
import { expectedPrintVolume, loanSigningCompletion } from "../_shared/loan-signing-fulfillment.mjs";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const uuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value||""))?String(value):"";
const allowedRoles=new Set(["owner","administrator","operations"]);
const tables={requirement:"loan_signing_requirements",package:"loan_signing_package_versions",stipulation:"loan_signing_stipulations",scanback:"loan_signing_scanbacks",return:"loan_signing_returns"} as const;
const fields={
  assignment:["instructions_reviewed_at","callback_confirmation_required","signer_confirmation_status","signer_contacted_at","signer_contact_method","signer_confirmation_note","printing_required","paper_size","sidedness","print_color","print_scaling","signing_set_count","borrower_copy_count","additional_copy_count","print_status","print_qc_status","borrower_copy_status","stacking_order_required","stacking_order_type","stacking_instructions","signing_outcome","post_signing_qc_status","arrival_at","signing_started_at","signing_ended_at","departure_at","resign_review_required","lsa_stage","scanbacks_required","approval_before_return_required","physical_return_required","return_method"],
  requirement:["requirement_group","requirement_key","title","instructions","applicability","status","source_type","source_note","customer_visible","sort_order","satisfied_at"],
  stipulation:["title","instructions","required","status","source_type","waiver_source","proof_file_id","proof_private","resolved_at"],
  scanback:["package_version_id","content_scope","instructions","status","qc_status","submitted_at","submission_method","recipient_destination","confirmation_reference","approval_source","approved_at","correction_instructions","resolved_at"],
  return:["return_method","destination_name","destination_department","destination_address_line1","destination_address_line2","destination_city","destination_state","destination_zip","delivery_window","delivery_instructions","carrier","label_required","label_provided","tracking_required","tracking_number","tracking_status","drop_off_location","drop_off_at","proof_required","proof_file_id","proof_recorded_at","status","completed_at"],
};
const pick=(body:Record<string,unknown>,names:string[])=>Object.fromEntries(names.filter((key)=>Object.hasOwn(body,key)).map((key)=>[key,body[key]]));

async function snapshot(requestId:string){
  const assignments=await serviceRows(`loan_signing_assignments?select=*&service_request_id=eq.${requestId}&limit=1`); const assignment=assignments[0];
  if(!assignment)throw new Error("Loan Signing assignment was not found."); const id=assignment.id;
  const [requirements,packages,stipulations,scanbacks,returns,invoices]=await Promise.all([
    serviceRows(`loan_signing_requirements?select=*&loan_signing_assignment_id=eq.${id}&order=requirement_group,sort_order`),
    serviceRows(`loan_signing_package_versions?select=*&loan_signing_assignment_id=eq.${id}&order=version_number.desc`),
    serviceRows(`loan_signing_stipulations?select=*&loan_signing_assignment_id=eq.${id}&order=created_at`),
    serviceRows(`loan_signing_scanbacks?select=*&loan_signing_assignment_id=eq.${id}&order=created_at.desc`),
    serviceRows(`loan_signing_returns?select=*&loan_signing_assignment_id=eq.${id}&order=created_at.desc`),
    serviceRows(`invoices?select=payment_terms,balance_due,amount_due,amount_paid,status&service_request_id=eq.${requestId}`),
  ]);
  const paymentTerms=assignment.payment_terms||"prepaid"; const prepaidBalance=invoices.filter((i:any)=>String(i.payment_terms||paymentTerms)==="prepaid"&&!['void','cancelled'].includes(i.status)).reduce((sum:number,i:any)=>sum+Math.max(0,Number(i.balance_due??(Number(i.amount_due||0)-Number(i.amount_paid||0)))),0);
  return {assignment,requirements,packages,stipulations,scanbacks,returns,completion:loanSigningCompletion({assignment,requirements,packages,stipulations,scanbacks,returns,payment_terms:paymentTerms,prepaid_balance:prepaidBalance})};
}
async function timeline(requestId:string,eventType:string,title:string,detail:string,adminId:string,metadata:Record<string,unknown>={}){await serviceRows("request_timeline_events",{method:"POST",body:JSON.stringify({service_request_id:requestId,event_type:eventType,title,detail,actor_type:"admin",visibility:"internal",metadata:{...metadata,admin_id:adminId}})});}

Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});try{
  const admin=await requireRelease2Staff(req); if(!allowedRoles.has(String(admin.profile.role)))throw new Error("Operations or administrator access is required.");
  const body=await req.json() as Record<string,unknown>; const requestId=uuid(body.request_id); if(!requestId)throw new Error("Request is required.");
  const base=await snapshot(requestId); const assignment=base.assignment as Record<string,unknown>; const command=String(body.command||"snapshot"); if(command==="snapshot")return json({ok:true,...base});
  if(command==="save_assignment"){
    const update=pick(body,fields.assignment); if(body.instructions_reviewed===true){update.instructions_reviewed_at=new Date().toISOString();update.instructions_reviewed_by=admin.id;}
    const active=(base.packages as any[]).find((p)=>p.status==="active"); Object.assign(update,expectedPrintVolume(active,{...assignment,...update}));
    await serviceRows(`loan_signing_assignments?id=eq.${assignment.id}`,{method:"PATCH",body:JSON.stringify({...update,updated_at:new Date().toISOString()})});
    await timeline(requestId,"lsa_assignment_requirements_updated","Loan Signing requirements updated","Assignment requirements and preparation state were updated.",admin.id); return json({ok:true,...await snapshot(requestId)});
  }
  if(command==="add_package"){
    const requestedFileId=uuid(body.source_file_id); const files=await serviceRows(`request_files?select=id,detected_page_count,page_count_status,page_count_source,file_name&service_request_id=eq.${requestId}&is_active=eq.true${requestedFileId?`&id=eq.${requestedFileId}`:"&document_classification=in.(lsa_signing_package_source,lsa_redraw_correction)"}&order=created_at.desc&limit=1`); const sourceFile=files[0];
    const count=Number(sourceFile?.detected_page_count); if(!sourceFile||!Number.isInteger(count)||count<1||!["detected","manual"].includes(String(sourceFile.page_count_status)))throw new Error("Select an active package source with a server-counted or administrator-verified authoritative page count.");
    const prior=(base.packages as any[]).find((p)=>p.status==="active"); if(prior)await serviceRows(`loan_signing_package_versions?id=eq.${prior.id}`,{method:"PATCH",body:JSON.stringify({status:"superseded",superseded_at:new Date().toISOString()})});
    const version=Math.max(0,...(base.packages as any[]).map((p)=>Number(p.version_number)))+1; const pricingImpact=Boolean(prior&&Number(prior.authoritative_page_count)!==count);
    await serviceRows("loan_signing_package_versions",{method:"POST",body:JSON.stringify({loan_signing_assignment_id:assignment.id,service_request_id:requestId,organization_id:assignment.organization_id||null,version_number:version,source_file_id:sourceFile.id,authoritative_page_count:count,letter_page_count:body.letter_page_count??null,legal_page_count:body.legal_page_count??null,replacement_reason:String(body.replacement_reason||"").slice(0,1000)||null,dependent_review_required:Boolean(prior),pricing_impact_review:pricingImpact,created_by:admin.id})});
    if(prior)await serviceRows(`loan_signing_assignments?id=eq.${assignment.id}`,{method:"PATCH",body:JSON.stringify({package_status:"replacement_received",scope_review_required:true,print_qc_status:"pending",borrower_copy_status:assignment.borrower_copy_required==="yes"?"pending":assignment.borrower_copy_status,updated_at:new Date().toISOString()})});
    await timeline(requestId,prior?"lsa_replacement_package_received":"lsa_package_received",prior?"Replacement package received":"Package received",`Package version ${version} recorded from ${sourceFile.file_name} with ${count} authoritative pages.`,admin.id,{source_file_id:sourceFile.id,page_count_source:sourceFile.page_count_source,prior_version:prior?.version_number||null,new_version:version,prior_page_count:prior?.authoritative_page_count||null,new_page_count:count,pricing_impact_review:pricingImpact}); return json({ok:true,...await snapshot(requestId)});
  }
  if(["save_requirement","save_stipulation","save_scanback","save_return"].includes(command)){
    const kind=command.replace("save_","") as keyof typeof tables; const table=tables[kind]; const id=uuid(body.id); const payload={...pick(body,(fields as Record<string,string[]>)[kind]||[]),loan_signing_assignment_id:assignment.id,service_request_id:requestId,organization_id:assignment.organization_id||null};
    if(id)await serviceRows(`${table}?id=eq.${id}&loan_signing_assignment_id=eq.${assignment.id}`,{method:"PATCH",body:JSON.stringify({...payload,updated_at:new Date().toISOString()})}); else await serviceRows(table,{method:"POST",body:JSON.stringify({...payload,created_by:admin.id})});
    await timeline(requestId,`lsa_${kind}_updated`,`Loan Signing ${kind} updated`,"A consequential fulfillment record was updated.",admin.id); return json({ok:true,...await snapshot(requestId)});
  }
  if(command==="evaluate_completion")return json({ok:true,...await snapshot(requestId)});
  throw new Error("Unsupported command.");
}catch(error){return json({ok:false,error:error instanceof Error?error.message:"Request failed."},400);}});
