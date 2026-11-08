import {spawnSync} from 'node:child_process';
const commands=[['scripts/prepare-solver.mjs'],['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']];
for(const args of commands){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
