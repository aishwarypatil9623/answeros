export type Answer = {
  id: string;
  date: string;
  paper: string;
  subject: string;
  theme: string;
  subtopic: string;
  question: string;
  directive: string;
  marks: number | null;
  maxMarks: number;
  score10: number | null;
  demandAddressed: number | null;
  demandBreakdown: string[];
  status: string;
  gapCategory: string;
  feedback: string;
  learning: string;
};

export type SyncConfig = { syncUrl: string; syncToken: string; autoSyncEnabled: boolean; syncIntervalMinutes: number };

const STORE_KEY = 'answeros:store:v2';
const CONFIG_KEY = 'answeros:config:v2';
const DEFAULT_CONFIG: SyncConfig = { syncUrl: '', syncToken: '', autoSyncEnabled: true, syncIntervalMinutes: 15 };

const aliases: Record<keyof Answer, string[]> = {
  id: ['id','ID','Id','rowId','Row ID'], date: ['date','Date','Question Date','questionDate','timestamp','Timestamp'],
  paper: ['paper','Paper','GS Paper','GS_Paper','gsPaper','GSPaper'], subject: ['subject','Subject'],
  theme: ['theme','Theme','topic','Topic'], subtopic: ['subtopic','Subtopic','Sub-topic','Sub Topic'],
  question: ['question','Question','title','Title'], directive: ['directive','Directive','commandWord','Command Word'],
  marks: ['marks','Marks','score','Score','Marks Obtained'], maxMarks: ['maxMarks','Max Marks','max','Max','Maximum Marks'],
  score10: ['score10','Score10'], demandAddressed: ['demandAddressed','Demand Addressed','demandPct','Demand %','Demand Addressed %','demand','Demand'],
  demandBreakdown: ['demandBreakdown','Demand Breakdown','demandItems','Demand Items'], status: ['status','Status'],
  gapCategory: ['gapCategory','Gap Category','gap','Gap','Recurring Gap'], feedback: ['feedback','Feedback'], learning: ['learning','Learning','Key Learning']
};

function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } }
function pick(row: Record<string, unknown>, keys: string[]): unknown { for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; return ''; }
function num(v: unknown, fallback: number | null = null): number | null { const n = Number(String(v ?? '').replace(/,/g,'' ).replace(/[^0-9.\-]/g,'')); return Number.isFinite(n) ? n : fallback; }
function date(v: unknown): string { if (typeof v === 'number') return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10); const s=String(v??'').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10); const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; const d=new Date(s); return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10); }
function demand(v: unknown): number | null { const n=num(v); if(n===null) return null; return n>=0&&n<=1?n*100:Math.max(0,Math.min(100,n)); }

export function normalize(row: Record<string, unknown>, i=0): Answer {
  const marks=num(pick(row,aliases.marks)); const max=num(pick(row,aliases.maxMarks),15) || 15;
  const score10=marks===null?num(pick(row,aliases.score10)):Math.round((marks/max)*10*10)/10;
  const value=(k:keyof Answer)=>pick(row,aliases[k]);
  const db=value('demandBreakdown');
  return { id:String(value('id')||i+1), date:date(value('date')), paper:String(value('paper')||'—'), subject:String(value('subject')||''), theme:String(value('theme')||''), subtopic:String(value('subtopic')||''), question:String(value('question')||''), directive:String(value('directive')||''), marks, maxMarks:max, score10, demandAddressed:demand(value('demandAddressed')), demandBreakdown:Array.isArray(db)?db.map(String):String(db||'').split(/[|;\n]+/).map(s=>s.trim()).filter(Boolean), status:String(value('status')||''), gapCategory:String(value('gapCategory')||''), feedback:String(value('feedback')||''), learning:String(value('learning')||'') };
}

export function getAnswers(): Answer[] { const store=read<{answers?:Answer[]}> (STORE_KEY,{answers:[]}); return store.answers || []; }
export function getConfig(): SyncConfig { return read(CONFIG_KEY,DEFAULT_CONFIG); }
export function saveConfig(config: SyncConfig) { localStorage.setItem(CONFIG_KEY,JSON.stringify(config)); }
export function subscribe(fn:()=>void) { const h=()=>fn(); window.addEventListener('answeros:data-updated',h); window.addEventListener('storage',h); return ()=>{window.removeEventListener('answeros:data-updated',h);window.removeEventListener('storage',h)}; }
export async function sync(): Promise<number> { const c=getConfig(); if(!c.syncUrl) throw new Error('Configure the Google Apps Script Web App URL first.'); const u=new URL(c.syncUrl); if(c.syncToken)u.searchParams.set('token',c.syncToken); u.searchParams.set('_',String(Date.now())); const r=await fetch(u.toString(),{cache:'no-store'}); if(!r.ok)throw new Error(`Sync failed: HTTP ${r.status}`); const data=await r.json(); const rows=Array.isArray(data.rows)?data.rows:Array.isArray(data.data)?data.data:Array.isArray(data.answers)?data.answers:null; if(!rows)throw new Error('Sync response has no rows/data/answers array.'); const answers=rows.map((x:Record<string,unknown>,i:number)=>normalize(x,i)); localStorage.setItem(STORE_KEY,JSON.stringify({rows,answers,lastSync:new Date().toISOString(),schemaVersion:2})); window.dispatchEvent(new CustomEvent('answeros:data-updated')); return answers.length; }

export function metrics(answers=getAnswers()) { const scored=answers.filter(a=>a.score10!==null); const avg=scored.length?scored.reduce((s,a)=>s+(a.score10||0),0)/scored.length:null; const best=scored.length?Math.max(...scored.map(a=>a.score10||0)):null; const worst=scored.length?Math.min(...scored.map(a=>a.score10||0)):null; const demandRows=answers.filter(a=>a.demandAddressed!==null); const avgDemand=demandRows.length?demandRows.reduce((s,a)=>s+(a.demandAddressed||0),0)/demandRows.length:null; const papers=Object.entries(answers.reduce<Record<string,number>>((m,a)=>(m[a.paper]=(m[a.paper]||0)+1,m),{})).sort((a,b)=>b[1]-a[1]); return {total:answers.length,avg,best,worst,avgDemand,papers}; }
