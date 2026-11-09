// Single-command bridge for the Windows panel. No HTTP server or credentials in output.
const fs=require('node:fs/promises'), path=require('node:path'), os=require('node:os');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.join(os.homedir(),'.dsh','.agent-presets','career-review');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function json(dir,file,optional=false){
 for(let i=0;;i++)try{return JSON.parse((await fs.readFile(path.join(dir,file),'utf8')).replace(/^\uFEFF/,''))}
 catch(e){if(optional&&e.code==='ENOENT')return null;if(i<2&&e instanceof SyntaxError){await wait(60);continue}throw e}
}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true}catch(e){return e.code==='EPERM'}}
function normalizeSearch(value){
 let u;try{u=new URL(value.trim())}catch{throw Error('Вставьте полную ссылку на поиск вакансий HH.')}
 if(u.protocol!=='https:'||!/(^|\.)hh\.ru$/.test(u.hostname)||u.port||u.username||u.password||u.pathname.replace(/\/$/,'')!=='/search/vacancy')throw Error('Нужна ссылка https://hh.ru/search/vacancy с вашими фильтрами.');
 u.pathname='/search/vacancy';u.hash='';u.searchParams.delete('page');u.searchParams.set('search_period','1');u.searchParams.set('order_by','publication_time');u.searchParams.sort();return u.href;
}
async function inspect(dir){
 const [cfg,h,s,lock]=await Promise.all([json(dir,'monitor-config.json'),json(dir,'monitor-health.json',true),json(dir,'monitor-state.json',true),fs.readFile(path.join(dir,'monitor.lock'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e})]);
 const pid=Number(lock),occupied=alive(pid),fresh=occupied&&h?.pid===pid&&Math.abs(Date.now()-Date.parse(h.updatedAt))<60000;
 const last=s?.lastSuccess||h?.lastSuccess, interval=cfg.intervalMinutes||15;
 const error=s?.lastError||h?.analysisError||'';
 const status=!cfg.enabled?'Пауза':!occupied?'Не запущен':!fresh?'Нет свежего статуса процесса':h.loginOpen?'Ожидает входа в HH':h.running?'Проверяет выдачу':error?'Ошибка проверки':(!last||Date.now()-Date.parse(last)>interval*120000)?'Давно не было проверки':'Ожидает следующей проверки';
 return {searchUrl:cfg.searchUrl||'',baselinePending:!!cfg.searchRevision&&cfg.searchRevision!==s?.searchRevision,status,occupied,fresh,enabled:!!cfg.enabled,interval,headless:cfg.headless!==false,last:last||'',count:s?.currentCount??null,checked:s?.publicationStatus?.checked??null,error:String(error).slice(0,360)};
}
async function enable(dir,value){
 const cfg=await json(dir,'monitor-config.json');
 if(cfg.enabled===value)return;
 await writeConfig(dir,{...cfg,enabled:value});
}
async function writeConfig(dir,cfg){
 const f=path.join(dir,'monitor-config.json'),tmp=f+'.panel-'+randomUUID()+'.tmp';
 try{await fs.writeFile(tmp,JSON.stringify(cfg,null,2));await fs.rename(tmp,f)}finally{await fs.rm(tmp,{force:true})}
}
async function command(action,dir,input){
 dir??=require('node:fs').existsSync(path.join(root,'monitor-config.json'))?root:path.resolve(__dirname,'../src');
 if(action==='telegram-begin'||action==='telegram-finish')return require('./telegram-setup.cjs').setup(action,dir,input);
 if(action==='set-url'){
  const url=normalizeSearch(input),cfg=await json(dir,'monitor-config.json');
  let same=false;try{const old=new URL(cfg.searchUrl);same=old.searchParams.get('search_period')==='1'&&old.searchParams.get('order_by')==='publication_time'&&!old.searchParams.has('page')&&normalizeSearch(cfg.searchUrl)===url}catch{}
  if(!same)await writeConfig(dir,{...cfg,searchUrl:url,searchRevision:randomUUID()});
  return inspect(dir);
 }
 if(action==='status')return inspect(dir);
 if(action==='pause'){await enable(dir,false);return inspect(dir)}
 if(action!=='start')throw Error('Неизвестная команда');
 const before=await inspect(dir);
 if(before.occupied&&!before.fresh)throw Error('Файл блокировки занят, но процесс не обновляет статус. Второй монитор не запущен.');
 await enable(dir,true);
 if(before.fresh)return inspect(dir);
 const child=spawn(process.execPath,[path.join(__dirname,'background.cjs'),dir],{detached:true,windowsHide:true,stdio:'ignore'});
 let failure;child.on('error',e=>{failure=e});child.unref();
 for(let i=0;i<30;i++){await wait(250);if(failure)throw failure;const s=await inspect(dir);if(s.fresh)return s}
 throw Error('Монитор не подтвердил запуск. Проверьте установленный пресет и файл блокировки.');
}
if(require.main===module)command(process.argv[2],undefined,['set-url','telegram-begin','telegram-finish'].includes(process.argv[2])?require('node:fs').readFileSync(0,'utf8'):undefined).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.log(JSON.stringify({failure:e.message}));process.exitCode=1});
module.exports={command};
