const SUPABASE_URL = 'https://sfsdniavqldgbiretply.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL,
  SUPABASE_ANON_KEY) : null;

const menuBtn = document.querySelector('.menu-btn');
const navLinks = document.querySelector('.nav-links');
if (menuBtn) {
  menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'))
}
// Premium scroll reveal animation with safe fallbacks.
// Functional content is still forced visible if the observer ever misses it.
let revealObserver = null;

function initReveals(root = document) {
  const items = [...root.querySelectorAll('.reveal:not(.visible):not([data-reveal-bound])')];
  if (!items.length) return;
  if ('IntersectionObserver' in window) {
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: .08,
        rootMargin: '0px 0px -40px 0px'
      });
    }
    items.forEach(el => {
      el.dataset.revealBound = 'true';
      revealObserver.observe(el);
    });
  } else {
    items.forEach(el => el.classList.add('visible'));
  }
}
initReveals();
window.addEventListener('load', () => initReveals());
setTimeout(() => document.querySelectorAll('.reveal:not(.visible)').forEach(el => el.classList.add(
  'visible')), 1400);
document.querySelectorAll('.faq-q').forEach(btn => btn.addEventListener('click', () => btn
  .parentElement.classList.toggle('open')));

function money(n) {
  return '$' + Number(n || 0).toFixed(2)
}

function qs(sel, root = document) {
  return root.querySelector(sel)
}

function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)]
}

function visible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

const tabs = qsa('.service-tab');
const wizard = qs('#smartRequestForm');
const stepNames = ['Contact', 'Details', 'Options', 'Scheduling', 'Review'];
const PRICING = window.ALIGNED_PRICING || {
  ron: {
    onlineServiceFee: 25,
    notarialAct: 10,
    providedWitness: 25
  },
  mobile: {
    appointmentBase: 50,
    notarialAct: 10,
    providedWitness: 50
  },
  documentServices: {
    scanPerPage: 1,
    courierBase: 20,
    mobileDocumentBase: 20
  }
};
let activeService = 'ron';
let currentStep = 0;

function printCost({
  pages = 0,
  color = 'bw',
  sides = 'single',
  paperSize = 'letter',
  paperType = 'standard'
} = {}) {
  let rate = 0;
  if (color === 'bw' && sides === 'single') rate = .25;
  if (color === 'bw' && sides === 'double') rate = .35;
  if (color === 'color' && sides === 'single') rate = .50;
  if (color === 'color' && sides === 'double') rate = .65;
  const size = paperSize === 'legal' ? .10 : 0;
  const paper = {
    standard: 0,
    resume: .25,
    cardstock: .40,
    'color-paper': .15
  } [paperType] || 0;
  return (+pages || 0) * (rate + size + paper);
}

function addItem(items, label, amt) {
  amt = Number(amt) || 0;
  if (amt > 0) items.push([label, amt]);
}

function calculateEstimate() {
  if (!wizard) return;
  let total = 0,
    items = [];
  const f = wizard.elements;
  if (activeService === 'ron') {
    addItem(items, 'Online notarization service fee', PRICING.ron.onlineServiceFee);
    addItem(items, 'Notarial act', PRICING.ron.notarialAct);
    addItem(items, 'Additional notarial acts', PRICING.ron.notarialAct * (+f.additionalNotarizations
      ?.value || 0));
    addItem(items, 'Witness coordination — Aligned Print & Scan provided', PRICING.ron
      .providedWitness * providedWitnessCount('ron'));
  }
  if (activeService === 'mobile') {
    addItem(items, 'Mobile Appointment Base (0–15 miles)', PRICING.mobile.appointmentBase);
    addItem(items, 'Notarial act estimate', PRICING.mobile.notarialAct * (+f.notarizationCount
      ?.value || 1));
    addItem(items, 'Mobile witness coordination — Aligned Print & Scan provided', PRICING.mobile
      .providedWitness * providedWitnessCount('mobile'));
    if (f.mobilePrintAddon?.checked) addItem(items, 'Print add-on estimate', printCost({
      pages: +f.mobilePrintPages?.value || 0,
      color: f.mobileColor?.value,
      sides: f.mobileSides?.value,
      paperSize: f.mobilePaperSize?.value,
      paperType: f.mobilePaperType?.value
    }));
    if (f.mobileScanAddon?.checked) addItem(items, 'Scan-to-PDF estimate', (+f.mobileScanPages
      ?.value || 0) * 1);
  }
  if (activeService === 'print') {
    addItem(items, 'Printing / copies estimate', printCost({
      pages: +f.pages?.value || 0,
      color: f.color?.value,
      sides: f.sides?.value,
      paperSize: f.paperSize?.value,
      paperType: f.paperType?.value
    }));
    addItem(items, 'Scan to PDF estimate', (+f.scanPages?.value || 0) * 1);
    if (f.fulfillment?.value === 'courier') addItem(items, 'Courier delivery estimate', 20);
    if (f.fulfillment?.value === 'mobile-service') addItem(items, 'Mobile document service base',
      20);
    if (f.fulfillment?.value === 'mobile-notary') {
      addItem(items, 'Mobile Appointment Base add-on (0–15 miles)', 50);
      addItem(items, 'Notarial act / signature add-on', 10 * (+f.printNotarizationCount?.value ||
        1));
    }
  }
  total = items.reduce((s, i) => s + i[1], 0);
  qs('#estimateTotal').textContent = money(total);
  qs('#lineItems').innerHTML = items.length ? items.map(([l, a]) => `${l}: ${money(a)}`).join(
    '<br>') : 'Complete the applicable fields to view an estimate.';
}

function applyService(service) {
  activeService = service;
  currentStep = 0;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.service === service));
  document.body.dataset.service = service;
  const names = {
    ron: 'Remote Online Notary',
    mobile: 'Mobile Notary',
    print: 'Document Services'
  };
  const copy = {
    ron: 'Secure online notarization estimate and onboarding details.',
    mobile: 'Mobile appointment estimate with relevant add-ons.',
    print: 'Printing, copies, scanning, and courier delivery estimate.'
  };
  qs('#summaryTitle').textContent = names[service];
  qs('#summaryCopy').textContent = copy[service];
  qs('#detailsHeading').textContent = service === 'ron' ? 'RON Details' : service === 'mobile' ?
    'Mobile Notary Details' : 'Document Service Details';
  qs('#detailsHelp').textContent = service === 'ron' ? 'Tell us what will be notarized online.' :
    service === 'mobile' ?
    'Tell us where the mobile appointment will take place and what will be notarized.' :
    'Upload or describe the documents you need printed, copied, scanned, or couriered.';
  qs('#optionsHeading').textContent = service === 'ron' ? 'RON Options' : service === 'mobile' ?
    'Mobile Add-Ons' : 'Document Service Options';
  qsa('[data-only]').forEach(el => {
    el.style.display = el.dataset.only.split(' ').includes(service) ? 'block' : 'none'
  });
  clearErrors();
  updateConditional();
  showStep(0);
  calculateEstimate();
  updateContinueState();
}

function providedWitnessCount(service) {
  if (!wizard) return 0;
  const need = wizard.elements[service + 'WitnessNeed']?.value;
  const provider = wizard.elements[service + 'WitnessProvider']?.value;
  if (need !== 'yes') return 0;
  if (provider === 'aligned') {
    const count = wizard.elements[service + 'WitnessCount']?.value;
    return count === 'not_sure' ? 0 : (Number(count) || 0);
  }
  if (provider === 'shared') return Number(wizard.elements[service + 'ProvidedWitnessCount']
    ?.value || 0) || 0;
  return 0;
}

function updateConditional() {
  if (!wizard) return;
  qsa('[data-addon]').forEach(el => {
    const ctrl = wizard.elements[el.dataset.addon];
    el.style.display = ctrl && ctrl.checked ? 'block' : 'none'
  });
  qsa('[data-fulfillment]').forEach(el => {
    const allowed = el.dataset.fulfillment.split(' ');
    const val = wizard.elements.fulfillment?.value;
    el.style.display = allowed.includes(val) ? 'block' : 'none'
  });
  qsa('[data-witness-service]').forEach(el => {
    const service = el.dataset.witnessService;
    el.style.display = wizard.elements[service + 'WitnessNeed']?.value === 'yes' ? 'block' :
      'none'
  });
  qsa('[data-witness-shared]').forEach(el => {
    const service = el.dataset.witnessShared;
    el.style.display = wizard.elements[service + 'WitnessNeed']?.value === 'yes' && wizard
      .elements[service + 'WitnessProvider']?.value === 'shared' ? 'block' : 'none'
  });
}

function showStep(n) {
  currentStep = Math.max(0, Math.min(4, n));
  clearErrors();
  qsa('.wizard-step').forEach((el, i) => el.classList.toggle('active', i === currentStep));
  qs('#stepLabel').textContent = `Step ${currentStep+1} of 5`;
  qs('#stepName').textContent = stepNames[currentStep];
  qs('#progressBar').style.width = `${((currentStep+1)/5)*100}%`;
  qs('#prevStep').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
  qs('#nextStep').style.display = currentStep === 4 ? 'none' : 'inline-flex';
  updateContinueState();
}

function fieldValue(name) {
  const el = wizard?.elements[name];
  if (!el) return '';
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'file') return el.files && el.files.length > 0;
  return String(el.value || '').trim();
}

