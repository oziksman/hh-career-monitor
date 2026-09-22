const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const dir of ['src','scripts','test'])for(const name of fs.readdirSync(path.join(root,dir)))if(name.endsWith('.cjs'))execFileSync(process.execPath,['--check',path.join(root,dir,name)]);
console.log('JavaScript syntax checks passed.');
