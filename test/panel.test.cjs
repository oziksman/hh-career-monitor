const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {command}=require('../scripts/panel.cjs');
test('panel starts one hidden worker, pauses and resumes it without replacing user settings',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hh-panel-test-'));let worker;
 try{
  await fs.writeFile(path.join(dir,'monitor-config.json'),JSON.stringify({enabled:false,headless:true,intervalMinutes:15,searchUrl:'fixture'}));
  await fs.writeFile(path.join(dir,'monitor-core.cjs'),`const fs=require('node:fs/promises'),path=require('node:path');exports.Monitor=class{
   initialize(){return fs.writeFile(path.join(__dirname,'monitor.lock'),String(process.pid),{flag:'wx'})}
   async action(){return {running:false}} async close(){}
  }`);
  assert.equal((await command('start',dir)).fresh,true);
  worker=Number(await fs.readFile(path.join(dir,'monitor.lock'),'utf8'));
  assert.equal((await command('pause',dir)).status,'Пауза');
  assert.equal((await command('start',dir)).enabled,true);
  assert.equal((await command('start',dir)).fresh,true);
  assert.equal(Number(await fs.readFile(path.join(dir,'monitor.lock'),'utf8')),worker);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'monitor-config.json'))).searchUrl,'fixture');
 }finally{if(worker)process.kill(worker);await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
});

test('new search saves filters, keeps the daily window, rejects non-search links and is idempotent',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hh-url-'));
 try{
  const file=path.join(dir,'monitor-config.json');await fs.writeFile(file,JSON.stringify({enabled:false,intervalMinutes:17}));
  const first=await command('set-url',dir,'https://spb.hh.ru/search/vacancy?area=1&area=2&text=аналитик&page=3&search_period=7');
  const u=new URL(first.searchUrl);assert.deepEqual(u.searchParams.getAll('area'),['1','2']);assert.equal(u.searchParams.get('text'),'аналитик');assert.equal(u.searchParams.get('search_period'),'1');assert.equal(u.searchParams.has('page'),false);
  assert.equal(first.baselinePending,true);assert.equal(first.enabled,false);assert.equal(first.interval,17);
  const saved=await fs.readFile(file,'utf8');await command('set-url',dir,first.searchUrl);assert.equal(await fs.readFile(file,'utf8'),saved);
  await assert.rejects(command('set-url',dir,'https://hh.ru.example.org/search/vacancy'));await assert.rejects(command('set-url',dir,'https://hh.ru/vacancy/12'));assert.equal(await fs.readFile(file,'utf8'),saved);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('changed source quietly seeds overlapping publications and drops old queue; later additions and republications are queued',async()=>{
 const {prepareSearch}=require('../src/delivery-history.cjs'),{refreshPublications}=require('../src/republication.cjs');
 const s={baseline:true,seen:{1:'baseline'},pending:{9:{id:'9'}},publicationDates:{1:'2020-01-01'}};
 const row=(id,h)=>({id,searchPublication:{day:'2026-10-10',at:'2026-10-10T'+h+':00:00Z'}});
 let rows=[row('1','07'),row('2','07')];
 async function scan(){prepareSearch(s,rows,'new');await refreshPublications(s,rows,r=>r.searchPublication,'2026-10-10T12:00:00Z')}
 await scan();assert.deepEqual(s.pending,{});assert.equal(s.baselineCount,2);
 rows=[row('1','08'),row('2','07'),row('3','08')];await scan();assert.deepEqual(Object.keys(s.pending),['1','3']);assert.equal(s.pending['1'].republished,true);
});
