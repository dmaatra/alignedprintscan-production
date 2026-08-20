import assert from "node:assert/strict";
import test from "node:test";
import {cancellationTiming,suggestedCancellationCharge,waitReview,customerSafeException} from "../supabase/functions/_shared/loan-signing-policy.mjs";

test("cancellation timing derives only from authoritative facts",()=>{
  assert.equal(cancellationTiming({}),"before_preparation");
  assert.equal(cancellationTiming({print_status:"printed"}),"after_preparation_before_travel");
  assert.equal(cancellationTiming({travel_started_at:"2026-08-20T10:00:00Z"}),"after_travel_started");
  assert.equal(cancellationTiming({arrival_at:"2026-08-20T10:30:00Z"}),"after_arrival");
  assert.equal(cancellationTiming({signing_started_at:"2026-08-20T10:45:00Z"}),"after_signing_started");
});
test("policy produces a ceiling suggestion and never an automatic charge",()=>{
  assert.deepEqual(suggestedCancellationCharge({agreedFee:150,facts:{}}),{timing:"before_preparation",percent:0,suggested_amount:0,requires_admin_review:true});
  assert.equal(suggestedCancellationCharge({agreedFee:150,facts:{print_status:"printed"}}).suggested_amount,75);
  assert.equal(suggestedCancellationCharge({agreedFee:150,facts:{arrival_at:"2026-08-20T10:00:00Z"}}).suggested_amount,150);
});
test("wait fee uses included time and started increments",()=>{
  const base={arrival_at:"2026-08-20T10:00:00Z"};
  assert.equal(waitReview({...base,signing_started_at:"2026-08-20T10:30:00Z"}).suggested_amount,0);
  assert.equal(waitReview({...base,signing_started_at:"2026-08-20T10:31:00Z"}).suggested_amount,25);
  assert.equal(waitReview({...base,signing_started_at:"2026-08-20T11:01:00Z"}).suggested_amount,50);
  assert.equal(waitReview({...base,signing_started_at:"2026-08-20T11:31:00Z"}).suggested_amount,75);
  assert.equal(waitReview({...base,signing_started_at:"2026-08-20T11:31:00Z",aps_caused_delay:true}).suggested_amount,0);
});
test("customer labels remain neutral",()=>{
  assert.equal(customerSafeException("no_sign"),"Signing Could Not Be Completed — Additional Review Needed");
  assert.equal(customerSafeException("resign_required"),"Additional Signing Appointment Needed");
  assert.equal(customerSafeException("cancelled"),"Cancellation Under Review");
});
