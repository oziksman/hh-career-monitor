function describeStatus({enabled,running,loginOpen,lastSuccess,intervalMinutes,lastError,now=Date.now()}) {
 if(!enabled)return 'disabled';
 if(loginOpen)return 'waiting_for_login';
 if(lastError)return 'error';
 if(running)return 'busy';
 if(!lastSuccess)return 'waiting_for_first_check';
 const last=Date.parse(lastSuccess);
 if(!Number.isFinite(last)||now-last>Math.max(2*intervalMinutes,5)*60000)return 'stale';
 return 'waiting_for_next_check';
}
module.exports={describeStatus};