function markInvalid(name, msg) {
  const el = wizard.elements[name];
  if (!el) return false;
  const box = el.closest('.upload-box') || el.closest('label') || el;
  box.classList.add('field-error');
  let hint = document.createElement('div');
  hint.className = 'error-text';
  hint.textContent = msg || 'Required';
  if (box.parentNode && !box.parentNode.querySelector(`.error-text[data-for="${name}"]`)) {
    hint.dataset.for = name;
    box.insertAdjacentElement('afterend', hint);
  }
  return false;
}

function clearErrors() {
  qsa('.field-error').forEach(e => e.classList.remove('field-error'));
  qsa('.error-text').forEach(e => e.remove());
}

function requireFilled(names) {
  let ok = true;
  names.forEach(n => {
    if (!fieldValue(n)) ok = markInvalid(n, 'Please complete this field.') && ok;
  });
  return ok;
}

function validateStep(showErrors = false) {
  if (!wizard) return true;
  if (showErrors) clearErrors();
  let ok = true;
  const need = (names) => {
    names.forEach(n => {
      if (!fieldValue(n)) {
        ok = false;
        if (showErrors) markInvalid(n, 'Please complete this field.')
      }
    })
  };
  const needOne = (names, msg) => {
    if (!names.some(n => fieldValue(n))) {
      ok = false;
      if (showErrors) markInvalid(names[0], msg)
    }
  };
  if (currentStep === 0) {
    need(['firstName', 'lastName', 'email', 'phone']);
  }
  if (currentStep === 1) {
    if (activeService === 'ron') {
      need(['documentType', 'notarizationCount', 'signerCount', 'ronFiles', 'techReady',
        'recordingConsent'
      ]);
    }
    if (activeService === 'mobile') {
      need(['documentType', 'notarizationCount', 'signerCount', 'street', 'city', 'zip']);
    }
    if (activeService === 'print') {
      need(['printFiles']);
      if ((+wizard.elements.pages.value || 0) <= 0 && (+wizard.elements.scanPages.value || 0) <=
        0) {
        ok = false;
        if (showErrors) markInvalid('pages', 'Enter the number of print or scan pages.')
      }
    }
  }
  if (currentStep === 2) {
    if (activeService === 'ron') {
      need(['idType']);
    }
    if (activeService === 'mobile') {
      if (wizard.elements.mobilePrintAddon?.checked) {
        need(['mobilePrintFiles']);
        if ((+wizard.elements.mobilePrintPages.value || 0) <= 0) {
          ok = false;
          if (showErrors) markInvalid('mobilePrintPages', 'Enter the number of pages to print.')
        }
      }
      if (wizard.elements.mobileScanAddon?.checked && (+wizard.elements.mobileScanPages.value ||
        0) <= 0) {
        ok = false;
        if (showErrors) markInvalid('mobileScanPages', 'Enter the number of scan pages.');
      }
    }
    if (activeService === 'print') {
      const val = wizard.elements.fulfillment?.value;
      if (val === 'courier' || val === 'mobile-service' || val === 'mobile-notary') need([
        'printStreet', 'printCity', 'printZip'
      ]);
      if (val === 'mobile-notary') need(['printNotarizationCount', 'printSignerCount',
        'printNotaryDocType'
      ]);
    }
  }
  if (currentStep === 3) {
    need(['preferredDate', 'timeWindow']);
    if (activeService === 'ron' || activeService === 'mobile') {
      need(['validId', 'awareWilling']);
    }
  }
  if (currentStep === 4) {
    need(['notLegalAdvice', 'quoteOnly']);
  }
  return ok;
}

function updateContinueState() {
  const btn = qs('#nextStep');
  if (!btn || currentStep === 4) return;
  const ok = validateStep(false);
  btn.disabled = !ok;
  btn.classList.toggle('disabled', !ok);
  btn.setAttribute('aria-disabled', String(!ok));
}

function numericValue(name) {
  return Number(wizard?.elements[name]?.value || 0) || 0;
}

function checkedValue(name) {
  return !!wizard?.elements[name]?.checked;
}

function cleanFileName(name) {
  return String(name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0,
  120);
}

function estimatePdfPageCountFromText(text) {
  const matches = String(text || '').match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}
async function countPdfPagesFromFile(file) {
  if (!file || !/pdf$/i.test(file.name || '') && file.type !== 'application/pdf') return 0;
  try {
    const text = await file.text();
    return estimatePdfPageCountFromText(text);
  } catch (err) {
    console.warn('PDF page count detection skipped:', err);
    return 0;
  }
}
async function detectUploadedPdfPageCount(inputNames = []) {
  let total = 0;
  for (const name of inputNames) {
    const input = wizard?.elements[name];
    const files = input?.files ? [...input.files] : [];
    for (const file of files) total += await countPdfPagesFromFile(file);
  }
  return total || null;
}

function appointmentUrgencyFlags(dateValue) {
  if (!dateValue) return {
    is_same_day_request: false,
    is_next_day_request: false
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requested = new Date(dateValue + 'T12:00:00');
  requested.setHours(0, 0, 0, 0);
  const diffDays = Math.round((requested - today) / 86400000);
  return {
    is_same_day_request: diffDays === 0,
    is_next_day_request: diffDays === 1
  };
}

function estimateNumber() {
  return Number((qs('#estimateTotal')?.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
}

function serviceLabel(service) {
  return {
    ron: 'Remote Online Notary',
    mobile: 'Mobile Notary',
    print: 'Document Services'
  } [service] || 'Service Request';
}

function statusLabel(status) {
  return ({
    under_review: 'Request Received / Under Review',
    quote_ready: 'Quote Ready',
    quote_sent: 'Quote Sent',
    awaiting_approval: 'Quote Ready / Awaiting Approval',
    awaiting_payment: 'Quote Approved / Awaiting Payment',
    payment_pending: 'Awaiting Payment',
    payment_submitted: 'Payment Submitted',
    payment_received: 'Payment Received',
    paid_confirmed: 'Payment Received',
    scheduling: 'Scheduling In Progress',
    scheduled: 'Appointment Confirmed',
    appointment_confirmed: 'Appointment Confirmed',
    appointment_needs_rescheduling: 'Appointment Needs Rescheduling',
    quote_expired: 'Quote Expired',
    final_balance_due: 'Final Balance Due',
    final_balance_payment_submitted: 'Final Balance Payment Submitted',
    final_payment_received: 'Final Payment Received',
    completed: 'Completed',
    changes_requested: 'Changes Requested',
    cancelled: 'Cancelled',
    declined: 'Declined'
  } [status] || String(status || 'Under Review').replace(/_/g, ' ').replace(/\b\w/g, c => c
    .toUpperCase()));
}

function setSubmitState(isSubmitting, msg) {
  const btn = wizard?.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = isSubmitting;
    btn.textContent = isSubmitting ? 'Submitting…' : 'Submit Request';
  }
  let status = qs('#formSubmitStatus');
  if (!status && wizard) {
    status = document.createElement('div');
    status.id = 'formSubmitStatus';
    status.className = 'form-submit-status';
    wizard.querySelector('.wizard-step[data-step="4"]')?.appendChild(status);
  }
  if (status) status.textContent = msg || '';
}
async function uploadFileGroup(serviceRequestId, inputName, category) {
  const input = wizard.elements[inputName];
  const files = input?.files ? [...input.files] : [];
  const records = [];
  for (const file of files) {
    const path = `${serviceRequestId}/${category}/${Date.now()}-${cleanFileName(file.name)}`;
    const {
      error: uploadError
    } = await supabaseClient.storage.from('service-request-files').upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });
    if (uploadError) throw uploadError;
    records.push({
      service_request_id: serviceRequestId,
      file_name: file.name,
      file_path: path,
      file_type: file.type || null,
      file_size: file.size || null
    });
  }
  if (records.length) {
    const {
      error
    } = await supabaseClient.from('request_files').insert(records);
    if (error) throw error;
  }
}

async function sendRequestNotifications(requestId, ref, customer = {}) {
  if (!supabaseClient) return;
  try {
    const {
      error
    } = await supabaseClient.functions.invoke('send-request-email', {
      body: {
        request_id: requestId,
        reference_number: ref,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name
      }
    });
    if (error) {
      console.warn('Notification function did not complete:', error.message || error);
    }
  } catch (err) {
    console.warn('Notification function is not deployed yet or could not be reached:', err);
  }
}

