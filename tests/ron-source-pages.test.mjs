import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Optional isolated PostgreSQL engine; no production connection is used.
test("RON source totals exclude returns/copies/audits and source changes still block", { skip: !process.env.APS_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.APS_PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table service_requests(id uuid primary key, service_type text, detected_pdf_page_count integer, pdf_page_count_review_required boolean default false, pdf_page_count_changed_after_quote boolean default false);
      create table request_files(id uuid primary key, service_request_id uuid, file_path text, uploaded_by text, document_category text, document_classification text, is_active boolean default true, file_type text default 'application/pdf', file_name text default 'file.pdf', detected_page_count integer, page_count_status text, review_state text default 'pending', customer_visible boolean default false, eligible_for_delivery boolean default false);
      create table quotes(service_request_id uuid, sent_at timestamptz, approved_at timestamptz, state text, quote_status text);
      create table review_queue_items(id uuid primary key default gen_random_uuid(), service_request_id uuid, blocker_key text, title text, detail text, target_tab text, state text, source_object_type text, source_object_id uuid, resolved_by uuid, resolved_at timestamptz, updated_at timestamptz);
      create unique index open_reviews on review_queue_items(service_request_id,blocker_key) where state='open';
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('fixture.admin',true),'')::uuid $$;
      create function is_admin() returns boolean language sql as $$ select auth.uid() is not null $$;
      create table request_timeline_events(service_request_id uuid,event_type text,title text,detail text,actor_type text,visibility text,metadata jsonb);
      create table proof_transaction_assets(source_request_file_id uuid,storage_bucket text,storage_path text);
      create table proof_document_command_attempts(request_file_id uuid);
      create table request_document_participants(request_file_id uuid);
      create table loan_signing_package_versions(source_file_id uuid);
      create table loan_signing_returns(proof_file_id uuid);
      create table loan_signing_stipulations(proof_file_id uuid);
      create table message_attachments(request_file_id uuid);
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261003151318_ron_source_pages_and_canonical_proof_staging.sql", import.meta.url), "utf8"));
    const ron = "00000000-0000-0000-0000-000000000001", loan = "00000000-0000-0000-0000-000000000002";
    await db.query("insert into service_requests(id,service_type) values ($1,'ron'),($2,'loan_signing')", [ron,loan]);
    let sequence = 10;
    const file = async (request, uploader, classification, count = 2, status = "manual", path = null) => {
      const id = `00000000-0000-0000-0000-${String(sequence++).padStart(12,"0")}`;
      await db.query("insert into request_files(id,service_request_id,file_path,uploaded_by,document_category,document_classification,detected_page_count,page_count_status) values ($1,$2,$3,$4,$5,$6,$7,$8)", [id,request,path,uploader,uploader === "proof" ? "proof-completed" : uploader === "admin" ? "admin-additional" : "upload",classification,count,status]);
      return id;
    };
    const source = await file(ron,"customer","customer_document");
    await db.query("insert into quotes(service_request_id,state) values ($1,'approved'),($2,'approved')", [ron,loan]);
    const manualCopy = await file(ron,"admin","completed_notarized_document");
    const returned = await file(ron,"proof","completed_notarized_document",2,"pending","canonical.pdf");
    const audit = await file(ron,"proof","internal_document",2,"pending","audit.pdf");
    await assert.rejects(db.query("select admin_set_document_release($1,$2,true)",[ron,returned]), /Administrator access/);
    await db.query("select set_config('fixture.admin',$1,false)",[ron]);
    await assert.rejects(db.query("select admin_set_document_release($1,$2,true)",[ron,returned]), /Approve the completed/);
    await db.query("update request_files set review_state='approved' where id=$1",[manualCopy]);
    await assert.rejects(db.query("select admin_set_document_release($1,$2,true)",[ron,manualCopy]), /Only a retrieved Proof/);
    await assert.rejects(db.query("select admin_set_document_release($1,$2,true)",[ron,audit]), /Internal and audit/);
    await db.query("update request_files set review_state='approved' where id=$1",[returned]);
    await db.query("select admin_set_document_release($1,$2,true)",[ron,returned]);
    assert.equal((await db.query("select customer_visible from request_files where id=$1",[returned])).rows[0].customer_visible,true);
    assert.equal((await db.query("select detected_pdf_page_count from service_requests where id=$1",[ron])).rows[0].detected_pdf_page_count,2);
    assert.equal((await db.query("select * from review_queue_items where service_request_id=$1 and state='open'",[ron])).rows.length,0);
    await assert.rejects(file(ron,"proof","completed_notarized_document",2,"manual","canonical.pdf"), /duplicate key/);
    await db.query("update request_files set detected_page_count=3 where id=$1",[source]);
    assert.equal((await db.query("select * from review_queue_items where service_request_id=$1 and blocker_key='pdf_page_count_changed_after_quote' and state='open'",[ron])).rows.length,1);
    // Exercise the exact approval-gated proposal only against isolated fixtures.
    const incident = "10000000-0000-4000-8000-000000000001";
    await db.query("insert into service_requests(id,service_type,detected_pdf_page_count,pdf_page_count_changed_after_quote) values ($1,'ron',8,true)",[incident]);
    for (const [id,uploader,classification,path,visible,review] of [
      ["10000000-0000-4000-8000-000000000005","customer","customer_document","source.pdf",true,"pending"],
      ["10000000-0000-4000-8000-000000000002","admin","completed_notarized_document","manual.pdf",false,"pending"],
      ["10000000-0000-4000-8000-000000000003","proof","completed_notarized_document","returned.pdf",true,"approved"],
      ["10000000-0000-4000-8000-000000000004","proof","internal_document","audit.pdf",false,"pending"],
    ]) await db.query("insert into request_files(id,service_request_id,file_path,uploaded_by,document_category,document_classification,detected_page_count,page_count_status,customer_visible,eligible_for_delivery,review_state) values ($1,$2,$3,$4,$5,$6,2,'detected',$7,$8,$9)",[id,incident,path,uploader,uploader === "proof" ? "proof-completed" : "upload",classification,visible,uploader === "proof" && visible,review]);
    await db.query("update service_requests set detected_pdf_page_count=8,pdf_page_count_changed_after_quote=true where id=$1",[incident]);
    await db.query("insert into review_queue_items(id,service_request_id,blocker_key,state) values ('10000000-0000-4000-8000-000000000006',$1,'pdf_page_count_changed_after_quote','open')",[incident]);
    const recovery = await readFile(new URL("./fixtures/ron-recovery.sql",import.meta.url),"utf8");
    await assert.rejects(db.exec(recovery), /Explicit owner approval/);
    await db.exec("rollback");
    await db.query("select set_config('aps.incident_approval','isolated-test-only',false)");
    await db.exec(recovery);
    assert.deepEqual((await db.query("select detected_pdf_page_count,pdf_page_count_changed_after_quote from service_requests where id=$1",[incident])).rows[0],{ detected_pdf_page_count:2,pdf_page_count_changed_after_quote:false });
    assert.equal((await db.query("select state from review_queue_items where id='10000000-0000-4000-8000-000000000006'")).rows[0].state,"resolved");
    const history=(await db.query("select metadata from request_timeline_events where event_type='ron_source_page_count_reconciled'")).rows[0].metadata;
    assert.equal(history.request_before.detected_pdf_page_count,8);
    assert.equal(history.review_before.state,"open");
    assert.equal((await db.query("select customer_visible from request_files where id='10000000-0000-4000-8000-000000000004'")).rows[0].customer_visible,false);
    // Administrator removal cases A-J, using the actual database routines.
    const internal = await file(ron,"admin","internal_document",2,"manual",`${ron}/admin/internal.pdf`);
    const manual = await file(ron,"admin","completed_notarized_document",2,"manual",`${ron}/admin/copy.pdf`);
    await db.query("select set_config('fixture.admin','',false)");
    await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,internal]), /Administrator access/);
    await db.query("select set_config('fixture.admin',$1,false)",[ron]);
    for(const protectedId of [source,returned,audit]) await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,protectedId]), /Only an unreleased manual/);
    await db.query("update request_files set document_classification='internal_document' where id=$1",[source]);
    await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,source]), /Only an unreleased manual/);
    const linked = await file(ron,"admin","internal_document",2,"manual",`${ron}/admin/linked.pdf`);
    await db.query("insert into proof_transaction_assets(source_request_file_id) values ($1)",[linked]);
    await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,linked]), /Only an unreleased manual/);
    const shared = await file(ron,"admin","internal_document",2,"manual",`${ron}/admin/shared.pdf`);
    await file(ron,"proof","internal_document",2,"manual",`${ron}/admin/shared.pdf`);
    await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,shared]), /Only an unreleased manual/);
    await db.query("insert into review_queue_items(service_request_id,blocker_key,state,source_object_type,source_object_id) values ($1,'manual_file_review','open','request_file',$2)",[ron,manual]);
    const protectedBefore=(await db.query("select * from request_files where id=any($1::uuid[]) order by id",[[returned,audit]])).rows;
    const providerBefore=(await db.query("select * from proof_transaction_assets")).rows;
    // A failed audit insert must roll back the deactivation and linked review.
    await db.exec(`create function reject_fixture_removal_audit() returns trigger language plpgsql as $$ begin if new.event_type='admin_document_removed' and current_setting('fixture.fail_audit',true)='true' then raise exception 'fixture audit failure'; end if; return new; end $$;
      create trigger reject_fixture_removal_audit before insert on request_timeline_events for each row execute function reject_fixture_removal_audit();`);
    await db.query("select set_config('fixture.fail_audit','true',false)");
    await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,manual]), /fixture audit failure/);
    assert.equal((await db.query("select is_active from request_files where id=$1",[manual])).rows[0].is_active,true);
    await db.query("select set_config('fixture.fail_audit','false',false)");
    for(const removable of [internal,manual]) await db.query("select admin_remove_uploaded_document($1,$2)",[ron,removable]);
    const removed=(await db.query("select is_active,customer_visible,eligible_for_delivery,review_state,file_path from request_files where id=$1",[manual])).rows[0];
    assert.deepEqual(removed,{is_active:false,customer_visible:false,eligible_for_delivery:false,review_state:"removed",file_path:`${ron}/admin/copy.pdf`});
    assert.equal((await db.query("select state from review_queue_items where source_object_id=$1",[manual])).rows[0].state,"resolved");
    assert.deepEqual((await db.query("select * from request_files where id=any($1::uuid[]) order by id",[[returned,audit]])).rows,protectedBefore);
    assert.deepEqual((await db.query("select * from proof_transaction_assets")).rows,providerBefore);
    const removalEvent=(await db.query("select visibility,metadata from request_timeline_events where event_type='admin_document_removed' and metadata->>'request_file_id'=$1",[manual])).rows[0];
    assert.equal(removalEvent.visibility,"internal");assert.equal(removalEvent.metadata.admin_id,ron);assert.equal(removalEvent.metadata.storage_action,"retained");
    await assert.rejects(db.query("select admin_remove_uploaded_document($1,$2)",[ron,manual]), /Active document not found/);
    await file(ron,"customer","customer_document",null,"pending");
    assert.equal((await db.query("select pdf_page_count_review_required from service_requests where id=$1",[ron])).rows[0].pdf_page_count_review_required,true);
    await file(loan,"admin","internal_document");
    assert.equal((await db.query("select detected_pdf_page_count from service_requests where id=$1",[loan])).rows[0].detected_pdf_page_count,2);
    // Neither historical false-positive reviews nor legitimate source reviews
    // are silently cleared by an output insert or verification.
    await file(ron,"proof","internal_document",2,"manual","another-audit.pdf");
    assert.equal((await db.query("select * from review_queue_items where service_request_id=$1 and blocker_key='pdf_page_count_changed_after_quote' and state='open'",[ron])).rows.length,1);
  } finally { await db.close(); }
});
