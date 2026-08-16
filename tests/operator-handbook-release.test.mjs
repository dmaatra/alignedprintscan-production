import assert from "node:assert/strict";
import { stat, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { OPERATOR_REFERENCE_SCRIPTS, SCRIPT_CATEGORY_ORDER } from "../assets/js/operator-reference-catalog.mjs";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("handbook 3.0 deliverables and reproducible source are present",async()=>{
  const [docx,pdf,builder]=await Promise.all([
    stat(new URL("docs/handbook/Aligned_Print_Scan_Operator_Handbook_v3.0.docx",root)),
    stat(new URL("docs/handbook/Aligned_Print_Scan_Operator_Handbook_v3.0.pdf",root)),
    read("docs/handbook/build_operator_handbook.py"),
  ]);
  assert.ok(docx.size>500_000);assert.ok(pdf.size>1_000_000);
  for(const required of ["PARTS=[","Contents","Back to Contents","landscape_start","Template Operator Catalog","Status Catalog","Visual SOP Atlas","Back-of-Book Index"])assert.match(builder,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(builder,/w:startOverride/);
  assert.match(builder,/start_override\.set\(qn\("w:val"\),"1"\)/);
  assert.match(builder,/line\.startswith\("- \[Part "/);
  assert.match(builder,/len\(faq_items\)==len\(bullets\)/);
  assert.match(builder,/metadata_labels=\("Version","Updated"/);
  assert.match(builder,/key=p\.add_run\(label\+": "\)/);
  assert.match(builder,/topic=="System Production Baseline and Document Control"/);
  assert.match(builder,/"System production baseline inspected:" not in p/);
  assert.match(builder,/len\(definition_rows\)>=12/);
  assert.match(builder,/add_table\(doc,\["Term","Meaning"\],definition_rows/);
});

test("handbook source includes all approved visuals and complete public policies",async()=>{
  const [images,builder]=await Promise.all([readdir(new URL("docs/assets/manual/",root)),read("docs/handbook/build_operator_handbook.py")]);
  assert.equal(images.filter(name=>/^ss-.*\.jpg$/.test(name)).length,19);
  for(const page of ["terms.html","privacy.html","accessibility.html","faq.html"])assert.match(builder,new RegExp(page.replace(".","\\.")));
});

test("admin reference and handbook use the same maintained script catalog",async()=>{
  const admin=await read("assets/js/admin-v3.js"),builder=await read("docs/handbook/build_operator_handbook.py");
  assert.match(admin,/operator-reference-catalog\.mjs/);assert.match(builder,/operator-reference-catalog\.mjs/);
  assert.equal(OPERATOR_REFERENCE_SCRIPTS.length,22);assert.equal(SCRIPT_CATEGORY_ORDER.length,7);
});
