const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright-core');
const {findBrowser} = require('./portable-browser.cjs');
async function login() {
  const root = path.join(__dirname,'../src');
  const cfg = JSON.parse(fs.readFileSync(path.join(root,'monitor-config.json'),'utf8').replace(/^\uFEFF/,''));
  if (!cfg.searchUrl) throw Error('Сначала сохраните ссылку на выдачу в HH-Monitor.exe.');
  if (cfg.enabled) throw Error('Нажмите «Пауза» в панели и дождитесь окончания проверки.');
  const browser = await chromium.launchPersistentContext(path.join(root,'monitor-browser'),{headless:false,executablePath:findBrowser()});
  try {
    const page = browser.pages()[0] || await browser.newPage();
    await page.goto(cfg.searchUrl,{waitUntil:'domcontentloaded'});
    console.log('Войдите в HH, проверьте выдачу и закройте это окно браузера.');
    await new Promise(resolve=>browser.once('close',resolve));
  } finally {await browser.close().catch(()=>{});}
}
login().catch(e=>{console.error(e.message);process.exitCode=1});
