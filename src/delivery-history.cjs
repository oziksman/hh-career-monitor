// The HH search-period filter is authoritative. Legacy date exclusions were
// never delivered and must not permanently suppress a current search result.
function queueSearchRows(state,rows,now=new Date().toISOString()){
 let added=0;
 for(const row of rows){
  const history=state.seen[row.id];
  const previouslyExcluded=history?.decision==='old-publication';
  if((!history||previouslyExcluded)&&!state.pending[row.id]){
   state.pending[row.id]={...row,foundAt:now,publishedAfter:state.lastSuccess||now};added++;
  }
 }
 return added;
}
function prepareSearch(state,rows,revision){
 if(state.baseline&&state.searchRevision===revision)return queueSearchRows(state,rows);
 state.pending={};state.publicationDates={};state.publicationTimes={};
 for(const r of rows)if(!state.seen[r.id]||state.seen[r.id]?.decision==='old-publication')state.seen[r.id]='baseline';
 state.baseline=true;state.baselineCount=rows.length;state.searchRevision=revision;
}
module.exports={queueSearchRows,prepareSearch};
