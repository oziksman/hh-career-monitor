const readline=require('node:readline/promises');
const {Monitor}=require('../src/monitor-core.cjs');
(async()=>{
 const monitor=new Monitor();
 await monitor.initialize();
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 console.log('Commands: status, start, stop, check, login, login_done, quit. Only one monitor per checkout.');
 try {for await(const line of rl){const action=line.trim();if(action==='quit')break;try{console.log(JSON.stringify(await monitor.action(action),null,2))}catch(e){console.error(e.message)}}}
 finally{rl.close();await monitor.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
