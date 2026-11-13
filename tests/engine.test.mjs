import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import loadHighs from 'highs';
import {example,clone,compare,optimize,measure,validate,timeLabel,parseTime,jobCSV,importJobs,profileCSV,importProfiles,csvText,parseCSV,resultCSV,scheduleCSV,reportHTML,MODES} from '../lib/engine.mjs';
const highs=await loadHighs();
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const defaultResult=compare(example(),highs);

test('default three-way comparison conserves energy and does not invent extra cash',()=>{
  const r=defaultResult;
  for(const mode of MODES){close(r[mode].energy_kwh,1500);assert.equal(r[mode].violations.length,0);}
  close(r.current.energy_charge_inr,12500);close(r.independent.energy_charge_inr,11300);close(r.coordinated.energy_charge_inr,11300);
  close(r.current.cluster_peak_kw,200);close(r.independent.cluster_peak_kw,200);close(r.coordinated.cluster_peak_kw,140);
  assert.equal(r.coordinated.feeder_exceedance_slots,0);
});
test('Python/SciPy and browser/HiGHS cases agree on objective and capacity outcomes',()=>{
  const fixtures=JSON.parse(fs.readFileSync(new URL('./python-parity.json',import.meta.url),'utf8'));
  for(const fixture of fixtures){
    const actual=compare(fixture.scenario,highs);
    for(const mode of MODES){const a=actual[mode],b=fixture.expected[mode];
      if(b.status==='infeasible'){assert.equal(a.status,'infeasible');continue;}
      assert.ok(a.starts,`${fixture.name}/${mode}`);
      for(const k of ['energy_kwh','energy_charge_inr','cluster_peak_kw','feeder_exceedance_slots'])close(a[k],b[k]);
    }
  }
});
test('a refusal retains the original activity start',()=>{const s=example();s.jobs[0].locked=true;const r=compare(s,highs);assert.equal(r.coordinated.starts[s.jobs[0].id],72);assert.equal(r.coordinated.feeder_exceedance_slots,0);});
test('an impossible shared limit returns infeasible without invented metrics',()=>{const s=example();s.feeder_limit_kw=70;const r=optimize(s,true,highs);assert.equal(r.status,'infeasible');assert.equal(r.energy_charge_inr,undefined);});
test('fixed background load above a limit is infeasible',()=>{const s=example();s.feeder_limit_kw=40;assert.equal(optimize(s,true,highs).status,'infeasible');});
test('no movable activities retains the full conflict honestly',()=>{const r=compare(example('locked'),highs);assert.equal(r.coordinated.status,'infeasible');assert.equal(r.independent.feeder_exceedance_slots,8);});
test('flat prices create no energy-charge saving from pure shifting',()=>{const r=compare(example('flat'),highs);close(r.current.energy_charge_inr,r.coordinated.energy_charge_inr);close(r.coordinated.energy_kwh,r.current.energy_kwh);});
test('ample supply creates no coordination premium',()=>{const r=compare(example('ample'),highs);close(r.independent.energy_charge_inr,r.coordinated.energy_charge_inr);close(r.independent.cluster_peak_kw,r.coordinated.cluster_peak_kw);});
test('tight supply exposes coordination cost rather than hiding it',()=>{const r=compare(example('tight'),highs);close(r.coordinated.energy_charge_inr-r.independent.energy_charge_inr,240);close(r.coordinated.cluster_peak_kw,80);assert.equal(r.coordinated.feeder_exceedance_slots,0);});
test('resource exclusivity prevents simultaneous use of one machine',()=>{const s=example();s.units=[s.units[0]];s.feeder_limit_kw=200;s.jobs=[{...s.jobs[0],id:'A',earliest_slot:0,deadline_slot:6,duration_slots:2,original_start:0,power_kw:2},{...s.jobs[0],id:'B',earliest_slot:0,deadline_slot:6,duration_slots:2,original_start:0,power_kw:2}];assert.ok(measure(s,{A:0,B:0}).violations.length);assert.equal(optimize(s,true,highs).violations.length,0);});
test('MILP objective matches an independently enumerated small problem',()=>{const s=example();s.units=[{...s.units[0],capacity_kw:5,fixed_kw:Array(96).fill(1)}];s.feeder_limit_kw=5;s.tariff=[10,8,2,2,7,10,...Array(90).fill(8)];s.jobs=[{...s.jobs[0],id:'A',machine:'M1',power_kw:3,duration_slots:2,earliest_slot:0,deadline_slot:6,original_start:0},{...s.jobs[0],id:'B',machine:'M2',power_kw:2,duration_slots:2,earliest_slot:1,deadline_slot:6,original_start:2}];let best=Infinity;for(let a=0;a<=4;a++)for(let b=1;b<=4;b++){const m=measure(s,{A:a,B:b});if(!m.violations.length&&!m.feeder_exceedance_slots)best=Math.min(best,m.energy_charge_inr);}close(optimize(s,true,highs).energy_charge_inr,best);});
test('empty activity set still checks fixed loads',()=>{const s=example();s.jobs=[];const a=optimize(s,true,highs);assert.equal(a.status,'optimal');close(a.energy_kwh,1200);s.feeder_limit_kw=40;assert.equal(optimize(s,true,highs).status,'infeasible');});
test('invalid powers, duplicate IDs and incomplete profiles are rejected',()=>{const s=example();s.jobs[0].power_kw=-5;assert.ok(validate(s).length);const d=example();d.jobs[1].id=d.jobs[0].id;assert.ok(validate(d).length);const p=example();p.units[0].fixed_kw.pop();assert.ok(validate(p).length);});
test('malformed imported structures produce errors instead of crashing validation',()=>{for(const x of [null,[],{}, {...example(),units:[null]}, {...example(),jobs:[null]}, {...example(),tariff:[]}])assert.ok(validate(x).length);});
test('outside-window schedules and omitted activities fail validation',()=>{const s=example(),starts=Object.fromEntries(s.jobs.map(j=>[j.id,j.original_start]));starts[s.jobs[0].id]=0;assert.throws(()=>measure(s,starts));assert.throws(()=>measure(s,{}));});
test('time conversion covers midnight and rejects off-grid or malformed times',()=>{assert.equal(parseTime('24:00'),96);assert.equal(timeLabel(37),'09:15');for(const x of ['24:15','09:10','99:00','broken'])assert.throws(()=>parseTime(x));});
test('activity CSV round-trips required constraints',()=>{const s=example();const restored=importJobs(jobCSV(s),s);assert.deepEqual(restored.jobs,s.jobs);});
test('profile CSV round-trips all prices and fixed loads',()=>{const s=example();s.units[0].fixed_kw[5]=12.5;s.tariff[10]=7.25;const restored=importProfiles(profileCSV(s),s);assert.deepEqual(restored.tariff,s.tariff);assert.deepEqual(restored.units,s.units);});
test('CSV parser preserves quoted commas, quotes, line breaks and BOM',()=>{const rows=[['a','b'],['hello, world','A "quote"\nand newline']];assert.deepEqual(parseCSV(csvText(rows)),rows);assert.deepEqual(parseCSV('\uFEFFa,b\r\n1,2'),[['a','b'],['1','2']]);});
test('CSV import rejects blank numeric data and off-grid durations',()=>{const s=example();let text=jobCSV(s).replace(',30,2,',',,2,');assert.throws(()=>importJobs(text,s));text=jobCSV(s).replace(',30,2,',',30,0.1,');assert.throws(()=>importJobs(text,s));const profile=profileCSV(s).split('\r\n');profile[1]='00:00,,10,10,10,10,10';assert.throws(()=>importProfiles(profile.join('\r\n'),s));});
test('CSV import rejects missing or reordered time intervals',()=>{const s=example();const rows=profileCSV(s).split('\r\n');rows[2]=rows[2].replace('00:15','00:30');assert.throws(()=>importProfiles(rows.join('\r\n'),s));assert.throws(()=>importProfiles(rows.slice(0,-1).join('\r\n'),s));});
test('CSV exports neutralise spreadsheet formula injection in text cells',()=>{assert.equal(csvText([['=HYPERLINK("bad")']]),'"\'=HYPERLINK(""bad"")"');assert.equal(csvText([[-15]]),'-15');});
test('downloaded report escapes user-provided HTML',()=>{const s=example();s.name='<script>alert(1)</script>';const html=reportHTML(s,defaultResult);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));});
test('infeasible exports leave unavailable metrics blank, not zero',()=>{const s=example('locked'),r=compare(s,highs);const rows=parseCSV(resultCSV(s,r));const row=rows.find(x=>x[0]==='coordinated');assert.equal(row[1],'infeasible');assert.equal(row[2],'');assert.ok(!scheduleCSV(s,r).split('\r\n').some(x=>x.startsWith('coordinated,')));});
test('solver time-limit status never becomes a claimed optimal result',()=>{const r=optimize(example(),true,{solve:()=>({Status:'Time limit reached'})});assert.equal(r.status,'not_proven');assert.equal(r.starts,undefined);});
test('independent post-solve checks reject a corrupted solver schedule',()=>{const solver={solve:()=>({Status:'Optimal',ObjectiveValue:0,Columns:{}})};assert.throws(()=>optimize(example(),true,solver),/Every activity/);});
test('application and worker use the identical authored model',()=>{assert.equal(fs.readFileSync(new URL('../lib/engine.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../public/engine.mjs',import.meta.url),'utf8'));});

test('valid IDs that match object property names survive solving and JSON export',()=>{
  for(const id of ['__proto__','constructor','toString']){
    const s=example();s.jobs=s.jobs.slice(0,1);s.jobs[0].id=id;
    assert.deepEqual(validate(s),[]);
    const r=optimize(s,true,highs);
    assert.equal(r.status,'optimal');
    assert.equal(Object.keys(r.starts).length,1);
    assert.ok(Number.isInteger(r.starts[id]));
    assert.equal(JSON.parse(JSON.stringify(r.starts))[id],r.starts[id]);
  }
});
