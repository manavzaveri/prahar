
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowDownToLine,ArrowRight,BarChart3,Check,CheckCircle2,ChevronRight,Clock3,Download,FileJson,FlaskConical,Info,Layers3,LockKeyhole,Play,RotateCcw,Settings2,ShieldCheck,TriangleAlert,Upload,X,Zap} from 'lucide-react';
import {clone,example,validate,timeLabel,parseTime,jobCSV,profileCSV,importJobs,importProfiles,resultCSV,scheduleCSV,reportHTML,MODES} from '../lib/engine.mjs';
import type {Scenario,Comparison,Mode,Job,Metric} from '../lib/engine.mjs';

const names:Record<Mode,string>={current:'Original schedule',independent:'Independent scheduling',coordinated:'PRAHAR coordinated'};
const colors:Record<Mode,string>={current:'#b7513c',independent:'#896616',coordinated:'#14764e'};
const money=(n?:number)=>n===undefined?'—':`₹${Math.round(n).toLocaleString('en-IN')}`;
const number=(n?:number)=>n===undefined?'—':n.toLocaleString('en-IN',{maximumFractionDigits:1});
const feasible=(m?:Metric)=>!!m?.starts&&!m.violations?.length&&!m.feeder_exceedance_slots;
function download(name:string,text:string,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function EnergyMark(){return <svg viewBox="0 0 40 40" width="35" height="35" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#163d31"/><path d="M8 28V20h7v8h6V12h7v16h5" fill="none" stroke="#7ce8ba" strokeWidth="3.1" strokeLinejoin="round"/></svg>;}

export function LoadChart({scenario,results}:{scenario:Scenario;results:Comparison}){
  const [hover,setHover]=useState<number|null>(null);
  const W=1080,H=286,L=52,R=18,T=26,B=40,iw=W-L-R,ih=H-T-B;
  const maximum=Math.max(scenario.feeder_limit_kw,...MODES.flatMap(m=>results[m].cluster_kw||[0]));
  const top=Math.max(20,Math.ceil(maximum*1.12/20)*20);
  const minimumRate=Math.min(...scenario.tariff),maximumRate=Math.max(...scenario.tariff);
  const cheapest:{start:number;end:number}[]=[];
  if(maximumRate>minimumRate)for(let k=0;k<96;k++)if(scenario.tariff[k]===minimumRate){const previous=cheapest[cheapest.length-1];if(previous?.end===k)previous.end=k+1;else cheapest.push({start:k,end:k+1});}
  const x=(k:number)=>L+k/96*iw,y=(v:number)=>T+ih-v/top*ih;
  const path=(values:number[])=>values.map((v,k)=>`${k?'L':'M'}${x(k).toFixed(2)},${y(v).toFixed(2)} L${x(k+1).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return <div className="chart-wrap">
    <svg role="img" aria-label="Twenty-four-hour combined factory load. The three schedules are compared with the shared supply limit." viewBox={`0 0 ${W} ${H}`} onMouseLeave={()=>setHover(null)} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(95,Math.floor((((e.clientX-r.left)/r.width)*W-L)/iw*96))));}}>
      {cheapest.map(band=><g key={band.start}><rect x={x(band.start)} y={T} width={x(band.end)-x(band.start)} height={ih} fill="#f0f7ee"/>{band.end-band.start>=20&&<text x={x(band.start)+12} y={T+17} className="chart-note">Lowest declared energy rate</text>}</g>)}
      {Array.from({length:5},(_,i)=>{const v=top*i/4;return <g key={i}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke="#e6ece8"/><text x={L-12} y={y(v)+4} textAnchor="end" className="axis-label">{Math.round(v)}</text></g>;})}
      {[0,3,6,9,12,15,18,21,24].map(h=><text key={h} x={x(h*4)} y={H-13} textAnchor="middle" className="axis-label">{String(h).padStart(2,'0')}:00</text>)}
      <text x={L-11} y={14} className="axis-label" textAnchor="end">kW</text>
      {MODES.map(mode=>results[mode].cluster_kw&&<path key={mode} d={path(results[mode].cluster_kw!)} fill="none" stroke={colors[mode]} strokeWidth={mode==='coordinated'?3:2.1} strokeDasharray={mode==='current'?'5 4':undefined} opacity={mode==='current'?.8:1}/>)}
      <line x1={L} x2={W-R} y1={y(scenario.feeder_limit_kw)} y2={y(scenario.feeder_limit_kw)} stroke="#3c4d46" strokeWidth="1.2" strokeDasharray="3 5"/>
      <rect x={W-193} y={y(scenario.feeder_limit_kw)-20} width="174" height="18" rx="3" fill="white"/>
      <text x={W-25} y={y(scenario.feeder_limit_kw)-7} textAnchor="end" className="limit-label">Supply limit {number(scenario.feeder_limit_kw)} kW</text>
      {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} stroke="#879a90" strokeDasharray="2 4"/>}
    </svg>
    {hover!==null&&<div className="chart-tooltip"><b>{timeLabel(hover)}–{timeLabel(hover+1)}</b>{MODES.map(mode=>results[mode].cluster_kw&&<span key={mode}><i style={{background:colors[mode]}}/>{names[mode]} <strong>{number(results[mode].cluster_kw![hover])} kW</strong></span>)}</div>}
  </div>;
}

function Status({metric}:{metric:Metric}){
  if(!metric.starts)return <span className="status fail"><TriangleAlert size={13}/>{metric.status==='infeasible'?'No feasible schedule':'Optimum not proven'}</span>;
  if(!feasible(metric))return <span className="status warning"><TriangleAlert size={13}/>{metric.violations?.length?'Factory constraint violation':'Shared limit exceeded'}</span>;
  return <span className="status good"><Check size={13}/>Within declared limits</span>;
}

export default function Lab(){
  const [tab,setTab]=useState('overview');const [draft,setDraft]=useState<Scenario>(()=>example());
  const [applied,setApplied]=useState<Scenario|null>(null);const [results,setResults]=useState<Comparison|null>(null);
  const [busy,setBusy]=useState(true);const [progress,setProgress]=useState('Preparing the comparison');
  const [errors,setErrors]=useState<string[]>([]);const [elapsed,setElapsed]=useState(0);const [preset,setPreset]=useState('headroom');
  const [notice,setNotice]=useState('');const [exportsOpen,setExportsOpen]=useState(false);const [guide,setGuide]=useState(false);
  const [validation,setValidation]=useState<{checks:number;date:string}|null>(null);
  const worker=useRef<Worker|null>(null),sequence=useRef(0);
  const dirty=!!applied&&JSON.stringify(draft)!==JSON.stringify(applied);
  const disabled=busy||dirty||!results||!applied;
  const m=results?.coordinated,b=results?.current,ind=results?.independent;

  function run(s:Scenario){
    const inputErrors=validate(s);if(inputErrors.length){setErrors(inputErrors);setBusy(false);return;}
    if(!worker.current)worker.current=new Worker('/solver-worker.js',{type:'module'});
    const id=++sequence.current,snapshot=clone(s);
    setBusy(true);setErrors([]);setProgress('Loading the local optimisation solver');setExportsOpen(false);
    worker.current.onmessage=(event)=>{const data=event.data;if(data.id!==sequence.current)return;
      if(data.progress){setProgress(data.progress);return;}
      setBusy(false);
      if(data.error){setErrors([data.error]);return;}
      setApplied(snapshot);setResults(data.results);setElapsed(data.elapsed_ms);setNotice('');
    };
    worker.current.onerror=()=>{setBusy(false);setErrors(['The local solver could not load. Reload this page or retry the comparison.']);worker.current?.terminate();worker.current=null;};
    worker.current.postMessage({id,scenario:snapshot});
  }
  useEffect(()=>{run(example());fetch('/validation.json').then(r=>r.ok?r.json():null).then((data:unknown)=>{if(data&&typeof data==='object'&&'checks' in data&&'date' in data&&typeof data.checks==='number'&&typeof data.date==='string')setValidation({checks:data.checks,date:data.date});}).catch(()=>{});return()=>{sequence.current++;worker.current?.terminate();worker.current=null;};},[]);
  function edit(fn:(s:Scenario)=>void){setDraft(previous=>{const s=clone(previous);fn(s);return s;});setNotice('');}
  function loadPreset(key:string){const s=example(key);setPreset(key);setDraft(s);setNotice('');run(s);}
  function lockActivity(id:string){const s=clone(draft);const j=s.jobs.find(j=>j.id===id)!;j.locked=!j.locked;setDraft(s);setPreset('custom');run(s);}
  function setJob(id:string,field:keyof Job,value:unknown){edit(s=>{Object.assign(s.jobs.find(j=>j.id===id)!,{[field]:value});});setPreset('custom');}
  function cancel(){sequence.current++;worker.current?.terminate();worker.current=null;setBusy(false);setErrors(['Comparison cancelled. No new result has been accepted.']);}
  async function importFile(file:File|undefined,kind:string){
    if(!file)return;if(file.size>1000000){setErrors(['Please use an input file smaller than 1 MB.']);return;}
    try{const text=await file.text();const s=kind==='jobs'?importJobs(text,draft):kind==='profiles'?importProfiles(text,draft):JSON.parse(text);
      const e=validate(s);if(e.length)throw new Error(e.join(' '));
      setDraft(s);setPreset('custom');setErrors([]);setNotice('Imported locally. Review the inputs and their source before running the comparison.');setTab('inputs');
    }catch(e){setErrors([(e as Error).message||'The file could not be imported.']);}
  }
  function exportResult(kind:string){if(disabled||!results||!applied)return;
    if(kind==='report')download('PRAHAR-simulation-report.html',reportHTML(applied,results),'text/html;charset=utf-8');
    if(kind==='metrics')download('PRAHAR-comparison.csv',resultCSV(applied,results),'text/csv;charset=utf-8');
    if(kind==='schedule')download('PRAHAR-schedules.csv',scheduleCSV(applied,results),'text/csv;charset=utf-8');
    if(kind==='json')download('PRAHAR-run.json',JSON.stringify({application:'PRAHAR v0.1',solver:'HiGHS 1.15.4',inputs:applied,results},null,2),'application/json');
    setExportsOpen(false);
  }

  const costSaving=m?.energy_charge_inr!==undefined&&b?.energy_charge_inr!==undefined?b.energy_charge_inr-m.energy_charge_inr:undefined;
  const additionalCost=m?.energy_charge_inr!==undefined&&ind?.energy_charge_inr!==undefined?m.energy_charge_inr-ind.energy_charge_inr:undefined;
  const peakRelief=m?.cluster_peak_kw!==undefined&&ind?.cluster_peak_kw!==undefined?ind.cluster_peak_kw-m.cluster_peak_kw:undefined;
  const shown=applied||draft;

  return <div className="app-shell">
    <header className="site-header"><a href="#main" className="brand" aria-label="PRAHAR home"><EnergyMark/><span>PRAHAR<small>FACTORY FLEXIBILITY LAB</small></span></a>
      <nav aria-label="Prototype sections">{[{id:'overview',label:'Overview',icon:BarChart3},{id:'inputs',label:'Inputs & passports',icon:Settings2},{id:'evidence',label:'Evidence & scope',icon:ShieldCheck}].map(t=><button key={t.id} className={tab===t.id?'active':''} aria-current={tab===t.id?'page':undefined} onClick={()=>setTab(t.id)}><t.icon size={16}/>{t.label}</button>)}</nav>
      <div className="research-label"><span/>Research prototype</div>
    </header>
    <main id="main" className="main">
      <div className="intro"><div><div className="eyebrow">SMART MANUFACTURING <span>/</span> ROUND 2 PROTOTYPE</div><h1>Factory flexibility, coordinated.</h1><p>Find a workable schedule. See who saves, who moves, and what the network gains.</p></div><button className="text-button" onClick={()=>setGuide(!guide)}><Info size={16}/>{guide?'Hide demo guide':'How to explore'}</button></div>
      {guide&&<div className="guide"><b>A four-minute walkthrough</b><ol><li>Run <strong>Shared headroom</strong> and compare all three schedules.</li><li>Keep one activity at its original time to demonstrate an operator refusal.</li><li>Try <strong>Tighter supply</strong> to reveal the cost of coordination.</li><li>Try <strong>No movable activities</strong> and inspect the honest infeasible result.</li><li>Export a report with the complete inputs and assumptions.</li></ol><button className="icon-button" aria-label="Close demo guide" onClick={()=>setGuide(false)}><X size={18}/></button></div>}
      <div className="simulation-banner"><FlaskConical size={17}/><span><strong>Simulation workspace.</strong> Sample factories, operating limits and prices are illustrative. Results are energy-charge estimates, not full electricity bills or measured factory savings.</span></div>
      <section className="toolbar" aria-label="Scenario controls">
        <label className="scenario-select"><span>SCENARIO</span><select aria-label="Choose example scenario" value={preset} disabled={busy} onChange={e=>loadPreset(e.target.value)}><option value="headroom">Shared headroom</option><option value="tight">Tighter supply</option><option value="flat">Flat price control</option><option value="locked">No movable activities</option><option value="ample">Ample supply control</option>{preset==='custom'&&<option value="custom">Custom scenario</option>}</select></label>
        <label className="supply-setting"><span>SHARED SUPPLY LIMIT <small>kW</small></span><input aria-label="Shared supply limit in kilowatts" type="number" min="1" max="1000000" step="10" value={draft.feeder_limit_kw} disabled={busy} onChange={e=>{edit(s=>s.feeder_limit_kw=Number(e.target.value));setPreset('custom');}}/></label>
        <div className="toolbar-context"><span><Layers3 size={15}/>{draft.units.length} factories</span><span><Clock3 size={15}/>15-minute intervals</span></div>
        <button className="reset-button" disabled={busy} onClick={()=>loadPreset('headroom')} title="Restore the default example"><RotateCcw size={16}/><span>Reset</span></button>
        <button className="primary-button" disabled={busy} onClick={()=>run(draft)}><Play size={15} fill="currentColor"/>{busy?'Comparing…':'Run comparison'}</button>
        <div className="export-container"><button className="secondary-button" disabled={disabled} aria-expanded={exportsOpen} onClick={()=>setExportsOpen(!exportsOpen)}><Download size={16}/>Export</button>{exportsOpen&&<div className="export-menu">{[['report','Readable report (HTML)'],['metrics','Comparison metrics (CSV)'],['schedule','All schedules (CSV)'],['json','Complete run (JSON)']].map(([id,title])=><button key={id} onClick={()=>exportResult(id)}>{title}<ArrowDownToLine size={14}/></button>)}</div>}</div>
      </section>
      {busy&&<div className="run-message" role="status"><span className="spinner"/>{progress}<button onClick={cancel}>Cancel</button></div>}
      {!busy&&dirty&&<div className="dirty-message" role="status"><Info size={16}/>Inputs changed. Results below belong to the previous run. Run comparison to update them; exports are paused.</div>}
      {notice&&<div className="success-message" role="status"><CheckCircle2 size={17}/>{notice}</div>}
      {errors.length>0&&<div className="error-message" role="alert"><TriangleAlert size={19}/><div><b>The comparison needs attention</b><ul>{errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div><button className="icon-button" aria-label="Dismiss input errors" onClick={()=>setErrors([])}><X size={16}/></button></div>}

      {tab==='inputs'&&<div className="simulation-banner"><Info size={17}/><span><strong>Avoid counting the same load twice.</strong> Fixed background profiles must exclude every activity entered in a Flexibility Passport. A whole-factory meter profile cannot be used unchanged as background while adding those activities again.</span></div>}
      {tab==='overview'&&<div className={dirty?'result-area stale':'result-area'}>
        <div className="section-heading"><div><span className="section-kicker">THE COORDINATED PLAN</span><h2>{m?.status==='infeasible'?'The declared limits cannot all be met.':'A clearer picture of the trade-offs.'}</h2></div><div className="run-meta">{results&&!busy?<><span className="live-dot"/>Calculated locally · {(elapsed/1000).toFixed(2)}s</>:<span>Waiting for a completed run</span>}</div></div>
        <div className="metric-grid">
          <article className="metric"><div><span>Energy charge</span><Zap size={17}/></div><strong>{money(m?.energy_charge_inr)}</strong><p>{costSaving!==undefined?<><b>{money(Math.abs(costSaving))} {costSaving>=0?'lower':'higher'}</b> than original</>:'No coordinated result available'}</p></article>
          <article className="metric"><div><span>Combined peak</span><Activity size={18}/></div><strong>{number(m?.cluster_peak_kw)}<small>kW</small></strong><p>{peakRelief!==undefined?<><b>{number(Math.abs(peakRelief))} kW</b> {peakRelief>=0?'below':'above'} independent</>:'Depends on a feasible schedule'}</p></article>
          <article className="metric"><div><span>Shared-limit exceedances</span><ShieldCheck size={18}/></div><strong>{m?.feeder_exceedance_slots??'—'}<small>intervals</small></strong><p>{m?.starts?'Each interval represents 15 minutes':'Infeasibility is shown explicitly'}</p></article>
          <article className="metric"><div><span>Electricity consumed</span><Layers3 size={17}/></div><strong>{number(m?.energy_kwh)}<small>kWh</small></strong><p>{m?.starts?<><b>Unchanged</b> by pure time shifting</>:'No energy reduction is assumed'}</p></article>
        </div>
        <section className="panel chart-panel"><div className="panel-heading"><div><span className="section-kicker">24-HOUR LOAD PROFILE</span><h2>Same work. Different timing.</h2></div><div className="legend">{MODES.map(mode=><span key={mode}><i style={{background:colors[mode]}}/>{mode==='current'?'Original':mode==='independent'?'Independent':'Coordinated'}</span>)}</div></div>
          {results?<LoadChart scenario={shown} results={results}/>:<div className="empty-chart"><Activity size={36}/><p>The actual calculated load profiles will appear here.</p></div>}
          <div className="chart-foot"><span><Info size={15}/><span>The dotted limit applies to the combined load of all factories.<small className="chart-scroll-note">Swipe the chart and tables to see every interval and column.</small></span></span><button className="text-button" onClick={()=>setTab('inputs')}>Inspect the assumptions<ArrowRight size={15}/></button></div>
        </section>
        <section className="panel comparison-panel"><div className="panel-heading"><div><span className="section-kicker">THE COMPARISON THAT MATTERS</span><h2>Separate savings from shared headroom.</h2></div></div><div className="table-scroll"><table className="comparison-table"><thead><tr><th>Scheduling approach</th><th>Energy charge</th><th>Combined peak</th><th>Shared-limit exceedances</th><th>Constraint check</th></tr></thead><tbody>{MODES.map((mode,i)=><tr key={mode} className={mode==='coordinated'?'coordinated-row':''}><th><span className="mode-letter" style={{color:colors[mode]}}>{String.fromCharCode(65+i)}</span>{names[mode]}</th><td>{money(results?.[mode].energy_charge_inr)}</td><td>{number(results?.[mode].cluster_peak_kw)} <small>kW</small></td><td>{results?.[mode].feeder_exceedance_slots??'—'}</td><td>{results?<Status metric={results[mode]}/>:<span className="muted">Awaiting calculation</span>}</td></tr>)}</tbody></table></div>
          {m?.reason?<div className="insight warn"><TriangleAlert size={20}/><div><b>{m.status==='infeasible'?'No coordinated schedule is feasible.':'A proven optimum is unavailable.'}</b><p>{m.reason}</p></div></div>:additionalCost!==undefined&&<div className="insight"><ShieldCheck size={20}/><div><b>{Math.abs(additionalCost)<.01?(peakRelief&&peakRelief>.01?'Coordination adds feasibility, with no extra energy-charge saving in this case.':'Coordination adds no extra benefit in this scenario.'):`Respecting the shared limit costs ${money(additionalCost)} more than independent scheduling.`}</b><p>{Math.abs(additionalCost)<.01?(peakRelief&&peakRelief>.01?'The network gains headroom. This does not create an additional payment to factories.':'The independent schedule already fits the shared limit. The model does not assume a cooperation premium.'):'This is a scheduling trade-off, not an automatic saving. A real incentive arrangement would need an identified payer.'}</p></div></div>}
        </section>
        <section className="panel review-panel"><div className="panel-heading"><div><span className="section-kicker">OPERATOR REVIEW</span><h2>The supervisor keeps the final say.</h2><p>Refuse a move by retaining its original start. The model will recalculate around that decision.</p></div><LockKeyhole size={21} className="panel-symbol"/></div>
          <div className="table-scroll"><table className="review-table"><thead><tr><th>Factory / activity</th><th>Original start</th><th>Coordinated start</th><th>Duration</th><th>Operator decision</th></tr></thead><tbody>{shown.jobs.map(j=><tr key={j.id}><th>{shown.units.find(u=>u.id===j.unit)?.name}<small>{j.id} · {j.name}</small></th><td>{timeLabel(j.original_start)}</td><td className="proposed-time">{m?.starts?.[j.id]!==undefined?timeLabel(m.starts[j.id]):'Unavailable'}</td><td>{j.duration_slots/4} h</td><td><button className={draft.jobs.find(x=>x.id===j.id)?.locked?'lock-button locked':'lock-button'} disabled={busy||dirty} onClick={()=>lockActivity(j.id)}>{draft.jobs.find(x=>x.id===j.id)?.locked?<><LockKeyhole size={14}/>Original time retained</>:<>Keep original time<ChevronRight size={14}/></>}</button></td></tr>)}</tbody></table></div>
        </section>
        {results&&<section className="panel factory-panel"><div className="panel-heading"><div><span className="section-kicker">INDIVIDUAL OUTCOMES</span><h2>Every factory has its own calculation.</h2></div></div><div className="table-scroll"><table><thead><tr><th>Factory</th><th>Original charge</th><th>Independent charge</th><th>Coordinated charge</th><th>Change vs independent</th></tr></thead><tbody>{shown.units.map(u=>{const a=results.current.per_unit?.[u.id]?.energy_charge_inr,b=results.independent.per_unit?.[u.id]?.energy_charge_inr,c=results.coordinated.per_unit?.[u.id]?.energy_charge_inr;return <tr key={u.id}><th>{u.name}</th><td>{money(a)}</td><td>{money(b)}</td><td>{money(c)}</td><td className={c!==undefined&&b!==undefined&&c>b+.01?'cost-increase':''}>{c!==undefined&&b!==undefined?`${c-b>.01?'+':''}${money(c-b)}`:'—'}</td></tr>;})}</tbody></table></div></section>}
      </div>}

      {tab==='inputs'&&<div className="inputs-area">
        <div className="section-heading"><div><span className="section-kicker">EDITABLE ASSUMPTIONS</span><h2>Make the constraints explicit.</h2><p>All activity times use 15-minute intervals. Activities run without interruption.</p></div><button className="secondary-button" onClick={()=>download('PRAHAR-scenario.json',JSON.stringify(draft,null,2),'application/json')}><FileJson size={16}/>Save inputs</button></div>
        <section className="panel"><div className="panel-heading"><div><h2>Factory profiles</h2><p>A fixed-load profile is retained while eligible activities move.</p></div></div><div className="unit-input-grid">{draft.units.map(u=><div className="unit-input" key={u.id}><span className="factory-id">{u.id}</span><h3>{u.name}</h3><label>Fixed background load <small>kW</small><input type="number" min="0" disabled={busy} placeholder="Varies by interval" value={u.fixed_kw.every(x=>x===u.fixed_kw[0])?u.fixed_kw[0]:''} onChange={e=>edit(s=>s.units.find(x=>x.id===u.id)!.fixed_kw=Array(96).fill(Number(e.target.value)))}/></label><label>Factory capacity <small>kW</small><input type="number" min="1" disabled={busy} value={u.capacity_kw} onChange={e=>edit(s=>s.units.find(x=>x.id===u.id)!.capacity_kw=Number(e.target.value))}/></label></div>)}</div><p className="panel-note">Entering a fixed background value replaces that factory&apos;s 96-interval profile. Use the profile CSV to retain a varying profile.</p></section>
        <section className="panel"><div className="panel-heading"><div><h2>Flexibility Passports</h2><p>Only operator-approved windows are movable. Equal resource names within one factory prohibit overlapping activities.</p></div></div><div className="table-scroll"><table className="passport-table"><thead><tr><th>Activity</th><th>Resource</th><th>Power, kW</th><th>Duration, h</th><th>Earliest</th><th>Finish by</th><th>Original start</th><th>Keep original</th></tr></thead><tbody>{draft.jobs.map(j=><tr key={j.id}><th>{j.id}<small>{draft.units.find(u=>u.id===j.unit)?.name}</small></th><td><input aria-label={`${j.id} resource`} value={j.machine} disabled={busy} onChange={e=>setJob(j.id,'machine',e.target.value)}/></td><td><input aria-label={`${j.id} power in kW`} type="number" min=".1" step=".1" value={j.power_kw} disabled={busy} onChange={e=>setJob(j.id,'power_kw',Number(e.target.value))}/></td><td><input aria-label={`${j.id} duration in hours`} type="number" min=".25" max="24" step=".25" value={j.duration_slots/4} disabled={busy} onChange={e=>setJob(j.id,'duration_slots',Number(e.target.value)*4)}/></td>{(['earliest_slot','deadline_slot','original_start'] as const).map(field=><td key={field}><select aria-label={`${j.id} ${field}`} disabled={busy} value={j[field]} onChange={e=>setJob(j.id,field,Number(e.target.value))}>{Array.from({length:field==='deadline_slot'?97:96},(_,k)=><option key={k} value={k}>{timeLabel(k)}</option>)}</select></td>)}<td><input aria-label={`Retain ${j.id} original start`} type="checkbox" checked={j.locked} disabled={busy} onChange={e=>setJob(j.id,'locked',e.target.checked)}/></td></tr>)}</tbody></table></div></section>
        <div className="input-columns"><section className="panel"><div className="panel-heading"><div><h2>Energy-price assumptions</h2><p>Illustrative rates in INR/kWh. This is not an official tariff or a complete electricity bill.</p></div></div><div className="tariff-editor">{[{title:'Normal hours',hours:'00:00–09:00',lo:0,hi:36},{title:'Solar-hour window',hours:'09:00–17:00',lo:36,hi:68},{title:'Evening hours',hours:'17:00–24:00',lo:68,hi:96}].map(b=>{const arr=draft.tariff.slice(b.lo,b.hi),uniform=arr.every(x=>x===arr[0]);return <label key={b.lo}><span>{b.title}<small>{b.hours}</small></span><div><span>₹</span><input type="number" min="0" step=".1" aria-label={`${b.title} energy rate`} placeholder="Variable" value={uniform?arr[0]:''} disabled={busy} onChange={e=>edit(s=>{for(let k=b.lo;k<b.hi;k++)s.tariff[k]=Number(e.target.value);})}/><small>/ kWh</small></div></label>;})}</div><p className="panel-note">Editing a band replaces all prices in that band. Import a profile CSV for a custom 96-interval tariff.</p></section>
          <section className="panel data-panel"><div className="panel-heading"><div><h2>Bring your own inputs</h2><p>Files are processed locally in this browser. Review source labels before reporting results.</p></div></div>{[{kind:'jobs',title:'Activities CSV',desc:'Up to 20 activities across the declared factories.',template:()=>download('PRAHAR-activities-template.csv',jobCSV(draft),'text/csv')},{kind:'profiles',title:'Profiles & prices CSV',desc:'All 96 intervals, with matching factory columns.',template:()=>download('PRAHAR-profiles-template.csv',profileCSV(draft),'text/csv')},{kind:'json',title:'Complete scenario JSON',desc:'Factories, activities, profiles, limits and sources.',template:()=>download('PRAHAR-scenario-template.json',JSON.stringify(example(),null,2),'application/json')}].map(f=><div className="import-option" key={f.kind}><div><b>{f.title}</b><small>{f.desc}</small><button className="text-button" onClick={f.template}>Download template<ArrowDownToLine size={13}/></button></div><label className={`file-button ${busy?'is-disabled':''}`}><Upload size={15}/><span>Import</span><input aria-label={`Import ${f.title}`} type="file" accept={f.kind==='json'?'.json':'.csv'} disabled={busy} onChange={e=>{importFile(e.target.files?.[0],f.kind);e.target.value='';}}/></label></div>)}</section></div>
        <section className="panel source-editor"><label htmlFor="source-notes"><h2>Data source & simulation status</h2><p>Identify what is measured, imported or assumed. A source label is a declaration, not verification.</p></label><textarea id="source-notes" maxLength={3000} value={draft.provenance} disabled={busy} onChange={e=>edit(s=>s.provenance=e.target.value)}/></section>
      </div>}

      {tab==='evidence'&&<div className="evidence-area"><div className="section-heading"><div><span className="section-kicker">REPRODUCIBLE BY DESIGN</span><h2>Understand the result before making a claim.</h2><p>The software proves a calculation under stated inputs. Factory performance still needs field validation.</p></div><div className="tested-label"><ShieldCheck size={18}/>{validation?`${validation.checks} automated checks passed`:'Engine checks included in source'}</div></div>
        <div className="evidence-grid"><section className="panel"><h2>What the comparison controls</h2><ol className="method-list"><li><span>A</span><div><b>Replay the original schedule</b><p>Retain all declared jobs and fixed loads. Show existing machine, factory-capacity and shared-limit violations.</p></div></li><li><span>B</span><div><b>Let factories optimise independently</b><p>Use the same prices and each factory&apos;s approved constraints. Ignore the shared feeder limit to expose any collective congestion.</p></div></li><li><span>C</span><div><b>Enforce the shared limit</b><p>Use the same jobs and limits, adding the feeder-capacity constraint. A lower-cost coordinated result is not assumed.</p></div></li></ol><p className="panel-note">The objective minimises energy charge. Earliest start times break ties at the minimum charge; the model does not separately minimise peak demand.</p></section>
        <section className="panel"><h2>Boundaries that matter</h2><ul className="boundary-list"><li><CheckCircle2 size={18}/><div><b>Energy charges are separated from total bills</b><p>Monthly maximum-demand charges, kVAh, taxes, duties and service fees are excluded.</p></div></li><li><CheckCircle2 size={18}/><div><b>Time shifting preserves kWh</b><p>The same activities run for the same duration and power. Energy reduction requires a separate, validated mechanism.</p></div></li><li><CheckCircle2 size={18}/><div><b>Network benefits do not create a payment</b><p>No DISCOM reward, carbon revenue or shared cash pool is included in these results.</p></div></li><li><CheckCircle2 size={18}/><div><b>Operational constraints need plant approval</b><p>The example windows are fictional. Software feasibility does not prove physical process quality or safety.</p></div></li></ul></section></div>
        <section className="panel evidence-source"><div><span className="section-kicker">SOURCE OF THE LAST COMPLETED RUN</span><h2>{shown.name}</h2><p>{shown.provenance}</p></div><button disabled={disabled} className="secondary-button" onClick={()=>exportResult('json')}><Download size={16}/>Reproduce this run</button></section>
        <section className="panel"><h2>Checks on the last completed run</h2><div className="check-grid">{[{label:'Required jobs retained',pass:!!m?.starts&&Object.keys(m.starts).length===shown.jobs.length},{label:'No machine or factory conflict',pass:!!m?.starts&&!m.violations?.length},{label:'Shared limit respected',pass:!!m?.starts&&!m.feeder_exceedance_slots},{label:'Energy conserved',pass:m?.energy_kwh!==undefined&&b?.energy_kwh!==undefined&&Math.abs(m.energy_kwh-b.energy_kwh)<1e-6}].map(x=><div key={x.label} className={x.pass?'passed':'unchecked'}>{x.pass?<CheckCircle2 size={20}/>:<Info size={20}/>}<span>{x.label}<small>{x.pass?'Passed for this simulation':'No passing coordinated result'}</small></span></div>)}</div></section>
        <p className="technical-note">Optimisation uses the MIT-licensed <a href="https://github.com/lovasoa/highs-js" target="_blank" rel="noreferrer">HiGHS solver</a>, running in a browser worker. Code-level tests and the Python reference model accompany the source package. {validation?`Validation record: ${validation.date}.`:''}</p>
      </div>}
      <footer className="site-footer"><div><EnergyMark/><span>PRAHAR <small>Peak Redistribution & Hour-Aware Reporting</small></span></div><p>Research prototype v0.1 · Simulated inputs · Human-approved decisions</p></footer>
    </main>
  </div>;
}
