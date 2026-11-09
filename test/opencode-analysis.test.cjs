const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseOutput,generate}=require('../src/opencode-analysis.cjs');
const {renderAssessment}=require('../src/opencode-analysis.cjs');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
async function fakeCLI(t,script){
 const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'hh-glm-test-'));
 await fs.mkdir(path.join(runtime,'work'));
 await fs.writeFile(path.join(runtime,'work','run'),script);
 t.after(()=>fs.rm(runtime,{recursive:true,force:true}));
 return {runtime,executable:process.execPath,model:'opencode/glm-5.3-flash-free'};
}
test('quota on stderr rejects promptly even when CLI stays alive',async t=>{
 const config=await fakeCLI(t,"process.stderr.write('Free usage limit reached');setInterval(()=>{},1000)");
 await assert.rejects(generate({messages:[]},config),e=>e.code==='OPENCODE_FREE_QUOTA');
});
test('completed stream returns result without waiting for CLI shutdown',async t=>{
 const config=await fakeCLI(t,`console.log(JSON.stringify({type:'text',part:{text:JSON.stringify({verdict:'Не подходит',conclusion:'Обязателен B2.',letter:''})}}));console.log(JSON.stringify({type:'step_finish',part:{reason:'stop'}}));setInterval(()=>{},1000)`);
 assert.equal(await generate({messages:[]},config),'Вывод: Не подходит. Обязателен B2.');
});
test('renderer suppresses letters for negative verdicts and requires them for positive verdicts',()=>{
 assert.equal(renderAssessment(JSON.stringify({verdict:'Не подходит',conclusion:'Обязателен B2.',letter:'Unwanted letter'})),'Вывод: Не подходит. Обязателен B2.');
 assert.throws(()=>renderAssessment(JSON.stringify({verdict:'Подходит',conclusion:'Совпадает опыт.',letter:''})),/письмо/);
 assert.match(renderAssessment(JSON.stringify({verdict:'Скорее подходит',conclusion:'Совпадает опыт.',letter:'Здравствуйте!'})),/Сопроводительное письмо:/);
 assert.throws(()=>renderAssessment('{bad json'));
});
const events=(...items)=>items.map(x=>JSON.stringify(x)).join('\n');
test('accepts completed text only, not reasoning',()=>{
 assert.equal(parseOutput(events({type:'reasoning',part:{text:'hidden'}},{type:'text',part:{text:'Вывод: Подходит.'}},{type:'step_finish',part:{reason:'stop'}})),'Вывод: Подходит.');
});
test('rejects errors and partial answers instead of sending them',()=>{
 assert.throws(()=>parseOutput(events({type:'error',error:{data:{statusCode:429}}})),/429/);
 assert.throws(()=>parseOutput(events({type:'text',part:{text:'partial'}})),/не завершён/);
 assert.throws(()=>parseOutput(events({type:'step_finish',part:{reason:'stop'}})),/пустой/);
});
test('paid model cannot be selected accidentally',async()=>{
 await assert.rejects(generate({messages:[]},{model:'opencode/glm-5.3-flash'}),/платный fallback/);
});
