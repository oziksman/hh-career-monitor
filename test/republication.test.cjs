const {test}=require('node:test');
const assert=require('node:assert/strict');
const {refreshPublications,canDeliver}=require('../src/republication.cjs');
const {deliverNew}=require('../src/monitor-core.cjs');
const now='2026-10-24T18:00:00Z';
const row=()=>({id:'123',title:'Analyst',url:'https://hh.ru/vacancy/123'});
const state=()=>({seen:{123:{decision:'notified'}},pending:{},publicationDates:{123:'2026-10-23'}});
const details=at=>({day:'2026-10-24',at});
test('timestamp migration seeds silently, same-day republication sends once across restart',async()=>{
 const s=state();s.publicationDates['123']='2026-10-24';
 await refreshPublications(s,[row()],async()=>details('2026-10-24T12:00:00+03:00'),now);
 assert.deepEqual(s.pending,{});assert.equal(s.publicationTimes['123'],'2026-10-24T09:00:00.000Z');
 const r=row();await refreshPublications(s,[r],async()=>details('2026-10-24T12:00:01+03:00'),now);
 assert.equal(canDeliver(s.pending['123'],[r]),true);
 await deliverNew(s,s.pending['123'],async()=>{});
 const restored=JSON.parse(JSON.stringify(s));
 await refreshPublications(restored,[row()],async()=>details('2026-10-24T09:00:01Z'),now);
 assert.deepEqual(restored.pending,{});
});
test('same-day timestamps reject regressions, future times and unverified retries',async()=>{
 const s=state();s.publicationDates['123']='2026-10-24';s.publicationTimes={123:'2026-10-24T09:00:00.000Z'};
 for(const at of ['2026-10-24T08:59:59Z','2026-10-24T12:00:00+03:00','2026-10-24T23:00:00+03:00',null]){
  await refreshPublications(s,[row()],async()=>details(at),now);assert.deepEqual(s.pending,{});
 }
 const r=row();await refreshPublications(s,[r],async()=>details('2026-10-24T10:00:00Z'),now);
 await assert.rejects(deliverNew(s,s.pending['123'],async()=>{throw Error('offline')}));
 assert.equal(s.publicationTimes['123'],'2026-10-24T09:00:00.000Z');
 assert.equal(canDeliver(s.pending['123'],[]),false);
 await refreshPublications(s,[r],async()=>{throw Error('captcha')},now);
 assert.equal(canDeliver(s.pending['123'],[r]),false);
 await refreshPublications(s,[r],async()=>details(null),now);assert.deepEqual(s.pending,{});
 await refreshPublications(s,[r],async()=>details('2026-10-24T10:00:00Z'),now);
 assert.equal(canDeliver(s.pending['123'],[r]),true);
});
test('structured publication time belongs to the exact JobPosting and agrees with displayed day',()=>{
 const {publicationDetails}=require('../src/publication-filter.cjs');
 const script=(id,datePosted)=>JSON.stringify({'@graph':[{'@type':'JobPosting',identifier:{value:id},datePosted}]});
 assert.equal(publicationDetails('2026-10-24',[script(123,'2026-10-24T12:00:01+03:00')],'123').at,'2026-10-24T09:00:01.000Z');
 for(const scripts of [[script(999,'2026-10-24T12:00:00Z')],[script(123,'2026-10-23T12:00:00Z')],[script(123,'2026-10-24T12:00:00')],['invalid']]){
  assert.equal(publicationDetails('2026-10-24',scripts,'123').at,null);
 }
});
test('first date capture never replays existing notifications or cleared baseline',async()=>{
 for(const history of [{decision:'notified'},'baseline','baseline-user-cleared']){
  const s={seen:{123:history},pending:{}};
  await refreshPublications(s,[row()],async()=> '2026-10-24',now);
  assert.equal(s.publicationDates['123'],'2026-10-24');assert.deepEqual(s.pending,{});
 }
});
test('a later date sends once with a republication label and commits new date',async()=>{
 const s=state(),r=row();await refreshPublications(s,[r],async()=> '2026-10-24',now);
 assert.equal(s.pending['123'].republished,true);assert.equal(canDeliver(s.pending['123'],[r]),true);
 const messages=[];await deliverNew(s,s.pending['123'],async text=>messages.push(text));
 assert.match(messages[0],/^Вакансия переопубликована/);assert.match(messages[0],/2026-10-24/);
 await refreshPublications(s,[row()],async()=> '2026-10-24',now);
 assert.deepEqual(s.pending,{});assert.equal(s.publicationDates['123'],'2026-10-24');
});
test('unchanged, older, malformed and future dates never trigger republication',async()=>{
 for(const date of ['2026-10-23','2026-10-22',null,'2026-02-30','2026-10-25']){
  const s=state();await refreshPublications(s,[row()],async()=>date,now);
  assert.deepEqual(s.pending,{});assert.equal(s.publicationDates['123'],'2026-10-23');
 }
});
test('failed delivery retries only with a verified current date and current search membership',async()=>{
 const s=state(),r=row();await refreshPublications(s,[r],async()=> '2026-10-24',now);
 await assert.rejects(deliverNew(s,s.pending['123'],async()=>{throw Error('offline')}));
 assert.equal(s.publicationDates['123'],'2026-10-23');
 assert.equal(canDeliver(s.pending['123'],[]),false);
 const unverified=row();await refreshPublications(s,[unverified],async()=>{throw Error('captcha')},now);
 assert.equal(canDeliver(s.pending['123'],[unverified]),false);
 await refreshPublications(s,[r],async()=> '2026-10-24',now);
 assert.equal(canDeliver(s.pending['123'],[r]),true);
});
test('regressed date cancels queued republication without resetting baseline',async()=>{
 const s=state();await refreshPublications(s,[row()],async()=> '2026-10-24',now);
 await refreshPublications(s,[row()],async()=> '2026-10-23',now);
 assert.deepEqual(s.pending,{});assert.equal(s.publicationDates['123'],'2026-10-23');
});
