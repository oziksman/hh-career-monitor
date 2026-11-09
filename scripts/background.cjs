// Start one monitor using its existing lock and schedule, without an MCP stdin.
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(process.argv[2] || path.join(__dirname,'../src'));
const {Monitor}=require(path.join(root,'monitor-core.cjs'));
const monitor=new Monitor();
let healthTimer;
async function health(){
 const status=await monitor.action('status');
 await fs.writeFile(path.join(root,'monitor-health.json'),JSON.stringify({...status,pid:process.pid,updatedAt:new Date().toISOString()},null,2));
}
async function shutdown(){clearInterval(healthTimer);await monitor.close();process.exit(0)}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
monitor.initialize().then(async()=>{await health();healthTimer=setInterval(()=>health().catch(e=>console.error(e.message)),15000)}).catch(e=>{console.error(e.message);process.exitCode=1});
