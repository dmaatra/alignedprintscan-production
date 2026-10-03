import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('completion shortcut selects order completion, never the alphabetically earlier optional review',async()=>{
 const source=await readFile(new URL('../assets/js/admin.js',import.meta.url),'utf8');
 const start=source.indexOf('function selectStatusMessage('),end=source.indexOf('\nfunction ',start+1);
 const code=source.slice(start,end);
 const fields={'#messageTemplateSelect':{value:'',dispatchEvent(){},focus(){}},'#messageStatus':{value:''},'#messageComposerStatus':{textContent:''}};
 const context={$:key=>fields[key],window:{AdminV3:{activateTab(){}}},selectedRequest:{completed_at:null},currentMessagePreviewContext:null,Event:class{},statusLabel:s=>s};
 vm.createContext(context);vm.runInContext(code,context);
 context.selectStatusMessage('completed',[{id:'review',template_key:'review_request',associated_status:'completed'},{id:'completion',template_key:'order_completed',associated_status:'completed'}]);
 assert.equal(fields['#messageTemplateSelect'].value,'completion');assert.equal(fields['#messageStatus'].value,'completed');
});
