import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("removal endpoint requires administrator authorization, confirmation, and authenticated transactional RPC", async () => {
  const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;
  let handler,adminAllowed=true,rpcAllowed=true,rpcCalls=0;
  globalThis.Deno={env:{get:name=>({SUPABASE_URL:"https://fixture.invalid",SUPABASE_SERVICE_ROLE_KEY:"fixture"})[name]||""},serve:fn=>{handler=fn;}};
  const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
  globalThis.fetch=async(url,init={})=>{
    const path=String(url);
    assert.notEqual(init.method,"DELETE");
    assert.ok(!path.includes("/storage/"));
    if(path.endsWith("/auth/v1/user"))return json({id:"fixture-admin"});
    if(path.endsWith("/rpc/is_admin"))return json(adminAllowed);
    if(path.endsWith("/rpc/admin_remove_uploaded_document")){
      rpcCalls++;
      assert.equal(init.headers.Authorization,"Bearer authenticated-admin");
      assert.deepEqual(JSON.parse(init.body),{p_request:"00000000-0000-0000-0000-000000000001",p_file:"00000000-0000-0000-0000-000000000002"});
      return rpcAllowed?json({file_id:"file",storage_action:"retained"}):json({message:"Protected workflow reference"},400);
    }
    if(path.includes("/rest/v1/service_requests?"))return json([{id:"request",customers:{}}]);
    if(path.includes("/rest/v1/")) { assert.ok(!init.method);return json([]); }
    throw new Error("Unexpected fixture request");
  };
  try{
    await import("../supabase/functions/admin-service-adjustment/index.ts?removal-test");
    const invoke=(confirmed,auth=true)=>handler(new Request("https://fixture.invalid/remove",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer authenticated-admin"}:{})},body:JSON.stringify({command:"remove_admin_document",request_id:"00000000-0000-0000-0000-000000000001",file_id:"00000000-0000-0000-0000-000000000002",confirmed})}));
    assert.equal((await invoke(true,false)).status,400);
    adminAllowed=false;assert.equal((await invoke(true)).status,400);assert.equal(rpcCalls,0);
    adminAllowed=true;assert.equal((await invoke(false)).status,400);assert.equal(rpcCalls,0);
    rpcAllowed=false;assert.equal((await invoke(true)).status,400);
    rpcAllowed=true;const response=await invoke(true);assert.equal(response.status,200);assert.equal((await response.json()).storage_action,"retained");
  }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
});
test("active UI uses backend eligibility and confirms file/request identity",async()=>{
  const source=await readFile(new URL("../assets/js/admin.js",import.meta.url),"utf8");
  assert.match(source,/adminClient.rpc\("admin_removable_uploads"/);
  assert.match(source,/removableFileIds.has\(f.id\)/);
  assert.match(source,/Remove "\$\{button.dataset.fileName\}" from \$\{ref\}/);
  assert.match(source,/confirmed: true/);
  const getFiles=source.slice(source.indexOf("async function getFiles("),source.indexOf("async function signedUrl("));
  assert.match(getFiles,/\.eq\("is_active", true\)/);
});
