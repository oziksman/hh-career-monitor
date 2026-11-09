const {moscowDay,normalizeTimestamp}=require('./publication-filter.cjs');
function validDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(day||'')&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day}
async function refreshPublications(state,rows,read,now=new Date().toISOString()){
 state.publicationDates??={};
 state.publicationTimes??={};
 const status={checkedAt:now,checked:0,initialized:0,republished:0,errors:[]};
 for(const row of rows){
  try{
   delete row.publishedOn;delete row.publishedAt;
   const value=await read(row);
   const day=typeof value==='string'?value:value?.day;
   const at=normalizeTimestamp(value?.at);
   if(!validDay(day)||day>moscowDay(now))throw Error('Publication date not verified');
   if(at&&(moscowDay(at)!==day||Date.parse(at)>Date.parse(now)))throw Error('Publication time not verified');
   row.publishedOn=day;status.checked++;
   if(at)row.publishedAt=at;
   const previous=state.publicationDates[row.id];
   const previousAt=normalizeTimestamp(state.publicationTimes[row.id]);
   const newer=at&&previousAt?at>previousAt:day>previous;
   let pending=state.pending[row.id];
   if(pending?.notified)continue;
   // A queued republication is only valid while the current date is newer.
   if(pending?.republished&&!newer){delete state.pending[row.id];pending=null;}
   if(!validDay(previous)){
    state.publicationDates[row.id]=day;status.initialized++;
    if(at)state.publicationTimes[row.id]=at;
   }else if(newer&&state.seen[row.id]&&!pending){
    state.pending[row.id]={...row,republished:true,previousPublishedOn:previous,...(at&&previousAt?{previousPublishedAt:previousAt}:{}),foundAt:now};status.republished++;
   }
   // Upgrading a calendar-day baseline to precise time must never replay it.
   if(at&&!previousAt&&day===previous&&!state.pending[row.id]?.republished)state.publicationTimes[row.id]=at;
   if(state.pending[row.id]){
    state.pending[row.id].publishedOn=day;
    if(at)state.pending[row.id].publishedAt=at;else delete state.pending[row.id].publishedAt;
   }
  }catch(e){status.errors.push({id:row.id,error:e.message.slice(0,160)})}
 }
 state.publicationStatus=status;return status;
}
function canDeliver(item,rows){
 const current=rows.find(row=>row.id===item.id);
 return !!current&&(!item.republished||item.notified||
  (item.previousPublishedAt
   ? !!current.publishedAt&&current.publishedAt===item.publishedAt&&current.publishedAt>item.previousPublishedAt
   : validDay(current.publishedOn)&&current.publishedOn===item.publishedOn&&current.publishedOn>item.previousPublishedOn));
}
module.exports={refreshPublications,canDeliver,validDay};
