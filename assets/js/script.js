const SUPABASE_URL = 'https://sfsdniavqldgbiretply.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco';
const supabaseClient=window.supabase?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;

const menuBtn=document.querySelector('.menu-btn');const navLinks=document.querySelector('.nav-links');if(menuBtn){menuBtn.addEventListener('click',()=>navLinks.classList.toggle('open'))}
const obs=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
document.querySelectorAll('.faq-q').forEach(btn=>btn.addEventListener('click',()=>btn.parentElement.classList.toggle('open')));
function money(n){return '$'+Number(n||0).toFixed(2)}
function qs(sel,root=document){return root.querySelector(sel)}
function qsa(sel,root=document){return [...root.querySelectorAll(sel)]}
function visible(el){return !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)}

const tabs=qsa('.service-tab');
const wizard=qs('#smartRequestForm');
const stepNames=['Contact','Details','Options','Scheduling','Review'];
let activeService='ron';let currentStep=0;

function printCost({pages=0,color='bw',sides='single',paperSize='letter',paperType='standard'}={}){
 let rate=0;if(color==='bw'&&sides==='single')rate=.25;if(color==='bw'&&sides==='double')rate=.35;if(color==='color'&&sides==='single')rate=.50;if(color==='color'&&sides==='double')rate=.65;
 const size=paperSize==='legal'?.10:0;const paper={standard:0,resume:.25,cardstock:.40,'color-paper':.15}[paperType]||0;return (+pages||0)*(rate+size+paper);
}
function addItem(items,label,amt){amt=Number(amt)||0;if(amt>0)items.push([label,amt]);}
function calculateEstimate(){
 if(!wizard)return;let total=0,items=[];const f=wizard.elements;
 if(activeService==='ron'){
   addItem(items,'RON initial session',40);
   addItem(items,'Additional notarizations',25*(+f.additionalNotarizations?.value||0));
 }
 if(activeService==='mobile'){
   addItem(items,'Base travel / dispatch review',20);
   addItem(items,'Notarizations',10*(+f.notarizationCount?.value||1));
   if(f.mobilePrintAddon?.checked)addItem(items,'Print add-on estimate',printCost({pages:+f.mobilePrintPages?.value||0,color:f.mobileColor?.value,sides:f.mobileSides?.value,paperSize:f.mobilePaperSize?.value,paperType:f.mobilePaperType?.value}));
   if(f.mobileScanAddon?.checked)addItem(items,'Scan-back / scan-to-PDF estimate',(+f.mobileScanPages?.value||0)*1);
 }
 if(activeService==='print'){
   addItem(items,'Printing estimate',printCost({pages:+f.pages?.value||0,color:f.color?.value,sides:f.sides?.value,paperSize:f.paperSize?.value,paperType:f.paperType?.value}));
   addItem(items,'Scan to PDF estimate',(+f.scanPages?.value||0)*1);
   if(f.fulfillment?.value==='delivery')addItem(items,'Delivery estimate',20);
   if(f.fulfillment?.value==='mobile-notary'){
     addItem(items,'Mobile notary add-on review base',20);
     addItem(items,'Notarization add-on',10*(+f.printNotarizationCount?.value||1));
   }
 }
 total=items.reduce((s,i)=>s+i[1],0);
 qs('#estimateTotal').textContent=money(total);
 qs('#lineItems').innerHTML=items.length?items.map(([l,a])=>`${l}: ${money(a)}`).join('<br>'):'Complete the applicable fields to view an estimate.';
}
function applyService(service){
 activeService=service;currentStep=0;tabs.forEach(t=>t.classList.toggle('active',t.dataset.service===service));
 document.body.dataset.service=service;
 const names={ron:'Remote Online Notary',mobile:'Mobile Notary',print:'Print & Scan'};
 const copy={ron:'Secure online notarization estimate and onboarding details.',mobile:'Mobile appointment estimate with relevant add-ons.',print:'Print, scan, delivery, and document support estimate.'};
 qs('#summaryTitle').textContent=names[service];qs('#summaryCopy').textContent=copy[service];
 qs('#detailsHeading').textContent=service==='ron'?'RON Details':service==='mobile'?'Mobile Notary Details':'Print & Scan Details';
 qs('#detailsHelp').textContent=service==='ron'?'Tell us what will be notarized online.':service==='mobile'?'Tell us where the mobile appointment will take place and what will be notarized.':'Upload or describe the documents you need printed, scanned, or prepared.';
 qs('#optionsHeading').textContent=service==='ron'?'RON Options':service==='mobile'?'Mobile Add-Ons':'Print & Fulfillment Options';
 qsa('[data-only]').forEach(el=>{el.style.display=el.dataset.only.split(' ').includes(service)?'block':'none'});
 clearErrors();updateConditional();showStep(0);calculateEstimate();updateContinueState();
}
function updateConditional(){
 if(!wizard)return;
 qsa('[data-addon]').forEach(el=>{const ctrl=wizard.elements[el.dataset.addon];el.style.display=ctrl&&ctrl.checked?'block':'none'});
 qsa('[data-fulfillment]').forEach(el=>{const allowed=el.dataset.fulfillment.split(' ');const val=wizard.elements.fulfillment?.value;el.style.display=allowed.includes(val)?'block':'none'});
}
function showStep(n){
 currentStep=Math.max(0,Math.min(4,n));clearErrors();
 qsa('.wizard-step').forEach((el,i)=>el.classList.toggle('active',i===currentStep));
 qs('#stepLabel').textContent=`Step ${currentStep+1} of 5`;qs('#stepName').textContent=stepNames[currentStep];qs('#progressBar').style.width=`${((currentStep+1)/5)*100}%`;
 qs('#prevStep').style.visibility=currentStep===0?'hidden':'visible';qs('#nextStep').style.display=currentStep===4?'none':'inline-flex';updateContinueState();
}
function fieldValue(name){const el=wizard?.elements[name];if(!el)return '';if(el.type==='checkbox')return el.checked;if(el.type==='file')return el.files&&el.files.length>0;return String(el.value||'').trim();}
function markInvalid(name,msg){const el=wizard.elements[name];if(!el)return false;const box=el.closest('.upload-box')||el.closest('label')||el;box.classList.add('field-error');let hint=document.createElement('div');hint.className='error-text';hint.textContent=msg||'Required';if(box.parentNode && !box.parentNode.querySelector(`.error-text[data-for="${name}"]`)){hint.dataset.for=name;box.insertAdjacentElement('afterend',hint);}return false;}
function clearErrors(){qsa('.field-error').forEach(e=>e.classList.remove('field-error'));qsa('.error-text').forEach(e=>e.remove());}
function requireFilled(names){let ok=true;names.forEach(n=>{if(!fieldValue(n)) ok=markInvalid(n,'Please complete this field.')&&ok;});return ok;}
function validateStep(showErrors=false){
 if(!wizard)return true;if(showErrors)clearErrors();let ok=true;
 const need=(names)=>{names.forEach(n=>{if(!fieldValue(n)){ok=false;if(showErrors)markInvalid(n,'Please complete this field.')}})};
 const needOne=(names,msg)=>{if(!names.some(n=>fieldValue(n))){ok=false;if(showErrors)markInvalid(names[0],msg)}};
 if(currentStep===0){need(['firstName','lastName','email','phone']);}
 if(currentStep===1){
   if(activeService==='ron'){need(['documentType','notarizationCount','signerCount','ronFiles','techReady','recordingConsent']);}
   if(activeService==='mobile'){need(['documentType','notarizationCount','signerCount','street','city','zip']);}
   if(activeService==='print'){need(['printFiles']); if((+wizard.elements.pages.value||0)<=0 && (+wizard.elements.scanPages.value||0)<=0){ok=false;if(showErrors)markInvalid('pages','Enter the number of print or scan pages.')}}
 }
 if(currentStep===2){
   if(activeService==='ron'){need(['idType']);}
   if(activeService==='mobile'){
     if(wizard.elements.mobilePrintAddon?.checked){need(['mobilePrintFiles']); if((+wizard.elements.mobilePrintPages.value||0)<=0){ok=false;if(showErrors)markInvalid('mobilePrintPages','Enter the number of pages to print.')}}
     if(wizard.elements.mobileScanAddon?.checked && (+wizard.elements.mobileScanPages.value||0)<=0){ok=false;if(showErrors)markInvalid('mobileScanPages','Enter the number of scan pages.');}
   }
   if(activeService==='print'){
     const val=wizard.elements.fulfillment?.value;
     if(val==='delivery'||val==='mobile-notary')need(['printStreet','printCity','printZip']);
     if(val==='mobile-notary')need(['printNotarizationCount','printSignerCount','printNotaryDocType']);
   }
 }
 if(currentStep===3){
   need(['preferredDate','timeWindow']);
   if(activeService==='ron'||activeService==='mobile'){need(['validId','awareWilling']);}
 }
 if(currentStep===4){need(['notLegalAdvice','quoteOnly']);}
 return ok;
}
function updateContinueState(){
 const btn=qs('#nextStep');if(!btn||currentStep===4)return;const ok=validateStep(false);btn.disabled=!ok;btn.classList.toggle('disabled',!ok);btn.setAttribute('aria-disabled',String(!ok));
}

