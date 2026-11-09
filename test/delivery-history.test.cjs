const {test}=require('node:test');
const assert=require('node:assert/strict');
const {queueSearchRows}=require('../src/delivery-history.cjs');
const {deliverNew}=require('../src/monitor-core.cjs');
test('recover a current legacy date exclusion once, retaining baselines and delivered history',async()=>{
 const state={seen:{a:{decision:'old-publication'},b:{decision:'notified'},c:'baseline-user-cleared',d:'baseline',e:{decision:'old-publication'}},pending:{}};
 const rows=['a','b','c','d'].map(id=>({id,title:id,url:'https://hh.ru/vacancy/'+id}));
 assert.equal(queueSearchRows(state,rows),1);
 assert.deepEqual(Object.keys(state.pending),['a']);
 assert.equal(queueSearchRows(state,rows),0);
 await assert.rejects(deliverNew(state,state.pending.a,async()=>{throw Error('network')}));
 assert.equal(state.seen.a.decision,'old-publication');assert.ok(state.pending.a);
 let sends=0;await deliverNew(state,state.pending.a,async()=>sends++);
 assert.equal(queueSearchRows(state,rows),0);assert.equal(sends,1);
 assert.equal(state.seen.a.decision,'notified');
 assert.equal(state.seen.e.decision,'old-publication');
});
