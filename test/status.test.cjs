const {test}=require('node:test');
const assert=require('node:assert/strict');
const {describeStatus}=require('../src/status.cjs');
const base={enabled:true,running:false,loginOpen:false,lastSuccess:'2026-01-01T12:00:00Z',intervalMinutes:15,lastError:null,now:Date.parse('2026-01-01T12:03:00Z')};
test('idle enabled monitor is scheduled, not stopped',()=>assert.equal(describeStatus(base),'waiting_for_next_check'));
test('old successful check cannot imply healthy monitoring',()=>assert.equal(describeStatus({...base,now:Date.parse('2026-01-01T14:00:00Z')}),'stale'));
test('login, disabled schedule and failures have separate states',()=>{
 assert.equal(describeStatus({...base,loginOpen:true}),'waiting_for_login');
 assert.equal(describeStatus({...base,enabled:false}),'disabled');
 assert.equal(describeStatus({...base,lastError:'blocked'}),'error');
});
