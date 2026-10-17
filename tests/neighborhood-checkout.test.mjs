import test from 'node:test';import assert from 'node:assert/strict';
import {canItemizeCheckout} from '../supabase/functions/_shared/checkout-itemization.mjs';
const row=(quantity,unit_price)=>({quantity,unit_price,line_total:quantity*unit_price});
test('promotional quote charges net balance without sending a negative Stripe price',()=>{assert.equal(canItemizeCheckout([row(1,50),row(1,10),row(1,-25)],35),false)});
test('standard whole-quantity invoice stays itemized',()=>{assert.equal(canItemizeCheckout([row(1,50),row(1,10)],60),true)});
test('partial payment and fractional quantities use exact outstanding balance',()=>{assert.equal(canItemizeCheckout([row(1,50),row(1,10)],25),false);assert.equal(canItemizeCheckout([row(1.5,10)],15),false)});
test('rounding mismatch and invalid values cannot create incorrect checkout itemization',()=>{assert.equal(canItemizeCheckout([row(3,.333)],1),false);assert.equal(canItemizeCheckout([row(1,NaN)],1),false);assert.equal(canItemizeCheckout([row(1,0)],0),false)});
