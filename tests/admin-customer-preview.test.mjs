import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {authorizeAdminPreview, authorizePortal} from '../supabase/functions/_shared/portal-access.ts';

test('preview requires Auth-verified identity and explicit is_admin authorization', async()=>{
 const prior=globalThis.fetch;
 try {
  let calls=0, valid=true, admin=true;
  globalThis.fetch=async(url)=>{calls++; return new Response(JSON.stringify(url.includes('/auth/')?{id:'verified-admin'}:admin),{status:valid?200:401});};
  assert.equal(await authorizeAdminPreview(new Request('https://example.invalid'),'https://example.invalid','key'),false);
  assert.equal(calls,0);
  const req=new Request('https://example.invalid',{headers:{authorization:'Bearer session'}});
  assert.equal(await authorizeAdminPreview(req,'https://example.invalid','key'),true);
  admin=false; assert.equal(await authorizeAdminPreview(req,'https://example.invalid','key'),false);
  valid=false; assert.equal(await authorizeAdminPreview(req,'https://example.invalid','key'),false);
  // Administrator privilege does not become a customer-action capability.
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.includes('/auth/')?{id:'admin',email:'admin@example.invalid',email_confirmed_at:'2026-01-01'}:[{customers:{email:'customer@example.invalid'}}]));
  assert.equal(await authorizePortal(req,'10000000-0000-4000-8000-000000000001','','https://example.invalid','key'),false);
 } finally {globalThis.fetch=prior;}
});

test('preview uses existing customer projection and retains mode across customer tabs',async()=>{
 const endpoint=await readFile(new URL('../supabase/functions/get-request-status/index.ts',import.meta.url),'utf8');
 assert.match(endpoint,/body.admin_preview === true/);
 assert.match(endpoint,/visibility=eq.customer/);
 assert.match(endpoint,/file.customer_visible === true/);
 const script=await readFile(new URL('../assets/js/script.js',import.meta.url),'utf8');
 assert.match(script,/payload.admin_preview = .*preview.*admin/);
 assert.match(script,/tab=\$\{tab\}\$\{previewQuery\}/);
});