async function submitRequestToSupabase(e) {
  e.preventDefault();
  if (!validateStep(true)) return;
  if (!supabaseClient) {
    alert(
      'The request system is not connected yet. Please contact Aligned Print & Scan directly.');
    return;
  }
  setSubmitState(true, 'Securely submitting your request…');
  try {
    const f = wizard.elements;
    const customerPayload = {
      first_name: f.firstName.value.trim(),
      last_name: f.lastName.value.trim(),
      email: f.email.value.trim(),
      phone: f.phone.value.trim(),
      preferred_contact: f.contactMethod?.value || null
    };
    const {
      data: customer,
      error: customerError
    } = await supabaseClient.from('customers').insert(customerPayload).select('id').single();
    if (customerError) throw customerError;
    const detectedPdfPageCount = await detectUploadedPdfPageCount(['ronFiles', 'mobilePrintFiles',
      'printFiles'
    ]);
    const urgencyFlags = appointmentUrgencyFlags(f.preferredDate.value || null);
    const servicePayload = {
      customer_id: customer.id,
      service_type: activeService,
      status: 'under_review',
      preferred_date: f.preferredDate.value || null,
      preferred_time_window: f.timeWindow.value || null,
      notes: f.notes.value || null,
      estimated_total: estimateNumber(),
      detected_pdf_page_count: detectedPdfPageCount,
      ...urgencyFlags
    };
    const {
      data: request,
      error: requestError
    } = await supabaseClient.from('service_requests').insert(servicePayload).select('id')
  .single();
    if (requestError) throw requestError;
    const requestId = request.id;
    if (activeService === 'ron') {
      const {
        error
      } = await supabaseClient.from('ron_requests').insert({
        service_request_id: requestId,
        document_type: f.documentType.value || null,
        number_of_signers: numericValue('signerCount'),
        number_of_notarizations: numericValue('notarizationCount'),
        ron_platform: null,
        tech_ready: checkedValue('techReady'),
        valid_id_confirmed: checkedValue('validId'),
        consent_to_recording: checkedValue('recordingConsent'),
        witness_need: f.ronWitnessNeed?.value || 'no',
        witness_count: f.ronWitnessCount?.value || null,
        witness_provider: f.ronWitnessProvider?.value || null,
        client_witness_count: numericValue('ronClientWitnessCount'),
        provided_witness_count: providedWitnessCount('ron'),
        witness_review_required: ['not_sure'].includes(f.ronWitnessNeed?.value) || [
            'not_sure'].includes(f.ronWitnessProvider?.value) || f.ronWitnessCount?.value ===
          'not_sure'
      });
      if (error) throw error;
      await uploadFileGroup(requestId, 'ronFiles', 'ron-documents');
    }
    if (activeService === 'mobile') {
      const witnessNeed = f.mobileWitnessNeed?.value || 'no';
      const printAddon = checkedValue('mobilePrintAddon');
      const scanAddon = checkedValue('mobileScanAddon');
      const mobilePrintTotal = printAddon ? printCost({
        pages: numericValue('mobilePrintPages'),
        color: f.mobileColor?.value,
        sides: f.mobileSides?.value,
        paperSize: f.mobilePaperSize?.value,
        paperType: f.mobilePaperType?.value
      }) : 0;
      const {
        error
      } = await supabaseClient.from('mobile_notary_requests').insert({
        service_request_id: requestId,
        street_address: f.street.value || null,
        unit: null,
        city: f.city.value || null,
        state: 'TX',
        zip: f.zip.value || null,
        number_of_signers: numericValue('signerCount'),
        number_of_notarizations: numericValue('notarizationCount'),
        witnesses_needed: witnessNeed === 'yes',
        witness_need: witnessNeed,
        witness_count: f.mobileWitnessCount?.value || null,
        witness_provider: f.mobileWitnessProvider?.value || null,
        client_witness_count: numericValue('mobileClientWitnessCount'),
        provided_witness_count: providedWitnessCount('mobile'),
        witness_review_required: witnessNeed === 'not_sure' || f.mobileWitnessProvider
          ?.value === 'not_sure' || f.mobileWitnessCount?.value === 'not_sure',
        print_add_on: printAddon,
        scan_back_needed: false,
        scan_to_pdf_needed: scanAddon,
        travel_miles: null,
        travel_fee: 50,
        dispatch_payment_required: 50 + mobilePrintTotal
      });
      if (error) throw error;
      if (printAddon) await uploadFileGroup(requestId, 'mobilePrintFiles', 'mobile-print-files');
    }
    if (activeService === 'print') {
      const fulfillment = f.fulfillment?.value || 'courier';
      const pages = numericValue('pages');
      const isColor = f.color?.value === 'color';
      const deliveryAddress = (fulfillment === 'courier' || fulfillment === 'mobile-service' ||
        fulfillment === 'mobile-notary') ? [f.printStreet?.value, f.printCity?.value, f.printZip
        ?.value
      ].filter(Boolean).join(', ') : null;
      const printTotal = printCost({
        pages,
        color: f.color?.value,
        sides: f.sides?.value,
        paperSize: f.paperSize?.value,
        paperType: f.paperType?.value
      });
      const {
        error
      } = await supabaseClient.from('print_scan_requests').insert({
        service_request_id: requestId,
        fulfillment_type: fulfillment,
        delivery_address: deliveryAddress,
        black_white_pages: isColor ? 0 : pages,
        color_pages: isColor ? pages : 0,
        paper_size: f.paperSize?.value || null,
        print_sides: f.sides?.value || null,
        paper_type: f.paperType?.value || null,
        scan_pages: numericValue('scanPages'),
        delivery_fee: fulfillment === 'courier' ? 20 : 0,
        print_total: printTotal
      });
      if (error) throw error;
      await uploadFileGroup(requestId, 'printFiles', 'print-scan-files');
    }
    const ref = 'APS-' + requestId.slice(0, 8).toUpperCase();
    try {
      const {
        error: statusError
      } = await supabaseClient.from('request_status_updates').insert({
        service_request_id: requestId,
        status: 'under_review',
        message: `Request received through the website intake form. Reference: ${ref}.`,
        sent_email: false,
        sent_sms: false
      });
      if (statusError) console.warn('Status update insert did not complete:', statusError
        .message || statusError);
    } catch (statusErr) {
      console.warn('Status update insert skipped:', statusErr);
    }
    await sendRequestNotifications(requestId, ref, customerPayload);
    localStorage.setItem('aligned_last_request', JSON.stringify({
      ref,
      service: activeService,
      total: qs('#estimateTotal').textContent,
      name: f.firstName.value,
      email: f.email.value,
      phone: f.phone.value,
      requestId
    }));
    window.location.href =
      `success.html?request_id=${encodeURIComponent(requestId)}&service=${activeService}&ref=${encodeURIComponent(ref)}`;
  } catch (err) {
    console.error(err);
    setSubmitState(false,
      'We could not submit the request. Please check your connection and try again, or contact us directly.'
      );
    alert(
      'We could not submit the request. Please try again or contact Aligned Print & Scan directly.'
      );
  }
}

function initWizard() {
  if (!wizard) return;
  tabs.forEach(t => t.addEventListener('click', () => applyService(t.dataset.service)));
  qs('#nextStep').addEventListener('click', () => {
    if (validateStep(true)) showStep(currentStep + 1);
    else updateContinueState();
  });
  qs('#prevStep').addEventListener('click', () => showStep(currentStep - 1));
  qsa('input,select,textarea', wizard).forEach(el => el.addEventListener('input', () => {
    updateConditional();
    calculateEstimate();
    updateContinueState()
  }));
  qsa('input,select,textarea', wizard).forEach(el => el.addEventListener('change', () => {
    updateConditional();
    calculateEstimate();
    updateContinueState()
  }));
  wizard.addEventListener('submit', submitRequestToSupabase);
  const params = new URLSearchParams(location.search);
  applyService(params.get('service') || 'ron');
}
initWizard();

async function submitSupportTicket(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = qs('#supportStatus');
  if (status) status.textContent = 'Submitting your support request…';
  if (!supabaseClient) {
    if (status) status.textContent =
      'Support system is not connected yet. Please email hello@alignedprintscan.com.';
    return;
  }
  const payload = {
    first_name: form.firstName.value.trim(),
    last_name: form.lastName.value.trim(),
    company: form.company.value.trim() || null,
    email: form.email.value.trim(),
    phone: form.phone?.value?.trim() || null,
    preferred_contact_method: form.preferredContact?.value || 'email',
    related_to_request: form.relatedToRequest?.value === 'yes',
    reference_number: form.referenceNumber.value.trim() || null,
    reason: form.reason.value || 'other',
    issue_type: form.reason.value || 'other',
    urgency: form.urgency?.value || 'standard',
    message: form.message.value.trim(),
    status: 'new'
  };
  const {
    error
  } = await supabaseClient.from('support_tickets').insert(payload);
  if (error) {
    console.error(error);
    if (status) status.textContent =
      'We could not submit your support request. Please email hello@alignedprintscan.com.';
    return;
  }
  form.reset();
  if (status) status.textContent =
    'Thank you. Your support request has been received. We will follow up within two business days.';
}
const supportForm = qs('#supportForm');
if (supportForm) {
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref') || params.get('reference') || '';
  if (ref && supportForm.referenceNumber) supportForm.referenceNumber.value = ref;
  supportForm.addEventListener('submit', submitSupportTicket);
}

