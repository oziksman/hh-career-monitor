const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const {Monitor}=require('./monitor-core.cjs');
const monitor=new Monitor();
const ready=monitor.initialize();ready.catch(e=>console.error(e.message));
const server=new Server({name:'career-monitor',version:'1.0'}, {capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{
 name:'monitor',description:'Control the HH new-vacancy notifications (no model analysis): status, start every 15 minutes, stop, check now, login (open separate Chrome for manual HH login), login_done (close login window after user confirms). Requires local Telegram setup. First scan establishes a baseline without old-vacancy notifications. Works only while this MCP process is alive.',
 inputSchema:{type:'object',properties:{action:{type:'string',enum:['status','start','stop','check','login','login_done']}},required:['action'],additionalProperties:false}
}]}));
server.setRequestHandler(CallToolRequestSchema,async({params})=>{try{await ready;if(params.name!=='monitor')throw Error('Unknown tool');return {content:[{type:'text',text:JSON.stringify(await monitor.action(params.arguments?.action))}]}}catch(e){return {isError:true,content:[{type:'text',text:e.message}]}}});
let closing=false;async function close(){if(closing)return;closing=true;await ready.catch(()=>{});await monitor.close();process.exit(0)}
process.stdin.on('end',close);process.on('SIGINT',close);process.on('SIGTERM',close);
server.connect(new StdioServerTransport()).catch(e=>{console.error(e.message);process.exitCode=1});
