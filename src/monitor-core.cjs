const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=__dirname;
async function json(name,fallback){try{return JSON.parse((await fs.readFile(path.join(root,name),'utf8')).replace(/^\uFEFF/,''))}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e}}
async function save(name,value){const file=path.join(root,name);await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file)}
const {Analysis,send,buttons}=require('./telegram-analysis.cjs');
const {describeStatus}=require('./status.cjs');
function notify(text,id){return send(text,id?buttons(id):undefined)}
class Monitor{
 constructor(){this.running=false;this.loginContext=null;this.timer=null;this.shuttingDown=false;this.state=null;this.lock=null;this.lastPoll=0;}
 async initialize(){
  try{this.lock=await fs.open(path.join(root,'monitor.lock'),'wx');await this.lock.writeFile(String(process.pid))}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await fs.readFile(path.join(root,'monitor.lock'),'utf8'));try{process.kill(pid,0);throw Error('Another monitor process is active')}catch(err){if(err.code!=='ESRCH')throw err}await fs.unlink(path.join(root,'monitor.lock'));return this.initialize()}
  this.state=await json('monitor-state.json',{baseline:false,seen:{},pending:{},lastSuccess:null,lastError:null});
  this.analysis=new Analysis(this);await this.analysis.load();
  this.callbackTimer=setInterval(()=>this.analysis.poll().catch(()=>{}),10000);
  this.timer=setInterval(()=>{this.maybeRun().catch(e=>{this.state.lastError=e.message});this.publishHealth().catch(()=>{})},15000);
  await this.publishHealth();this.maybeRun().catch(e=>{this.state.lastError=e.message});
 }
 async publishHealth(){
  if(this.healthWriting)return;this.healthWriting=true;
  try{await save('monitor-health.json',{pid:process.pid,updatedAt:new Date().toISOString(),running:this.running,loginOpen:!!this.loginContext,lastSuccess:this.state.lastSuccess,lastError:this.state.lastError,analysisError:this.analysis?.error??null,analysisPending:Object.values(this.analysis?.state.jobs??{}).filter(j=>j.status==='queued').length})}
  finally{this.healthWriting=false}
 }
 async maybeRun(){const config=await json('monitor-config.json');if(config.enabled&&!this.running&&!this.loginContext&&Date.now()-this.lastPoll>=config.intervalMinutes*60000){this.lastPoll=Date.now();await this.tick(config)}}
 async context(headless){return chromium.launchPersistentContext(path.join(root,'monitor-browser'),{...(process.env.CAREER_BROWSER_PATH?{executablePath:process.env.CAREER_BROWSER_PATH}:{}),headless})}
 async scan(page,config){
  const found=new Map();let next=config.searchUrl;const visited=new Set();
  for(let n=0;next&&n<config.maxSearchPages;n++){
   if(visited.has(next))throw Error('Search pagination cycle');visited.add(next);
   await page.goto(next,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForSelector('a[href*="/vacancy/"], [data-qa="vacancy-serp__vacancy-title"], [data-qa="vacancy-serp__no-results"]',{timeout:20000}).catch(()=>{});
   const data=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,1200),url:location.href,
    links:Array.from(document.querySelectorAll('a[href*="/vacancy/"]')).map(a=>({url:a.href,title:a.innerText})),
    next:document.querySelector('[data-qa="pager-next"]')?.href,
    empty:!!document.querySelector('[data-qa="vacancy-serp__no-results"]')}));
   if(!data.url.includes('/search/vacancy')||/captcha|капч|подтвердите.*человек|доступ.*ограничен/i.test(data.title+' '+data.text))throw Error('HH requires manual login/CAPTCHA or blocked this search');
   for(const link of data.links){const u=new URL(link.url);const m=u.pathname.match(/^\/vacancy\/(\d+)/);if(m&&/(^|\.)hh\.ru$/.test(u.hostname))found.set(m[1],{id:m[1],url:'https://hh.ru/vacancy/'+m[1],title:link.title})}
   if(!found.size&&!data.empty)throw Error('Search has no verified vacancy cards; login or layout check required');
   if(data.next){const u=new URL(data.next);if(!/(^|\.)hh\.ru$/.test(u.hostname)||u.pathname!=='/search/vacancy')throw Error('Unexpected pagination URL');next=u.href}else next=null;
  }
  if(next)throw Error('Search exceeds page limit; refusing incomplete baseline. Narrow the search or increase maxSearchPages.');
  return [...found.values()];
 }
 async tick(config){
  if(this.running||this.loginContext)throw Error('Monitor busy or login browser open');this.running=true;let context;
  try{
   await fs.access(path.join(root,'telegram-token.xml'));await fs.access(path.join(root,'telegram-chat.json'));
   context=await this.context(true);const page=await context.newPage();const rows=await this.scan(page,config);
   if(!this.state.baseline){for(const r of rows)this.state.seen[r.id]='baseline';this.state.baseline=true;this.state.baselineCount=rows.length;}
   else for(const r of rows)if(!this.state.seen[r.id]&&!this.state.pending[r.id])this.state.pending[r.id]={...r,foundAt:new Date().toISOString()};
   await save('monitor-state.json',this.state);
   for(const item of Object.values(this.state.pending).slice(0,config.maxNotificationsPerRun ?? 20)){
    if(this.shuttingDown)break;
    try{
     await deliverNew(this.state,item,notify);
     await new Promise(resolve=>setTimeout(resolve,1100));
     await save('monitor-state.json',this.state);
    }catch(e){item.lastError=e.message;item.attempts=(item.attempts??0)+1;await save('monitor-state.json',this.state)}
   }
   this.state.lastSuccess=new Date().toISOString();this.state.lastError=null;this.state.currentCount=rows.length;
   await save('monitor-state.json',this.state);
  }catch(e){this.state.lastError=e.message;await save('monitor-state.json',this.state);throw e}
  finally{try{await context?.close()}finally{this.running=false}}
 }
 async action(action){
  const config=await json('monitor-config.json');
  if(action==='start'){await fs.access(path.join(root,'telegram-token.xml'));await fs.access(path.join(root,'telegram-chat.json'));config.enabled=true;await save('monitor-config.json',config);this.lastPoll=0;this.maybeRun().catch(()=>{});}
  else if(action==='stop'){config.enabled=false;await save('monitor-config.json',config);}
  else if(action==='check'){if(this.running)throw Error('Already running');this.lastPoll=Date.now();this.tick(config).catch(()=>{});}
  else if(action==='login'){if(this.running)throw Error('Wait for current check to finish');if(!this.loginContext){this.loginContext=await this.context(false);const p=await this.loginContext.newPage();await p.goto(config.searchUrl,{waitUntil:'domcontentloaded'});}}
  else if(action==='login_done'){await this.loginContext?.close();this.loginContext=null;}
  else if(action!=='status')throw Error('Unknown action');
  return {status:describeStatus({...config,running:this.running,loginOpen:!!this.loginContext,lastSuccess:this.state.lastSuccess,lastError:this.state.lastError}),statusNote:'running=false means idle between checks, not stopped. start is a monitor tool action, not Telegram /start.',enabled:config.enabled,intervalMinutes:config.intervalMinutes,running:this.running,loginOpen:!!this.loginContext,baseline:this.state.baseline,baselineCount:this.state.baselineCount,pending:Object.keys(this.state.pending).length,pendingErrors:Object.values(this.state.pending).filter(v=>v.lastError).map(v=>({url:v.url,error:v.lastError})).slice(0,5),lastSuccess:this.state.lastSuccess,lastError:this.state.lastError,analysisError:this.analysis?.error,analysisPending:Object.values(this.analysis?.state.jobs??{}).filter(j=>j.status==='queued').length};
 }
 async close(){this.shuttingDown=true;clearInterval(this.timer);clearInterval(this.callbackTimer);await this.loginContext?.close();if(this.lock){await this.lock.close();await fs.unlink(path.join(root,'monitor.lock')).catch(()=>{});}}
}
async function deliverNew(state,item,send){
 if(!item.notified){
  const title=(item.title || 'Вакансия '+item.id).replace(/\s+/g,' ').trim().slice(0,500);
  await send('Новая вакансия в вашей выдаче HH\n'+title+'\n'+item.url,item.id);
  item.notified=true;
 }
 state.seen[item.id]={decision:'notified',notifiedAt:new Date().toISOString()};
 delete state.pending[item.id];
}
module.exports={Monitor,deliverNew};