const publicStatusCopy = {
  under_review: {
    eyebrow: 'Request Received',
    headline: 'We’re Reviewing Your Request',
    lead: 'Thank you. Your request has been received and is being reviewed for service fit, availability, document needs, and next steps.',
    title: 'Request Received — Under Review',
    body: 'Your appointment or order is not confirmed yet. We will review the details and follow up with a professional quote, preparation instructions, or any needed clarification.'
  },
  quote_ready: {
    eyebrow: 'Quote Ready',
    headline: 'Your Quote Is Ready for Review',
    lead: 'Your request has been reviewed and an itemized quote has been prepared for your approval.',
    title: 'Quote Ready — Awaiting Approval',
    body: 'Please review the invoice details carefully. If everything looks correct, continue to secure payment. If changes are needed, contact support with your reference number.'
  },
  awaiting_approval: {
    eyebrow: 'Quote Ready',
    headline: 'Please Review Your Quote',
    lead: 'Your itemized quote is ready. Review the services, fees, and preparation details before payment.',
    title: 'Quote Ready — Awaiting Approval',
    body: 'This stage gives you time to confirm the details before payment. Your appointment or production work is not confirmed until payment and scheduling requirements are complete.'
  },
  awaiting_payment: {
    eyebrow: 'Awaiting Payment',
    headline: 'Secure Payment Required',
    lead: 'Your quote has been approved or prepared for payment. Complete secure payment to move your request toward confirmation.',
    title: 'Awaiting Payment',
    body: 'Once payment is received, we will continue with appointment confirmation, production scheduling, or fulfillment instructions.'
  },
  payment_submitted: {
    eyebrow: 'Payment Submitted',
    headline: 'Thank You — Your Payment Was Submitted',
    lead: 'Your secure payment was completed through Stripe. Aligned Print & Scan has been notified and will manually confirm the payment record before sending your official payment-received confirmation and appointment instructions.',
    title: 'Payment Submitted — Admin Review Pending',
    body: 'Thank you for your payment. Once your payment has been reviewed and recorded by Aligned Print & Scan, you will receive a confirmation email with your receipt/status link and the next appointment or fulfillment steps.'
  },
  payment_received: {
    eyebrow: 'Payment Received',
    headline: 'Payment Received',
    lead: 'Thank you. Your payment has been received and your request is confirmed for the next scheduling or fulfillment step.',
    title: 'Payment Received — Appointment Confirmation',
    body: 'Your payment has been recorded. We will now confirm appointment details, RON platform instructions, delivery timing, or production next steps based on your service type.'
  },
  final_balance_payment_submitted: {
    eyebrow: 'Final Payment Submitted',
    headline: 'Final Payment Submitted',
    lead: 'Thank you. Your final balance payment has been submitted successfully.',
    title: 'Final Payment Submitted',
    body: 'Your final payment has been submitted. Aligned Print & Scan has been notified and your payment record is being finalized.'
  },
  final_payment_received: {
    eyebrow: 'Final Payment Received',
    headline: 'Final Payment Received',
    lead: 'Thank you. All outstanding payments connected to this request have been received.',
    title: 'Final Payment Received',
    body: 'Your final payment has been received. Your service summary, payment summary, and receipts are available below.'
  },
  appointment_confirmed: {
    eyebrow: 'Appointment Confirmed',
    headline: 'Your Appointment Is Confirmed',
    lead: 'Your request is confirmed. Please review the preparation details so your appointment or fulfillment can proceed smoothly.',
    title: 'Confirmed — Appointment Details',
    body: 'Please have required identification, documents, technology, witnesses, or access details ready according to your service type. If additional services are completed on site, a final balance invoice may be issued before the order is marked complete.'
  },
  completed: {
    eyebrow: 'Completed',
    headline: 'Service Completed',
    lead: 'Thank you for trusting Aligned Print & Scan. Your invoice/receipt details are available for your records.',
    title: 'Completed — Receipt & Review',
    body: 'We appreciate your business and would be grateful for a review if you were pleased with your experience.'
  },
  appointment_needs_rescheduling: {
    eyebrow: 'Rescheduling Needed',
    headline: 'Appointment Needs Rescheduling',
    lead: 'Your requested appointment time is no longer available or requires adjustment.',
    title: 'Appointment Needs Rescheduling',
    body: 'Please contact support with your next best availability, or watch for an updated appointment option from Aligned Print & Scan.'
  },
  quote_expired: {
    eyebrow: 'Quote Expired',
    headline: 'This Quote Has Expired',
    lead: 'The secure payment option for this quote is no longer active.',
    title: 'Quote Expired',
    body: 'Please submit a new request or contact support if you would like this quote reviewed again.'
  },
  quote_sent: {
    eyebrow: 'Quote Sent',
    headline: 'Your Quote Is Ready for Review',
    lead: 'Your itemized quote has been sent and is ready for approval.',
    title: 'Quote Ready — Awaiting Approval',
    body: 'Please review the invoice details carefully. If everything looks correct, continue to secure payment. If changes are needed, contact support with your reference number.'
  },
  payment_pending: {
    eyebrow: 'Awaiting Payment',
    headline: 'Secure Payment Required',
    lead: 'Complete secure payment to move your request toward confirmation.',
    title: 'Awaiting Payment',
    body: 'Once payment is received, we will continue with appointment confirmation, production scheduling, or fulfillment instructions.'
  },
  scheduled: {
    eyebrow: 'Appointment Confirmed',
    headline: 'Your Appointment Is Confirmed',
    lead: 'Your appointment or fulfillment window has been scheduled.',
    title: 'Confirmed — Appointment Details',
    body: 'Please review all preparation details and have required identification, documents, technology, witnesses, or access details ready.'
  },
  scheduling: {
    eyebrow: 'Scheduling',
    headline: 'Scheduling In Progress',
    lead: 'Your payment has been received and we are preparing appointment or fulfillment details.',
    title: 'Scheduling — Next Step Pending',
    body: 'Aligned Print & Scan is preparing your appointment, RON platform link, delivery plan, or production timeline.'
  },
  paid_confirmed: {
    eyebrow: 'Payment Received',
    headline: 'Payment Received',
    lead: 'Thank you. Your payment has been received and your request is confirmed for the next scheduling or fulfillment step.',
    title: 'Payment Received — Appointment Confirmation',
    body: 'Your payment has been recorded. We will now confirm appointment details, RON platform instructions, delivery timing, or production next steps based on your service type.'
  },
  cancelled: {
    eyebrow: 'Request Closed',
    headline: 'Request Cancelled',
    lead: 'This request is currently marked cancelled.',
    title: 'Cancelled',
    body: 'If you believe this is an error or would like to submit a new request, please contact support.'
  },
  declined: {
    eyebrow: 'Request Closed',
    headline: 'Request Declined',
    lead: 'This request is currently marked declined.',
    title: 'Declined',
    body: 'If circumstances have changed, you may submit a new request or contact support for clarification.'
  }
};

function statusCopy(status) {
  return publicStatusCopy[status] || publicStatusCopy.under_review;
}

function invoiceTotal(items = []) {
  return (items || []).reduce((sum, i) => sum + Number(i.line_total || (Number(i.quantity || 1) *
    Number(i.unit_price || 0)) || 0), 0);
}

function invoiceList(items = []) {
  if (!items.length)
  return '<p class="admin-muted">Line items will appear here after the quote is prepared.</p>';
  const rows = items.map(i => {
    const qty = Number(i.quantity || 1);
    const rate = Number(i.unit_price || 0);
    const total = Number(i.line_total || (qty * rate) || 0);
    return `<tr><td>${escapePublic(i.description||'Service')}</td><td>${escapePublic(String(qty))}</td><td>${money(rate)}</td><td><strong>${money(total)}</strong></td></tr>`;
  }).join('');
  const total = invoiceTotal(items);
  return `<div class="invoice-public-table-wrap"><table class="invoice-public-table"><thead><tr><th>Service Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total</td><td>${money(total)}</td></tr></tfoot></table></div>`;
}

function invoiceStatusLabel(status = '') {
  const s = String(status || '').toLowerCase();
  if (['paid', 'payment_received', 'final_payment_received'].includes(s)) return 'Paid';
  if (['payment_submitted'].includes(s)) return 'Payment submitted';
  if (['final_balance_due', 'awaiting_payment', 'draft', 'sent'].includes(s)) return 'Due';
  if (['void', 'cancelled'].includes(s)) return 'Closed';
  return s ? s.replaceAll('_', ' ') : 'Pending';
}

function findInitialInvoice(invoices = []) {
  return (invoices || []).find(inv => String(inv.invoice_type || '').includes('initial') || String(
    inv.invoice_number || '').endsWith('-01')) || null;
}

function finalBalanceInvoices(invoices = []) {
  return (invoices || []).filter(inv => String(inv.invoice_type || '').includes('final') || String(
    inv.invoice_number || '').endsWith('-02') || String(inv.status || '').includes('final'));
}

