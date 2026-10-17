import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverSecureCustomerCommunication } from '../supabase/functions/_shared/secure-customer-delivery.mjs';
import { authorizePortal } from '../supabase/functions/_shared/portal-access.ts';

const requestId = '10000000-0000-4000-8000-000000000001';
const secondId = '20000000-0000-4000-8000-000000000002';
const siteUrl = 'https://alignedprintscan.com';
const portalUrl = `${siteUrl}/success.html?request_id=${requestId}&tab=quote-payment`;

test('automatic customer email has a scoped portal token; retry reuses recorded content and avoids duplicate delivery', async () => {
  const originalFetch = globalThis.fetch;
  const rows = new Map(), tokenRows = [], sends = [];
  let failOnce = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname.endsWith('/customer_portal_access_tokens') && init.method === 'POST') {
      tokenRows.push(body);
      return new Response('{}', { status: 201 });
    }
    if (url.pathname.endsWith('/customer_portal_access_tokens')) {
      const id = url.searchParams.get('service_request_id')?.replace(/^eq\./, '');
      const hash = url.searchParams.get('token_hash')?.replace(/^eq\./, '');
      return Response.json(tokenRows.filter(row => row.service_request_id === id && row.token_hash === hash));
    }
    if (url.pathname.endsWith('/messages') && init.method === 'POST') {
      const row = { ...body, id: 'message-1' };
      rows.set(body.idempotency_key, row);
      return Response.json([row], { status: 201 });
    }
    if (url.pathname.endsWith('/messages') && init.method === 'PATCH') {
      const row = rows.get('request:1:quote_ready');
      Object.assign(row, body);
      return Response.json([row]);
    }
    if (url.pathname.endsWith('/messages')) return Response.json(rows.has('request:1:quote_ready') ? [rows.get('request:1:quote_ready')] : []);
    if (url.pathname.endsWith('/request_timeline_events') && init.method === 'POST') return Response.json([body], { status: 201 });
    if (url.pathname.endsWith('/request_timeline_events')) return Response.json([]);
    throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
  };
  const options = { supabaseUrl: 'https://example.invalid', serviceRoleKey: 'fixture-key', requestId, recipient: 'approved@example.invalid', subject: 'Quote ready', renderedHtml: `<a href="${portalUrl.replaceAll('&', '&amp;')}">Review</a>`, renderedText: `Review: ${portalUrl}`, sourceType: 'automatic', sourceEvent: 'quote_ready', idempotencyKey: 'request:1:quote_ready' };
  const sendProvider = async (html, subject) => {
    sends.push({ html, subject });
    if (failOnce) { failOnce = false; throw new Error('Simulated provider timeout'); }
    return { id: 'provider-message-1' };
  };
  try {
    await assert.rejects(deliverSecureCustomerCommunication(options, { siteUrl, portalUrl, sendProvider }), /Simulated provider timeout/);
    assert.equal(tokenRows.length, 1);
    assert.equal(sends.length, 1);
    assert.match(sends[0].html, /#access_token=[0-9a-f]{64}/);
    const token = sends[0].html.match(/#access_token=([0-9a-f]{64})/)[1];
    assert.equal(await authorizePortal(new Request('https://example.invalid'), requestId, token, 'https://example.invalid', 'fixture-key'), true);
    assert.equal(await authorizePortal(new Request('https://example.invalid'), secondId, token, 'https://example.invalid', 'fixture-key'), false);
    const retry = await deliverSecureCustomerCommunication(options, { siteUrl, portalUrl, sendProvider });
    assert.equal(retry.duplicate, false);
    assert.equal(sends.length, 2);
    assert.equal(sends[0].html, sends[1].html);
    const duplicate = await deliverSecureCustomerCommunication(options, { siteUrl, portalUrl, sendProvider });
    assert.equal(duplicate.duplicate, true);
    assert.equal(sends.length, 2);
    assert.equal(rows.get(options.idempotencyKey).delivery_state, 'sent');
  } finally { globalThis.fetch = originalFetch; }
});
