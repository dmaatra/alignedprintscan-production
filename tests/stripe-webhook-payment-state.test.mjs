import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHmac, webcrypto } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8'), { mode: 'transform' });
const secret = 'whsec_fixture';
const event = (payment_status, amount_total = 700) => ({
  id: 'evt_fixture', type: 'checkout.session.completed',
  data: { object: { id: 'cs_fixture', payment_status, amount_total, currency: 'usd', metadata: { request_id: 'request', invoice_id: 'invoice' }, livemode: true } },
});
function signedRequest(value, valid = true) {
  const body = JSON.stringify(value);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', valid ? 'wrong' : secret).update(`${timestamp}.${body}`).digest('hex');
  return new Request('https://fixture.invalid', { method: 'POST', headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` }, body });
}
function handlerWith(fetch) {
  let handler;
  vm.runInNewContext(source, { Deno: { env: { get: key => key === 'STRIPE_WEBHOOK_SECRET' ? secret : key === 'SUPABASE_URL' ? 'https://fixture.invalid' : 'fixture' }, serve: fn => { handler = fn; } }, crypto: webcrypto, fetch, Request, Response, TextEncoder, URLSearchParams, Date, console });
  return handler;
}

test('webhook rejects a bad signature before any database or provider call', async () => {
  let calls = 0;
  const handler = handlerWith(async () => { calls++; throw Error('Unexpected call'); });
  const response = await handler(signedRequest(event('paid'), true));
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test('signed but unpaid checkout completion never creates a payment or receipt', async () => {
  let calls = 0;
  const handler = handlerWith(async () => { calls++; throw Error('Unexpected call'); });
  const response = await handler(signedRequest(event('unpaid'), false));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).payment_pending, true);
  assert.equal(calls, 0);
});

test('signed paid checkout with a mismatched balance cannot insert a payment', async () => {
  const methods = [];
  const handler = handlerWith(async (url, options = {}) => {
    methods.push(options.method || 'GET');
    if (url.includes('/invoices?')) return Response.json([{ id: 'invoice', service_request_id: 'request', amount_due: 8, amount_paid: 0, invoice_number: 'INV-FIXTURE-01' }]);
    if (url.includes('/request_payments?')) return Response.json([]);
    throw Error('Unexpected outbound request');
  });
  const response = await handler(signedRequest(event('paid'), false));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /does not match the invoice balance/);
  assert.deepEqual(methods, ['GET', 'GET']);
});

test('a retry with an existing payment repairs invoice state without another payment insert', async () => {
  let paymentInserts = 0, invoicePatches = 0;
  const handler = handlerWith(async (url, options = {}) => {
    const method = options.method || 'GET';
    if (url.includes('/functions/v1/send-order-email')) return Response.json({ ok: true });
    if (url.includes('/invoices?') && method === 'PATCH') { invoicePatches++; return Response.json([]); }
    if (url.includes('/invoices?')) return Response.json([{ id: 'invoice', service_request_id: 'request', amount_due: 7, amount_paid: 0, invoice_number: 'INV-FIXTURE-01' }]);
    if (url.includes('/request_payments?') && url.includes('external_reference')) return Response.json([{ id: 'payment', invoice_id: 'invoice', amount: 7 }]);
    if (url.includes('/request_payments?')) return Response.json([{ amount: 7 }]);
    if (url.endsWith('/request_payments') && method === 'POST') { paymentInserts++; return Response.json([]); }
    if (url.includes('/service_requests?') || url.endsWith('/request_status_updates')) return Response.json([]);
    throw Error(`Unexpected outbound request: ${url}`);
  });
  const response = await handler(signedRequest(event('paid'), false));
  assert.equal(response.status, 200);
  assert.equal(paymentInserts, 0);
  assert.equal(invoicePatches, 1);
});