function paymentSchedulePanel({
  request = {},
  invoices = [],
  quoteItems = [],
  additionalItems = [],
  quoteAmount = 0,
  compact = false
} = {}) {
  const quoteTotal = Number(quoteAmount || invoiceTotal(quoteItems) || request.quote_amount ||
    request.estimated_total || 0) || 0;
  const initial = findInitialInvoice(invoices);
  const finals = finalBalanceInvoices(invoices);
  const paidStatuses = ['paid', 'payment_received', 'final_payment_received', 'payment_submitted',
    'final_balance_payment_submitted'
  ];
  const closedStatuses = ['void', 'cancelled'];
  const statusNow = String(request.status || '').toLowerCase();

  const activeFinal = finals.find(inv => !paidStatuses.includes(String(inv.status || '')
    .toLowerCase()) && !closedStatuses.includes(String(inv.status || '').toLowerCase()));
  const initialPaid = paidStatuses.includes(String(initial?.status || '').toLowerCase()) || [
    'payment_received', 'appointment_confirmed', 'scheduled', 'final_balance_due',
    'final_payment_received', 'completed'
  ].includes(statusNow);

  const rawInitialAmount = Number(initial?.amount_due || request.initial_payment_amount ||
    quoteTotal || 0) || 0;
  const initialAmount = quoteTotal ? quoteTotal : rawInitialAmount;
  const paidInitial = initialPaid ? initialAmount : 0;
  const paidFinalAmount = finals
    .filter(inv => paidStatuses.includes(String(inv.status || '').toLowerCase()))
    .reduce((sum, inv) => sum + Number(inv.amount_paid || inv.paid_amount || inv.amount_due || 0),
      0);

  const finalIssuedTotal = finals.reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0);
  const totalServiceValue = quoteTotal + finalIssuedTotal;
  const paidToDate = invoices.length ? paidInitial + paidFinalAmount : Number(request.paid_amount ||
    0) || 0;
  const balanceDue = Math.max(0, totalServiceValue - paidToDate);
  const showInitialPay = ['awaiting_payment', 'payment_pending', 'awaiting_approval', 'quote_ready']
    .includes(statusNow) && initialAmount > 0 && !initialPaid && !activeFinal;

  const initialNumber = initial?.invoice_number || (request.invoice_number ?
    `${String(request.invoice_number).replace(/^QUOTE-/,'INV-')}-01`.replace(/-01-01$/, '-01') :
    'Initial payment');
  const initialReceipt = initial?.receipt_url || initial?.receipt_pdf_url || request.receipt_url ||
    request.receipt_pdf_url || '';

  const invoiceRows = [];
  if (initial || quoteTotal || initialAmount) {
    invoiceRows.push(`<div class="payment-schedule-row initial-payment-row premium-receipt-row">
      <span class="small-label">Initial Payment</span>
      <div class="payment-row-main"><strong>${escapePublic(initialNumber)}</strong><span>${initialPaid ? 'Paid' : 'Due'} · ${money(initialAmount)}</span></div>
      <div class="cta-row compact-cta-row">
        ${initialReceipt ? `<a class="btn dark" href="${escapePublic(initialReceipt)}" target="_blank" rel="noopener">View Receipt</a>` : ''}
        ${showInitialPay ? `<button id="startPaymentBtn" class="btn primary" type="button">Pay Initial Payment</button>` : ''}
      </div>
    </div>`);
  }

  if (finals.length) {
    finals.forEach(inv => {
      const invItems = additionalItems.filter(item => String(item.invoice_id || '') === String(
        inv.id || ''));
      const total = Number(inv.amount_due || invoiceTotal(invItems) || 0);
      const receiptUrl = inv.receipt_url || inv.receipt_pdf_url || '';
      const statusText = invoiceStatusLabel(inv.status);
      const payable = String(activeFinal?.id || '') === String(inv.id || '') && total > 0;
      invoiceRows.push(`<div class="payment-schedule-row final-balance-row premium-receipt-row">
        <span class="small-label">Final Balance</span>
        <div class="payment-row-main"><strong>${escapePublic(inv.invoice_number || 'Final Balance Invoice')}</strong><span>${escapePublic(statusText)} · ${money(total)}</span></div>
        ${inv.note ? `<p class="payment-row-note">${escapePublic(inv.note)}</p>` : ''}
        ${invItems.length && !compact ? invoiceList(invItems) : ''}
        <div class="cta-row compact-cta-row">
          ${receiptUrl ? `<a class="btn dark" href="${escapePublic(receiptUrl)}" target="_blank" rel="noopener">View Receipt</a>` : ''}
          ${payable ? `<button class="btn primary payAdditionalInvoice" data-invoice-id="${escapePublic(inv.id)}" type="button">Pay Final Balance</button>` : ''}
        </div>
      </div>`);
    });
  } else if (!compact) {
    invoiceRows.push(
      `<div class="payment-schedule-row final-balance-row not-issued"><span class="small-label">Final Balance</span><div class="payment-row-main"><strong>Not issued</strong><span>Only appears if additional on-site or fulfillment charges are added.</span></div></div>`
      );
  }

  const settled = balanceDue <= 0 && paidToDate > 0;
  return `<div class="next-panel payment-schedule-panel reveal ${settled ? 'settled-payment-panel' : ''}">
    <h3>${settled ? 'Payment Summary' : 'Payment Schedule'}</h3>
    <div class="request-public-detail-grid payment-summary-grid-public premium-payment-metrics">
      <div><span class="small-label">Service Total</span><strong>${money(totalServiceValue || quoteTotal)}</strong></div>
      <div><span class="small-label">Initial Payment</span><strong>${initialPaid ? `${money(paidInitial)} paid` : `${money(initialAmount)} due`}</strong></div>
      ${finals.length ? `<div><span class="small-label">Final Balance</span><strong>${money(finalIssuedTotal)}${activeFinal ? ' due' : ' paid'}</strong></div>` : ''}
      <div><span class="small-label">Paid to Date</span><strong>${money(paidToDate)}</strong></div>
      <div><span class="small-label">Balance Due</span><strong>${money(balanceDue)}</strong></div>
    </div>
    <div class="payment-schedule-list clean-payment-schedule receipt-archive-list">
      ${invoiceRows.join('')}
    </div>
    <div id="embeddedPaymentBox" class="embedded-payment-box"></div>
  </div>`;
}

function receiptPanel(request, reference) {
  if (!['payment_submitted', 'payment_received', 'paid_confirmed', 'scheduling',
      'appointment_confirmed', 'scheduled', 'final_balance_due', 'final_balance_payment_submitted',
      'final_payment_received', 'completed'
    ].includes(request.status || '')) return '';
  const amount = Number(request.paid_amount || request.quote_amount || request.estimated_total ||
    0) || 0;
  const paidDate = request.paid_at ? new Date(request.paid_at).toLocaleString() :
    'Processed / received';
  const submitted = (request.status === 'payment_submitted' || request.status ===
    'final_balance_payment_submitted');
  const finalPaid = (request.status === 'final_payment_received');
  const heading = finalPaid ? 'Final Payment Receipt' : submitted ? 'Payment Submitted' :
    'Payment Receipt';
  const body = finalPaid ?
    'Your final payment has been received. All outstanding payment items connected to this request are now settled.' :
    submitted ?
    'Thank you. Your secure payment was submitted through Stripe. Aligned Print & Scan has been notified.' :
    'Thank you. Your payment has been received and recorded for your request.';
  return `<div class="next-panel receipt-panel reveal"><h3>${heading}</h3><p>${body}</p><div class="request-public-detail-grid"><div><span class="small-label">Reference</span><strong>${escapePublic(reference)}</strong></div><div><span class="small-label">Amount Recorded</span><strong>${money(amount)}</strong></div><div><span class="small-label">Status</span><strong>${escapePublic(finalPaid ? 'Final payment received' : submitted ? 'Payment submitted' : 'Payment received')}</strong></div><div><span class="small-label">Processed</span><strong>${escapePublic(paidDate)}</strong></div></div><div class="cta-row">${request.receipt_url||request.receipt_pdf_url?`<a class="btn dark" href="${escapePublic(request.receipt_url||request.receipt_pdf_url)}" target="_blank" rel="noopener">View Receipt</a>`:`<button class="btn dark" type="button" onclick="window.print()">Print Confirmation</button>`}<a class="btn secondary visible-secondary" href="support.html?ref=${encodeURIComponent(reference)}">Questions? Contact Support</a></div></div>`;
}

function workflowKind(service) {
  const s = String(service || '').toLowerCase();
  if (s === 'ron' || s.includes('remote')) return 'ron';
  if (s === 'mobile' || s.includes('notary')) return 'mobile';
  return 'document';
}

function statusTimeline(status, service = '') {
  const kind = workflowKind(service);
  const stepSets = {
    ron: [
      ['under_review', 'Request Received'],
      ['awaiting_approval', 'Quote Prepared'],
      ['payment_received', 'Payment Received'],
      ['appointment_confirmed', 'Session Confirmed'],
      ['completed', 'Completed']
    ],
    mobile: [
      ['under_review', 'Request Received'],
      ['awaiting_approval', 'Quote Prepared'],
      ['payment_received', 'Reservation Payment Received'],
      ['appointment_confirmed', 'Appointment Confirmed'],
      ['final_balance_due', 'Final Balance Due'],
      ['final_payment_received', 'Final Payment Received'],
      ['completed', 'Completed']
    ],
    document: [
      ['under_review', 'Request Received'],
      ['awaiting_approval', 'Quote Prepared'],
      ['payment_received', 'Production Payment Received'],
      ['appointment_confirmed', 'Fulfillment Scheduled'],
      ['final_balance_due', 'Final Balance Due'],
      ['final_payment_received', 'Final Payment Received'],
      ['completed', 'Completed']
    ]
  };
  const aliases = {
    quote_ready: 'awaiting_approval',
    quote_sent: 'awaiting_approval',
    awaiting_payment: 'awaiting_approval',
    payment_pending: 'awaiting_approval',
    payment_submitted: 'payment_received',
    paid_confirmed: 'payment_received',
    scheduling: 'payment_received',
    scheduled: 'appointment_confirmed'
  };
  const steps = stepSets[kind] || stepSets.document;
  const normalized = aliases[status] || status || 'under_review';
  let idx = steps.findIndex(s => s[0] === normalized);
  if (idx < 0) {
    if (['appointment_needs_rescheduling', 'quote_expired'].includes(normalized)) idx = 1;
    else idx = 0;
  }
  return `<div class="portal-progress reveal">${steps.map((s,i)=>`<div class="portal-step ${i<=idx?'done':''} ${i===idx?'current':''}"><span>${String(i+1).padStart(2,'0')}</span><strong>${s[1]}</strong></div>`).join('')}</div>`;
}

