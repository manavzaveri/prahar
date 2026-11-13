/* PRAHAR browser scheduling model. Authored application logic; solver: HiGHS (MIT).
 * Monetary values are ENERGY CHARGES ONLY. This model does not calculate kVAh,
 * monthly demand charges, taxes, carbon credits or automatic network payments.
 */
export const N = 96;
export const DT = 0.25;
export const MODES = ['current', 'independent', 'coordinated'];
export const clone = x => JSON.parse(JSON.stringify(x));
const finite = x => typeof x === 'number' && Number.isFinite(x);
const sum = x => x.reduce((a,b)=>a+b,0);

export function timeLabel(t) {
  return `${String(Math.floor(t/4)).padStart(2,'0')}:${String((t%4)*15).padStart(2,'0')}`;
}
export function parseTime(value) {
  const m=/^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!m || +m[1]>24 || +m[2]>59 || +m[2]%15 || (+m[1]===24 && +m[2]!==0))
    throw new Error('Use a time in 15-minute intervals, from 00:00 to 24:00.');
  return +m[1]*4+(+m[2])/15;
}

export function example(key='headroom') {
  const units=Array.from({length:5},(_,i)=>({id:`F${i+1}`,name:`Foundry ${String(i+1).padStart(2,'0')}`,capacity_kw:100,fixed_kw:Array(N).fill(10)}));
  const s={version:1,name:'Shared headroom',provenance:'Simulated example: five fictional foundries. All loads, operating windows, capacity limits and prices are illustrative; no factory measurements or official tariff are used.',
    units,jobs:units.map(u=>({id:`${u.id}-A1`,unit:u.id,name:'Eligible auxiliary activity',machine:'auxiliary',power_kw:30,duration_slots:8,earliest_slot:36,deadline_slot:84,original_start:72,locked:false})),
    tariff:Array.from({length:N},(_,k)=>k>=36&&k<68?6:k>=68?10:8),feeder_limit_kw:140};
  if(key==='tight'){s.name='Tighter supply';s.feeder_limit_kw=90;}
  if(key==='flat'){s.name='Flat price control';s.tariff=Array(N).fill(8);}
  if(key==='locked'){s.name='No movable activities';s.jobs.forEach(j=>j.locked=true);}
  if(key==='ample'){s.name='Ample supply control';s.feeder_limit_kw=220;}
  return s;
}

