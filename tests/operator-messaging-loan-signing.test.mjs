import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const publicJs=read("assets/js/script.js"),admin=read("assets/js/admin.js"),adminV3=read("assets/js/admin-v3.js"),submit=read("supabase/functions/public-request-submit/index.ts"),migration=read("supabase/migrations/20260822140000_operator_profiles_and_scoped_conversations.sql"),inbound=read("supabase/functions/resend-inbound/index.ts"),cardEndpoint=read("supabase/functions/operator-card-public/index.ts"),card=read("assets/js/operator-card.js"),vercel=JSON.parse(read("vercel.json"));

test("Loan Signing uses canonical participant addresses and service-aware email",()=>{
  assert.match(publicJs,/lsaSignerSameAddress/);
  assert.match(publicJs,/address:/);
  assert.match(submit,/person\.address/);
  assert.match(submit,/detail\.signing_method.*=== "ron"/s);
  assert.doesNotMatch(submit,/Loan Signing signers with individual email addresses/);
  assert.match(adminV3,/adminLoanSigningSignerFields/);
  assert.match(adminV3,/lsa_signer_same_address_/);
  assert.match(adminV3,/hiddenWithinService/);
  assert.match(adminV3,/const retained=\{\}/);
  assert.match(adminV3,/control\.value=prior\.value/);
  assert.match(adminV3,/method==="ron"\?"required":""/);
  assert.match(adminV3,/service === "loan_signing"\) details = `\$\{labelFromStatus\(wizardValue\(form,"lsa_signing_type"\)\)\}/);
  assert.match(adminV3,/service === "loan_signing" \? labelFromStatus\(wizardValue\(form, "lsa_signing_method"\)\)/);
});

test("Loan Signing skips the empty shared options step",()=>{
  assert.match(publicJs,/activeService === "loan_signing" \? \[0, 1, 3, 4\]/);
  assert.match(publicJs,/availableSteps\.length/);
  assert.doesNotMatch(publicJs,/renderDynamicFields\(\)/);
});

test("Admin detail loader has explicit Loan Signing mapping and no generic Print fallback",()=>{
  assert.match(admin,/loan_signing: "loan_signing_assignments"/);
  assert.doesNotMatch(admin,/service_type === "mobile"[\s\S]{0,100}: "print_scan_requests"/);
  assert.match(admin,/Unable to load \$\{table\} details/);
});

test("operator and conversation migration is additive and protected",()=>{
  assert.match(migration,/message_conversations/);
  assert.match(migration,/message_reply_routes/);
  assert.match(migration,/service_request_id uuid references public\.service_requests\(id\) on delete set null/);
  assert.match(migration,/APS must retain at least one active protected Owner/);
  assert.match(migration,/public_operator_card/);
  assert.match(migration,/revoke all on public\.message_conversations from public,anon,authenticated/);
});

test("inbound replies require signed webhooks and scoped reply tokens",()=>{
  assert.match(inbound,/svix-signature/);
  assert.match(inbound,/Deno\.env\.get\("RESEND_RECEIVING_DOMAIN"\)/);
  assert.match(inbound,/address\.slice\(separator \+ 1\) === receivingDomain/);
  assert.match(inbound,/\^reply\\\+\[a-f0-9\]\{32\}\$/);
  assert.match(inbound,/provider_event_id/);
  assert.match(inbound,/message_reply_routes/);
  assert.match(inbound,/unread_count/);
  assert.match(inbound,/emailAddress\(event\.data\.from\)\s*!==\s*emailAddress\(conversation\.contact_email\)/);
  assert.match(inbound,/rendered_html:\s*null/);
  assert.match(inbound,/safeText\(content\.text,\s*content\.html\)/);
  assert.match(inbound,/inbound_customer_reply/);
  assert.match(read("supabase/functions/operator-correspondence/index.ts"),/"In-Reply-To"/);
  assert.match(read("supabase/functions/operator-correspondence/index.ts"),/"References"/);
  assert.match(read("supabase/functions/operator-correspondence/index.ts"),/sent\.ok && replying[\s\S]*read_at: now[\s\S]*unread_count: 0/);
  assert.doesNotMatch(read("supabase/functions/operator-correspondence/index.ts"),/randomUUID\(\).*\+\s*crypto\.randomUUID\(\)/s);
  assert.doesNotMatch(read("supabase/functions/send-message/index.ts"),/randomUUID\(\).*\+\s*crypto\.randomUUID\(\)/s);
  assert.match(read("supabase/functions/operator-correspondence/index.ts"),/requestId\s*=\s*text\(rows\[0\]\.service_request_id,\s*36\)\s*\|\|\s*null/);
});

test("operator card uses a narrow route and derives QR and vCard",()=>{
  assert.ok(vercel.rewrites.some(route=>route.source==="/professionals/:slug"));
  assert.ok(!vercel.rewrites.some(route=>route.source==="/:slug"));
  assert.match(card,/BEGIN:VCARD/);
  assert.match(card,/`N:\$\{escV\(profile\.last_name\)\};/);
  assert.match(card,/format=qr/);
  assert.match(cardEndpoint,/Access-Control-Allow-Origin/);
  assert.match(read("operator-card.html"),/digital-card professional-card/);
});
