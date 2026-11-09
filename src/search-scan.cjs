// HH hydrates and lazy-loads cards after the initial HTML (often only 20).
const {normalizeTimestamp,moscowDay}=require('./publication-filter.cjs');
function snapshot(){
 const scope=document.querySelector('#a11y-main-content')||document;
 const links=[...scope.querySelectorAll('[data-qa="serp-item__title"], [data-qa="vacancy-serp__vacancy-title"]')].map(a=>({url:a.href,title:a.innerText}));
 const heading=document.querySelector('h1')?.innerText||'';
 const totalMatch=heading.match(/(?:Найден[аоы]?\s+)?([\d\s\u00a0\u202f]+)\s+(?:подходящ\S+\s+)?ваканс/i);
 const sizes=[...document.querySelectorAll('[role="combobox"],select')].map(e=>e.innerText||e.value||'');
 const sizeMatch=sizes.map(t=>t.match(/^\s*(\d+)\s*ваканс/i)).find(Boolean);
 const next=document.querySelector('[data-qa="pager-next"]');
 const currentPage=Number(new URL(location.href).searchParams.get('page')||0);
 const numberedNext=[...document.querySelectorAll('a[data-qa="pager-page"]')]
  .map(a=>({href:a.href,page:Number(new URL(a.href).searchParams.get('page'))}))
  .filter(a=>Number.isInteger(a.page)&&a.page>currentPage).sort((a,b)=>a.page-b.page)[0];
 let publications=[];
 try{
  const state=JSON.parse(document.querySelector('template#HH-Lux-InitialState').content.textContent);
  publications=state.vacancySearchResult.vacancies.map(v=>({id:String(v.vacancyId),at:v.publicationTime?.['$']}));
 }catch{} // Missing metadata must not hide new IDs or fabricate a republication.
 return {links,publications,heading,total:totalMatch?Number(totalMatch[1].replace(/\s/g,'')):null,
  pageSize:sizeMatch?Number(sizeMatch[1]):null,next:next?.href||numberedNext?.href||null,
  empty:!!document.querySelector('[data-qa="vacancy-serp__no-results"]'),
  url:location.href,title:document.title,text:document.body.innerText.slice(0,1500)};
}
function rowsFrom(data){
 const rows=new Map();
 const times=new Map();
 for(const entry of data.publications||[]){
  const at=normalizeTimestamp(entry.at);
  times.set(entry.id,times.has(entry.id)&&times.get(entry.id)!==at?null:at);
 }
 for(const link of data.links){
  try{const u=new URL(link.url);const m=u.pathname.match(/^\/vacancy\/(\d+)\/?$/);
   if(m&&/(^|\.)hh\.ru$/.test(u.hostname)&&link.title?.trim()){
    const at=times.get(m[1]);
    rows.set(m[1],{id:m[1],url:'https://hh.ru/vacancy/'+m[1],title:link.title.trim(),...(at?{searchPublication:{day:moscowDay(at),at}}:{})});
   }
  }catch{}
 }
 return [...rows.values()];
}
function validate(data){
 const u=new URL(data.url);
 if(!/(^|\.)hh\.ru$/.test(u.hostname)||u.pathname!=='/search/vacancy')throw Error('HH search redirected: '+u.origin+u.pathname+'; title='+data.title.slice(0,120));
 const marker=(data.title+' '+data.text).match(/captcha|капч|подтвердите.*человек|доступ.*ограничен/i);
 if(marker)throw Error('HH access check: marker='+marker[0].slice(0,100)+'; heading='+(data.heading||'').slice(0,120)+'; cards='+rowsFrom(data).length+'; title='+data.title.slice(0,120));
}
async function scanSearch(page,config){
 const found=new Map(),visited=new Set();let next=config.searchUrl,reportedTotal=null,collectedCards=0;
 const rounds=config.searchLoadRounds??30;
 for(let n=0;next&&n<(config.maxSearchPages??10);n++){
  if(visited.has(next))throw Error('Search pagination cycle');visited.add(next);
  await page.goto(next,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('[data-qa="serp-item__title"], [data-qa="vacancy-serp__vacancy-title"], [data-qa="vacancy-serp__no-results"]',{timeout:20000}).catch(()=>{});
  const pageRows=new Map();let data,previous='',stable=0,complete=false;
  for(let attempt=0;attempt<rounds;attempt++){
   data=await page.evaluate(snapshot);validate(data);
   pageRows.clear(); // HH can replace initial cards during hydration; retain only the current DOM.
   for(const row of rowsFrom(data))pageRows.set(row.id,row);
   if(data.total!==null)reportedTotal=data.total;
   const signature=JSON.stringify([[...pageRows.keys()],data.total,data.pageSize,data.next,data.empty]);
   stable=signature===previous?stable+1:0;previous=signature;
   const target=data.total===null||(data.next&&!data.pageSize)?null:Math.min(data.pageSize||data.total,Math.max(0,data.total-(data.pageSize?n*data.pageSize:found.size)));
   if(stable>=3&&(target===null||pageRows.size>=target)) {complete=true;break;}
   // Scrolling the final card triggers HH's intersection-based lazy loader.
   const cards=page.locator('[data-qa="serp-item__title"], [data-qa="vacancy-serp__vacancy-title"]');
   if(await cards.count())await cards.last().scrollIntoViewIfNeeded();
   await page.keyboard.press('Control+End');
   await page.waitForTimeout(1000);
  }
  if(!complete)throw Error(`Incomplete HH search: loaded ${pageRows.size} cards on page ${n+1}, reported total ${data?.total??'unknown'}; retry required`);
  if(!pageRows.size&&!data.empty)throw Error('HH has no vacancy cards: title='+data.title.slice(0,120)+'; heading='+(data.heading||'').slice(0,120)+'; text='+data.text.slice(0,350));
  collectedCards+=pageRows.size;
  for(const row of pageRows.values())found.set(row.id,row);
  next=data.next;
  if(next){const u=new URL(next);if(!/(^|\.)hh\.ru$/.test(u.hostname)||u.pathname!=='/search/vacancy')throw Error('Unexpected pagination URL');}
 }
 if(next)throw Error('Search exceeds page limit; refusing incomplete scan. Narrow the search or increase maxSearchPages.');
 if(reportedTotal!==null&&(collectedCards<reportedTotal||found.size>reportedTotal))throw Error(`Incomplete HH search: collected ${found.size} of ${reportedTotal}; retry required`);
 return [...found.values()];
}
module.exports={scanSearch,snapshot,rowsFrom};
