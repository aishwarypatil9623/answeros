/* AnswerOS shared data + Google Sheet sync layer */
(function () {
  'use strict';
  const STORE_KEY = 'answeros:store:v1';
  const CONFIG_KEY = 'answeros:config:v1';
  const DEFAULT = { syncUrl: '', syncToken: '', autoSyncEnabled: true, syncIntervalMinutes: 15 };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }
  let store = read(STORE_KEY, { rows: [], answers: [], lastSync: null });
  let config = Object.assign({}, DEFAULT, read(CONFIG_KEY, {}));
  let syncing = false;

  function saveStore() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
  function broadcast(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); }

  function parseDate(value) {
    if (value === undefined || value === null || value === '') return '';
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2,'0')}-${String(dmy[1]).padStart(2,'0')}`;
    const parsed = new Date(s);
    return isNaN(parsed) ? '' : parsed.toISOString().slice(0, 10);
  }

  function toNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function first(row, ...keys) {
    for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    return '';
  }

  function normaliseRows(rows) {
    return rows.map((row, index) => {
      if (!row || typeof row !== 'object') return { id: String(index + 1), value: row };
      const dateRaw = first(row, 'date', 'Date', 'Question Date', 'questionDate', 'timestamp', 'Timestamp');
      const marksRaw = first(row, 'marks', 'Marks', 'score', 'Score');
      const maxRaw = first(row, 'max', 'Max', 'maxMarks', 'Max Marks');
      const demandRaw = first(row,
        'demandAddressed', 'Demand Addressed', 'demand_addressed',
        'demandPct', 'Demand %', 'Demand Addressed %', 'demand', 'Demand'
      );
      const demand = toNumber(demandRaw, NaN);
      return Object.assign({}, row, {
        id: String(first(row, 'id', 'ID', 'Id') || index + 1),
        date: parseDate(dateRaw),
        paper: first(row, 'paper', 'Paper', 'gsPaper', 'GSPaper') || 'GS2',
        subject: first(row, 'subject', 'Subject'),
        theme: first(row, 'theme', 'Theme', 'topic', 'Topic', 'Subtopic', 'subtopic'),
        subtopic: first(row, 'subtopic', 'Subtopic', 'theme', 'Theme', 'topic', 'Topic'),
        question: first(row, 'question', 'Question', 'title', 'Title'),
        marks: toNumber(marksRaw, 0),
        max: toNumber(maxRaw, 15) || 15,
        score: toNumber(first(row, 'score', 'Score', 'marks', 'Marks'), 0),
        status: first(row, 'status', 'Status'),
        gapCategory: first(row, 'gapCategory', 'Gap Category', 'gap', 'Gap'),
        demandAddressed: Number.isFinite(demand) ? demand : null
      });
    });
  }

  if (Array.isArray(store.rows) && store.rows.length) {
    store.answers = normaliseRows(store.rows);
    saveStore();
  }

  function setRows(rows) {
    if (!Array.isArray(rows)) throw new Error('Sync response did not contain an array of rows.');
    store.rows = rows;
    store.answers = normaliseRows(rows);
    store.lastSync = new Date().toISOString();
    saveStore();
    broadcast('answeros:data-updated', store);
    return store;
  }

  function buildSyncUrl() {
    if (!config.syncUrl) throw new Error('Google Sheet Web App URL is not configured.');
    const url = new URL(config.syncUrl);
    if (config.syncToken) url.searchParams.set('token', config.syncToken);
    url.searchParams.set('_', Date.now());
    return url.toString();
  }

  async function sync() {
    if (syncing) return { count: store.rows.length, lastSync: store.lastSync, skipped: true };
    syncing = true;
    try {
      const response = await fetch(buildSyncUrl(), { method: 'GET', mode: 'cors', cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data && data.ok === false) throw new Error(data.error || 'The sync endpoint reported an error.');
      const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.data) ? data.data : Array.isArray(data?.answers) ? data.answers : null;
      if (!rows) throw new Error('Connected, but the response has no rows/data/answers array.');
      setRows(rows);
      return { count: rows.length, lastSync: store.lastSync };
    } finally {
      syncing = false;
    }
  }

  function maybeAutoSync() {
    if (!config.autoSyncEnabled || !config.syncUrl) return;
    const age = store.lastSync ? Date.now() - new Date(store.lastSync).getTime() : Infinity;
    const interval = Math.max(5, Number(config.syncIntervalMinutes) || 15) * 60000;
    if (age >= interval) sync().catch(() => {});
  }

  window.AnswerOS = {
    getConfig: () => Object.assign({}, config),
    setConfig(patch) {
      config = Object.assign({}, config, patch || {});
      saveConfig();
      broadcast('answeros:config-updated', Object.assign({}, config));
      maybeAutoSync();
    },
    getStore: () => store,
    getAnswers: () => store.answers || [],
    getRows: () => store.rows || [],
    sync,
    get lastSync() { return store.lastSync; }
  };

  window.addEventListener('storage', (event) => {
    if (event.key === STORE_KEY) {
      store = read(STORE_KEY, store);
      store.answers = normaliseRows(store.rows || []);
      saveStore();
      broadcast('answeros:data-updated', store);
    }
    if (event.key === CONFIG_KEY) {
      config = Object.assign({}, DEFAULT, read(CONFIG_KEY, config));
      maybeAutoSync();
    }
  });

  /* Dashboard is data-driven: repair legacy sample metrics after the page's original
     renderer runs, using only the currently synced Sheet rows. */
  window.addEventListener('DOMContentLoaded', function () {
    if (!location.pathname.endsWith('answeros-dashboard.html')) return;
    setTimeout(renderLiveDashboard, 0);
  });

  function renderLiveDashboard() {
    const rows = normaliseRows(store.rows || []);
    if (!rows.length) return;
    const validDates = rows.filter(a => a.date && !isNaN(new Date(a.date).getTime()));
    const score = a => a.max ? (a.marks / a.max * 10) : 0;
    const total = rows.length;
    const avg = total ? rows.reduce((s,a)=>s+score(a),0)/total : 0;
    const best = total ? Math.max(...rows.map(score)) : 0;
    const worst = total ? Math.min(...rows.map(score)) : 0;

    function streaks() {
      const dates = [...new Set(validDates.map(a=>a.date))].sort();
      if (!dates.length) return {current:0,longest:0};
      let longest=1, cur=1;
      for(let i=1;i<dates.length;i++) {
        const gap=(new Date(dates[i])-new Date(dates[i-1]))/86400000;
        if(gap===1){cur++;longest=Math.max(longest,cur);} else cur=1;
      }
      let current=1, i=dates.length-1;
      while(i>0 && (new Date(dates[i])-new Date(dates[i-1]))/86400000===1){current++;i--;}
      return {current,longest};
    }
    const st = streaks();

    const demandRows = rows.filter(a => Number.isFinite(a.demandAddressed));
    const demand = demandRows.length ? Math.round(demandRows.reduce((s,a)=>s+a.demandAddressed,0)/demandRows.length) : null;

    const q = document.getElementById('quickStats');
    if (q) {
      const items = q.querySelectorAll('.qs-item');
      const vals = [total, st.current, st.longest, avg.toFixed(1), demand===null?'—':demand, best.toFixed(1), worst.toFixed(1)];
      items.forEach((el,i)=>{ const v=el.querySelector('.qs-val'); if(v) v.innerHTML=`${vals[i]}<span>${i===4&&demand!==null?'%':i===3||i>=5?'/10':''}</span>`; });
    }
    const streakTop=document.getElementById('streakTop'); if(streakTop) streakTop.textContent=st.current+' Days';

    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    const todayCount = rows.filter(a=>a.date===todayStr).length;
    const goalText=document.getElementById('todayGoalText');
    if(goalText) goalText.innerHTML=`${todayCount} Answer${todayCount===1?'':'s'} Today`;
    const goalBar=document.getElementById('todayGoalBar'); if(goalBar) goalBar.style.width='100%';

    const counts={}, sums={};
    rows.forEach(a=>{const p=a.paper||'Unknown';counts[p]=(counts[p]||0)+1;sums[p]=(sums[p]||0)+score(a);});
    const labels=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
    const colors={GS1:'#3b6fd5',GS2:'#2c8a46',GS3:'#7a4fd5',GS4:'#e0762c',Essay:'#e0a021',PSIR:'#22a3a3'};
    const chartColor=labels.map(x=>colors[x]||'#9aa0a5');
    const subjectCanvas=document.getElementById('subjectDonut');
    if(subjectCanvas && window.Chart){const old=Chart.getChart(subjectCanvas);if(old)old.destroy();new Chart(subjectCanvas,{type:'doughnut',data:{labels,datasets:[{data:labels.map(x=>counts[x]),backgroundColor:chartColor,borderWidth:3,borderColor:'#fff'}]},options:{cutout:'70%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.parsed} answers · avg ${(sums[ctx.label]/counts[ctx.label]).toFixed(1)}/10`}}}}});}
    const td=document.getElementById('totalAnswersDonut');if(td)td.textContent=total;
    const perf=document.getElementById('subjectPerf');if(perf)perf.innerHTML=labels.map(p=>{const a=sums[p]/counts[p],share=Math.round(counts[p]/total*100);return `<div class="subj-leg-row"><div class="subj-leg-dot" style="background:${colors[p]||'#9aa0a5'};"></div><div class="subj-leg-label"><b>${p}</b> <span class="subj-leg-count">${counts[p]} · ${share}%</span></div><div class="subj-leg-score" style="background:${a>=6.5?'#e6f4ea':a>=4.5?'#fbf5e8':'#fbf1ee'};color:${a>=6.5?'#1c5c30':a>=4.5?'#8a6212':'#b3402c'};">${a.toFixed(1)}</div></div>`;}).join('');
    const ranked=labels.map(p=>({p,avg:sums[p]/counts[p],n:counts[p]}));
    const weak=ranked.slice().sort((a,b)=>a.avg-b.avg)[0], heavy=ranked.slice().sort((a,b)=>b.n-a.n)[0];
    const si=document.getElementById('subjectInsight');if(si&&weak&&heavy)si.innerHTML=`You've written most in <b>${heavy.p}</b> (${heavy.n} answers), but <b>${weak.p}</b> is scoring lowest at ${weak.avg.toFixed(1)}/10. Ring size = share of practice, score badge = where marks are actually landing.`;

    const trendCanvas=document.getElementById('scoreTrend');
    const trend=[...validDates].sort((a,b)=>a.date.localeCompare(b.date));
    function drawTrend(){const n=document.getElementById('trendFilter')?.value||'all';const data=n==='all'?trend:trend.slice(-Number(n));if(!trendCanvas||!window.Chart)return;const old=Chart.getChart(trendCanvas);if(old)old.destroy();new Chart(trendCanvas,{type:'line',data:{labels:data.map(a=>new Date(a.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})),datasets:[{data:data.map(score),borderColor:'#2c8a46',backgroundColor:'rgba(44,138,70,0.08)',fill:true,tension:.35,pointBackgroundColor:'#2c8a46',pointRadius:3,borderWidth:2}]},options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10,grid:{color:'#eef1ee'}},x:{grid:{display:false}}}}});}
    const trendFilter=document.getElementById('trendFilter');
    if(trendFilter){const fresh=trendFilter.cloneNode(true);trendFilter.parentNode.replaceChild(fresh,trendFilter);fresh.addEventListener('change',drawTrend);}
    drawTrend();

    const recent=[...rows].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);
    const rl=document.getElementById('recentList');if(rl)rl.innerHTML=recent.map(a=>{const d=a.date?new Date(a.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'Date unavailable';const p=a.paper||'—';const c=colors[p]||'#888';return `<div class="ra-row"><div class="tag" style="background:${c}1a;color:${c};">${p}</div><div style="flex:1;min-width:0;"><div class="ra-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.subtopic||a.question||'Untitled answer'}</div><div class="ra-meta"><span>${d}</span><span>·</span><span>${a.subject||'—'}</span></div></div><div class="ra-score">${score(a).toFixed(1)}<span style="color:var(--ink-500);font-weight:500;">/10</span></div></div>`;}).join('');

    const dated=[...validDates].sort((a,b)=>a.date.localeCompare(b.date));
    if(dated.length){
      const start=new Date(dated[0].date), end=new Date(dated[dated.length-1].date);
      const span=Math.max(1,Math.ceil((end-start)/86400000));
      const buckets=[];
      const bucketCount=4;
      for(let i=0;i<bucketCount;i++){const lo=start.getTime()+span*86400000*i/bucketCount,hi=start.getTime()+span*86400000*(i+1)/bucketCount;const r=dated.filter(a=>{const t=new Date(a.date).getTime();return t>=lo&&(i===bucketCount-1?t<=hi:t<hi);});buckets.push(r.length?r.reduce((s,a)=>s+score(a),0)/r.length:null);}
      const labels4=['Period 1','Period 2','Period 3','Period 4'];
      const c=document.getElementById('improveBar');if(c&&window.Chart){const old=Chart.getChart(c);if(old)old.destroy();new Chart(c,{type:'bar',data:{labels:labels4,datasets:[{data:buckets,backgroundColor:['#cfe8d8','#b8dfc4','#a2d6b1','#2c8a46'],borderRadius:6,maxBarThickness:34}]},options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:10,grid:{color:'#eef1ee'}},x:{grid:{display:false}}}}});}
      const finite=buckets.filter(x=>x!==null);const imp=finite.length>=2?finite[finite.length-1]-finite[0]:0;const iv=document.getElementById('improveVal');if(iv)iv.textContent=(imp>=0?'+':'')+imp.toFixed(1);
    }

    const bestRow=rows.slice().sort((a,b)=>score(b)-score(a))[0];
    const highest=ranked.slice().sort((a,b)=>b.avg-a.avg)[0], most=ranked.slice().sort((a,b)=>b.n-a.n)[0];
    const tp=document.getElementById('topPerf');if(tp&&bestRow&&highest&&most)tp.innerHTML=`<div class="kpi-box"><div class="kval">${score(bestRow).toFixed(1)}/10</div><div class="klabel">Best Score</div><div class="klabel" style="font-weight:600;color:var(--ink-700);">${bestRow.subject||bestRow.paper||'—'}</div></div><div class="kpi-box"><div class="kval">${highest.avg.toFixed(1)}/10</div><div class="klabel">Highest Average</div><div class="klabel" style="font-weight:600;color:var(--ink-700);">${highest.p}</div></div><div class="kpi-box"><div class="kval">${most.n}</div><div class="klabel">Most Answers</div><div class="klabel" style="font-weight:600;color:var(--ink-700);">${most.p}</div></div>`;

    const pyqTotal=document.getElementById('pyqTotal'),pyqWritten=document.getElementById('pyqWritten'),pyqPending=document.getElementById('pyqPending'),pyqPct=document.getElementById('pyqPct');
    [pyqTotal,pyqWritten,pyqPending,pyqPct].forEach(el=>{if(el)el.textContent='—';});
    const pyqCard=pyqTotal?.closest('section.card'); if(pyqCard){const badge=pyqCard.querySelector('.card-head span');if(badge)badge.textContent='No PYQ data in sheet';}
    const pyqProg=document.getElementById('pyqProgress');if(pyqProg)pyqProg.innerHTML='<div style="font-size:11.5px;color:var(--ink-500);line-height:1.5;">PYQ progress requires a PYQ dataset. No sample percentages are shown.</div>';
    const pyqProgCard=pyqProg?.closest('section.card');if(pyqProgCard){const badge=pyqProgCard.querySelector('.card-head span');if(badge)badge.textContent='No PYQ data in sheet';}
    const overallList=document.getElementById('overallList');if(overallList)overallList.innerHTML=`<div class="row"><div class="sdot" style="background:#3b6fd5"></div><div class="slabel">Answers Written</div><div class="sval">${total}</div></div><div class="row"><div class="sdot" style="background:#7a4fd5"></div><div class="slabel">Answers ≥ 6/10</div><div class="sval">${rows.filter(a=>score(a)>=6).length}</div></div>`;
    const overallPct=document.getElementById('overallPct');if(overallPct)overallPct.textContent='—';
    const overallCanvas=document.getElementById('overallDonut');if(overallCanvas&&window.Chart){const old=Chart.getChart(overallCanvas);if(old)old.destroy();new Chart(overallCanvas,{type:'doughnut',data:{datasets:[{data:[1,1],backgroundColor:['#2c8a46','#eef1ee'],borderWidth:0}]},options:{cutout:'74%',plugins:{legend:{display:false},tooltip:{enabled:false}}}});}
    const overallCard=overallPct?.closest('section.card');if(overallCard){const badge=overallCard.querySelector('.card-head span');if(badge)badge.textContent='Live answer data only';}

    const gaps={};rows.forEach(a=>{if(a.gapCategory)gaps[a.gapCategory]=(gaps[a.gapCategory]||0)+1;});
    const topGap=Object.entries(gaps).sort((a,b)=>b[1]-a[1])[0];
    const focus=document.getElementById('focusArea');
    if(focus&&weak){focus.innerHTML=`<div class="focus-headline">${weak.p} <span>· ${weak.avg.toFixed(1)}/10 avg</span></div><div class="focus-sub">Lowest-scoring paper, across ${weak.n} answers.</div>${topGap?`<div class="focus-note">Recurring gap: <b>${topGap[0]}</b> flagged in ${topGap[1]} of ${total} answers (${Math.round(topGap[1]/total*100)}%).</div>`:'<div class="focus-note">No gap-category data is available in the synced Sheet.</div>'}<div class="focus-secondary">Use the next 3 answers to deliberately address this weakness.</div>`;}

    const bs=document.getElementById('bottomStrip');if(bs){const weekAgo=new Date();weekAgo.setDate(weekAgo.getDate()-6);const weekCount=validDates.filter(a=>new Date(a.date)>=weekAgo).length;bs.innerHTML=`<div class="strip-item"><div class="si-icon">+</div><div><div class="si-val">${weekCount}</div><div class="si-label">Answers in last 7 days</div><div class="si-delta">Live Sheet data</div></div></div><div class="strip-item"><div class="si-icon">—</div><div><div class="si-val">—</div><div class="si-label">Revisions Done</div><div class="si-delta">No revision data in sheet</div></div></div><div class="strip-item"><div class="si-icon">↗</div><div><div class="si-val">${avg.toFixed(1)}/10</div><div class="si-label">Average Answer Quality</div><div class="si-delta">Live Sheet data</div></div></div><div class="strip-item"><div class="si-icon">—</div><div><div class="si-val">—</div><div class="si-label">Prelims Countdown</div><div class="si-delta">Exam date not configured here</div></div></div><div class="strip-item"><div class="si-icon">—</div><div><div class="si-val">—</div><div class="si-label">Mains Countdown</div><div class="si-delta">Exam date not configured here</div></div></div>`;}
  }

  maybeAutoSync();
})();
