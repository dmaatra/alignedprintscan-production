const SUPABASE_URL='https://sfsdniavqldgbiretply.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco';
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


const successBox=qs('#successDetails');
if(successBox){
  const params=new URLSearchParams(location.search);
  const saved=JSON.parse(localStorage.getItem('aligned_last_request')||'{}');
  const service=params.get('service')||saved.service||'request';
  const ref=params.get('ref')||saved.ref||'APS-REQUEST';
  const labels={ron:'Remote Online Notary request',mobile:'Mobile Notary request',print:'Print & Scan request'};
  const serviceNext={
    ron:{
      title:'Remote Online Notary: What Happens Next',
      items:[
        'We will review your document type, signer details, uploaded files, and requested time window.',
        'After review, you will receive instructions to complete scheduling/payment and continue through our approved Remote Online Notary platform.',
        'Please keep your government-issued photo ID, camera-enabled device, microphone, and stable internet connection available for your session.'
      ]
    },
    mobile:{
      title:'Mobile Notary: What Happens Next',
      items:[
        'We will review your address, document needs, signer details, and any print/scan add-ons.',
        'If accepted, you will receive a quote/payment link for the required dispatch and preparation payment before travel begins.',
        'Remaining balances are collected before services continue once appointment readiness is confirmed on arrival.'
      ]
    },
    print:{
      title:'Print & Scan: What Happens Next',
      items:[
        'We will review your uploaded files, print preferences, scan needs, and fulfillment details.',
        'If everything is complete, you will receive pricing/payment instructions before printing, scanning, delivery, or fulfillment begins.',
        'Requests requiring delivery or mobile notary add-ons will be reviewed before confirmation.'
      ]
    }
  };
  const next=serviceNext[service]||serviceNext.print;
  successBox.innerHTML=`
    <div class="success-ref">${ref}</div>
    <div class="success-grid">
      <div><span class="small-label">Selected Service</span><strong>${labels[service]||'Service request'}</strong></div>
      <div><span class="small-label">Estimated Total</span><strong>${saved.total||'Pending review'}</strong></div>
      <div><span class="small-label">Status</span><strong>Under Review</strong></div>
    </div>
    <div class="email-notice">
      <h3>Check your email</h3>
      <p>A confirmation email will be sent from <strong>hello@alignedprintscan.com</strong>. Please check your inbox, junk, or spam folder.</p>
    </div>
    <div class="next-panel">
      <h3>${next.title}</h3>
      <ol>${next.items.map(i=>`<li>${i}</li>`).join('')}</ol>
    </div>
  `;
}
