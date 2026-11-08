import loadHighs from './solver/highs.mjs';
import {compare} from './engine.mjs';
let solver;
self.onmessage=async(event)=>{
  const {id,scenario}=event.data;
  try{
    self.postMessage({id,progress:'Loading the local optimisation solver'});
    solver ||= await loadHighs({locateFile:file=>new URL(`./solver/${file}`,import.meta.url).href});
    const started=performance.now();
    const results=compare(scenario,solver,progress=>self.postMessage({id,progress}));
    self.postMessage({id,results,elapsed_ms:Math.round(performance.now()-started)});
  }catch(e){self.postMessage({id,error:e?.message||'The comparison could not be completed.'});}
};
