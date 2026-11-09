const fs=require('node:fs/promises');
const path=require('node:path');
const {renderAssessment}=require('./opencode-analysis.cjs');

async function route(body,config,{primary,secondary,root,now=Date.now}){
 const fallback=config.fallback;
 const enabled=fallback?.provider==='mistral'&&fallback.model==='ministral-14b-2512'&&fallback.freeTierConfirmed===true;
 const file=path.join(root,'analysis-provider-state.json');
 let state={};try{state=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 if(!enabled || !(state.openCodeRetryAt>now())){
  try{return {text:await primary(body,config),provider:'opencode',model:config.model}}
  catch(e){
   if(!enabled||e.code!=='OPENCODE_FREE_QUOTA')throw e;
   state.openCodeRetryAt=now()+3600000;
   await fs.writeFile(file+'.tmp',JSON.stringify(state));await fs.rename(file+'.tmp',file);
  }
 }
 try{
  const text=await secondary({...body,model:fallback.model,response_format:{type:'json_object'},messages:[...body.messages,{role:'user',content:'Технический формат для бота: верни только JSON с полями verdict, conclusion, letter. verdict: Подходит / Скорее подходит / Скорее не подходит / Не подходит / Недостаточно данных. conclusion: 2–3 коротких предложения по-русски, до 800 символов, без заголовка. letter: два коротких абзаца только при положительной оценке, иначе пустая строка. Общая длина текста полей до 2000 символов. Это уточнение формата, остальные правила анализа действуют. Не выдумывай опыт и не считай неизвестные условия доказанным несоответствием.'}]});
  return {text:renderAssessment(text),provider:'mistral',model:fallback.model};
 }catch{
  const error=Error('Лимит OpenCode исчерпан; резервный Mistral тоже недоступен (ключ, квота, сеть или формат ответа). Задание сохранено, повтор через час.');
  error.code='ANALYSIS_PROVIDERS_UNAVAILABLE';throw error;
 }
}
module.exports={route};
