const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {route}=require('../src/analysis-router.cjs');
const config={model:'opencode/glm-5.3-flash-free',fallback:{provider:'mistral',model:'ministral-14b-2512',freeTierConfirmed:true}};
const body={messages:[{role:'user',content:'Test vacancy'}]};
const quota=()=>{throw Object.assign(Error('quota'),{code:'OPENCODE_FREE_QUOTA'})};
async function directory(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'hh-router-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root}
test('quota switches to independent provider, persists cooldown, then retries GLM',async t=>{
 const root=await directory(t);let primaryCalls=0,secondaryCalls=0,time=1000;
 const deps={root,now:()=>time,primary:async()=>{primaryCalls++;return quota()},secondary:async req=>{secondaryCalls++;assert.equal(req.model,'ministral-14b-2512');assert.equal(req.response_format.type,'json_object');return JSON.stringify({verdict:'Не подходит',conclusion:'Обязателен B2.',letter:''})}};
 assert.equal((await route(body,config,deps)).provider,'mistral');
 await route(body,config,deps);assert.equal(primaryCalls,1);assert.equal(secondaryCalls,2);
 time+=3600001;deps.primary=async()=>{primaryCalls++;return 'Вывод: Подходит.'};
 assert.equal((await route(body,config,deps)).provider,'opencode');assert.equal(primaryCalls,2);
});
test('no fallback without explicit free tier configuration and none for unrelated errors',async t=>{
 const root=await directory(t);let called=false;const secondary=async()=>{called=true};
 await assert.rejects(route(body,{model:config.model},{root,primary:quota,secondary}),e=>e.code==='OPENCODE_FREE_QUOTA');
 await assert.rejects(route(body,config,{root,primary:async()=>{throw Error('bad configuration')},secondary}),/bad configuration/);
 assert.equal(called,false);
});
test('both providers unavailable preserves a retryable error, not a fabricated answer',async t=>{
 const root=await directory(t);
 await assert.rejects(route(body,config,{root,primary:quota,secondary:async()=>{throw Error('429')}}),e=>e.code==='ANALYSIS_PROVIDERS_UNAVAILABLE');
});
