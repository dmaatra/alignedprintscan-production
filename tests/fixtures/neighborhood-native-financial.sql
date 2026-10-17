-- Synthetic fixture only; guarded against the hosted APS database.
DO $$ BEGIN IF current_database()<>'aps_pr159_revision_fixture' THEN RAISE EXCEPTION 'Synthetic fixture database required'; END IF; END $$;
SET test.user_id='11111111-1111-4111-8111-111111111111'; SET test.admin='true';
INSERT INTO service_requests(id,service_type,status,paid_amount,estimated_total,estimate_components) VALUES('22222222-2222-4222-8222-222222222222','mobile','under_review',0,35,'{"components":[{"key":"mobile:base","label":"Mobile Notary Appointment Base","quantity":1,"unit_amount":50,"line_amount":50},{"key":"notarial_act:jurat","label":"Jurat","quantity":1,"unit_amount":10,"line_amount":10},{"key":"promotion:CAMDEN_PARK","label":"Camden Park Promotional Adjustment","quantity":1,"unit_amount":-25,"line_amount":-25}]}');
INSERT INTO mobile_notary_requests(service_request_id,street_address,city,state,zip) VALUES('22222222-2222-4222-8222-222222222222','Synthetic address','Waxahachie','TX','75165');
INSERT INTO request_promotion_applications(service_request_id,promotion_code,submitted_service_address) VALUES('22222222-2222-4222-8222-222222222222','CAMDEN_PARK','Synthetic address');
SELECT aps_review_pricing_program('22222222-2222-4222-8222-222222222222','approved','Fixture review',0);
INSERT INTO invoices(id,service_request_id,status,amount_due,amount_paid) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','paid',35,35);
INSERT INTO request_payments(service_request_id,invoice_id,amount) VALUES('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',35);
INSERT INTO mobile_travel_calculations(id,service_request_id,suggested_fee) VALUES('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',10);
SELECT aps_review_pricing_program('22222222-2222-4222-8222-222222222222','denied','Fixture standard review',1,'44444444-4444-4444-8444-444444444444');
INSERT INTO invoices(service_request_id,status,amount_due,amount_paid) VALUES('22222222-2222-4222-8222-222222222222','issued',35,0);
