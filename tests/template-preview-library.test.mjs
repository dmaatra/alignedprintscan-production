import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SYNTHETIC_TEMPLATE_CONTEXT, TEMPLATE_SPECIFICATIONS, renderFullTemplateEmail } from "../supabase/functions/_shared/template-preview.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const templates = Object.keys(TEMPLATE_SPECIFICATIONS).map((template_key,index)=>({id:`template-${index}`,template_key,name:template_key.replaceAll("_"," "),subject_template:`Update: {{request_reference}}`,html_template:"<p>Hello {{customer_first_name}},</p><p>Maintained body wording.</p>"}));

test("all maintained template specifications define expected data and full synthetic previews",()=>{
  assert.equal(templates.length,23);
  for(const template of templates){const spec=TEMPLATE_SPECIFICATIONS[template.template_key];assert.ok(spec.fields.length>=4,template.template_key);const rendered=renderFullTemplateEmail({template});assert.match(rendered.html,/Aligned Print &amp; Scan|Aligned Print & Scan/);assert.match(rendered.html,/Need assistance\?/);assert.match(rendered.html,/Aligned Print & Scan LLC/);assert.match(rendered.html,/APS-DEMO1234/);assert.match(rendered.html,/<img /);assert.match(rendered.html,/<a href=/);assert.doesNotMatch(rendered.html,/86d1e803|Brandi|bnturnbo/i);}
});

test("live request preview remains request scoped and wraps edited body in the canonical shell",()=>{
  const template=templates.find(item=>item.template_key==="appointment_rescheduled");
  const requestA={...SYNTHETIC_TEMPLATE_CONTEXT,requestId:"request-a",reference:"APS-REQUESTA",customer:{first_name:"Alex"},appointmentDate:"September 1, 2026",appointmentTime:"9:00 AM",appointmentLocation:"1 Current Street",serviceType:"mobile"};
  const requestB={...SYNTHETIC_TEMPLATE_CONTEXT,requestId:"request-b",reference:"APS-REQUESTB",customer:{first_name:"Blair"},appointmentDate:"September 2, 2026",appointmentTime:"3:00 PM",appointmentLocation:"2 Current Street",serviceType:"mobile"};
  const a=renderFullTemplateEmail({template,context:requestA,editedBody:"<p>Administrator edit A.</p>"}).html;
  const b=renderFullTemplateEmail({template,context:requestB,editedBody:"<p>Administrator edit B.</p>"}).html;
  assert.match(a,/Administrator edit A/);assert.match(a,/APS-REQUESTA/);assert.match(a,/September 1, 2026/);assert.match(a,/1 Current Street/);assert.doesNotMatch(a,/REQUESTB|Blair|September 2/);
  assert.match(b,/APS-REQUESTB/);assert.doesNotMatch(b,/REQUESTA|Alex|September 1/);
});

test("RON appointment preview excludes physical location and includes secure-session details",()=>{
  const template=templates.find(item=>item.template_key==="ron_session_ready");
  const html=renderFullTemplateEmail({template,context:{...SYNTHETIC_TEMPLATE_CONTEXT,serviceType:"ron",serviceName:"Remote Online Notary",appointmentLocation:"SHOULD-NOT-APPEAR",appointmentLink:"Secure session available"}}).html;
  assert.match(html,/Secure Session/);assert.match(html,/Secure session available/);assert.doesNotMatch(html,/SHOULD-NOT-APPEAR|Service Address \/ Location/);
});

test("quote, payment, invoice, and document previews expose only appropriate current values",()=>{
  const byKey=key=>renderFullTemplateEmail({template:templates.find(item=>item.template_key===key),context:SYNTHETIC_TEMPLATE_CONTEXT}).html;
  assert.match(byKey("quote_ready"),/Q-DEMO1234-v2/);assert.match(byKey("quote_ready"),/Mobile notary appointment/);
  assert.match(byKey("payment_received"),/Payment Recorded/);assert.match(byKey("payment_received"),/\$20\.00/);
  assert.match(byKey("final_invoice"),/INV-DEMO1234-01/);assert.match(byKey("document_delivery"),/sample-customer-copy\.pdf/);
});