function formatDateValue(value) {
  if (!value) return 'Pending';
  try {
    const d = new Date(String(value).includes('T') ? value : `${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (_) {
    return String(value);
  }
}

function formatTimeWindow(value) {
  if (!value) return 'Pending';
  return String(value).replace(/\s*-\s*/g, '–').replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
}

async function getPublicStatus(requestId, ref) {
  if (!requestId && !ref) return null;
  if (!supabaseClient || !supabaseClient.functions || !supabaseClient.functions.invoke) {
    console.warn('Supabase client is not available for public status lookup.');
    return null;
  }
  try {
    const payload = {};
    if (requestId) payload.request_id = requestId;
    if (ref) payload.ref = ref;
    const {
      data,
      error
    } = await supabaseClient.functions.invoke('get-request-status', {
      body: payload
    });
    if (error) {
      console.warn('get-request-status error', error);
      return null;
    }
    if (!data || data.ok === false) {
      console.warn('get-request-status returned no usable data', data);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Public status lookup failed', err);
    return null;
  }
}

// Public status page safety helpers. These are intentionally small and defensive
// so the status page can still render if an optional helper from an older patch is missing.
function escapePublic(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } [ch]));
}

function refFromPublicId(id) {
  return id ? 'APS-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase() : 'APS-REQUEST';
}

function customerCard(customer = {}) {
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  if (!name && !customer.email && !customer.phone) return '';
  return `<div class="request-public-summary reveal"><h3>Client Information</h3><div class="request-public-detail-grid"><div><span class="small-label">Prepared For</span><strong>${escapePublic(name || 'Client')}</strong></div>${customer.email ? `<div><span class="small-label">Email</span><strong>${escapePublic(customer.email)}</strong></div>` : ''}${customer.phone ? `<div><span class="small-label">Phone</span><strong>${escapePublic(customer.phone)}</strong></div>` : ''}</div></div>`;
}

function printControls(reference) {
  return `<div class="cta-row print-controls reveal"><button class="btn dark" type="button" onclick="window.print()">Print Confirmation</button><a class="btn secondary visible-secondary" href="support.html?ref=${encodeURIComponent(reference || '')}">Contact Support</a></div>`;
}

function serviceMethodLabel(request = {}) {
  const raw = String(request.appointment_platform || request.fulfillment_method || request
    .fulfillment || request.service_method || '').trim();
  if (raw) return raw;
  const service = workflowKind(request.service_type);
  if (service === 'ron') return 'Remote Online Notary';
  if (service === 'mobile') return 'Mobile appointment';
  return 'Mobile document service / courier delivery';
}

function serviceLocationValue(request = {}) {
  return request.appointment_location || request.service_address || request.delivery_address ||
    request.print_address || request.address || request.street_address || request.location || '';
}

function serviceDetailSummary(serviceType, detail = {}) {
  if (!detail || typeof detail !== 'object') return '';
  const hidden = new Set(['id', 'service_request_id', 'customer_id', 'created_at', 'updated_at']);
  const rows = Object.entries(detail).filter(([k, v]) => !hidden.has(k) && v !== null && v !==
    undefined && String(v).trim() !== '').slice(0, 10);
  if (!rows.length) return '';
  return `<div class="request-public-detail-grid service-detail-map">${rows.map(([k,v]) => `<div><span class="small-label">${escapePublic(k.replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase()))}</span><strong>${escapePublic(String(v))}</strong></div>`).join('')}</div>`;
}

function appointmentDetailsPanel(request = {}) {
  const statuses = ['payment_received', 'paid_confirmed', 'scheduling', 'scheduled',
    'appointment_confirmed', 'final_balance_due', 'final_balance_payment_submitted',
    'final_payment_received', 'completed'
  ];
  if (!statuses.includes(String(request.status || '').toLowerCase())) return '';
  const date = formatDateValue(request.appointment_date || request.preferred_date);
  const time = formatTimeWindow(request.appointment_time || request.preferred_time_window);
  const method = serviceMethodLabel(request);
  const location = serviceLocationValue(request);
  const instructions = request.appointment_instructions || request.appointment_line_items_note ||
    request.notes || '';
  return `<div class="next-panel appointment-panel reveal"><h3>Service Details</h3><p>Your appointment or fulfillment details are listed below.</p><div class="request-public-detail-grid"><div><span class="small-label">Date</span><strong>${escapePublic(date)}</strong></div><div><span class="small-label">Time</span><strong>${escapePublic(time)}</strong></div><div><span class="small-label">Service Method</span><strong>${escapePublic(method)}</strong></div>${location ? `<div><span class="small-label">Service Address / Location</span><strong>${escapePublic(location)}</strong></div>` : ''}${instructions ? `<div><span class="small-label">Instructions</span><strong>${escapePublic(instructions)}</strong></div>` : ''}</div></div>`;
}

function conciseServiceSummaryPanel(request = {}, reference = '') {
  const serviceName = serviceLabel(request.service_type) || 'Service Request';
  const date = formatDateValue(request.appointment_date || request.preferred_date);
  const time = formatTimeWindow(request.appointment_time || request.preferred_time_window);
  const method = serviceMethodLabel(request);
  const location = serviceLocationValue(request);
  const instructions = request.appointment_instructions || request.appointment_line_items_note ||
    request.notes || '';
  return `<div class="next-panel service-summary-panel reveal"><h3>Service Summary</h3><div class="request-public-detail-grid"><div><span class="small-label">Service</span><strong>${escapePublic(serviceName)}</strong></div><div><span class="small-label">Date</span><strong>${escapePublic(date)}</strong></div><div><span class="small-label">Time</span><strong>${escapePublic(time)}</strong></div><div><span class="small-label">Service Method</span><strong>${escapePublic(method)}</strong></div>${location ? `<div><span class="small-label">Service Address / Location</span><strong>${escapePublic(location)}</strong></div>` : ''}${instructions ? `<div><span class="small-label">Service Notes</span><strong>${escapePublic(instructions)}</strong></div>` : ''}</div></div>`;
}

function clientServiceDetailsPanel({
  request = {},
  customer = null,
  reference = '',
  fileCount = 0,
  detail = null
} = {}) {
  const c = customer || (Array.isArray(request.customers) ? request.customers[0] : request
    .customers || {});
  const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || 'Client';
  const serviceName = serviceLabel(request.service_type) || 'Service Request';
  const requestedDate = formatDateValue(request.appointment_date || request.preferred_date);
  const requestedTime = formatTimeWindow(request.appointment_time || request.preferred_time_window);
  const method = serviceMethodLabel(request);
  const location = serviceLocationValue(request);
  const instructions = request.appointment_instructions || request.appointment_line_items_note ||
    request.notes || '';
  return `<div class="request-public-summary client-service-combo reveal">
    <h3>Client & Service Details</h3>
    <div class="request-public-detail-grid">
      <div><span class="small-label">Client</span><strong>${escapePublic(name)}</strong></div>
      ${c?.email ? `<div><span class="small-label">Email</span><strong>${escapePublic(c.email)}</strong></div>` : ''}
      ${c?.phone ? `<div><span class="small-label">Phone</span><strong>${escapePublic(c.phone)}</strong></div>` : ''}
      <div><span class="small-label">Service</span><strong>${escapePublic(serviceName)}</strong></div>
      <div><span class="small-label">Date</span><strong>${escapePublic(requestedDate)}</strong></div>
      <div><span class="small-label">Time</span><strong>${escapePublic(requestedTime)}</strong></div>
      <div><span class="small-label">Service Method</span><strong>${escapePublic(method)}</strong></div>
      ${location ? `<div><span class="small-label">Address / Location</span><strong>${escapePublic(location)}</strong></div>` : ''}
      ${fileCount ? `<div><span class="small-label">Uploaded Files</span><strong>${fileCount} received</strong></div>` : ''}
      ${instructions ? `<div><span class="small-label">Instructions</span><strong>${escapePublic(instructions)}</strong></div>` : ''}
    </div>
    ${serviceDetailSummary(request.service_type, detail)}
  </div>`;
}

function approvedServiceQuotePanel({
  items = [],
  quoteAmount = 0,
  reference = '',
  note = '',
  includeDisclaimer = false
} = {}) {
  const hasItems = (items || []).length;
  if (!hasItems && !quoteAmount) return '';
  return `<div class="next-panel invoice-panel approved-service-quote reveal">
    <h3>Approved Service Quote</h3>
    <p class="premium-intro">This is the approved service estimate for your request.</p>
    ${hasItems ? invoiceList(items) : `<p class="admin-muted">Service quote total: <strong>${money(quoteAmount)}</strong></p>`}
    <p class="admin-muted">Quote Reference: <strong>QUOTE-${escapePublic(String(reference).replace(/^APS-/,''))}</strong></p>
    ${includeDisclaimer ? `<div class="email-notice slim-note"><h3>Possible Additional Charges</h3><p>If additional pages, travel, rush handling, after-hours support, witnesses, scanning, courier delivery, or on-site additions are completed, a final balance invoice may be issued before the request is marked complete.</p></div>` : ''}
    ${note ? `<div class="email-notice slim-note"><h3>Client Note</h3><p>${escapePublic(note)}</p></div>` : ''}
  </div>`;
}

function nextStepsPanel(status = '', service = '') {
  const kind = workflowKind(service);
  if (String(status).toLowerCase() === 'payment_received' || String(status).toLowerCase() ===
    'paid_confirmed' || String(status).toLowerCase() === 'scheduling') {
    return `<div class="timeline-list reveal"><h3>What Happens Next</h3><div><span>01</span><p>Aligned Print & Scan will confirm your appointment, delivery, session, or fulfillment details.</p></div><div><span>02</span><p>You will receive a confirmation email with the date, time, address, method, and preparation instructions.</p></div><div><span>03</span><p>${kind === 'ron' ? 'Please keep your ID and technology ready for the remote session.' : 'If additional services are completed, a final balance invoice may be issued before completion.'}</p></div></div>`;
  }
  return '';
}

function preparationTipsPanel(request = {}) {
  const kind = workflowKind(request.service_type);
  const text = kind === 'ron' ?
    'Please have your valid identification, required documents, stable internet, camera, microphone, and any platform instructions ready before your session time.' :
    kind === 'mobile' ?
    'Please have valid identification, unsigned documents, required witnesses, and access details ready at the appointment location. If additional notarial acts, travel, or on-site support are added, a final balance invoice may be issued.' :
    'Please have documents, access details, delivery instructions, labels, or pickup/courier information ready according to your service type. If additional pages, scanning, delivery, or on-site support are added, a final balance invoice may be issued.';
  return `<div class="next-panel prep-tips-panel reveal"><h3>Preparation Tips</h3><p>${escapePublic(text)}</p></div>`;
}

function paymentReceivedView({
  request = {},
  invoices = [],
  items = [],
  additionalItems = [],
  quoteAmount = 0,
  reference = '',
  customer = null,
  fileCount = 0,
  detail = null,
  displayStatus = 'payment_received'
} = {}) {
  const quoteNote = request.quote_notes || request.customer_message || '';
  return `
    <div class="success-ref reveal">${escapePublic(reference)}</div>
    ${statusTimeline(displayStatus, request.service_type)}
    <div class="next-panel payment-received-hero reveal"><h3>Payment Received</h3><p>Your payment has been recorded. Aligned Print & Scan will confirm your appointment, session, delivery, or fulfillment details next.</p></div>
    ${clientServiceDetailsPanel({request, customer, reference, fileCount, detail})}
    ${approvedServiceQuotePanel({items, quoteAmount, reference, note: quoteNote, includeDisclaimer:true})}
    ${paymentSchedulePanel({request:{...request,status:displayStatus}, invoices, quoteItems:items, additionalItems, quoteAmount, compact:true})}
    ${nextStepsPanel(displayStatus, request.service_type)}
    <div class="next-panel support-panel reveal"><h3>Need Help?</h3><p>Questions about your request or payment? Contact customer support and include your APS reference number.</p><a class="btn secondary" href="support.html?ref=${encodeURIComponent(reference)}">Contact Customer Support</a></div>
  `;
}

function appointmentConfirmedView({
  request = {},
  invoices = [],
  items = [],
  additionalItems = [],
  quoteAmount = 0,
  reference = '',
  customer = null,
  fileCount = 0,
  detail = null,
  displayStatus = 'appointment_confirmed'
} = {}) {
  return `
    <div class="success-ref reveal">${escapePublic(reference)}</div>
    ${statusTimeline(displayStatus, request.service_type)}
    <div class="next-panel appointment-confirmed-hero reveal"><h3>Appointment Confirmed</h3><p>Your appointment or fulfillment has been confirmed. Please review the details below and prepare for your scheduled service time.</p></div>
    ${appointmentDetailsPanel({...request,status:displayStatus})}
    ${preparationTipsPanel(request)}
    ${clientServiceDetailsPanel({request, customer, reference, fileCount, detail})}
    ${paymentSchedulePanel({request:{...request,status:displayStatus}, invoices, quoteItems:items, additionalItems, quoteAmount, compact:true})}
    <div class="next-panel support-panel reveal"><h3>Need Help?</h3><p>Need to update your appointment details or ask a question? Contact customer support and include your APS reference number.</p><a class="btn secondary" href="support.html?ref=${encodeURIComponent(reference)}">Contact Customer Support</a></div>
  `;
}

function finalPaymentReceivedView({
  request = {},
  invoices = [],
  items = [],
  additionalItems = [],
  quoteAmount = 0,
  reference = '',
  customer = null,
  displayStatus = 'final_payment_received'
} = {}) {
  return `
    <div class="success-ref reveal">${escapePublic(reference)}</div>
    ${statusTimeline(displayStatus, request.service_type)}
    <div class="next-panel final-paid-hero reveal"><h3>Final Payment Received</h3><p>Thank you. Your final payment has been received and your balance is now settled.</p></div>
    ${customerCard(customer || {})}
    ${conciseServiceSummaryPanel(request, reference)}
    ${paymentSchedulePanel({request:{...request,status:displayStatus}, invoices, quoteItems:items, additionalItems, quoteAmount, compact:true})}
    <div class="next-panel support-panel reveal"><h3>Need Help?</h3><p>Questions about this request or receipt? Contact customer support and include your reference number.</p><a class="btn secondary" href="support.html?ref=${encodeURIComponent(reference)}">Contact Customer Support</a></div>
  `;
}

function completedSuccessView({
  request = {},
  invoices = [],
  items = [],
  additionalItems = [],
  quoteAmount = 0,
  reference = '',
  displayStatus = 'completed'
} = {}) {
  const reviewButtons =
    `<div class="cta-row review-buttons"><a class="btn primary" href="${escapePublic(request.review_link_google||'https://www.google.com/search?q=Aligned+Print+%26+Scan+reviews')}" target="_blank" rel="noopener">Leave a Google Review</a><a class="btn secondary" href="${escapePublic(request.review_link_yelp||'support.html')}">Share Feedback</a></div>`;
  return `
    <div class="success-ref reveal">${escapePublic(reference)}</div>
    ${statusTimeline(displayStatus, request.service_type)}
    <div class="next-panel completed-hero reveal"><h3>Service Completed</h3><p>Thank you for choosing Aligned Print & Scan. Your request has been completed and your receipts are available below.</p>${reviewButtons}</div>
    ${paymentSchedulePanel({request:{...request,status:displayStatus}, invoices, quoteItems:items, additionalItems, quoteAmount, compact:true})}
    <div class="next-panel support-panel reveal"><h3>Need Help?</h3><p>Questions about this completed request? Contact customer support and include your reference number.</p><a class="btn secondary" href="support.html?ref=${encodeURIComponent(reference)}">Contact Customer Support</a></div>
  `;
}

function ronNextStepPanel(request = {}, detail = {}) {
  if (workflowKind(request.service_type) !== 'ron') return '';
  const link = request.appointment_link || request.ron_session_url || '';
  if (!link) return '';
  return `<div class="next-panel reveal"><h3>Secure Online Session</h3><p>Your RON session link is available below.</p><a class="btn primary" href="${escapePublic(link)}" target="_blank" rel="noopener">Open Secure Session</a></div>`;
}
async function submitQuoteDecision(requestId, reference, decision) {
  if (!supabaseClient || !requestId) throw new Error('Missing request information.');
  const {
    data,
    error
  } = await supabaseClient.functions.invoke('client-quote-action', {
    body: {
      request_id: requestId,
      reference_number: reference,
      action: decision
    }
  });
  if (error) throw error;
  return data;
}
let embeddedCheckoutInstance = null;
let embeddedCheckoutLoading = false;
async function startEmbeddedPayment(requestId, invoiceId) {
  const box = qs('#embeddedPaymentBox');
  if (!box || !requestId || embeddedCheckoutLoading) return;
  if (embeddedCheckoutInstance) {
    try {
      await embeddedCheckoutInstance.destroy();
    } catch (_) {}
    embeddedCheckoutInstance = null;
  }
  embeddedCheckoutLoading = true;
  box.innerHTML =
    '<div class="email-notice"><h3>Preparing secure payment…</h3><p>Please do not refresh this page while the payment form is loading.</p></div>';
  try {
    const {
      data,
      error
    } = await supabaseClient.functions.invoke('create-embedded-checkout', {
      body: {
        request_id: requestId,
        invoice_id: invoiceId || null
      }
    });
    if (error) throw error;
    const clientSecret = data?.client_secret || data?.clientSecret;
    const publishableKey = data?.publishable_key || data?.publishableKey || data
      ?.stripe_publishable_key;
    if (!clientSecret) throw new Error(data?.error || 'Secure payment is not available yet.');
    if (!window.Stripe) throw new Error('Stripe did not load. Please refresh and try again.');
    const stripe = window.__alignedStripe || (window.__alignedStripe = Stripe(publishableKey ||
      window.STRIPE_PUBLISHABLE_KEY));
    box.innerHTML = '<div id="embeddedCheckoutMount" class="embedded-checkout-mount"></div>';
    embeddedCheckoutInstance = await stripe.initEmbeddedCheckout({
      clientSecret
    });
    await embeddedCheckoutInstance.mount('#embeddedCheckoutMount');
    document.body.dataset.paymentOpen = 'true';
  } catch (err) {
    console.error(err);
    box.innerHTML =
      `<div class="email-notice"><h3>Secure payment is not available yet</h3><p>${escapePublic(err.message || 'Please contact Aligned Print & Scan with your APS reference if this continues.')}</p></div>`;
  } finally {
    embeddedCheckoutLoading = false;
  }
}

function startStatusPolling(requestId, currentStatus) {
  if (!requestId) return;
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts += 1;
    if (document.body.dataset.paymentOpen === 'true') return;
    try {
      const result = await getPublicStatus(requestId, null);
      const next = result?.request?.status;
      if (next && next !== currentStatus) {
        clearInterval(timer);
        location.reload();
      }
    } catch (_) {}
    if (attempts > 20) clearInterval(timer);
  }, 4000);
}

function renderSuccessFallback(params, saved) {
  const requestId = params.get('request_id') || params.get('id') || saved.requestId || '';
  const ref = params.get('ref') || saved.ref || (requestId ? refFromPublicId(requestId) :
    'APS-REQUEST');
  return {
    ok: false,
    request: {
      id: requestId,
      status: 'under_review',
      service_type: saved.serviceType || 'print',
      quote_amount: Number(saved.total || saved.estimatedTotal || 0) || 0,
      estimated_total: Number(saved.total || saved.estimatedTotal || 0) || 0
    },
    items: [],
    invoices: [],
    additional_invoice_items: [],
    service_detail: null,
    file_count: 0,
    reference_number: ref
  };
}

async function initSuccessPage() {
  const successBox = qs('#successDetails');
  if (!successBox) return;
  const params = new URLSearchParams(location.search);
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('aligned_last_request') || '{}');
  } catch (_) {}
  const requestId = params.get('request_id') || params.get('id') || saved.requestId || null;
  const ref = params.get('ref') || saved.ref || null;
  const result = await getPublicStatus(requestId, ref) || renderSuccessFallback(params, saved);
  const request = result.request || {};
  if (!request.id && requestId) request.id = requestId;
  window.__alignedCurrentRequestId = request.id || requestId || null;
  const items = result.items || [];
  const invoices = result.invoices || [];
  const additionalItems = result.additional_invoice_items || [];
  const reference = result.reference_number || ref || refFromPublicId(request.id) ||
  'APS-REQUEST';
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const status = request.status || 'under_review';

  // STRIPE RETURN FALLBACK
  // If Stripe returns to success.html before the webhook finishes, show a polished
  // payment-submitted message immediately while polling the database for the webhook update.
  const displayStatus = (sessionId && ['awaiting_payment', 'payment_pending'].includes(status)) ?
    'payment_submitted' : status;
  const copy = statusCopy(displayStatus);
  const quoteAmount = Number(request.quote_amount || request.estimated_total || 0) || 0;

  const eyebrowEl = qs('#successEyebrow');
  const headlineEl = qs('#successHeadline');
  const leadEl = qs('#successLead');
  if (eyebrowEl) eyebrowEl.textContent = copy.eyebrow;
  if (headlineEl) headlineEl.textContent = copy.headline;
  if (leadEl) leadEl.textContent = copy.lead;

  const serviceName = serviceLabel(request.service_type) || result.label || 'Service Request';
  const completed = displayStatus === 'completed';
  const hasQuote = items.length || quoteAmount || request.invoice_number;
  const statusClass = String(displayStatus || 'under_review').replace(/[^a-z0-9_-]/gi, '-');

  const reviewButtons = completed ?
    `<div class="cta-row review-buttons"><a class="btn primary" href="${escapePublic(request.review_link_google||'https://www.google.com/search?q=Aligned+Print+%26+Scan+reviews')}" target="_blank" rel="noopener">Leave a Google Review</a><a class="btn secondary" href="${escapePublic(request.review_link_yelp||'support.html')}">Share Feedback</a></div>` :
    '';
  const prepVideo = request.prep_video_url ?
    `<div class="next-panel reveal"><h3>Appointment Preparation Video</h3><p>Watch this preparation guide before your session or appointment.</p><div class="video-embed"><iframe src="${escapePublic(request.prep_video_url)}" title="Preparation video" allowfullscreen></iframe></div></div>` :
    '';

  const detail = result.service_detail || null;
  const fileCount = Number(result.file_count || 0);
  const requestedDate = formatDateValue(request.preferred_date);
  const requestedTime = formatTimeWindow(request.preferred_time_window);
  const quoteNote = request.quote_notes || request.customer_message || '';
  const canApprove = ['quote_ready', 'quote_sent', 'awaiting_approval'].includes(status) &&
    hasQuote && request.id;
  const canPay = !sessionId && ['awaiting_payment', 'payment_pending'].includes(status) &&
    quoteAmount > 0 && request.id && status !== 'quote_expired';

  const customer = Array.isArray(request.customers) ? request.customers[0] : (request.customers ||
  {});
  if (['payment_received', 'paid_confirmed', 'scheduling'].includes(displayStatus)) {
    successBox.innerHTML = paymentReceivedView({
      request,
      invoices,
      items,
      additionalItems,
      quoteAmount,
      reference,
      customer,
      fileCount,
      detail,
      displayStatus
    });
    return;
  }
  if (['appointment_confirmed', 'scheduled'].includes(displayStatus)) {
    successBox.innerHTML = appointmentConfirmedView({
      request,
      invoices,
      items,
      additionalItems,
      quoteAmount,
      reference,
      customer,
      fileCount,
      detail,
      displayStatus
    });
    return;
  }
  if (displayStatus === 'final_payment_received') {
    successBox.innerHTML = finalPaymentReceivedView({
      request,
      invoices,
      items,
      additionalItems,
      quoteAmount,
      reference,
      customer,
      displayStatus
    });
    return;
  }
  if (displayStatus === 'completed') {
    successBox.innerHTML = completedSuccessView({
      request,
      invoices,
      items,
      additionalItems,
      quoteAmount,
      reference,
      displayStatus
    });
    return;
  }

  successBox.innerHTML = `
    <div class="success-ref reveal">${escapePublic(reference)}</div>
    ${statusTimeline(displayStatus, request.service_type)}
    <div class="success-grid reveal">
      <div><span class="small-label">Selected Service</span><strong>${escapePublic(serviceName)}</strong></div>
      <div><span class="small-label">${hasQuote?'Service Total':'Estimated Total'}</span><strong>${quoteAmount?money(quoteAmount):'Pending review'}</strong></div>
      <div><span class="small-label">Current Status</span><strong>${escapePublic(copy.title)}</strong></div>
    </div>
    ${customerCard(Array.isArray(request.customers)?request.customers[0]:request.customers||{})}
    ${printControls(reference)}
    <div class="request-public-summary reveal">
      <h3>Request Details</h3>
      <div class="request-public-detail-grid">
        <div><span class="small-label">Requested Date</span><strong>${requestedDate}</strong></div>
        <div><span class="small-label">Requested Time</span><strong>${requestedTime}</strong></div>
        <div><span class="small-label">Uploaded Files</span><strong>${fileCount?`${fileCount} received`:'None listed'}</strong></div>
      </div>
      ${serviceDetailSummary(request.service_type, detail)}
    </div>
    <div class="email-notice status-${statusClass} reveal"><h3>${escapePublic(copy.title)}</h3><p>${escapePublic(copy.body)}</p></div>
    ${hasQuote?`<div class="next-panel invoice-panel reveal"><h3>Prepared Service Quote</h3><p class="premium-intro">This is the full estimated service quote for your request. Payments are handled below based on the approved schedule.</p>${invoiceList(items)}<p class="admin-muted">Quote Reference: <strong>QUOTE-${escapePublic(reference.replace(/^APS-/,'') )}</strong></p>${quoteNote?`<div class="email-notice slim-note"><h3>Client Note</h3><p>${escapePublic(quoteNote)}</p></div>`:''}</div>`:''}
    ${hasQuote?paymentSchedulePanel({request, invoices, quoteItems: items, additionalItems, quoteAmount}):''}
    ${canApprove?`<div class="next-panel reveal"><h3>Review Quote</h3><p>Please review the itemized quote and service details. Approving the quote moves your request to the secure payment step. If anything needs to change, request an edit before paying.</p><div class="cta-row"><button id="approveQuoteBtn" class="btn primary" type="button">Approve Quote</button><a class="btn secondary visible-secondary" href="support.html?ref=${encodeURIComponent(reference)}&reason=quote_change_request">Request Changes</a></div><div id="quoteActionStatus" class="form-submit-status" role="status" aria-live="polite"></div></div>`:''}
    
    ${receiptPanel({...request, status: displayStatus}, reference)}
    ${appointmentDetailsPanel({...request, status: displayStatus})}
    ${ronNextStepPanel(request, detail)}
    ${prepVideo}
    ${completed?`<div class="next-panel reveal"><h3>Receipt & Review</h3><p>Your service has been completed. Please keep this page for your invoice/receipt reference. We appreciate your trust and welcome your feedback.</p>${reviewButtons}</div>`:''}
    ${['final_payment_received','completed'].includes(displayStatus)?'':`<div class="timeline-list reveal"><h3>${hasQuote?'What Happens Next':'General Review Process'}</h3><div><span>01</span><p>${hasQuote?'Review the itemized quote and service details before payment.':'Your request and uploaded documents are received securely.'}</p></div><div><span>02</span><p>${hasQuote?'Approve the quote, request an edit, or proceed to secure payment when payment is available.':'Aligned Print & Scan reviews the details, availability, fulfillment needs, and service requirements.'}</p></div><div><span>03</span><p>${hasQuote?'Once payment is received, appointment or fulfillment confirmation details will be provided.':'You receive the appropriate next step by email, such as a quote, payment link, RON platform instructions, or preparation checklist.'}</p></div></div>`}
    <div class="next-panel support-panel reveal"><h3>Need Help?</h3><p>Questions about this request, invoice, or appointment? Contact customer support and include your reference number.</p><a class="btn secondary" href="support.html?ref=${encodeURIComponent(reference)}">Contact Customer Support</a></div>
  `;
  qs('#approveQuoteBtn')?.addEventListener('click', async () => {
    const statusBox = qs('#quoteActionStatus');
    try {
      if (statusBox) statusBox.textContent = 'Approving your quote…';
      await submitQuoteDecision(request.id, reference, 'approve');
      if (statusBox) statusBox.textContent =
        'Quote approved. Refreshing secure payment options…';
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      console.error(err);
      if (statusBox) statusBox.textContent =
        'We could not approve the quote online. Please contact customer support with your reference number.';
    }
  });
  qs('#startPaymentBtn')?.addEventListener('click', () => startEmbeddedPayment(request.id ||
    requestId));
  qsa('.payAdditionalInvoice').forEach(btn => btn.addEventListener('click', () =>
    startEmbeddedPayment(request.id || requestId, btn.dataset.invoiceId)));
  if (sessionId || ['awaiting_payment', 'payment_pending'].includes(status)) {
    startStatusPolling(request.id, status);
  }
  initReveals(successBox);
  setTimeout(() => successBox.querySelectorAll('.reveal:not(.visible)').forEach(el => el.classList
    .add('visible')), 1400);
}
initSuccessPage();
