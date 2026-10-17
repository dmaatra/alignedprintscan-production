import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../assets/js/aps-growth.js',import.meta.url),'utf8');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('yard-sign acquisition survives neighborhood, team, and intake navigation',()=>{
 const sessionStorage=storage(),localStorage=storage();let api;
 for(const [pathname,search,referrer] of [['/neighborhood','?utm_source=yard_sign&utm_medium=offline&utm_campaign=neighborhood_services',''],['/team','','https://alignedprintscan.com/neighborhood'],['/pricing.html','','https://alignedprintscan.com/team']]){
  const window={};vm.runInNewContext(code,{window,location:{pathname,search,origin:'https://alignedprintscan.com'},document:{referrer},sessionStorage,localStorage,URL,URLSearchParams});api=window.APSGrowth;
  const t=api.attribution();assert.equal(t.request_touch.utm_source,'yard_sign');assert.equal(t.request_touch.utm_medium,'offline');assert.equal(t.request_touch.utm_campaign,'neighborhood_services');assert.equal(t.request_touch.landing_page,'/neighborhood');
 }
});