test("review invitation renders the exact owner-controlled Google destination",()=>{
  const template=templates.find(item=>item.template_key==="review_request");
  const rendered=renderFullTemplateEmail({template,context:SYNTHETIC_TEMPLATE_CONTEXT});
  assert.equal(rendered.portal,"https://g.page/r/CeY4X1XsHwJFEAI/review");
  assert.match(rendered.html,/href="https:\/\/g\.page\/r\/CeY4X1XsHwJFEAI\/review"/);
  assert.doesNotMatch(rendered.html,/success\.html\?request_id=demo-request/);
});

test("global cards are buttons and detail view exposes specification, expected data, and sandboxed full preview",async()=>{
  const source=await read("assets/js/admin-v3.js");
  assert.match(source,/button class="admin-v3-module-card template-library-card"/);
  assert.match(source,/Data this template expects/);assert.match(source,/Back to Templates/);assert.match(source,/Previous Template/);assert.match(source,/Next Template/);assert.match(source,/Synthetic data only/);assert.match(source,/sandbox srcdoc/);
});

test("cancellation and refund templates use the same complete detail specification contract",()=>{
  for(const key of ["cancellation_request_received","cancellation_confirmed_no_payment","cancellation_confirmed_refund_due","refund_due","refund_processed","late_retained_amount_explanation","aps_unable_to_fulfill"]){
    const spec=TEMPLATE_SPECIFICATIONS[key];assert.ok(spec,key);assert.ok(spec.purpose);assert.ok(spec.trigger);assert.ok(spec.classification);assert.ok(spec.eyebrow);assert.ok(spec.title);assert.ok(spec.cta);assert.ok(spec.tab);assert.ok(spec.fields.length>=5);
  }
});

test("admin Scripts is reference-only, categorized, navigable, and absent from customer pages",async()=>{
  const [adminHtml,adminJs,customerJs,catalog]=await Promise.all([read("admin-dashboard.html"),read("assets/js/admin-v3.js"),read("assets/js/script.js"),import("../assets/js/operator-reference-catalog.mjs")]);
  assert.match(adminHtml,/data-admin-view="scripts"/);assert.match(adminJs,/Back to Scripts/);assert.match(adminJs,/Previous Script/);assert.match(adminJs,/Next Script/);
  assert.deepEqual(catalog.SCRIPT_CATEGORY_ORDER,["RON Session","Notarial Acts","Mobile Notary","Print & Scan","Problem / Stop / Refusal","Quick-Flip","Checklists"]);
  assert.ok(catalog.OPERATOR_REFERENCE_SCRIPTS.length>=20);assert.equal(new Set(catalog.OPERATOR_REFERENCE_SCRIPTS.map(item=>item.key)).size,catalog.OPERATOR_REFERENCE_SCRIPTS.length);
  for(const script of catalog.OPERATOR_REFERENCE_SCRIPTS){for(const field of ["purpose","when","say","stop","next","related"])assert.ok(script[field],`${script.key}:${field}`);assert.ok(script.mustDo.length);assert.ok(script.doNot.length);}
  assert.doesNotMatch(customerJs,/operator-reference-catalog|data-admin-view="scripts"/);
  assert.doesNotMatch(adminJs,/openScriptDetail[\s\S]{0,800}(functions\.invoke|\.from\(|fetch\()/);
});

test("request body editor stays compact while preview and delivery share the final renderer",async()=>{
  const admin=await read("assets/js/admin.js"),send=await read("supabase/functions/send-message/index.ts");
  assert.match(admin,/Message HTML<textarea/);assert.match(admin,/renderFullTemplateEmail/);assert.match(admin,/aps-full-email-preview/);assert.match(admin,/currentMessagePreviewContext/);
  assert.match(admin,/customerPreviewDate\(selectedRequest\.appointment_date/);
  assert.match(send,/renderFullTemplateEmail/);assert.doesNotMatch(admin,/textarea[^>]*renderCustomerEmailShell/);
});