export function validate(s) {
  const errors=[];
  if(!s||typeof s!=='object'||Array.isArray(s)) return ['Import a PRAHAR scenario object.'];
  if(s.version!==1)errors.push('Scenario version must be 1.');
  if(typeof s.name!=='string'||s.name.length>120)errors.push('Scenario name is required (maximum 120 characters).');
  if(typeof s.provenance!=='string'||!s.provenance.trim()||s.provenance.length>3000)errors.push('Describe the data source and whether it is simulated (maximum 3,000 characters).');
  if(!finite(s.feeder_limit_kw)||s.feeder_limit_kw<=0||s.feeder_limit_kw>1000000)errors.push('Shared supply limit must be a positive number, up to 1,000,000 kW.');
  if(!Array.isArray(s.tariff)||s.tariff.length!==N||s.tariff.some(x=>!finite(x)||x<0||x>10000))errors.push('Provide 96 finite, non-negative energy prices in INR/kWh, up to 10,000.');
  if(!Array.isArray(s.units)||s.units.length<1||s.units.length>10)errors.push('This prototype supports 1 to 10 factories.');
  if(!Array.isArray(s.jobs)||s.jobs.length>20)errors.push('This prototype supports up to 20 activities.');
  if(errors.length) return errors;
  const unitIds=new Set();
  for(const u of s.units){
    if(!u||typeof u!=='object'){errors.push('Every factory must be an object.');continue;}
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(u.id||'')||unitIds.has(u.id))errors.push('Factory IDs must be unique letters/numbers/hyphens/underscores, up to 32 characters.');
    unitIds.add(u.id);
    if(typeof u.name!=='string'||!u.name.trim()||u.name.length>80)errors.push(`Factory ${u.id}: a name of up to 80 characters is required.`);
    if(!finite(u.capacity_kw)||u.capacity_kw<=0||u.capacity_kw>1000000)errors.push(`Factory ${u.id}: capacity must be positive and at most 1,000,000 kW.`);
    if(!Array.isArray(u.fixed_kw)||u.fixed_kw.length!==N||u.fixed_kw.some(x=>!finite(x)||x<0||x>1000000))errors.push(`Factory ${u.id}: provide 96 non-negative fixed-load values (kW).`);
  }
  const ids=new Set();
  for(const j of s.jobs){
    if(!j||typeof j!=='object'){errors.push('Every activity must be an object.');continue;}
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(j.id||'')||ids.has(j.id))errors.push('Activity IDs must be unique letters/numbers/hyphens/underscores, up to 32 characters.');
    ids.add(j.id);
    if(!unitIds.has(j.unit))errors.push(`${j.id}: unknown factory.`);
    if(typeof j.name!=='string'||j.name.length>120)errors.push(`${j.id}: activity name must be text up to 120 characters.`);
    if(typeof j.machine!=='string'||!j.machine.trim()||j.machine.length>80)errors.push(`${j.id}: give the machine/resource a name of up to 80 characters.`);
    if(!finite(j.power_kw)||j.power_kw<=0||j.power_kw>1000000)errors.push(`${j.id}: power must be positive and at most 1,000,000 kW.`);
    for(const p of ['duration_slots','earliest_slot','deadline_slot','original_start'])if(!Number.isInteger(j[p]))errors.push(`${j.id}: ${p} must use whole 15-minute slots.`);
    if(!(j.duration_slots>=1&&j.duration_slots<=N&&j.earliest_slot>=0&&j.deadline_slot<=N&&j.earliest_slot+j.duration_slots<=j.deadline_slot))errors.push(`${j.id}: duration does not fit the permitted window.`);
    if(!(j.original_start>=j.earliest_slot&&j.original_start+j.duration_slots<=j.deadline_slot))errors.push(`${j.id}: original start must fit its permitted window and finish by the deadline.`);
    if(typeof j.locked!=='boolean')errors.push(`${j.id}: locked must be true or false.`);
  }
  return [...new Set(errors)];
}

export function measure(s, starts) {
  const errors=validate(s);if(errors.length)throw new Error(errors.join(' '));
  if(Object.keys(starts).length!==s.jobs.length||s.jobs.some(j=>!(j.id in starts)))throw new Error('Every activity must appear exactly once.');
  const loads=Object.fromEntries(s.units.map(u=>[u.id,[...u.fixed_kw]]));
  const occupancy=new Map();const violations=[];
  for(const j of s.jobs){
    const t=starts[j.id];
    if(!Number.isInteger(t)||t<j.earliest_slot||t+j.duration_slots>j.deadline_slot)throw new Error(`Activity ${j.id} is outside its operating window.`);
    if(j.locked&&t!==j.original_start)throw new Error(`Activity ${j.id} must keep its original time.`);
    const key=JSON.stringify([j.unit,j.machine]);if(!occupancy.has(key))occupancy.set(key,Array(N).fill(0));
    for(let k=t;k<t+j.duration_slots;k++){loads[j.unit][k]+=j.power_kw;occupancy.get(key)[k]++;}
  }
  for(const [key,occ]of occupancy)if(occ.some(x=>x>1))violations.push(`Machine overlap: ${JSON.parse(key).join(' / ')}`);
  for(const u of s.units)if(loads[u.id].some(x=>x>u.capacity_kw+1e-6))violations.push(`Factory capacity: ${u.name}`);
  const cluster=Array.from({length:N},(_,k)=>sum(s.units.map(u=>loads[u.id][k])));
  const per_unit=Object.fromEntries(s.units.map(u=>[u.id,{energy_kwh:sum(loads[u.id])*DT,energy_charge_inr:sum(loads[u.id].map((p,k)=>p*s.tariff[k]*DT)),peak_kw:Math.max(...loads[u.id])}]));
  return {starts,cluster_kw:cluster,unit_kw:loads,per_unit,energy_kwh:sum(cluster)*DT,energy_charge_inr:sum(Object.values(per_unit).map(u=>u.energy_charge_inr)),cluster_peak_kw:Math.max(...cluster),feeder_exceedance_slots:cluster.filter(v=>v>s.feeder_limit_kw+1e-6).length,violations,scope:'Energy charges only; excludes monthly demand charges, kVAh, taxes, duty, fees and carbon payments.'};
}

