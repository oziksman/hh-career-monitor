const {test}=require('node:test');const assert=require('node:assert/strict');
const {parsePublication,moscowDay,approvePublication}=require('../src/publication-filter.cjs');
const now=new Date('2026-10-15T07:45:00Z');
test('reads exact JobPosting time without waiting for the visible footer',async()=>{
 const {readPublicationDetails}=require('../src/publication-filter.cjs');
 const page={goto:async()=>({status:()=>200}),url:()=> 'https://hh.ru/vacancy/123',locator:()=>({allTextContents:async()=>[JSON.stringify({'@type':'JobPosting',identifier:{value:123},datePosted:'2026-10-26T10:33:05.751+03:00'})]}),getByText:()=>{throw Error('footer not loaded')}};
 assert.deepEqual(await readPublicationDetails(page,{id:'123'}),{day:'2026-10-26',at:'2026-10-26T07:33:05.751Z'});
 page.goto=async()=>({status:()=>403});await assert.rejects(readPublicationDetails(page,{id:'123'}),/HTTP 403/);
 page.goto=async()=>({status:()=>200});page.url=()=> 'https://hh.ru/account/login';await assert.rejects(readPublicationDetails(page,{id:'123'}),/Unexpected vacancy/);
});
function fixture(){const item={id:'138355705',foundAt:now.toISOString(),publishedAfter:'2026-10-15T07:00:00Z'};return {item,state:{seen:{},pending:{[item.id]:item}}}}
test('parses HH publication line and rejects invalid dates',()=>{
 assert.equal(parsePublication('Вакансия опубликована 12\u00a0октября\u00a02026 в Москве'),'2026-10-12');
 assert.equal(parsePublication('Вакансия опубликована 31 февраля 2026'),null);
 assert.equal(parsePublication('нет даты'),null);
});
test('old vacancy newly appearing in recommendations is suppressed permanently',async()=>{
 const {state,item}=fixture();assert.equal(await approvePublication(state,item,async()=> '2026-10-12',now),false);
 assert.equal(state.seen[item.id].decision,'old-publication');assert.equal(state.pending[item.id],undefined);
});
test('today is eligible; previous day survives crossing Moscow midnight',async()=>{
 const {state,item}=fixture();assert.equal(await approvePublication(state,item,async()=> '2026-10-15',now),true);
 assert.ok(state.pending[item.id]);item.publishedAfter='2026-10-14T20:50:00Z';
 assert.equal(await approvePublication(state,item,async()=> '2026-10-14',new Date('2026-10-14T21:10:00Z')),true);
 assert.equal(moscowDay('2026-10-14T21:10:00Z'),'2026-10-15');
});
test('unknown, failed, future dates remain pending without marking seen',async()=>{
 for(const read of [async()=>null,async()=>{throw Error('CAPTCHA')},async()=> '2026-10-16']){
  const {state,item}=fixture();await assert.rejects(approvePublication(state,item,read,now));assert.ok(state.pending[item.id]);assert.equal(state.seen[item.id],undefined);
 }
});
