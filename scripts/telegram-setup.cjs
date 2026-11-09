const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {spawn} = require('node:child_process');

async function telegram(token, method, body) {
  let result;
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body),
      signal:AbortSignal.timeout(9000), redirect:'error'
    });
    result = await response.json();
  } catch { throw Error('Telegram недоступен. Проверьте сеть и повторите.'); }
  if (!result.ok) {
    if (result.error_code === 401) throw Error('Telegram отклонил токен. Проверьте его в BotFather.');
    if (result.error_code === 409) throw Error('Обновления получает другой сервис. Используйте отдельного бота без webhook.');
    throw Error('Telegram отклонил запрос (' + result.error_code + '). Проверьте, что вы запустили бота в личном чате.');
  }
  return result.result;
}

function encrypt(token) {
  return new Promise((resolve,reject) => {
    const child = spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      '$ErrorActionPreference="Stop"; [Console]::Write((ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force | ConvertFrom-SecureString))'],
      {windowsHide:true,env:{...process.env,PSModulePath:path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules')},stdio:['pipe','pipe','ignore']});
    let encrypted = '';
    child.stdout.on('data', chunk => { encrypted += chunk; });
    const failed = () => reject(Error('Windows не удалось зашифровать токен.'));
    child.on('error', failed);
    child.stdin.on('error', failed);
    child.on('close', code => code === 0 && /^[a-f0-9]+$/i.test(encrypted) ? resolve(encrypted) : failed());
    child.stdin.end(token);
  });
}

async function setup(action,dir,input,api=telegram,protect=encrypt) {
  const {token,code} = JSON.parse(input);
  if (typeof token !== 'string' || !/^\d+:[\w-]+$/.test(token)) throw Error('Вставьте токен, полученный от BotFather.');
  const me = await api(token,'getMe',{});
  const file = path.join(dir,'telegram-chat.json');
  let current;
  try { current = JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'')); }
  catch(e) { if (e.code !== 'ENOENT') throw e; }
  const connected = !!current?.chatId;
  if (action === 'telegram-begin') {
    // Telegram remembers allowed_updates. Enable messages before offering the start link.
    if (!connected) await api(token,'getUpdates',{allowed_updates:['message','callback_query'],timeout:0});
    return {username:me.username,code:randomUUID().replaceAll('-',''),connected};
  }
  if (action !== 'telegram-finish' || !/^[a-f0-9]{32}$/.test(code)) throw Error('Начните подключение заново.');
  let chatId = current?.chatId;
  if (!connected) {
    const updates = await api(token,'getUpdates',{allowed_updates:['message','callback_query'],timeout:0});
    const match = updates.map(update=>update.message).find(m=>m?.chat.type==='private' &&
      String(m.chat.id)===String(m.from?.id) && m.text==='/start '+code);
    if (!match) throw Error('Откройте ссылку на бота, нажмите «Запустить» в Telegram и повторите проверку.');
    chatId = String(match.chat.id);
  }
  const encryptedToken = await protect(token);
  await api(token,'sendMessage',{chat_id:chatId,text:'Проверка HH Monitor: этот чат выбран для уведомлений о вакансиях.'});
  const tmp = file+'.'+randomUUID()+'.tmp';
  try {
    await fs.writeFile(tmp,JSON.stringify({chatId,username:me.username,botId:String(me.id),encryptedToken}),{flag:'wx'});
    await fs.rename(tmp,file);
  } finally { await fs.rm(tmp,{force:true}); }
  return {username:me.username};
}
module.exports={setup,encrypt};
