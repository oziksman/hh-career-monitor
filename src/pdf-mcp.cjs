// Local read-only PDF tool. No shell interpolation or network requests.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const run = promisify(execFile);
const server = new Server({name:'career-pdf',version:'1.0.0'}, {capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema, async () => ({tools:[{
  name:'read_pdf',
  description:'Read a local PDF resume or document as text with page numbers. Use this instead of read for every PDF, including attached PDFs. No OCR: scanned pages are reported. Returns 5 pages per call, with continuation instructions.',
  inputSchema:{type:'object',properties:{
    file_path:{type:'string',description:'Absolute local path of the PDF, including an attachment path.'},
    start_page:{type:'integer',minimum:1,description:'First page, starting at 1. Optional; defaults to 1.'},
    offset:{type:'integer',minimum:0,description:'Character offset within these five pages. Optional; defaults to 0. Follow TRUNCATED instructions.'}
  },required:['file_path'],additionalProperties:false}
}, {
  name:'read_profile',
  description:'Read the user-provided career profile, factual limits, real work examples, cover-letter/interview preferences and application history. Omit section to list headings, then pass one exact heading. Historical details may be stale.',
  inputSchema:{type:'object',properties:{section:{type:'string',description:'Exact section heading. Omit to list sections.'}},additionalProperties:false}
}]}));
server.setRequestHandler(CallToolRequestSchema, async ({params}) => {
  try {
    if(params.name === 'read_profile') {
      const text=await fs.readFile(path.join(__dirname,'profile.txt'),'utf8');
      const headings=[...text.matchAll(/^[А-ЯЁA-Z][А-ЯЁA-Z0-9 ,—-]+\r?$/gm)];
      const section=params.arguments?.section;
      if(section===undefined || section==='') return {content:[{type:'text',text:'USER PROFILE SECTIONS:\n'+headings.map(h=>h[0].trim()).join('\n')}]};
      const index=headings.findIndex(h=>h[0].trim()===section);
      if(index<0) throw Error('Unknown profile section. Call read_profile without section to list headings.');
      return {content:[{type:'text',text:'USER-PROVIDED CONTEXT. Historical facts may be stale; resolve conflicts explicitly.\n'+text.slice(headings[index].index,headings[index+1]?.index ?? text.length)}]};
    }
    if(params.name !== 'read_pdf') throw Error('Unknown tool');
    const a=params.arguments ?? {};
    if(typeof a.file_path !== 'string' || !path.isAbsolute(a.file_path)) throw Error('file_path must be an absolute local path');
    const start=a.start_page ?? 1, offset=a.offset ?? 0;
    if(!Number.isSafeInteger(start) || !Number.isSafeInteger(offset) || start<1 || offset<0 || start>100000) throw Error('start_page and offset must be integers; start_page >= 1, offset >= 0');
    const real=await fs.realpath(a.file_path);
    if(!(await fs.stat(real)).isFile()) throw Error('Not a regular file');
    const {stdout}=await run((process.env.CAREER_PYTHON || 'python'),[
      path.join(__dirname,'read_pdf.py'),real,'--start',String(start),'--end',String(start+4),'--offset',String(offset)
    ],{encoding:'utf8',timeout:30000,maxBuffer:256*1024,windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    return {content:[{type:'text',text:stdout}]};
  } catch(e) {
    return {isError:true,content:[{type:'text',text:String(e.stderr || e.message).slice(0,2000)}]};
  }
});
server.connect(new StdioServerTransport()).catch(e=>{console.error(e);process.exitCode=1});
