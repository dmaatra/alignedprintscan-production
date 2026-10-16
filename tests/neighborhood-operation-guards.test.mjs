import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const requestId = '22222222-2222-4222-8222-222222222222';
for (const [entry, commands, message] of [
  ['admin-service-adjustment', ['preview_service_conversion', 'convert_service'], /financial history requires/],
  ['admin-route-distance', ['apply_to_quote', 'apply_manual'], /neighborhood pricing review/],
]) {
  for (const command of commands) test(`${command} refuses unsafe neighborhood mutations before writing`, async () => {
    let handler;
    const calls = [];
    const fetch = async (url, options = {}) => {
      calls.push({url, method: options.method || 'GET'});
      if (url.endsWith('/auth/v1/user')) return Response.json({id: 'admin'});
      if (url.endsWith('/rpc/is_admin')) return Response.json(true);
      if (url.endsWith('/rpc/aps_convert_neighborhood_service')) {
        assert.equal(options.headers.Authorization, 'Bearer synthetic-admin');
        assert.equal(JSON.parse(options.body).p_preview, command === 'preview_service_conversion');
        return Response.json({message: 'Conversion with financial history requires separate review'}, {status:400});
      }
      if (url.includes('/request_promotion_applications?')) return Response.json([{id: 'application'}]);
      throw new Error('Unexpected network call');
    };
    const source = fs.readFileSync(new URL(`../supabase/functions/${entry}/index.ts`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
    vm.runInNewContext(stripTypeScriptTypes(source, {mode: 'transform'}), {
      Deno: {env: {get: () => ''}, serve: value => {handler = value;}},
      fetch, Response, console: {error() {}},
    });
    const response = await handler(new Request('http://localhost/test', {
      method: 'POST', headers: {Authorization: 'Bearer synthetic-admin'},
      body: JSON.stringify({command, request_id: requestId, new_service_type: 'ron'}),
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, message);
    assert.equal(calls.filter(call => call.method !== 'GET' && !call.url.includes('/rpc/')).length, 0);
  });
}
