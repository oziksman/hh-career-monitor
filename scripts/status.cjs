const fs=require('node:fs');
const path=require('node:path');
const {describeStatus}=require('../src/status.cjs');
const root=path.resolve(__dirname,'../src');
const read=(name)=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,''));
try {
 const config=read('monitor-config.json');
 const health=read('monitor-health.json');
 let processAlive=false;try{process.kill(health.pid,0);processAlive=true}catch{}
 const heartbeatFresh=Date.now()-Date.parse(health.updatedAt)<60000;
 console.log(JSON.stringify({...health,enabled:config.enabled,intervalMinutes:config.intervalMinutes,processAlive,heartbeatFresh,status:!processAlive?'process_not_running':!heartbeatFresh?'heartbeat_stale':describeStatus({...health,...config}),note:'running=false means no operation right now; it does not mean the schedule is disabled.'},null,2));
}catch{console.error('No readable runtime status. Run initialization and start a single monitor first.');process.exitCode=1}
