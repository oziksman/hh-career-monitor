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
 async maybeRun(){const config=await json('monitor-config.json');if(config.enabled&&!this.running&&!this.loginContext&&(this.lastRevision!==config.searchRevision||Date.now()-this.lastPoll>=config.intervalMinutes*60000)){this.lastRevision=config.searchRevision;this.lastPoll=Date.now();await this.tick(config)}}
 async context(headless,minimized=false){return chromium.launchPersistentContext(path.join(root,'monitor-browser'),{...(process.env.CAREER_BROWSER_PATH?{executablePath:process.env.CAREER_BROWSER_PATH}:{}),headless,...(minimized&&!headless?{args:['--start-minimized']}: {})})}
 async scan(page,config){return require('./search-scan.cjs').scanSearch(page,config)}
 async tick(config){
  if(this.running||this.loginContext)throw Error('Monitor busy or login browser open');this.running=true;let context;
  try{
   await fs.access(path.join(root,'telegram-chat.json'));
   const minimized=config.headless===false&&config.startMinimized!==false;
   context=await this.context(config.headless !== false,minimized);const page=context.pages()[0]||await context.newPage();
   if(minimized)this.state.browserWindowState=await require('./browser-window.cjs').minimizeWindow(page);
   const rows=await this.scan(page,config);
   const current=async()=>config.searchRevision===(await json('monitor-config.json')).searchRevision;
   if(!await current())return;
   require('./delivery-history.cjs').prepareSearch(this.state,rows,config.searchRevision);
   await require('./republication.cjs').refreshPublications(this.state,rows,row=>row.searchPublication);
   await save('monitor-state.json',this.state);
   for(const item of Object.values(this.state.pending).filter(item=>require('./republication.cjs').canDeliver(item,rows)).slice(0,config.maxNotificationsPerRun ?? 20)){
    if(this.shuttingDown||!await current())break;
    try{


     await deliverNew(this.state,item,notify);
     await new Promise(resolve=>setTimeout(resolve,1100));
     await save('monitor-state.json',this.state);
    }catch(e){item.lastError=e.message;item.attempts=(item.attempts??0)+1;await save('monitor-state.json',this.state)}
   }
   this.state.lastScanAt=new Date().toISOString();this.state.currentCount=rows.length;this.state.currentIds=rows.map(row=>row.id);
   const errors=this.state.publicationStatus?.errors||[];
   const deliveryErrors=Object.values(this.state.pending).filter(item=>item.lastError&&rows.some(row=>row.id===item.id));
   if(errors.length||deliveryErrors.length){this.state.lastError=`Incomplete check: publication errors ${errors.length}/${rows.length}, delivery errors ${deliveryErrors.length}. `+(errors[0]?.error||deliveryErrors[0]?.lastError||'');}
   else{this.state.lastSuccess=this.state.lastScanAt;this.state.lastError=null;}
   await save('monitor-state.json',this.state);
  }catch(e){this.state.lastError=e.message;await save('monitor-state.json',this.state);throw e}
  finally{try{await context?.close()}finally{this.running=false}}
 }
 async action(action){
  const config=await json('monitor-config.json');
  if(action==='start'){await fs.access(path.join(root,'telegram-chat.json'));config.enabled=true;await save('monitor-config.json',config);this.lastPoll=0;this.maybeRun().catch(()=>{});}
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
  await send((item.republished?'Вакансия переопубликована в вашей выдаче HH\n':'Новая вакансия в вашей выдаче HH\n')+title+'\n'+item.url+(item.publishedOn?'\nОпубликована: '+item.publishedOn:''),item.id);
  item.notified=true;
 }
 state.seen[item.id]={decision:'notified',notifiedAt:new Date().toISOString(),...(item.publishedOn?{publishedOn:item.publishedOn}:{})};
 if(item.publishedOn){state.publicationDates??={};state.publicationDates[item.id]=item.publishedOn;state.publicationTimes??={};if(item.publishedAt)state.publicationTimes[item.id]=item.publishedAt;else delete state.publicationTimes[item.id];}
 delete state.pending[item.id];
}
module.exports={Monitor,deliverNew};
