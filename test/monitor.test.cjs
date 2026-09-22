const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deliverNew}=require('../src/monitor-core.cjs');
const {validCallback,buttons}=require('../src/telegram-analysis.cjs');
test('delivery failure remains queued; successful retry is not sent twice',async()=>{
 const item={id:'123',title:'Example analyst',url:'https://hh.ru/vacancy/123'};
 const state={seen:{},pending:{123:item}};let calls=0;
 await assert.rejects(()=>deliverNew(state,item,async()=>{throw Error('offline')}));
 assert.equal(state.seen['123'],undefined);assert.ok(state.pending['123']);
 await deliverNew(state,item,async(text,id)=>{assert.ok(text.includes(item.url));assert.equal(id,'123');calls++});
 await deliverNew(state,item,async()=>calls++);
 assert.equal(calls,1);assert.equal(state.pending['123'],undefined);assert.equal(state.seen['123'].decision,'notified');
});
test('only the configured owner and chat can enqueue a numeric vacancy ID',()=>{
 const callback={from:{id:12},message:{chat:{id:12}},data:'analyze:123'};
 assert.ok(validCallback({callback_query:callback},'12'));
 for(const change of [{from:{id:13}},{message:{chat:{id:13}}},{data:'analyze:https://example.com'},{data:'analyze:123;command'}])assert.equal(validCallback({callback_query:{...callback,...change}},12),null);
 assert.equal(buttons('123').inline_keyboard[0][0].callback_data,'analyze:123');
});
