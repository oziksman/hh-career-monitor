const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const {setup,encrypt} = require('../scripts/telegram-setup.cjs');

test('pairing requires the private start link and successful delivery before saving',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hh-pair-'));
  const file=path.join(dir,'telegram-chat.json'), token='123:test_token';
  let messages=[], refuse=false, delivered=[];
  const api=async(_,method,body)=>{
    if(method==='getMe')return {username:'test_bot',id:123};
    if(method==='getUpdates')return messages.map(message=>({message}));
    if(refuse)throw Error('delivery failed');
    delivered.push(body.chat_id);
  };
  const protect=async()=>'encrypted-fixture';
  try {
    const begin=await setup('telegram-begin',dir,JSON.stringify({token}),api,protect);
    const request=JSON.stringify({token,code:begin.code}), text='/start '+begin.code;
    messages=[{text:'/start',from:{id:4},chat:{type:'private',id:4}},{text,from:{id:5},chat:{type:'group',id:5}}];
    const finish=()=>setup('telegram-finish',dir,request,api,protect);
    await assert.rejects(finish(),/нажмите/);await assert.rejects(fs.access(file));assert.deepEqual(delivered,[]);
    messages.push({text,from:{id:7},chat:{type:'private',id:7}});
    await finish();const saved=await fs.readFile(file,'utf8');assert.equal(JSON.parse(saved).chatId,'7');assert.deepEqual(delivered,['7']);assert.ok(!saved.includes(token));
    refuse=true;await assert.rejects(finish(),/delivery failed/);assert.equal(await fs.readFile(file,'utf8'),saved);
  } finally {await fs.rm(dir,{force:true,recursive:true})}
});
