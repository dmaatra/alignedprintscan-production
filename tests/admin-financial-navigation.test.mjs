import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildInvoiceRows, buildPaymentRows, filterFinancialRows, sortFinancialRows, summarizeInvoices, summarizePayments } from "../assets/js/admin-financial-view.mjs";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const requests=[
  {id:"b45d17e3-f808-464c-8f4b-7feba7d1acf2",created_at:"2026-08-12T17:17:47Z",service_type:"mobile",quote_amount:79,invoice_status:"draft",payment_state:"not_invoiced",customers:{first_name:"D",last_name:"R"}},
  {id:"11111111-1111-4111-8111-111111111111",created_at:"2026-08-10T12:00:00Z",service_type:"ron",quote_amount:45,customers:{first_name:"Jane",last_name:"Sample"}},
  {id:"22222222-2222-4222-8222-222222222222",created_at:"2026-08-11T12:00:00Z",service_type:"print",quote_amount:100,customers:{first_name:"Alex",last_name:"Customer"}},
];
const invoices=[
  {id:"i1",service_request_id:requests[1].id,status:"partially_paid",payment_status:"partially_paid",amount_due:45,amount_paid:20,balance_due:25,created_at:"2026-08-11T10:00:00Z"},
  {id:"i2",service_request_id:requests[2].id,status:"paid",payment_status:"paid",amount_due:100,amount_paid:100,balance_due:0,created_at:"2026-08-12T10:00:00Z",paid_at:"2026-08-12T11:00:00Z"},
];
const payments=[{id:"p1",service_request_id:requests[1].id,amount:20,received_at:"2026-08-11T11:00:00Z",is_test:false},{id:"p2",service_request_id:requests[2].id,amount:100,received_at:"2026-08-12T11:00:00Z",is_test:false}];

test("invoice sorting is deterministic and numeric rather than formatted-string based",()=>{const rows=buildInvoiceRows(requests,invoices);assert.deepEqual(sortFinancialRows(rows,"reference","asc").map(row=>row.reference),["APS-11111111","APS-22222222","APS-B45D17E3"]);assert.deepEqual(sortFinancialRows(rows,"quoted","asc").map(row=>row.quoted),[45,79,100]);assert.equal(sortFinancialRows(rows,"date","desc")[0].reference,"APS-B45D17E3");});
test("payment sorting uses numeric paid and balance values",()=>{const rows=buildPaymentRows(requests,invoices,payments);assert.deepEqual(sortFinancialRows(rows,"paid","desc").map(row=>row.paid),[100,20,0]);assert.deepEqual(sortFinancialRows(rows,"balance","desc").map(row=>row.balance),[25,0,0]);});
test("financial search finds APS reference and customer without reload",()=>{const rows=buildInvoiceRows(requests,invoices);assert.equal(filterFinancialRows(rows,{search:"B45D17E3"})[0].customer,"D R");assert.equal(filterFinancialRows(rows,{search:"Jane Sample"})[0].reference,"APS-11111111");});
test("filters use legitimate state, service, and relevant dates",()=>{const rows=buildPaymentRows(requests,invoices,payments);assert.deepEqual(filterFinancialRows(rows,{state:"partially_paid",service:"ron",from:"2026-08-11",to:"2026-08-11"}).map(row=>row.reference),["APS-11111111"]);});
test("authoritative summaries exclude draft quotes from receivables",()=>{const invoiceRows=buildInvoiceRows(requests,invoices),paymentRows=buildPaymentRows(requests,invoices,payments);const draft=invoiceRows.find(row=>row.reference==="APS-B45D17E3");assert.equal(draft.quoted,79);assert.equal(draft.invoiced,0);assert.equal(draft.balance,0);assert.equal(draft.status,"draft");assert.deepEqual(summarizeInvoices(invoiceRows),{quoted:224,invoiced:145,outstanding:25,open:1});assert.deepEqual(summarizePayments(paymentRows),{paid:120,outstanding:25,recorded:2});});
test("financial links, customer portal, and website navigation target the intended contexts",async()=>{const admin=await read("assets/js/admin-v3.js"),html=await read("admin-dashboard.html");assert.match(admin,/data-tab="\$\{invoiceView\?"quote":"payments"\}"/);assert.match(admin,/workspaceCustomerPortal/);assert.match(admin,/success\.html\?request_id=\$\{encodeURIComponent\(request\.id\)\}/);assert.match(html,/id="workspaceCustomerPortal"[^>]*target="_blank"/);assert.match(html,/id="viewMainWebsite"/);assert.match(html,/https:\/\/alignedprintscan\.com\//);assert.doesNotMatch(await read("assets/js/admin.js"),/Open Client Status Page/);});
test("existing typed admin search and protected customer portal implementation remain intact",async()=>{assert.match(await read("assets/js/admin-v3.js"),/Search requests, customers, and invoices|global/i);const portal=await read("supabase/functions/get-request-status/index.ts");assert.match(portal,/customer_visible === true/);assert.match(portal,/eligible_for_delivery === true/);});
