const SUPABASE_URL = 'https://sfsdniavqldgbiretply.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco';
const SITE_URL = window.location.origin;
const adminClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => '$' + Number(n || 0).toFixed(2);
const refFromId = (id) => id ? 'APS-' + String(id).slice(0, 8).toUpperCase() : 'APS-REQUEST';
const serviceLabel = (s) => ({ ron: 'Remote Online Notary', mobile: 'Mobile Notary', print: 'Print & Scan' }[s] || 'Service Request');
const statusLabel = (s) => ({
  under_review: 'Under Review',
  quote_ready: 'Quote Ready',
  awaiting_approval: 'Awaiting Approval',
  awaiting_payment: 'Awaiting Payment',
  payment_received: 'Payment Received',
  appointment_confirmed: 'Appointment Confirmed',
  completed: 'Completed',
  archived: 'Archived',
  cancelled: 'Cancelled',
  declined: 'Declined',
  quote_sent: 'Quote Sent',
  payment_pending: 'Payment Pending',
  scheduled: 'Scheduled',
  changes_requested: 'Changes Requested',
  new: 'New',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  waiting_on_customer: 'Waiting on Customer'
}[s] || String(s || 'under_review').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()));

let requests = [];
let supportTickets = [];
let selectedRequest = null;
let realtimeChannel = null;
let supportChannel = null;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function inputVal(id) {
  return document.getElementById(id)?.value || '';
}
function numericVal(id) {
  return Number(inputVal(id) || 0) || 0;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function showToast(message) {
  const toast = $('#newRequestToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5200);
}
function playNewRequestSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch (err) { console.warn('Audio alert unavailable:', err); }
}
async function ensureAdminSession() {
  if (!adminClient) return null;
  const { data } = await adminClient.auth.getSession();
  return data.session;
}
async function handleLogin() {
  const form = $('#adminLoginForm');
  if (!form || !adminClient) return;
  const status = $('#adminLoginStatus');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (status) status.textContent = 'Signing in…';
    const email = form.email.value.trim();
    const password = form.password.value;
    const { error } = await adminClient.auth.signInWithPassword({ email, password });
    if (error) {
      if (status) status.textContent = error.message;
      return;
    }
    window.location.href = 'admin-dashboard.html';
  });
}
function serviceColor(service) {
  if (service === 'ron') return 'tag-ron';
  if (service === 'mobile') return 'tag-mobile';
  if (service === 'print') return 'tag-print';
  return '';
}
function isArchived(r) { return !!r.archived_at; }
function isOpenValueStatus(status) {
  return !['completed', 'cancelled', 'declined', 'archived'].includes(status || 'under_review');
}
function displayValue(r) {
  return Number(r.quote_amount || r.estimated_total || 0);
}
function renderStats() {
  const active = requests.filter(r => !isArchived(r));
  const newCount = active.filter(r => (r.status || 'under_review') === 'under_review').length;
  const openValue = active.filter(r => isOpenValueStatus(r.status)).reduce((sum, r) => sum + displayValue(r), 0);
  setText('statNew', String(newCount));
  setText('statTotal', String(active.length));
  setText('statRevenue', money(openValue));
  setText('statSelected', selectedRequest ? refFromId(selectedRequest.id) : 'None');
}
function filteredRequests() {
  const service = $('#requestFilter')?.value || 'all';
  const status = $('#statusFilter')?.value || 'all';
  const archive = $('#archiveFilter')?.value || 'active';
  return requests.filter(r => {
    const serviceOk = service === 'all' || r.service_type === service;
    const statusOk = status === 'all' || (r.status || 'under_review') === status;
    const archiveOk = archive === 'all' || (archive === 'active' ? !isArchived(r) : isArchived(r));
    return serviceOk && statusOk && archiveOk;
  });
}
function renderRequestList() {
  const list = $('#requestList');
  if (!list) return;
  const items = filteredRequests();
  if (!items.length) {
    list.innerHTML = '<div class="request-empty">No requests match this view.</div>';
    return;
  }
  list.innerHTML = items.map(r => {
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Client';
    const created = r.created_at ? new Date(r.created_at).toLocaleString() : '';
    const selected = selectedRequest?.id === r.id ? 'selected' : '';
    const archivedBadge = isArchived(r) ? '<span class="status-pill archived-pill">Archived</span>' : '';
    return `
      <button class="request-row ${selected}" data-id="${r.id}" type="button">
        <span class="request-ref">${refFromId(r.id)}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${created}</small>
        <span class="service-tag ${serviceColor(r.service_type)}">${serviceLabel(r.service_type)}</span>
        <span class="status-pill">${statusLabel(r.status)}</span>${archivedBadge}
      </button>
    `;
  }).join('');
  $$('.request-row', list).forEach(btn => btn.addEventListener('click', () => selectRequest(btn.dataset.id)));
}
async function getFiles(requestId) {
  const { data, error } = await adminClient
    .from('request_files')
    .select('id,file_name,file_path,file_type,file_size,created_at')
    .eq('service_request_id', requestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
async function signedUrl(filePath) {
  const { data, error } = await adminClient.storage
    .from('service-request-files')
    .createSignedUrl(filePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}
async function getDetailRows(table, requestId) {
  const { data, error } = await adminClient.from(table).select('*').eq('service_request_id', requestId).maybeSingle();
  if (error) return null;
  return data;
}
async function getInvoiceItems(requestId) {
  const { data, error } = await adminClient.from('invoice_items').select('*').eq('service_request_id', requestId).order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}
function detailMap(obj) {
  if (!obj) return '<p class="admin-muted">No detail record found yet.</p>';
  const skip = new Set(['id', 'service_request_id']);
  return `<div class="detail-map">${Object.entries(obj).filter(([k]) => !skip.has(k)).map(([k, v]) => `
    <div><span>${k.replaceAll('_', ' ')}</span><strong>${v === null || v === '' ? '—' : escapeHtml(String(v))}</strong></div>
  `).join('')}</div>`;
}
function defaultInvoiceRows(r) {
  const base = Number(r.quote_amount || r.estimated_total || 0) || 0;
  if (base > 0) return [{ description: serviceLabel(r.service_type), quantity: 1, unit_price: base, line_total: base, item_type: 'service' }];
  return [{ description: serviceLabel(r.service_type), quantity: 1, unit_price: 0, line_total: 0, item_type: 'service' }];
}
function invoiceRowsFromDom() {
  return $$('.invoice-row').map(row => {
    const description = row.querySelector('[data-field="description"]')?.value?.trim() || 'Service fee';
    const quantity = Number(row.querySelector('[data-field="quantity"]')?.value || 1) || 1;
    const unit_price = Number(row.querySelector('[data-field="unit_price"]')?.value || 0) || 0;
    return { item_type: 'service', description, quantity, unit_price, line_total: quantity * unit_price, taxable: false };
  });
}
function renderInvoiceRows(rows) {
  const wrap = $('#invoiceRows');
  if (!wrap) return;
  wrap.innerHTML = rows.map((item, i) => `
    <div class="invoice-row">
      <input data-field="description" value="${escapeHtml(item.description || '')}" placeholder="Service, travel, print prep, RON session…">
      <input data-field="quantity" type="number" min="0" step="0.01" value="${Number(item.quantity || 1)}" aria-label="Quantity">
      <input data-field="unit_price" type="number" min="0" step="0.01" value="${Number(item.unit_price || 0).toFixed(2)}" aria-label="Unit price">
      <button class="btn dark remove-invoice-row" type="button" aria-label="Remove line item">×</button>
    </div>
  `).join('');
  $$('.invoice-row input', wrap).forEach(input => input.addEventListener('input', updateInvoiceTotalPreview));
  $$('.remove-invoice-row', wrap).forEach(btn => btn.addEventListener('click', () => { btn.closest('.invoice-row')?.remove(); updateInvoiceTotalPreview(); }));
  updateInvoiceTotalPreview();
}
function updateInvoiceTotalPreview() {
  const total = invoiceRowsFromDom().reduce((sum, item) => sum + item.line_total, 0);
  setText('invoiceTotalPreview', money(total));
}
async function selectRequest(id) {
  selectedRequest = requests.find(r => r.id === id);
  renderStats();
  renderRequestList();
  if (!selectedRequest) return;
  const detail = $('#requestDetail');
  const ref = refFromId(selectedRequest.id);
  setText('detailRef', ref);
  detail.innerHTML = '<p class="admin-muted">Loading details…</p>';

  const customer = Array.isArray(selectedRequest.customers) ? selectedRequest.customers[0] : selectedRequest.customers;
  const table = selectedRequest.service_type === 'ron' ? 'ron_requests' : selectedRequest.service_type === 'mobile' ? 'mobile_notary_requests' : 'print_scan_requests';
  const [files, serviceDetails, invoiceItems] = await Promise.all([getFiles(id), getDetailRows(table, id), getInvoiceItems(id)]);
  const fileItems = await Promise.all(files.map(async f => {
    const url = await signedUrl(f.file_path);
    return `<li>${url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(f.file_name)}</a>` : escapeHtml(f.file_name)}<small>${f.file_type || 'file'} · ${f.file_size ? Math.round(f.file_size / 1024) + ' KB' : ''}</small></li>`;
  }));
  const rows = invoiceItems.length ? invoiceItems : defaultInvoiceRows(selectedRequest);

  detail.innerHTML = `
    <div class="admin-detail-grid">
      <div><span class="small-label">Client</span><h3>${escapeHtml(customer?.first_name || '')} ${escapeHtml(customer?.last_name || '')}</h3><p>${escapeHtml(customer?.email || '')}<br>${escapeHtml(customer?.phone || '')}</p></div>
      <div><span class="small-label">Service</span><h3>${serviceLabel(selectedRequest.service_type)}</h3><p>${selectedRequest.preferred_date || 'No preferred date'} · ${selectedRequest.preferred_time_window || 'No time selected'}</p></div>
      <div><span class="small-label">Current Value</span><h3>${money(displayValue(selectedRequest))}</h3><p>${statusLabel(selectedRequest.status)}${isArchived(selectedRequest) ? ' · Archived' : ''}</p></div>
    </div>

    <div class="admin-detail-section invoice-builder-card">
      <h3>Invoice / Quote Builder</h3>
      <p class="admin-muted">Use itemized language that separates notarial acts, travel/dispatch, document preparation, scan-backs, print handling, and other support fees.</p>
      <div id="invoiceRows" class="invoice-rows"></div>
      <div class="invoice-total-line"><strong>Invoice Total</strong><span id="invoiceTotalPreview">$0.00</span></div>
      <label>Invoice / client note</label>
      <textarea id="invoiceNote" placeholder="Premium client-facing note, preparation instructions, appointment readiness, or quote terms…">${escapeHtml(selectedRequest.quote_notes || selectedRequest.customer_message || '')}</textarea>
      <div class="status-actions invoice-actions">
        <button id="addInvoiceRow" class="btn dark" type="button">Add Line Item</button>
        <button id="saveInvoiceBtn" class="btn primary" type="button">Save Invoice</button>
        <button id="sendInvoiceBtn" class="btn dark" type="button">Send Quote Email</button>
        <button id="openStatusPageBtn" class="btn dark" type="button">Open Client Status Page</button>
      </div>
      <p class="admin-muted small-admin-note">Embedded Stripe payment is created from the customer status page after the Stripe Edge Function is deployed and your live keys are saved as environment secrets.</p>
    </div>

    <div class="admin-detail-section">
      <h3>Service Details</h3>${detailMap(serviceDetails)}
    </div>

    <div class="admin-detail-section">
      <h3>Uploaded Files</h3>
      ${fileItems.length ? `<ul class="admin-file-list">${fileItems.join('')}</ul>` : '<p class="admin-muted">No files uploaded with this request.</p>'}
    </div>

    <div class="admin-detail-section">
      <h3>Status Update</h3>
      <div class="status-actions">
        <button data-status="under_review" class="btn dark" type="button">Under Review</button>
        <button data-status="quote_ready" class="btn dark" type="button">Quote Ready</button>
        <button data-status="awaiting_approval" class="btn dark" type="button">Awaiting Approval</button>
        <button data-status="awaiting_payment" class="btn dark" type="button">Awaiting Payment</button>
        <button data-status="payment_received" class="btn dark" type="button">Payment Received</button>
        <button data-status="appointment_confirmed" class="btn dark" type="button">Appointment Confirmed</button>
        <button data-status="completed" class="btn dark" type="button">Completed</button>
      </div>
      <textarea id="adminStatusNote" placeholder="Internal note or client-facing update draft…"></textarea>
      <div class="status-actions archive-actions">
        <button id="archiveRequestBtn" class="btn dark" type="button">${isArchived(selectedRequest) ? 'Restore Request' : 'Archive Request'}</button>
      </div>
      <p class="admin-muted small-admin-note">Archiving hides the request from the active dashboard. It does not delete client files, invoice items, or history.</p>
    </div>
  `;
  renderInvoiceRows(rows);
  $$('.status-actions button[data-status]', detail).forEach(btn => btn.addEventListener('click', () => updateRequestStatus(btn.dataset.status)));
  $('#addInvoiceRow')?.addEventListener('click', () => { const current = invoiceRowsFromDom(); current.push({ description: '', quantity: 1, unit_price: 0, line_total: 0 }); renderInvoiceRows(current); });
  $('#saveInvoiceBtn')?.addEventListener('click', saveInvoice);
  $('#sendInvoiceBtn')?.addEventListener('click', sendInvoiceEmail);
  $('#openStatusPageBtn')?.addEventListener('click', () => window.open(`success.html?request_id=${selectedRequest.id}&ref=${encodeURIComponent(ref)}`, '_blank'));
  $('#archiveRequestBtn')?.addEventListener('click', toggleArchiveRequest);
}
async function updateRequestStatus(status) {
  if (!selectedRequest) return;
  const note = $('#adminStatusNote')?.value || '';
  const update = { status };
  if (status === 'payment_received') update.paid_at = new Date().toISOString();
  if (status === 'appointment_confirmed') update.appointment_confirmed_at = new Date().toISOString();
  const { error } = await adminClient.from('service_requests').update(update).eq('id', selectedRequest.id);
  if (error) { alert(error.message); return; }
  await adminClient.from('request_status_updates').insert({
    service_request_id: selectedRequest.id,
    status,
    message: note || `Status changed to ${statusLabel(status)} from admin dashboard.`,
    sent_email: false,
    sent_sms: false
  });
  Object.assign(selectedRequest, update);
  renderRequestList(); renderStats();
  showToast(`Status updated: ${statusLabel(status)}`);
}
async function saveInvoice() {
  if (!selectedRequest) return;
  const items = invoiceRowsFromDom();
  const total = items.reduce((sum, item) => sum + item.line_total, 0);
  const invoiceNumber = selectedRequest.invoice_number || refFromId(selectedRequest.id).replace('APS-', 'INV-');
  const note = $('#invoiceNote')?.value || '';
  const update = {
    quote_amount: total,
    quote_notes: note,
    customer_message: note,
    invoice_number: invoiceNumber,
    invoice_status: 'draft',
    payment_status: selectedRequest.payment_status || 'unpaid',
    status: 'quote_ready'
  };
  const { error: updateError } = await adminClient.from('service_requests').update(update).eq('id', selectedRequest.id);
  if (updateError) { alert(updateError.message); return; }
  await adminClient.from('invoice_items').delete().eq('service_request_id', selectedRequest.id);
  const rows = items.map(item => ({ ...item, service_request_id: selectedRequest.id }));
  if (rows.length) {
    const { error: itemError } = await adminClient.from('invoice_items').insert(rows);
    if (itemError) { alert(itemError.message); return; }
  }
  Object.assign(selectedRequest, update);
  await adminClient.from('request_status_updates').insert({ service_request_id: selectedRequest.id, status: 'quote_ready', message: 'Invoice/quote prepared for client review.', sent_email: false, sent_sms: false });
  renderStats(); renderRequestList();
  showToast('Invoice saved. Status set to Quote Ready.');
}
async function sendInvoiceEmail() {
  if (!selectedRequest) return;
  await saveInvoice();
  const ref = refFromId(selectedRequest.id);
  const status = $('#invoiceNote');
  try {
    const { data, error } = await adminClient.functions.invoke('send-invoice-email', { body: { request_id: selectedRequest.id, reference_number: ref } });
    if (error) throw error;
    await updateRequestStatus('awaiting_approval');
    showToast('Quote email requested through Resend.');
  } catch (err) {
    console.error(err);
    alert('Invoice saved, but the email function did not complete yet. Deploy send-invoice-email and set RESEND_API_KEY.');
  }
}
async function toggleArchiveRequest() {
  if (!selectedRequest) return;
  const archived = isArchived(selectedRequest);
  const update = { archived_at: archived ? null : new Date().toISOString() };
  const { error } = await adminClient.from('service_requests').update(update).eq('id', selectedRequest.id);
  if (error) { alert(error.message); return; }
  Object.assign(selectedRequest, update);
  await adminClient.from('request_status_updates').insert({ service_request_id: selectedRequest.id, status: archived ? (selectedRequest.status || 'under_review') : 'archived', message: archived ? 'Request restored to active dashboard.' : 'Request archived from active dashboard. Files retained.', sent_email: false, sent_sms: false });
  renderStats(); renderRequestList(); await selectRequest(selectedRequest.id);
  showToast(archived ? 'Request restored.' : 'Request archived. Files were not deleted.');
}
async function loadRequests() {
  setText('adminLiveStatus', 'Loading requests…');
  const { data, error } = await adminClient
    .from('service_requests')
    .select('id,created_at,service_type,status,preferred_date,preferred_time_window,notes,estimated_total,archived_at,quote_amount,quote_notes,invoice_number,invoice_url,receipt_url,payment_status,paid_at,appointment_confirmed_at,customer_message,review_link_google,review_link_yelp,prep_video_url,invoice_status,customers(first_name,last_name,email,phone,preferred_contact)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) {
    setText('adminLiveStatus', `Could not load requests: ${error.message}`);
    $('#requestList').innerHTML = `<div class="request-empty">${escapeHtml(error.message)}</div>`;
    return;
  }
  requests = data || [];
  if (selectedRequest) selectedRequest = requests.find(r => r.id === selectedRequest.id) || selectedRequest;
  renderStats(); renderRequestList(); setText('adminLiveStatus', 'Live and listening for new requests.');
}
function renderSupportTickets() {
  const list = $('#supportTicketList');
  if (!list) return;
  if (!supportTickets.length) { list.innerHTML = '<div class="request-empty">No support tickets yet.</div>'; return; }
  list.innerHTML = supportTickets.map(t => {
    const ref = t.reference_number || 'GENERAL SUPPORT';
    const linked = ref !== 'GENERAL SUPPORT' ? requests.find(r => refFromId(r.id) === ref || refFromId(r.id).toLowerCase() === String(ref).toLowerCase()) : null;
    return `
    <div class="support-ticket-card ${t.urgency && t.urgency !== 'standard' ? 'urgent-ticket' : ''}">
      <div class="support-ticket-head"><span class="request-ref">${escapeHtml(ref)}</span><span class="status-pill">${statusLabel(t.status || 'new')}</span></div>
      <h3>${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)}</h3>
      <p><strong>${escapeHtml(t.email)}</strong>${t.phone ? ' · ' + escapeHtml(t.phone) : ''}${t.preferred_contact_method ? ' · Prefers ' + escapeHtml(t.preferred_contact_method) : ''}${t.company ? '<br>' + escapeHtml(t.company) : ''}</p>
      <div class="support-ticket-meta">
        <span>${escapeHtml((t.issue_type || t.reason || 'support').replaceAll('_',' '))}</span>
        <span>${escapeHtml((t.urgency || 'standard').replaceAll('_',' '))}</span>
        ${linked ? `<span>${serviceLabel(linked.service_type)} · ${statusLabel(linked.status)}</span>` : ''}
      </div>
      ${linked ? `<div class="linked-request-mini"><strong>Linked Request</strong><p>${refFromId(linked.id)} · ${money(displayValue(linked))} · ${linked.preferred_date || 'No date'} ${linked.preferred_time_window || ''}</p><button class="btn secondary open-linked-request" data-id="${linked.id}" type="button">Open Request</button></div>` : ''}
      <p>${escapeHtml(t.message)}</p>
      <label>Internal notes<textarea class="support-internal-note" data-id="${t.id}" placeholder="Private follow-up notes…">${escapeHtml(t.internal_notes || '')}</textarea></label>
      <div class="status-actions">
        <button class="btn dark support-status" data-id="${t.id}" data-status="in_progress" type="button">In Progress</button>
        <button class="btn dark support-status" data-id="${t.id}" data-status="waiting_on_customer" type="button">Waiting on Customer</button>
        <button class="btn dark support-status" data-id="${t.id}" data-status="resolved" type="button">Resolved</button>
        <button class="btn secondary support-save-note" data-id="${t.id}" type="button">Save Note</button>
        <button class="btn dark support-archive" data-id="${t.id}" type="button">Archive</button>
      </div>
      <small>${t.created_at ? new Date(t.created_at).toLocaleString() : ''}</small>
    </div>`;
  }).join('');
  $$('.support-status', list).forEach(btn => btn.addEventListener('click', () => updateSupportTicket(btn.dataset.id, { status: btn.dataset.status })));
  $$('.support-save-note', list).forEach(btn => btn.addEventListener('click', () => updateSupportTicket(btn.dataset.id, { internal_notes: $(`.support-internal-note[data-id="${btn.dataset.id}"]`)?.value || '' })));
  $$('.support-archive', list).forEach(btn => btn.addEventListener('click', () => updateSupportTicket(btn.dataset.id, { archived_at: new Date().toISOString() })));
  $$('.open-linked-request', list).forEach(btn => btn.addEventListener('click', () => selectRequest(btn.dataset.id)));
}
async function updateSupportTicket(id, update) {
  const { error } = await adminClient.from('support_tickets').update(update).eq('id', id);
  if (error) { alert(error.message); return; }
  await loadSupportTickets(); showToast('Support ticket updated.');
}
async function loadSupportTickets() {
  const list = $('#supportTicketList');
  if (!list) return;
  const { data, error } = await adminClient.from('support_tickets').select('*').is('archived_at', null).order('created_at', { ascending: false }).limit(100);
  if (error) { list.innerHTML = `<div class="request-empty">${escapeHtml(error.message)}</div>`; return; }
  supportTickets = data || []; renderSupportTickets();
}
function subscribeRealtime() {
  if (realtimeChannel) adminClient.removeChannel(realtimeChannel);
  realtimeChannel = adminClient.channel('aligned-admin-requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, async () => { await loadRequests(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_requests' }, async () => { playNewRequestSound(); showToast('New request received. Dashboard refreshed.'); })
    .subscribe((status) => { if (status === 'SUBSCRIBED') setText('adminLiveStatus', 'Live and listening for new requests.'); });
  if (supportChannel) adminClient.removeChannel(supportChannel);
  supportChannel = adminClient.channel('aligned-support-tickets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, async () => { await loadSupportTickets(); })
    .subscribe();
}
async function initDashboard() {
  if (!$('#requestList')) return;
  if (!adminClient) return;
  const session = await ensureAdminSession();
  if (!session) { window.location.href = 'admin-login.html'; return; }
  setText('adminLiveStatus', `Signed in as ${session.user.email}`);
  $('#signOutBtn')?.addEventListener('click', async () => { await adminClient.auth.signOut(); window.location.href = 'admin-login.html'; });
  $('#refreshRequests')?.addEventListener('click', loadRequests);
  $('#refreshSupport')?.addEventListener('click', loadSupportTickets);
  $('#requestFilter')?.addEventListener('change', renderRequestList);
  $('#statusFilter')?.addEventListener('change', renderRequestList);
  $('#archiveFilter')?.addEventListener('change', renderRequestList);
  await loadRequests(); await loadSupportTickets(); subscribeRealtime();
}
handleLogin();
initDashboard();
