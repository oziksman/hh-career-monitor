const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function moscowDay(value){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid publication boundary');
 return new Date(date.getTime()+3*3600000).toISOString().slice(0,10);
}
function parsePublication(text){
 const m=text.match(/Вакансия\s+опубликована\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
 if(!m)return null;
 const month=months.indexOf(m[2].toLowerCase());if(month<0)return null;
 const day=`${m[3]}-${String(month+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 const date=new Date(day+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day?day:null;
}
async function readPublication(page,item){
 return (await readPublicationDetails(page,item)).day;
}
function normalizeTimestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const t=Date.parse(value);return Number.isFinite(t)?new Date(t).toISOString():null;
}
function publicationDetails(day,scripts,id){
 const stamps=[];
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){node.forEach(visit);return;}
  if([].concat(node['@type']||[]).includes('JobPosting')&&String(node.identifier?.value)===String(id)){
   const at=normalizeTimestamp(node.datePosted);
   if(at&&(!day||moscowDay(at)===day))stamps.push(at);
  }
  if(node['@graph'])visit(node['@graph']);
 }
 for(const script of scripts){try{visit(JSON.parse(script))}catch{}}
 const unique=[...new Set(stamps)];
 const at=unique.length===1?unique[0]:null;
 return {day:day||(at?moscowDay(at):null),at};
}
async function readPublicationDetails(page,item){
 if(!/^\d+$/.test(item.id))throw Error('Invalid vacancy ID');
 const response=await page.goto('https://hh.ru/vacancy/'+item.id,{waitUntil:'domcontentloaded',timeout:45000});
 if(response&&response.status()>=400)throw Error('HH vacancy HTTP '+response.status());
 const u=new URL(page.url());
 if(u.hostname!=='hh.ru'||u.pathname!=='/vacancy/'+item.id)throw Error('Unexpected vacancy page');
 // The publication timestamp is in the server-rendered JobPosting. Do not
 // depend on the visible footer finishing hydration before reading it.
 const scripts=await page.locator('script[type="application/ld+json"]').allTextContents();
 const structured=publicationDetails(null,scripts,item.id);
 if(structured.at)return structured;
 const line=await page.getByText(/Вакансия\s+опубликована/).first().innerText({timeout:8000});
 const day=parsePublication(line);
 if(!day)throw Error('Publication date unavailable; notification withheld');
 return publicationDetails(day,scripts,item.id);
}
async function approvePublication(state,item,read,now=new Date()){
 if(item.notified)return true;
 const day=await read(item);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!Number.isFinite(Date.parse(day+'T00:00:00Z')))throw Error('Publication date unavailable; notification withheld');
 const cutoff=moscowDay(item.publishedAfter||item.foundAt||now);
 if(day>moscowDay(now))throw Error('Publication date is in the future; notification withheld');
 item.publishedOn=day;
 if(day<cutoff){
  state.seen[item.id]={decision:'old-publication',publishedOn:day,checkedAt:new Date(now).toISOString()};
  delete state.pending[item.id];return false;
 }
 delete item.lastError;return true;
}
module.exports={moscowDay,parsePublication,readPublication,readPublicationDetails,publicationDetails,normalizeTimestamp,approvePublication};
