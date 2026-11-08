export interface Unit {id:string; name:string; capacity_kw:number; fixed_kw:number[]}
export interface Job {id:string;unit:string;name:string;machine:string;power_kw:number;duration_slots:number;earliest_slot:number;deadline_slot:number;original_start:number;locked:boolean}
export interface Scenario {version:number;name:string;provenance:string;units:Unit[];jobs:Job[];tariff:number[];feeder_limit_kw:number}
export interface FactoryMetric {energy_kwh:number;energy_charge_inr:number;peak_kw:number}
export interface Metric {status:string;reason?:string;starts?:Record<string,number>;cluster_kw?:number[];unit_kw?:Record<string,number[]>;per_unit?:Record<string,FactoryMetric>;energy_kwh?:number;energy_charge_inr?:number;cluster_peak_kw?:number;feeder_exceedance_slots?:number;violations?:string[];scope?:string;tie_break_proven?:boolean}
export type Mode='current'|'independent'|'coordinated';
export type Comparison=Record<Mode,Metric>;
export const N:number;
export const DT:number;
export const MODES:Mode[];
export function clone<T>(x:T):T;
export function example(key?:string):Scenario;
export function timeLabel(t:number):string;
export function parseTime(t:string):number;
export function validate(s:unknown):string[];
export function measure(s:Scenario,starts:Record<string,number>):Metric;
export function makeModel(s:Scenario,coordinated:boolean,costCap?:number|null,tieBreak?:boolean):unknown;
export function optimize(s:Scenario,coordinated:boolean,highs:unknown):Metric;
export function compare(s:Scenario,highs:unknown,progress?:(s:string)=>void):Comparison;
export function jobCSV(s:Scenario):string;
export function profileCSV(s:Scenario):string;
export function importJobs(text:string,s:Scenario):Scenario;
export function importProfiles(text:string,s:Scenario):Scenario;
export function resultCSV(s:Scenario,r:Comparison):string;
export function scheduleCSV(s:Scenario,r:Comparison):string;
export function reportHTML(s:Scenario,r:Comparison):string;
export function csvText(rows:unknown[][]):string;
export function csvCell(x:unknown):string;
export function parseCSV(text:string):string[][];