function terms(coeffs){
  const active=coeffs.map((v,i)=>v?`${v<0?'-':'+'} ${Math.abs(v).toFixed(8)} x${i}`:'').filter(Boolean).join(' ');
  return active||'0 x0';
}

export function makeModel(s, coordinated, costCap=null, tieBreak=false){
  const errors=validate(s);if(errors.length)throw new Error(errors.join(' '));
  const choices=s.jobs.flatMap(j=>(j.locked?[j.original_start]:Array.from({length:j.deadline_slot-j.duration_slots-j.earliest_slot+1},(_,i)=>i+j.earliest_slot)).map(t=>({j,t})));
  if(!choices.length)return {choices,lp:null};
  const costs=choices.map(({j,t})=>j.power_kw*sum(s.tariff.slice(t,t+j.duration_slots))*DT);
  const constraints=[];let row=0;
  function add(coeff,op,rhs){
    if(!coeff.some(Boolean)){
      if((op==='='&&Math.abs(rhs)>1e-7)||(op==='<='&&rhs< -1e-7))throw new Error('INFEASIBLE_FIXED_LOAD');
      return;
    }
    constraints.push(` c${row++}: ${terms(coeff)} ${op} ${rhs.toFixed(8)}`);
  }
  for(const j of s.jobs)add(choices.map(c=>Number(c.j.id===j.id)),'=',1);
  for(const u of s.units)for(let k=0;k<N;k++)add(choices.map(({j,t})=>j.unit===u.id&&t<=k&&k<t+j.duration_slots?j.power_kw:0),'<=',u.capacity_kw-u.fixed_kw[k]);
  const machineKeys=[...new Set(s.jobs.map(j=>JSON.stringify([j.unit,j.machine])))];
  for(const key of machineKeys)for(let k=0;k<N;k++)add(choices.map(({j,t})=>JSON.stringify([j.unit,j.machine])===key&&t<=k&&k<t+j.duration_slots?1:0),'<=',1);
  if(coordinated)for(let k=0;k<N;k++)add(choices.map(({j,t})=>t<=k&&k<t+j.duration_slots?j.power_kw:0),'<=',s.feeder_limit_kw-sum(s.units.map(u=>u.fixed_kw[k])));
  if(costCap!==null)add(costs,'<=',costCap);
  const objective=tieBreak?choices.map(c=>c.t):costs;
  const lp=`Minimize\n objective: ${terms(objective)}\nSubject To\n${constraints.join('\n')}\nBounds\n${choices.map((_,i)=>` 0 <= x${i} <= 1`).join('\n')}\nBinary\n ${choices.map((_,i)=>`x${i}`).join(' ')}\nEnd`;
  return {lp,choices,costs};
}

function startsFrom(result,choices){
  const starts=Object.create(null);for(let i=0;i<choices.length;i++)if(result.Columns?.[`x${i}`]?.Primal>0.5)starts[choices[i].j.id]=choices[i].t;
  return starts;
}

export function optimize(s, coordinated, highs){
  const errors=validate(s);if(errors.length)throw new Error(errors.join(' '));
  if(!s.jobs.length){const m=measure(s,{});return m.violations.length||(coordinated&&m.feeder_exceedance_slots)?{status:'infeasible',reason:'Fixed loads already exceed a declared capacity.'}:{status:'optimal',...m};}
  let model;
  try{model=makeModel(s,coordinated);}catch(e){if(e.message==='INFEASIBLE_FIXED_LOAD')return {status:'infeasible',reason:'Fixed loads already exceed a declared capacity.'};throw e;}
  const opts={output_flag:false,time_limit:12,mip_rel_gap:0,random_seed:0,threads:1};
  const r=highs.solve(model.lp,opts);
  if(String(r.Status).toLowerCase().includes('infeasible'))return {status:'infeasible',reason:'No schedule satisfies all declared machine, time and capacity constraints. Relax an approved constraint or increase available capacity.'};
  if(r.Status!=='Optimal')return {status:'not_proven',reason:`The solver stopped with status ${r.Status}. No optimum is claimed. Reduce the problem size or revise constraints.`};
  const secondary=makeModel(s,coordinated,r.ObjectiveValue+1e-6,true);
  const r2=highs.solve(secondary.lp,opts);
  const best=r2.Status==='Optimal'?r2:r;
  const metrics=measure(s,startsFrom(best,model.choices));
  if(metrics.violations.length||(coordinated&&metrics.feeder_exceedance_slots))throw new Error('The proposed schedule failed the independent feasibility checks.');
  return {status:'optimal',tie_break_proven:r2.Status==='Optimal',...metrics};
}

