import {spawnSync} from 'node:child_process';
for(const args of [['scripts/prepare-solver.mjs'],['--test','tests/engine.test.mjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
