import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePortal, issuePortalToken } from '../supabase/functions/_shared/portal-access.ts';
const owner='owner@example.invalid', id='10000000-0000-4000-8000-000000000001';
test('portal rejects identifiers, forged claims, unverified and wrong owners; accepts scoped token and verified owner',async()=>{
 const prior=globalThis.fetch;
 try {
  assert.equal(await authorizePortal(new Request('https://example.invalid'),id,'','https://example.invalid','key'),false);
  let verified=true, email=owner, scoped=true;
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.includes('/auth/v1/user')?{id:'user',email,email_confirmed_at:verified?'2026-01-01':null}:url.includes('access_tokens')?(scoped?[{service_request_id:id}]:[]):[{customers:{email:owner}}]),{status:200});
  const req=new Request('https://example.invalid',{headers:{authorization:'Bearer verified-by-auth-service'}});
  assert.equal(await authorizePortal(req,id,'','https://example.invalid','key'),true);
  email='other@example.invalid';assert.equal(await authorizePortal(req,id,'','https://example.invalid','key'),false);
  email=owner;verified=false;assert.equal(await authorizePortal(req,id,'','https://example.invalid','key'),false);
  const anon=new Request('https://example.invalid');
  assert.equal(await authorizePortal(anon,id,'a'.repeat(64),'https://example.invalid','key'),true);
  scoped=false;assert.equal(await authorizePortal(anon,id,'a'.repeat(64),'https://example.invalid','key'),false);
  globalThis.fetch=async()=>new Response('{}',{status:401});assert.equal(await authorizePortal(req,id,'','https://example.invalid','key'),false);
 } finally {globalThis.fetch=prior;}
});
test('token issuance stores only hash with expiry and fails closed',async()=>{
 const prior=globalThis.fetch;let stored;
 try { globalThis.fetch=async(url,init)=>{stored=JSON.parse(init.body);return new Response('{}',{status:201});};
 const token=await issuePortalToken(id,'https://example.invalid','key');assert.match(token,/^[0-9a-f]{64}$/);assert.notEqual(stored.token_hash,token);assert.equal(stored.service_request_id,id);assert.ok(Date.parse(stored.expires_at)>Date.now());
 globalThis.fetch=async()=>new Response('{}',{status:500});await assert.rejects(issuePortalToken(id,'https://example.invalid','key'));
 } finally {globalThis.fetch=prior;}
});