export function compare(s,highs,progress=()=>{}){
  const errors=validate(s);if(errors.length)throw new Error(errors.join(' '));
  const current={status:'replayed',...measure(s,Object.fromEntries(s.jobs.map(j=>[j.id,j.original_start])))};
  progress('Solving each factory independently');const independent=optimize(s,false,highs);
  progress('Coordinating within the shared limit');const coordinated=optimize(s,true,highs);
  return {current,independent,coordinated};
}

export function csvCell(value){
  let s=String(value??'');if(typeof value==='string'&&/^[\t\r\n ]*[=+\-@]/.test(s))s="'"+s;
  return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s;
}
export function csvText(rows){return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
export function parseCSV(text){
  if(text.length>1000000)throw new Error('CSV is larger than the 1 MB prototype limit.');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell.length)throw new Error('Unexpected quote in CSV.');else quoted=!quoted;}
    else if(!quoted&&ch===','){row.push(cell);cell='';}
    else if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(quoted)throw new Error('CSV contains an unfinished quoted field.');
  row.push(cell);if(row.some(v=>v!==''))rows.push(row);
  if(!rows.length)throw new Error('CSV is empty.');
  const width=rows[0].length;if(rows.some(r=>r.length!==width))throw new Error('Every CSV row must have the same number of columns.');
  rows[0][0]=rows[0][0].replace(/^\uFEFF/,'');return rows;
}
export function jobCSV(s){return csvText([['id','unit','name','machine','power_kw','duration_hours','earliest','deadline','original_start','locked'],...s.jobs.map(j=>[j.id,j.unit,j.name,j.machine,j.power_kw,j.duration_slots/4,timeLabel(j.earliest_slot),timeLabel(j.deadline_slot),timeLabel(j.original_start),j.locked])]);}
export function importJobs(text,s){
  const rows=parseCSV(text),h=rows.shift();
  const expected=['id','unit','name','machine','power_kw','duration_hours','earliest','deadline','original_start','locked'];
  if(h.join(',')!==expected.join(','))throw new Error('Activity CSV headers must match the downloaded template.');
  const jobs=rows.map((row,i)=>{const x=Object.fromEntries(h.map((k,n)=>[k,row[n]]));
    if(!['true','false'].includes(x.locked.toLowerCase()))throw new Error(`Row ${i+2}: locked must be true or false.`);
    for(const k of ['power_kw','duration_hours'])if(!x[k].trim())throw new Error(`Row ${i+2}: ${k} is required.`);
    return {id:x.id,unit:x.unit,name:x.name,machine:x.machine,power_kw:Number(x.power_kw),duration_slots:Number(x.duration_hours)*4,earliest_slot:parseTime(x.earliest),deadline_slot:parseTime(x.deadline),original_start:parseTime(x.original_start),locked:x.locked.toLowerCase()==='true'};});
  const result={...clone(s),jobs,name:'Imported activity scenario',provenance:'User-imported activities with the current factory profiles and tariff settings. Source and simulation status must be specified before reporting results.'};
  const errors=validate(result);if(errors.length)throw new Error(errors.join(' '));return result;
}
export function profileCSV(s){return csvText([['time','tariff_inr_kwh',...s.units.map(u=>`fixed_kw_${u.id}`)],...Array.from({length:N},(_,k)=>[timeLabel(k),s.tariff[k],...s.units.map(u=>u.fixed_kw[k])])]);}
export function importProfiles(text,s){
  const rows=parseCSV(text),h=rows.shift(),expected=['time','tariff_inr_kwh',...s.units.map(u=>`fixed_kw_${u.id}`)];
  if(h.join(',')!==expected.join(','))throw new Error('Profile CSV headers must match the current factories and downloaded template.');
  if(rows.length!==N)throw new Error('Profile CSV must contain all 96 intervals in order.');
  const result=clone(s);
  rows.forEach((row,k)=>{if(row[0]!==timeLabel(k))throw new Error(`Profile row ${k+2}: expected ${timeLabel(k)}.`);if(row.slice(1).some(x=>!x.trim()))throw new Error(`Profile row ${k+2}: numeric values cannot be blank.`);result.tariff[k]=Number(row[1]);result.units.forEach((u,i)=>u.fixed_kw[k]=Number(row[i+2]));});
  result.name='Imported profile scenario';result.provenance='User-imported fixed-load profiles and tariff values with the current activity assumptions. Specify source and simulation status.';
  const errors=validate(result);if(errors.length)throw new Error(errors.join(' '));return result;
}
export function resultCSV(s,r){return csvText([['scenario','status','energy_charge_inr','energy_kwh','cluster_peak_kw','feeder_exceedance_slots','factory_violations','scope'],...MODES.map(mode=>[mode,r[mode].status,r[mode].energy_charge_inr??'',r[mode].energy_kwh??'',r[mode].cluster_peak_kw??'',r[mode].feeder_exceedance_slots??'',r[mode].violations?.join('; ')??r[mode].reason??'','Energy charges only'])]);}
export function scheduleCSV(s,r){return csvText([['scenario','factory','activity','start','finish','power_kw','locked'],...MODES.flatMap(mode=>r[mode].starts?s.jobs.map(j=>[mode,j.unit,j.id,timeLabel(r[mode].starts[j.id]),timeLabel(r[mode].starts[j.id]+j.duration_slots),j.power_kw,j.locked]):[])]);}

