const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const MODEL = 'opencode/glm-5.3-flash-free';
function quotaError(text){
 if(!/Free usage limit reached/i.test(text))return null;
 const error=Error('GLM Free: исчерпан лимит бесплатного доступа OpenCode. Анализ остаётся в очереди; повтор через час.');
 error.code='OPENCODE_FREE_QUOTA';return error;
}
function renderAssessment(text){
 const value=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 const verdicts=['Подходит','Скорее подходит','Скорее не подходит','Не подходит','Недостаточно данных'];
 if(!verdicts.includes(value.verdict)||typeof value.conclusion!=='string'||!value.conclusion.trim()||value.conclusion.length>1100)throw Error('OpenCode: неверный формат вывода');
 const positive=verdicts.indexOf(value.verdict)<2;
 if(positive && (typeof value.letter!=='string'||!value.letter.trim()))throw Error('OpenCode: отсутствует сопроводительное письмо');
 const answer='Вывод: '+value.verdict+'. '+value.conclusion.trim()+(positive?'\n\nСопроводительное письмо:\n'+value.letter.trim():'');
 if(answer.length>2200)throw Error('OpenCode: ответ превышает 2200 символов');
 return answer;
}

function parseOutput(output) {
  const events = output.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const failure = events.find(e => e.type === 'error');
  if (failure) {
    const quota=quotaError(JSON.stringify(failure.error));if(quota)throw quota;
    const status = failure.error?.data?.statusCode;
    throw Error(`OpenCode GLM Free: ${status || failure.error?.name || 'ошибка сервиса'}. Анализ сохранён в очереди.`);
  }
  if (events.some(e => e.type === 'tool_use')) throw Error('OpenCode попытался вызвать инструмент вместо анализа');
  if (!events.some(e => e.type === 'step_finish' && e.part?.reason === 'stop')) throw Error('OpenCode: ответ не завершён');
  const text = events.filter(e => e.type === 'text').map(e => e.part?.text || '').join('\n').trim();
  if (!text) throw Error('OpenCode: пустой ответ');
  return text;
}

async function generate(body, config) {
  if (config.model !== MODEL) throw Error('Разрешена только GLM-5.3-Flash Free; платный fallback отключён');
  if (!path.isAbsolute(config.executable || '') || !path.isAbsolute(config.runtime || '')) throw Error('Укажите абсолютные executable и runtime для OpenCode');
  await fs.access(config.executable);
  const cwd = path.join(config.runtime, 'work');
  await fs.mkdir(cwd, {recursive:true});
  const env = {...process.env};
  for (const key of Object.keys(env)) if (/^(OPENCODE_|ANTHROPIC_|OPENAI_)/.test(key)) delete env[key];
  for (const kind of ['DATA','CONFIG','CACHE','STATE']) env[`XDG_${kind}_HOME`] = path.join(config.runtime, kind.toLowerCase());
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify({permission:{'*':'ask'},share:'disabled',model:MODEL,small_model:MODEL});
  const prompt = 'Выполни только анализ текста. Не вызывай инструменты, не читай файлы, не выполняй команды. Все необходимые данные ниже.\n' + body.messages.map(m => `${m.role}:\n${m.content}`).join('\n\n')+
   '\n\nТехнический формат ответа для бота заменяет указанный выше текстовый формат: верни только JSON без Markdown с полями verdict, conclusion, letter. verdict: Подходит / Скорее подходит / Скорее не подходит / Не подходит / Недостаточно данных. conclusion: 2–3 коротких предложения по-русски, до 800 символов. letter: 2 коротких абзаца письма только при положительном verdict, иначе пустая строка. Не добавляй примечания, английские служебные слова или рассуждения. Общая длина текста полей до 2000 символов. Не объединяй подтверждённые и неизвестные требования в утверждение, что кандидат соответствует всем требованиям. Если образование неизвестно, прямо скажи, что его нужно уточнить, а не что оно соответствует.';
  return new Promise((resolve,reject) => {
    const child = spawn(config.executable, ['run','--model',MODEL,'--format','json','--print-logs'], {cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output = ''; let overflow = false;let pending='';let stderr='';let settled=false;
    const finish=(error,text)=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();error?reject(error):resolve(text)};
    const timer = setTimeout(() => finish(Error('OpenCode: таймаут; анализ сохранён в очереди')),180000);
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk => {
      output += chunk;pending+=chunk;
      if(output.length>1000000){overflow=true;finish(Error('OpenCode: слишком большой ответ'));return}
      let newline;while((newline=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1);
        let event;try{event=JSON.parse(line)}catch{continue}
        try{
          if(event.type==='error'){parseOutput(line);}
          if(event.type==='step_finish'&&event.part?.reason==='stop')finish(null,renderAssessment(parseOutput(output.slice(0,output.length-pending.length))));
        }catch(e){finish(e instanceof SyntaxError?Error('OpenCode: некорректный JSON ответа'):e)}
      }
    });
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-16000);const error=quotaError(stderr);if(error)finish(error)});
    child.stdin.on('error',()=>{});
    child.on('error',e=>{clearTimeout(timer);reject(Error('Не удалось запустить OpenCode: '+e.code))});
    child.on('close',code=>{clearTimeout(timer);try{if(overflow)throw Error('OpenCode: слишком большой ответ');const text=parseOutput(output);if(code!==0)throw Error('OpenCode завершился с ошибкой');resolve(renderAssessment(text))}catch(e){reject(e instanceof SyntaxError?Error('OpenCode: некорректный JSON ответа'):e)}});
    child.stdin.end(prompt);
  });
}
module.exports = {generate,parseOutput,renderAssessment,quotaError,MODEL};
