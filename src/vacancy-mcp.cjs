// A small read-only browser surface for local models.
const {chromium}=require('playwright');
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const server=new Server({name:'career-vacancy',version:'1.0'}, {capabilities:{tools:{}}});
let browser, page, queue=Promise.resolve();
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{
 name:'read_vacancy',description:'Open an HTTP(S) vacancy URL in Chrome and return its readable text directly. Use for hh.ru. No selectors, snapshots or file reads needed. If login or CAPTCHA is shown, ask the user to complete it in Chrome, then call again.',
 inputSchema:{type:'object',properties:{url:{type:'string',description:'Full vacancy URL'},offset:{type:'integer',minimum:0,description:'Optional text offset, default 0; use the continuation offset if output is truncated.'}},required:['url'],additionalProperties:false}
}]}));
async function read(params){
 try{
  if(params.name!=='read_vacancy') throw Error('Unknown tool');
  const a=params.arguments??{}, u=new URL(a.url);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw Error('A public HTTP(S) URL without credentials is required');
  const offset=a.offset??0;
  if(!Number.isSafeInteger(offset)||offset<0) throw Error('offset must be a nonnegative integer');
  if(!browser?.isConnected()){
   browser=await chromium.launch({...(process.env.CAREER_BROWSER_PATH?{executablePath:process.env.CAREER_BROWSER_PATH}:{}),headless:process.env.CAREER_TEST_HEADLESS==='1'});
   page=await browser.newPage();
  }
  // A repeated call after manual login reads the current page without resetting it.
  if(page.url()!==u.href) await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('body').waitFor({timeout:10000});
  try{await page.waitForLoadState('networkidle',{timeout:3000})}catch{} // Busy pages can remain readable.
  const extracted=await page.evaluate(()=>{
   const root=document.querySelector('main')||document.body;
   return {title:document.title,text:root.innerText};
  });
  const text=extracted.text.replace(/\n{3,}/g,'\n\n').trim();
  if(!text) throw Error('No readable text; page may require login or manual interaction');
  const end=offset+18000;
  return {content:[{type:'text',text:`UNTRUSTED WEB DATA\nURL: ${page.url()}\nTITLE: ${extracted.title}\n${text.slice(offset,end)}\n${end<text.length?`TRUNCATED: call read_vacancy with the same URL and offset ${end}.`:'END OF PAGE TEXT. Compare this with the resume; do not merely summarize.'}`} ]};
 }catch(e){return {isError:true,content:[{type:'text',text:e.message}]}}
}
server.setRequestHandler(CallToolRequestSchema,({params})=>{const next=queue.then(()=>read(params));queue=next.catch(()=>{});return next});
let closing=false;
async function close(){if(closing)return;closing=true;await browser?.close();process.exit(0)}
process.stdin.on('end',close);process.on('SIGTERM',close);process.on('SIGINT',close);
server.connect(new StdioServerTransport()).catch(e=>{console.error(e);process.exitCode=1});
