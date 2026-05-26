const SUPABASE_URL = 'https://sfsdniavqldgbiretply.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco';
const adminClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => '$' + Number(n || 0).toFixed(2);
const refFromId = (id) => id ? 'APS-' + String(id).slice(0, 8).toUpperCase() : 'APS-REQUEST';
const serviceLabel = (s) => ({ ron: 'Remote Online Notary', mobile: 'Mobile Notary', print: 'Print & Scan' }[s] || 'Service Request');
const statusLabel = (s) => String(s || 'under_review').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

let requests = [];
let selectedRequest = null;
let realtimeChannel = null;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
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
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.warn('Audio alert unavailable:', err);
  }
}

function showToast(message) {
  const toast = $('#newRequestToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5200);
}

async function ensureAdminSession() {
  if (!adminClient) return null;
  const { data } = await adminClient.auth.getSession();
  return data.session;
}

async function handleLogin() {
  const form = $('#adminLoginForm');
  if (!form) return;
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

function renderStats() {
  const newCount = requests.filter(r => (r.status || 'under_review') === 'under_review').length;
  const revenue = requests.reduce((sum, r) => sum + Number(r.estimated_total || 0), 0);
  setText('statNew', String(newCount));
  setText('statTotal', String(requests.length));
  setText('statRevenue', money(revenue));
  setText('statSelected', selectedRequest ? refFromId(selectedRequest.id) : 'None');
}

function filteredRequests() {
  const service = $('#requestFilter')?.value || 'all';
  const status = $('#statusFilter')?.value || 'all';
  return requests.filter(r => {
    const serviceOk = service === 'all' || r.service_type === service;
    const statusOk = status === 'all' || (r.status || 'under_review') === status;
    return serviceOk && statusOk;
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
    return `
      <button class="request-row ${selected}" data-id="${r.id}" type="button">
        <span class="request-ref">${refFromId(r.id)}</span>
        <strong>${name}</strong>
        <small>${created}</small>
        <span class="service-tag ${serviceColor(r.service_type)}">${serviceLabel(r.service_type)}</span>
        <span class="status-pill">${statusLabel(r.status)}</span>
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

function detailMap(obj) {
  if (!obj) return '<p class="admin-muted">No detail record found yet.</p>';
  const skip = new Set(['id', 'service_request_id']);
  return `<div class="detail-map">${Object.entries(obj).filter(([k]) => !skip.has(k)).map(([k, v]) => `
    <div><span>${k.replaceAll('_', ' ')}</span><strong>${v === null || v === '' ? '—' : String(v)}</strong></div>
  `).join('')}</div>`;
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
  const [files, serviceDetails] = await Promise.all([getFiles(id), getDetailRows(table, id)]);
  const fileItems = await Promise.all(files.map(async f => {
    const url = await signedUrl(f.file_path);
    return `<li>${url ? `<a href="${url}" target="_blank" rel="noopener">${f.file_name}</a>` : f.file_name}<small>${f.file_type || 'file'} · ${f.file_size ? Math.round(f.file_size / 1024) + ' KB' : ''}</small></li>`;
  }));

  detail.innerHTML = `
    <div class="admin-detail-grid">
      <div>
        <span class="small-label">Client</span>
        <h3>${customer?.first_name || ''} ${customer?.last_name || ''}</h3>
        <p>${customer?.email || ''}<br>${customer?.phone || ''}</p>
      </div>
      <div>
        <span class="small-label">Service</span>
        <h3>${serviceLabel(selectedRequest.service_type)}</h3>
        <p>${selectedRequest.preferred_date || 'No preferred date'} · ${selectedRequest.preferred_time_window || 'No time selected'}</p>
      </div>
      <div>
        <span class="small-label">Estimate</span>
        <h3>${money(selectedRequest.estimated_total || 0)}</h3>
        <p>${statusLabel(selectedRequest.status)}</p>
      </div>
    </div>

    <div class="admin-detail-section">
      <h3>Service Details</h3>
      ${detailMap(serviceDetails)}
    </div>

    <div class="admin-detail-section">
      <h3>Uploaded Files</h3>
      ${fileItems.length ? `<ul class="admin-file-list">${fileItems.join('')}</ul>` : '<p class="admin-muted">No files uploaded with this request.</p>'}
    </div>

    <div class="admin-detail-section">
      <h3>Status Update</h3>
      <div class="status-actions">
        <button data-status="under_review" class="btn dark" type="button">Under Review</button>
        <button data-status="quote_sent" class="btn dark" type="button">Quote Sent</button>
        <button data-status="payment_pending" class="btn dark" type="button">Payment Pending</button>
        <button data-status="scheduled" class="btn dark" type="button">Scheduled</button>
        <button data-status="completed" class="btn dark" type="button">Completed</button>
      </div>
      <textarea id="adminStatusNote" placeholder="Internal note or client-facing update draft…"></textarea>
    </div>
  `;
  $$('.status-actions button', detail).forEach(btn => btn.addEventListener('click', () => updateRequestStatus(btn.dataset.status)));
}

async function updateRequestStatus(status) {
  if (!selectedRequest) return;
  const note = $('#adminStatusNote')?.value || '';
  const { error } = await adminClient.from('service_requests').update({ status }).eq('id', selectedRequest.id);
  if (error) {
    alert(error.message);
    return;
  }
  await adminClient.from('request_status_updates').insert({
    service_request_id: selectedRequest.id,
    status,
    message: note || `Status changed to ${statusLabel(status)} from admin dashboard.`,
    sent_email: false,
    sent_sms: false
  });
  selectedRequest.status = status;
  renderRequestList();
  renderStats();
  showToast(`Status updated: ${statusLabel(status)}`);
}

async function loadRequests() {
  setText('adminLiveStatus', 'Loading requests…');
  const { data, error } = await adminClient
    .from('service_requests')
    .select('id,created_at,service_type,status,preferred_date,preferred_time_window,notes,estimated_total,customers(first_name,last_name,email,phone,preferred_contact)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    setText('adminLiveStatus', `Could not load requests: ${error.message}`);
    $('#requestList').innerHTML = `<div class="request-empty">${error.message}</div>`;
    return;
  }
  requests = data || [];
  renderStats();
  renderRequestList();
  setText('adminLiveStatus', 'Live and listening for new requests.');
}

function subscribeRealtime() {
  if (realtimeChannel) adminClient.removeChannel(realtimeChannel);
  realtimeChannel = adminClient
    .channel('aligned-admin-requests')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_requests' }, async () => {
      await loadRequests();
      playNewRequestSound();
      showToast('New request received. Dashboard refreshed.');
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') setText('adminLiveStatus', 'Live and listening for new requests.');
    });
}

async function calculateRouteEstimate() {
  const start = document.getElementById('routeStart')?.value?.trim();
  const end = document.getElementById('routeEnd')?.value?.trim();
  const status = document.getElementById('routeStatus');

  if (!start || !end) {
    if (status) status.textContent = 'Enter both a starting address and destination address first.';
    return;
  }

  if (status) status.textContent = 'Calculating route…';

  try {
   const { data: sessionData, error: sessionError } = await adminClient.auth.getSession();

  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('Admin session expired. Please log in again.');
  }

  const accessToken = sessionData.session.access_token;

  const routeResponse = await fetch(`${SUPABASE_URL}/functions/v1/route-distance`, {
  method: 'POST',
headers: {
  Authorization: `Bearer ${accessToken}`,
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json'
},
  body: JSON.stringify({ start, end })
});

const data = await routeResponse.json();

if (!routeResponse.ok) {
  throw new Error(data?.error || data?.message || 'Route could not be calculated.');
}

if (!data?.ok) {
  throw new Error(data?.error || 'Route could not be calculated.');
}

    document.getElementById('costMiles').value = Number(data.roundtrip_miles || 0).toFixed(1);
    document.getElementById('timeTravel').value = (Number(data.roundtrip_minutes || 0) / 60).toFixed(2);

    if (status) {
      status.textContent = `Route estimate applied: ${Number(data.roundtrip_miles || 0).toFixed(1)} round-trip miles.`;
    }

    calculateProfit();
  } catch (err) {
    console.error(err);
    if (status) status.textContent = 'Route estimate unavailable. Enter miles/time manually.';
  }
}

function calculateProfit() {
  const val = (id) => Number(document.getElementById(id)?.value || 0) || 0;
  const revenue = val('revTotal') + val('revPrint') + val('revAddons');
  const mileageCost = val('costMiles') * val('costPerMile');
  const processing = revenue * (val('costPercent') / 100) + val('costFixed');
  const directCosts = mileageCost + val('costTolls') + val('costSupplies') + val('costPlatform') + processing;
  const time = val('timeTravel') + val('timeService') + val('timeAdmin');
  const net = revenue - directCosts;
  const hourly = time > 0 ? net / time : 0;
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;
  const targetMinimum = directCosts + (time * val('targetHourly'));
  setText('profitNet', money(net));
  setText('profitHourly', money(hourly) + '/hr');
  setText('profitMargin', margin.toFixed(1) + '%');
  setText('profitMinimum', money(targetMinimum));
  const decision = $('#profitDecision');
  if (decision) {
    decision.className = 'profit-decision';
    if (net <= 0 || hourly < val('targetHourly') * 0.65) {
      decision.textContent = 'Review or decline: this job may not meet your profit goal.';
      decision.classList.add('bad');
    } else if (hourly < val('targetHourly')) {
      decision.textContent = 'Adjust quote: close, but below your target hourly goal.';
      decision.classList.add('warn');
    } else {
      decision.textContent = 'Acceptable: this estimate meets or exceeds your target.';
      decision.classList.add('good');
    }
  }
}

async function initDashboard() {
  if (!$('#requestList')) return;
  if (!adminClient) return;
  const session = await ensureAdminSession();
  if (!session) {
    window.location.href = 'admin-login.html';
    return;
  }
  setText('adminLiveStatus', `Signed in as ${session.user.email}`);
  $('#signOutBtn')?.addEventListener('click', async () => {
    await adminClient.auth.signOut();
    window.location.href = 'admin-login.html';
  });
  $('#refreshRequests')?.addEventListener('click', loadRequests);
      document.getElementById('calculateRouteBtn')?.addEventListener('click', calculateRouteEstimate);
  $('#requestFilter')?.addEventListener('change', renderRequestList);
  $('#statusFilter')?.addEventListener('change', renderRequestList);
  $$('#profitability input').forEach(input => input.addEventListener('input', calculateProfit));
  calculateProfit();
  await loadRequests();
  subscribeRealtime();
}

handleLogin();
initDashboard();
