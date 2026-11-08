import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const runtime=require.resolve('highs/runtime');
const directory=path.dirname(runtime);
await fs.mkdir('public/solver',{recursive:true});
for(const file of ['highs.mjs','highs.wasm'])await fs.copyFile(path.join(directory,file),path.join('public/solver',file));
await fs.copyFile(path.join(directory,'..','LICENSE'),'public/solver/LICENSE.txt');
await fs.copyFile('lib/engine.mjs','public/engine.mjs');
await fs.mkdir('public/licenses',{recursive:true});
for(const name of ['react','react-dom','lucide-react']){
  const entry=require.resolve(name);
  let root=path.dirname(entry);
  while(!await fs.access(path.join(root,'LICENSE')).then(()=>true,()=>false)){
    const parent=path.dirname(root);
    if(parent===root)throw new Error(`Missing ${name} license`);
    root=parent;
  }
  await fs.copyFile(path.join(root,'LICENSE'),path.join('public/licenses',`${name}.txt`));
}
console.log('Prepared local solver assets and identical browser model.');