function numericValue(name){return Number(wizard?.elements[name]?.value||0)||0;}
function checkedValue(name){return !!wizard?.elements[name]?.checked;}
function cleanFileName(name){return String(name||'upload').replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').slice(0,120);}
function estimateNumber(){return Number((qs('#estimateTotal')?.textContent||'0').replace(/[^0-9.]/g,''))||0;}
function serviceLabel(service){return {ron:'Remote Online Notary',mobile:'Mobile Notary',print:'Print & Scan'}[service]||'Service Request';}
function setSubmitState(isSubmitting,msg){const btn=wizard?.querySelector('button[type="submit"]');if(btn){btn.disabled=isSubmitting;btn.textContent=isSubmitting?'Submitting…':'Submit Request';}let status=qs('#formSubmitStatus');if(!status&&wizard){status=document.createElement('div');status.id='formSubmitStatus';status.className='form-submit-status';wizard.querySelector('.wizard-step[data-step="4"]')?.appendChild(status);}if(status)status.textContent=msg||'';}
async function uploadFileGroup(serviceRequestId,inputName,category){
 const input=wizard.elements[inputName];
 const files=input?.files?[...input.files]:[];
 const records=[];
 for(const file of files){
   const path=`${serviceRequestId}/${category}/${Date.now()}-${cleanFileName(file.name)}`;
   const {error:uploadError}=await supabaseClient.storage.from('service-request-files').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
   if(uploadError)throw uploadError;
   records.push({service_request_id:serviceRequestId,file_name:file.name,file_path:path,file_type:file.type||null,file_size:file.size||null});
 }
 if(records.length){
   const {error}=await supabaseClient.from('request_files').insert(records);
   if(error)throw error;
 }
}

async function sendRequestNotifications(requestId, ref){
  if(!supabaseClient) return;
  try{
    const { error } = await supabaseClient.functions.invoke('send-request-email', {
      body: {
        request_id: requestId,
        reference_number: ref
      }
    });
    if(error){
      console.warn('Notification function did not complete:', error.message || error);
    }
  }catch(err){
    console.warn('Notification function is not deployed yet or could not be reached:', err);
  }
}

async function submitRequestToSupabase(e){
 e.preventDefault();
 if(!validateStep(true))return;
 if(!supabaseClient){alert('The request system is not connected yet. Please contact Aligned Print & Scan directly.');return;}
 setSubmitState(true,'Securely submitting your request…');
 try{
   const f=wizard.elements;
   const customerPayload={first_name:f.firstName.value.trim(),last_name:f.lastName.value.trim(),email:f.email.value.trim(),phone:f.phone.value.trim(),preferred_contact:f.contactMethod?.value||null};
   const {data:customer,error:customerError}=await supabaseClient.from('customers').insert(customerPayload).select('id').single();
   if(customerError)throw customerError;
   const servicePayload={customer_id:customer.id,service_type:activeService,status:'under_review',preferred_date:f.preferredDate.value||null,preferred_time_window:f.timeWindow.value||null,notes:f.notes.value||null,estimated_total:estimateNumber()};
   const {data:request,error:requestError}=await supabaseClient.from('service_requests').insert(servicePayload).select('id').single();
   if(requestError)throw requestError;
   const requestId=request.id;
   if(activeService==='ron'){
     const {error}=await supabaseClient.from('ron_requests').insert({service_request_id:requestId,document_type:f.documentType.value||null,number_of_signers:numericValue('signerCount'),number_of_notarizations:numericValue('notarizationCount'),ron_platform:null,tech_ready:checkedValue('techReady'),valid_id_confirmed:checkedValue('validId'),consent_to_recording:checkedValue('recordingConsent')});
     if(error)throw error;
     await uploadFileGroup(requestId,'ronFiles','ron-documents');
   }
   if(activeService==='mobile'){
     const witnessVal=f.witnesses?.value||'No';
     const printAddon=checkedValue('mobilePrintAddon');
     const scanAddon=checkedValue('mobileScanAddon');
     const mobilePrintTotal=printAddon?printCost({pages:numericValue('mobilePrintPages'),color:f.mobileColor?.value,sides:f.mobileSides?.value,paperSize:f.mobilePaperSize?.value,paperType:f.mobilePaperType?.value}):0;
     const {error}=await supabaseClient.from('mobile_notary_requests').insert({service_request_id:requestId,street_address:f.street.value||null,unit:null,city:f.city.value||null,state:'TX',zip:f.zip.value||null,number_of_signers:numericValue('signerCount'),number_of_notarizations:numericValue('notarizationCount'),witnesses_needed:witnessVal==='Yes',print_add_on:printAddon,scan_back_needed:scanAddon,travel_miles:null,travel_fee:20,dispatch_payment_required:20+mobilePrintTotal});
     if(error)throw error;
     if(printAddon)await uploadFileGroup(requestId,'mobilePrintFiles','mobile-print-files');
   }
   if(activeService==='print'){
     const fulfillment=f.fulfillment?.value||'digital';
     const pages=numericValue('pages');
     const isColor=f.color?.value==='color';
     const deliveryAddress=(fulfillment==='delivery'||fulfillment==='mobile-notary')?[f.printStreet?.value,f.printCity?.value,f.printZip?.value].filter(Boolean).join(', '):null;
     const printTotal=printCost({pages,color:f.color?.value,sides:f.sides?.value,paperSize:f.paperSize?.value,paperType:f.paperType?.value});
     const {error}=await supabaseClient.from('print_scan_requests').insert({service_request_id:requestId,fulfillment_type:fulfillment,delivery_address:deliveryAddress,black_white_pages:isColor?0:pages,color_pages:isColor?pages:0,paper_size:f.paperSize?.value||null,print_sides:f.sides?.value||null,paper_type:f.paperType?.value||null,scan_pages:numericValue('scanPages'),delivery_fee:fulfillment==='delivery'?20:0,print_total:printTotal});
     if(error)throw error;
     await uploadFileGroup(requestId,'printFiles','print-scan-files');
   }
   const ref='APS-'+requestId.slice(0,8).toUpperCase();
   try {
     const { error: statusError } = await supabaseClient.from('request_status_updates').insert({service_request_id:requestId,status:'under_review',message:`Request received through the website intake form. Reference: ${ref}.`,sent_email:false,sent_sms:false});
     if (statusError) console.warn('Status update insert did not complete:', statusError.message || statusError);
   } catch(statusErr) {
     console.warn('Status update insert skipped:', statusErr);
   }
   await sendRequestNotifications(requestId, ref);
   localStorage.setItem('aligned_last_request',JSON.stringify({ref,service:activeService,total:qs('#estimateTotal').textContent,name:f.firstName.value,email:f.email.value,phone:f.phone.value,requestId}));
   window.location.href=`success.html?service=${activeService}&ref=${encodeURIComponent(ref)}`;
 }catch(err){
   console.error(err);
   setSubmitState(false,'We could not submit the request. Please check your connection and try again, or contact us directly.');
   alert('We could not submit the request. Please try again or contact Aligned Print & Scan directly.');
 }
}

function initWizard(){
 if(!wizard)return;
 tabs.forEach(t=>t.addEventListener('click',()=>applyService(t.dataset.service)));
 qs('#nextStep').addEventListener('click',()=>{if(validateStep(true))showStep(currentStep+1);else updateContinueState();});
 qs('#prevStep').addEventListener('click',()=>showStep(currentStep-1));
 qsa('input,select,textarea',wizard).forEach(el=>el.addEventListener('input',()=>{updateConditional();calculateEstimate();updateContinueState()}));
 qsa('input,select,textarea',wizard).forEach(el=>el.addEventListener('change',()=>{updateConditional();calculateEstimate();updateContinueState()}));
 wizard.addEventListener('submit',submitRequestToSupabase);
 const params=new URLSearchParams(location.search);applyService(params.get('service')||'ron');
}
initWizard();



async function submitSupportTicket(event){
  event.preventDefault();
  const form=event.currentTarget;
  const status=qs('#supportStatus');
  if(status)status.textContent='Submitting your support request…';
  if(!supabaseClient){if(status)status.textContent='Support system is not connected yet. Please email hello@alignedprintscan.com.';return;}
  const payload={
    first_name:form.firstName.value.trim(),
    last_name:form.lastName.value.trim(),
    company:form.company.value.trim()||null,
    email:form.email.value.trim(),
    reference_number:form.referenceNumber.value.trim()||null,
    reason:form.reason.value||'other',
    message:form.message.value.trim(),
    status:'new'
  };
  const {error}=await supabaseClient.from('support_tickets').insert(payload);
  if(error){console.error(error);if(status)status.textContent='We could not submit your support request. Please email hello@alignedprintscan.com.';return;}
  form.reset();
  if(status)status.textContent='Thank you. Your support request has been received. We will follow up within two business days.';
}
const supportForm=qs('#supportForm');
if(supportForm) supportForm.addEventListener('submit',submitSupportTicket);

const publicStatusCopy={
  under_review:{eyebrow:'Request Received',headline:'We’re Reviewing Your Request',lead:'Thank you. Your request has been received and is being reviewed for service fit, availability, document needs, and next steps.',title:'Request Received — Under Review',body:'Your appointment or order is not confirmed yet. We will review the details and follow up with a professional quote, preparation instructions, or any needed clarification.'},
  quote_ready:{eyebrow:'Quote Ready',headline:'Your Quote Is Ready for Review',lead:'Your request has been reviewed and an itemized quote has been prepared for your approval.',title:'Quote Ready — Awaiting Approval',body:'Please review the invoice details carefully. If everything looks correct, continue to secure payment. If changes are needed, contact support with your reference number.'},
  awaiting_approval:{eyebrow:'Quote Ready',headline:'Please Review Your Quote',lead:'Your itemized quote is ready. Review the services, fees, and preparation details before payment.',title:'Quote Ready — Awaiting Approval',body:'This stage gives you time to confirm the details before payment. Your appointment or production work is not confirmed until payment and scheduling requirements are complete.'},
  awaiting_payment:{eyebrow:'Awaiting Payment',headline:'Secure Payment Required',lead:'Your quote has been approved or prepared for payment. Complete secure payment to move your request toward confirmation.',title:'Awaiting Payment',body:'Once payment is received, we will continue with appointment confirmation, production scheduling, or fulfillment instructions.'},
  payment_received:{eyebrow:'Payment Received',headline:'Payment Received',lead:'Thank you. Payment has been received and your request is moving into confirmation.',title:'Payment Received — Appointment Confirmation',body:'We will confirm appointment details, platform instructions, delivery timing, or production next steps based on your service type.'},
  appointment_confirmed:{eyebrow:'Appointment Confirmed',headline:'Your Appointment Is Confirmed',lead:'Your request is confirmed. Please review the preparation details so your appointment or fulfillment can proceed smoothly.',title:'Confirmed — Appointment Details',body:'Please have required identification, documents, technology, witnesses, or access details ready according to your service type.'},
  completed:{eyebrow:'Completed',headline:'Service Completed',lead:'Thank you for trusting Aligned Print & Scan. Your invoice/receipt details are available for your records.',title:'Completed — Receipt & Review',body:'We appreciate your business and would be grateful for a review if you were pleased with your experience.'},
  cancelled:{eyebrow:'Request Closed',headline:'Request Cancelled',lead:'This request is currently marked cancelled.',title:'Cancelled',body:'If you believe this is an error or would like to submit a new request, please contact support.'},
  declined:{eyebrow:'Request Closed',headline:'Request Declined',lead:'This request is currently marked declined.',title:'Declined',body:'If circumstances have changed, you may submit a new request or contact support for clarification.'}
};
function statusCopy(status){return publicStatusCopy[status]||publicStatusCopy.under_review;}
function invoiceList(items=[]){
  if(!items.length)return '<p class="admin-muted">Invoice line items are pending review.</p>';
  const rows=items.map(i=>`<div class="invoice-public-row"><span>${escapePublic(i.description||'Service')}</span><strong>${money(Number(i.line_total||0))}</strong></div>`).join('');
  const total=items.reduce((s,i)=>s+Number(i.line_total||0),0);
  return `<div class="invoice-public-list">${rows}<div class="invoice-public-total"><span>Total</span><strong>${money(total)}</strong></div></div>`;
}
function escapePublic(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
async function getPublicStatus(requestId,ref){
  if(!supabaseClient)return null;
  try{
    const {data,error}=await supabaseClient.functions.invoke('get-request-status',{body:{request_id:requestId||null,reference_number:ref||null}});
    if(error)throw error;
    return data;
  }catch(err){console.warn('Status function unavailable. Using local confirmation fallback.',err);return null;}
}
async function startEmbeddedPayment(requestId){
  const box=qs('#embeddedPaymentBox');
  if(box)box.innerHTML='<p class="admin-muted">Preparing secure payment…</p>';
  try{
    const {data,error}=await supabaseClient.functions.invoke('create-embedded-checkout',{body:{request_id:requestId}});
    if(error)throw error;
    if(!data?.client_secret)throw new Error('Missing Stripe client secret.');
    const stripe=Stripe(data.publishable_key);
    const checkout=await stripe.initEmbeddedCheckout({clientSecret:data.client_secret});
    checkout.mount('#embeddedPaymentBox');
  }catch(err){
    console.error(err);
    if(box)box.innerHTML='<div class="email-notice"><h3>Secure payment is not available yet</h3><p>Your invoice is saved, but embedded payment is not fully connected. Please contact Aligned Print & Scan for payment instructions.</p></div>';
  }
}
function renderSuccessFallback(params,saved){
  const service=params.get('service')||saved.service||'request';
  const ref=params.get('ref')||saved.ref||'APS-REQUEST';
  const labels={ron:'Remote Online Notary request',mobile:'Mobile Notary request',print:'Print & Scan request'};
  return {request:{id:saved.requestId||null,status:'under_review',service_type:service,estimated_total:saved.total||null,quote_amount:null,invoice_number:null,receipt_url:null,prep_video_url:null,review_link_google:null,review_link_yelp:null},reference_number:ref,items:[],label:labels[service]||'Service Request'};
}
async function initSuccessPage(){
  const successBox=qs('#successDetails');
  if(!successBox)return;
  const params=new URLSearchParams(location.search);
  const saved=JSON.parse(localStorage.getItem('aligned_last_request')||'{}');
  const requestId=params.get('request_id')||params.get('id')||saved.requestId||null;
  const ref=params.get('ref')||saved.ref||null;
  const result=await getPublicStatus(requestId,ref) || renderSuccessFallback(params,saved);
  const request=result.request||{};
  const items=result.items||[];
  const reference=result.reference_number||ref||'APS-REQUEST';
  const status=request.status||'under_review';
  const copy=statusCopy(status);
  const quoteAmount=Number(request.quote_amount||request.estimated_total||0)||0;
  qs('#successEyebrow').textContent=copy.eyebrow;
  qs('#successHeadline').textContent=copy.headline;
  qs('#successLead').textContent=copy.lead;
  const canPay=['quote_ready','awaiting_approval','awaiting_payment'].includes(status)&&quoteAmount>0&&request.id;
  const completed=status==='completed';
  const reviewButtons=completed?`<div class="cta-row review-buttons"><a class="btn primary" href="${request.review_link_google||'https://www.google.com/search?q=Aligned+Print+%26+Scan+reviews'}" target="_blank" rel="noopener">Leave a Google Review</a><a class="btn secondary" href="${request.review_link_yelp||'#'}">Yelp Review</a></div>`:'';
  const prepVideo=request.prep_video_url?`<div class="next-panel"><h3>Appointment Preparation Video</h3><p>Watch this preparation guide before your session or appointment.</p><div class="video-embed"><iframe src="${escapePublic(request.prep_video_url)}" title="Preparation video" allowfullscreen></iframe></div></div>`:'';
  successBox.innerHTML=`
    <div class="success-ref">${escapePublic(reference)}</div>
    <div class="success-grid">
      <div><span class="small-label">Selected Service</span><strong>${serviceLabel(request.service_type)||result.label||'Service Request'}</strong></div>
      <div><span class="small-label">Invoice Total</span><strong>${quoteAmount?money(quoteAmount):'Pending review'}</strong></div>
      <div><span class="small-label">Current Status</span><strong>${copy.title}</strong></div>
    </div>
    <div class="email-notice"><h3>${copy.title}</h3><p>${copy.body}</p></div>
    <div class="next-panel"><h3>Itemized Invoice / Quote</h3>${invoiceList(items)}${request.invoice_number?`<p class="admin-muted">Invoice Number: <strong>${escapePublic(request.invoice_number)}</strong></p>`:''}${request.receipt_url?`<p><a class="btn dark" href="${escapePublic(request.receipt_url)}" target="_blank" rel="noopener">Open Receipt</a></p>`:''}</div>
    ${canPay?`<div class="next-panel"><h3>Secure Embedded Payment</h3><p>Complete payment securely to continue with appointment confirmation, production, or fulfillment.</p><div id="embeddedPaymentBox" class="embedded-payment-box"><button id="startPaymentBtn" class="btn primary" type="button">Proceed to Secure Payment</button></div></div>`:''}
    ${prepVideo}
    ${completed?`<div class="next-panel"><h3>Thank You for Choosing Aligned Print & Scan</h3><p>Your service has been completed. Please keep this page for your invoice/receipt reference. We appreciate your trust and welcome your feedback.</p>${reviewButtons}</div>`:''}
    <div class="timeline-list"><h3>Service Timeline</h3><div><span>01</span><p>Request received and reviewed for service fit, timing, and document needs.</p></div><div><span>02</span><p>Quote or invoice issued with next-step instructions.</p></div><div><span>03</span><p>Payment and appointment/fulfillment details confirmed.</p></div></div>
  `;
  qs('#startPaymentBtn')?.addEventListener('click',()=>startEmbeddedPayment(request.id));
}
initSuccessPage();
