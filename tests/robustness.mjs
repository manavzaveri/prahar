// Adversarial audit. Enumeration uses its own arithmetic and feasibility logic.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import {example,optimize,measure,validate,clone} from '../lib/engine.mjs';
const highs=await loadHighs();
const failures=[],checks=[];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
let seed=6132026;
const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);};

function enumerate(s,coordinated){
 let best=Infinity,valid=0;
 const starts={};
 function visit(i){
  if(i<s.jobs.length){const j=s.jobs[i];for(const t of j.locked?[j.original_start]:Array.from({length:j.deadline_slot-j.duration_slots-j.earliest_slot+1},(_,k)=>k+j.earliest_slot)){starts[j.id]=t;visit(i+1);}return;}
  const loads=new Map(s.units.map(u=>[u.id,[...u.fixed_kw]])),machines=new Map();
  for(const j of s.jobs){const key=j.unit+'|'+j.machine;if(!machines.has(key))machines.set(key,Array(96).fill(0));for(let k=starts[j.id];k<starts[j.id]+j.duration_slots;k++){loads.get(j.unit)[k]+=j.power_kw;machines.get(key)[k]++;}}
  if([...machines.values()].some(p=>p.some(x=>x>1)))return;
  if(s.units.some(u=>loads.get(u.id).some(x=>x>u.capacity_kw+1e-6)))return;
  const cluster=Array.from({length:96},(_,k)=>[...loads.values()].reduce((a,p)=>a+p[k],0));
  if(coordinated&&cluster.some(x=>x>s.feeder_limit_kw+1e-6))return;
  const cost=cluster.reduce((a,x,k)=>a+x*s.tariff[k]/4,0);best=Math.min(best,cost);valid++;
 }
 visit(0);return{cost:best,valid};
}
async function check(name,fn){try{const data=await fn();checks.push({name,...data});}catch(e){failures.push({name,error:e.message});}}

let randomFeasible=0,randomInfeasible=0;
await check('60 seeded small scenarios against separate exhaustive arithmetic',()=>{
 for(let c=0;c<60;c++){
  const s=example();s.units=s.units.slice(0,2).map(u=>({...u,capacity_kw:3+rand(7),fixed_kw:Array.from({length:96},(_,k)=>k<6?rand(3):0)}));
  s.tariff=Array.from({length:96},(_,k)=>k<6?rand(13):8);
  s.feeder_limit_kw=2+rand(11);
  s.jobs=Array.from({length:3},(_,i)=>{const duration=1+rand(3),earliest=rand(2),deadline=5+rand(2);return{id:'J'+i,unit:'F'+(1+rand(2)),name:'Test job',machine:'M'+rand(2),power_kw:1+rand(4),duration_slots:duration,earliest_slot:earliest,deadline_slot:deadline,original_start:earliest+rand(deadline-duration-earliest+1),locked:rand(5)===0};});
  assert.deepEqual(validate(s),[]);
  const outcomes=[];
  for(const coordinated of [false,true]){
   const truth=enumerate(s,coordinated),r=optimize(s,coordinated,highs);outcomes.push(r);
   if(!truth.valid){assert.equal(r.status,'infeasible',`case ${c}`);randomInfeasible++;}
   else{assert.equal(r.status,'optimal',`case ${c}`);close(r.energy_charge_inr,truth.cost);assert.equal(r.violations.length,0);randomFeasible++;}
  }
  if(outcomes[1].starts)assert.ok(outcomes[1].energy_charge_inr+1e-5>=outcomes[0].energy_charge_inr);
 }
 return{scenarios:60,solves:120,feasible:randomFeasible,infeasible:randomInfeasible};
});

await check('manual staggering matches the default optimum',()=>{
 const s=example(),starts=Object.fromEntries(s.jobs.map((j,i)=>[j.id,i<3?36:44])),m=measure(s,starts),r=optimize(s,true,highs);
 close(m.energy_charge_inr,r.energy_charge_inr);assert.equal(m.cluster_peak_kw,140);assert.equal(m.feeder_exceedance_slots,0);
 return{starts,energy_charge_inr:m.energy_charge_inr,peak_kw:m.cluster_peak_kw,implication:'The default example alone cannot justify a software fee.'};
});
await check('zero prices preserve workload and do not create savings',()=>{
 const s=example();s.tariff=Array(96).fill(0);const r=optimize(s,true,highs);assert.equal(r.status,'optimal');close(r.energy_charge_inr,0);close(r.energy_kwh,1500);return{status:r.status};
});
await check('a full-day job ends exactly at midnight',()=>{
 const s=example();s.units=s.units.slice(0,1);s.jobs=[{...s.jobs[0],earliest_slot:0,deadline_slot:96,duration_slots:96,original_start:0}];const r=optimize(s,true,highs);assert.equal(r.status,'optimal');assert.equal(r.starts[s.jobs[0].id],0);close(r.energy_kwh,960);return{status:r.status};
});
await check('exact capacity passes and one extra declared kW fails when locked',()=>{
 const s=example('locked');s.feeder_limit_kw=200;assert.equal(optimize(s,true,highs).status,'optimal');s.feeder_limit_kw=199;assert.equal(optimize(s,true,highs).status,'infeasible');return{};
});
await check('price scaling and factory order do not change the minimum cost',()=>{
 const s=example(),r=optimize(s,true,highs),t=clone(s);t.tariff=t.tariff.map(x=>x*3);close(optimize(t,true,highs).energy_charge_inr,3*r.energy_charge_inr);t.tariff=s.tariff;t.units.reverse();t.jobs.reverse();close(optimize(t,true,highs).energy_charge_inr,r.energy_charge_inr);return{};
});
await check('malformed and out-of-scope inputs fail before solving',()=>{
 const mutations=[s=>s.units.push(...Array(6).fill(s.units[0])),s=>s.jobs.push(...Array(16).fill(s.jobs[0])),s=>s.tariff[0]=-1,s=>s.tariff[0]=Infinity,s=>s.units[0].fixed_kw[0]=NaN,s=>s.jobs[0].duration_slots=0,s=>s.jobs[0].original_start=95,s=>s.feeder_limit_kw=0];
 for(const mutation of mutations){const s=example();mutation(s);assert.ok(validate(s).length);assert.throws(()=>optimize(s,true,highs));}return{mutations:mutations.length};
});
await check('supported size boundary: ten factories and twenty activities',()=>{
 const s=example();s.units=Array.from({length:10},(_,i)=>({id:'F'+i,name:'Factory '+i,capacity_kw:20,fixed_kw:Array(96).fill(1)}));
 s.jobs=s.units.flatMap(u=>Array.from({length:2},(_,i)=>({id:u.id+'J'+i,unit:u.id,name:'Boundary activity',machine:'M',power_kw:4,duration_slots:4,earliest_slot:0,deadline_slot:96,original_start:i*4,locked:false})));
 s.feeder_limit_kw=30;
 const start=performance.now(),r=optimize(s,true,highs),ms=performance.now()-start;
 assert.ok(['optimal','not_proven'].includes(r.status));if(r.starts){assert.equal(r.violations.length,0);assert.equal(r.feeder_exceedance_slots,0);close(r.energy_kwh,320);}
 return{status:r.status,elapsed_ms:Math.round(ms),tie_break_proven:r.tie_break_proven??false};
});
const report={date:'2026-11-13',scope:'Node/WASM engine audit, not a browser or factory safety certification.',passed_groups:checks.length,checks,failures};
await fs.mkdir('docs/stress-test',{recursive:true});await fs.writeFile('docs/stress-test/engine-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