const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reportHTML(s,r){
  const e=escapeHTML;
  const rows=MODES.map(mode=>{const m=r[mode];return `<tr><th>${e(mode)}</th><td>${e(m.status)}</td><td>${m.energy_charge_inr?.toFixed(2)??'Unavailable'}</td><td>${m.energy_kwh?.toFixed(2)??'Unavailable'}</td><td>${m.cluster_peak_kw?.toFixed(2)??'Unavailable'}</td><td>${m.feeder_exceedance_slots??'Unavailable'}</td></tr>`;}).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>PRAHAR - simulation report</title><style>body{font:16px/1.6 system-ui;max-width:1050px;margin:40px auto;padding:0 24px;color:#163b30}h1{font-size:36px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:12px;border:1px solid #cddbd5;text-align:left}pre{white-space:pre-wrap;font-size:12px;background:#f2f7f4;padding:18px}aside{padding:18px;border-left:4px solid #1b8f62;background:#f2f7f4}@media print{body{margin:10mm}}</style><h1>PRAHAR simulation report</h1><p>${e(s.name)} · ${new Date().toISOString()}</p><aside>${e(s.provenance)}</aside><h2>Comparison</h2><table><thead><tr><th>Case</th><th>Status</th><th>Energy charge (INR)</th><th>Energy (kWh)</th><th>Cluster peak (kW)</th><th>Supply-limit exceedance slots</th></tr></thead><tbody>${rows}</tbody></table><h2>Scope and assumptions</h2><p>One day, 96 consecutive 15-minute intervals. Activity power is constant throughout its uninterrupted duration. The same required jobs and fixed loads are retained in every comparison. Independent scheduling ignores the shared feeder limit but respects each factory's constraints. Coordination enforces that additional limit. Each solve minimises energy charge and then chooses earliest starts within the proven minimum charge. A non-optimal solver status is not reported as proven optimal.</p><p>Pure time shifting preserves electricity consumption. Energy-charge estimates exclude monthly demand charges, power-factor/kVAh billing, taxes, duties and service fees. Network headroom is not an automatic customer payment. No certified carbon savings or physical production-quality validation is claimed.</p><h2>Constraint observations</h2><ul>${MODES.map(mode=>`<li>${e(mode)}: ${e(r[mode].reason||r[mode].violations?.join('; ')||'No factory or machine violation detected.')}${r[mode].feeder_exceedance_slots?` ${r[mode].feeder_exceedance_slots} shared-limit exceedances.`:''}</li>`).join('')}</ul><h2>Reproducible inputs</h2><pre>${e(JSON.stringify(s,null,2))}</pre><h2>Schedules</h2><pre>${e(scheduleCSV(s,r))}</pre><p>Application model: PRAHAR. Optimisation solver: HiGHS, MIT-licensed, via highs-js. See <a href="https://github.com/lovasoa/highs-js">solver documentation</a>.</p></html>`;
}
