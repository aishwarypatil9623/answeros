/* AnswerOS shared data contract + Google Sheet sync layer v2 */
(function () {
  'use strict';

  const VERSION = 2;
  const STORE_KEY = 'answeros:store:v2';
  const CONFIG_KEY = 'answeros:config:v2';
  const DEFAULT_CONFIG = { syncUrl: '', syncToken: '', autoSyncEnabled: true, syncIntervalMinutes: 15 };

  const ALIASES = {
    id: ['id', 'ID', 'Id', 'rowId', 'Row ID'],
    date: ['date', 'Date', 'Question Date', 'questionDate', 'timestamp', 'Timestamp'],
    paper: ['paper', 'Paper', 'GS Paper', 'GS_Paper', 'gsPaper', 'GSPaper'],
    subject: ['subject', 'Subject'],
    theme: ['theme', 'Theme', 'topic', 'Topic'],
    subtopic: ['subtopic', 'Subtopic', 'Sub-topic', 'Sub Topic'],
    question: ['question', 'Question', 'title', 'Title'],
    marks: ['marks', 'Marks', 'score', 'Score', 'Marks Obtained', 'Marks obtained'],
    maxMarks: ['maxMarks', 'Max Marks', 'Max marks', 'max', 'Max', 'Maximum Marks'],
    directive: ['directive', 'Directive', 'commandWord', 'Command Word', 'questionDirective'],
    demand: ['demandAddressed', 'Demand Addressed', 'demand_addressed', 'demandPct', 'Demand %', 'Demand Addressed %', 'demand', 'Demand'],
    status: ['status', 'Status'],
    gapCategory: ['gapCategory', 'Gap Category', 'gap', 'Gap', 'recurringGap', 'Recurring Gap'],
    feedback: ['feedback', 'Feedback', 'evaluatorFeedback', 'Evaluator Feedback'],
    learning: ['learning', 'Learning', 'keyLearning', 'Key Learning'],
    pdfDate: ['pdfDate', 'PDF Date', 'Answer Date', 'answerDate'],
    bestIntro: ['bestIntro', 'Best Intro'],
    idealSubheadings: ['idealSubheadings', 'Ideal Subheadings'],
    mustHavePoints: ['mustHavePoints', 'Must Have Points'],
    valueAdditions: ['valueAdditions', 'Value Additions'],
    keywords: ['keywords', 'Keywords'],
    examples: ['examples', 'Examples'],
    bestConclusion: ['bestConclusion', 'Best Conclusion'],
    improvements: ['improvements', 'Improvements'],
    topperEdge: ['topperEdge', 'Topper Edge'],
    demandBreakdown: ['demandBreakdown', 'Demand Breakdown', 'demandItems', 'Demand Items']
  };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
  }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function first(row, keys) {
    for (const key of keys) if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    return '';
  }
  function toNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const n = Number(String(value).replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  function parseDate(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    }
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    const parsed = new Date(s);
    return isNaN(parsed) ? '' : parsed.toISOString().slice(0, 10);
  }
  function parseDemand(value) {
    const n = toNumber(value, null);
    if (n === null) return null;
    return n >= 0 && n <= 1 ? Math.round(n * 100) : Math.max(0, Math.min(100, n));
  }
  function listValue(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') return value.split(/\s*\|\s*|\s*;\s*|\n+/).map(s => s.trim()).filter(Boolean);
    return [value];
  }
  function textValue(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }

  function normalizeRow(row, index = 0) {
    if (!row || typeof row !== 'object') return { schemaVersion: VERSION, id: String(index + 1), rowIndex: index, raw: row, valid: false, errors: ['Row is not an object'] };
    const date = parseDate(first(row, ALIASES.date));
    const marks = toNumber(first(row, ALIASES.marks), null);
    const maxMarks = toNumber(first(row, ALIASES.maxMarks), 15) || 15;
    const demandAddressed = parseDemand(first(row, ALIASES.demand));
    const normalized = {
      schemaVersion: VERSION,
      id: String(first(row, ALIASES.id) || index + 1),
      rowIndex: index,
      date,
      paper: textValue(first(row, ALIASES.paper)),
      subject: textValue(first(row, ALIASES.subject)),
      theme: textValue(first(row, ALIASES.theme)),
      subtopic: textValue(first(row, ALIASES.subtopic)),
      question: textValue(first(row, ALIASES.question)),
      marks: marks === null ? 0 : marks,
      maxMarks,
      max: maxMarks,
      score10: maxMarks > 0 && marks !== null ? +(marks / maxMarks * 10).toFixed(2) : null,
      score: marks === null ? 0 : marks,
      directive: textValue(first(row, ALIASES.directive)),
      demandAddressed,
      demandPct: demandAddressed,
      demand: demandAddressed,
      status: textValue(first(row, ALIASES.status)) || 'PROCESSED',
      gapCategory: textValue(first(row, ALIASES.gapCategory)),
      feedback: first(row, ALIASES.feedback),
      learning: textValue(first(row, ALIASES.learning)),
      pdfDate: textValue(first(row, ALIASES.pdfDate)),
      bestIntro: textValue(first(row, ALIASES.bestIntro)),
      idealSubheadings: listValue(first(row, ALIASES.idealSubheadings)),
      mustHavePoints: listValue(first(row, ALIASES.mustHavePoints)),
      valueAdditions: listValue(first(row, ALIASES.valueAdditions)),
      keywords: listValue(first(row, ALIASES.keywords)),
      examples: listValue(first(row, ALIASES.examples)),
      bestConclusion: textValue(first(row, ALIASES.bestConclusion)),
      improvements: listValue(first(row, ALIASES.improvements)),
      topperEdge: textValue(first(row, ALIASES.topperEdge)),
      demandBreakdown: listValue(first(row, ALIASES.demandBreakdown)),
      raw: row
    };
    normalized.valid = Boolean(normalized.date || normalized.question || normalized.subtopic || normalized.subject);
    normalized.errors = [];
    if (!normalized.date) normalized.errors.push('Missing/invalid date');
    if (!normalized.question && !normalized.subtopic) normalized.errors.push('Missing question/subtopic');
    return normalized;
  }

  function normalizeRows(rows) { return (Array.isArray(rows) ? rows : []).map(normalizeRow); }

  function parseCSV(text) {
    const rows = [], row = [];
    let current = row, field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n') { current.push(field.replace(/\r$/, '')); rows.push(current); current = []; field = ''; }
      else field += ch;
    }
    current.push(field);
    if (current.some(Boolean)) rows.push(current);
    if (!rows.length) return [];
    const headers = rows[0].map((h, i) => h || `Column ${i + 1}`);
    return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  }

  let store = read(STORE_KEY, { schemaVersion: VERSION, rows: [], answers: [], lastSync: null, source: 'none', validation: null });
  let config = Object.assign({}, DEFAULT_CONFIG, read(CONFIG_KEY, {}));
  let syncing = false;
  const subscribers = new Set();

  function getStore() { return { ...store, answers: store.answers || normalizeRows(store.rows || []) }; }
  function publish() {
    const payload = getStore();
    window.dispatchEvent(new CustomEvent('answeros:data-updated', { detail: payload }));
    subscribers.forEach(fn => { try { fn(payload); } catch (_) {} });
  }
  function validate(answers = getAnswers({ includeInvalid: true })) {
    const errors = [], warnings = [];
    answers.forEach(a => {
      (a.errors || []).forEach(e => errors.push({ id: a.id, rowIndex: a.rowIndex, error: e }));
      if (a.maxMarks <= 0) errors.push({ id: a.id, rowIndex: a.rowIndex, error: 'Max marks must be positive' });
      if (a.marks > a.maxMarks) warnings.push({ id: a.id, rowIndex: a.rowIndex, warning: 'Marks exceed max marks' });
      if (!a.paper) warnings.push({ id: a.id, rowIndex: a.rowIndex, warning: 'Missing paper' });
    });
    return { ok: errors.length === 0, errors, warnings, total: answers.length, valid: answers.filter(a => a.valid).length };
  }
  function setRows(rows, meta = {}) {
    if (!Array.isArray(rows)) throw new Error('AnswerOS sync data must contain an array of rows.');
    const answers = normalizeRows(rows);
    store = { schemaVersion: VERSION, rows, answers, lastSync: new Date().toISOString(), source: meta.source || 'sheet', validation: validate(answers) };
    save(STORE_KEY, store);
    publish();
    return getStore();
  }
  function getAnswers(options = {}) {
    const answers = store.answers || normalizeRows(store.rows || []);
    return options.includeInvalid ? answers : answers.filter(a => a.valid);
  }
  function getRows() { return store.rows || []; }
  function getConfig() { return { ...config }; }
  function setConfig(patch = {}) {
    config = Object.assign({}, config, patch);
    save(CONFIG_KEY, config);
    window.dispatchEvent(new CustomEvent('answeros:config-updated', { detail: getConfig() }));
    maybeAutoSync();
    return getConfig();
  }

  function metrics() {
    const answers = getAnswers();
    const score = a => a.score10 ?? 0;
    const total = answers.length;
    const avg = total ? answers.reduce((s, a) => s + score(a), 0) / total : 0;
    const papers = {}, directives = {}, gaps = {};
    answers.forEach(a => {
      const p = a.paper || 'Unknown';
      if (!papers[p]) papers[p] = { count: 0, total: 0 };
      papers[p].count++; papers[p].total += score(a);
      if (a.directive) {
        if (!directives[a.directive]) directives[a.directive] = { count: 0, total: 0 };
        directives[a.directive].count++; directives[a.directive].total += score(a);
      }
      if (a.gapCategory) gaps[a.gapCategory] = (gaps[a.gapCategory] || 0) + 1;
    });
    const dated = [...new Set(answers.filter(a => a.date).map(a => a.date))].sort();
    let currentStreak = 0, longestStreak = 0, run = 0;
    for (let i = 0; i < dated.length; i++) {
      const prev = i ? new Date(dated[i - 1]) : null, cur = new Date(dated[i]);
      if (!prev || (cur - prev) / 86400000 !== 1) run = 1; else run++;
      longestStreak = Math.max(longestStreak, run);
    }
    if (dated.length) {
      currentStreak = 1;
      for (let i = dated.length - 1; i > 0; i--) {
        if ((new Date(dated[i]) - new Date(dated[i - 1])) / 86400000 === 1) currentStreak++; else break;
      }
    }
    const demandRows = answers.filter(a => Number.isFinite(a.demandAddressed));
    return {
      schemaVersion: VERSION, total, averageScore10: +avg.toFixed(2),
      bestScore10: total ? Math.max(...answers.map(score)) : 0,
      worstScore10: total ? Math.min(...answers.map(score)) : 0,
      currentStreak, longestStreak,
      averageDemandPct: demandRows.length ? Math.round(demandRows.reduce((s, a) => s + a.demandAddressed, 0) / demandRows.length) : null,
      papers: Object.fromEntries(Object.entries(papers).map(([k, v]) => [k, { count: v.count, averageScore10: +(v.total / v.count).toFixed(2) }])),
      directives: Object.fromEntries(Object.entries(directives).map(([k, v]) => [k, { count: v.count, averageScore10: +(v.total / v.count).toFixed(2) }])),
      gaps, dates: dated
    };
  }

  function buildSyncUrl() {
    if (!config.syncUrl) throw new Error('Google Sheet sync URL is not configured.');
    const url = new URL(config.syncUrl);
    if (config.syncToken) url.searchParams.set('token', config.syncToken);
    url.searchParams.set('_', Date.now());
    return url.toString();
  }
  async function sync() {
    if (syncing) return { skipped: true, count: getRows().length, lastSync: store.lastSync };
    syncing = true;
    try {
      const response = await fetch(buildSyncUrl(), { method: 'GET', mode: 'cors', cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      let data;
      if (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) data = JSON.parse(text);
      else data = { rows: parseCSV(text) };
      if (data && data.ok === false) throw new Error(data.error || 'The sync endpoint reported an error.');
      const rows = Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : Array.isArray(data.data) ? data.data : Array.isArray(data.answers) ? data.answers : null);
      if (!rows) throw new Error('Connected, but the response has no rows/data/answers array.');
      return setRows(rows, { source: 'google-sheet' });
    } finally { syncing = false; }
  }
  function maybeAutoSync() {
    if (!config.autoSyncEnabled || !config.syncUrl) return;
    const age = store.lastSync ? Date.now() - new Date(store.lastSync).getTime() : Infinity;
    const interval = Math.max(5, Number(config.syncIntervalMinutes) || 15) * 60000;
    if (age >= interval) sync().catch(() => {});
  }

  window.AnswerOS = {
    VERSION,
    SCHEMA: { version: VERSION, fields: ALIASES },
    normalizeRow, normalizeRows, validate, metrics,
    getStore, getRows, getAnswers, getConfig, setConfig, setRows, sync,
    subscribe(fn) { if (typeof fn !== 'function') return () => {}; subscribers.add(fn); return () => subscribers.delete(fn); },
    get lastSync() { return store.lastSync; }
  };

  const oldStore = read('answeros:store:v1', null);
  if ((!store.rows || !store.rows.length) && oldStore && Array.isArray(oldStore.rows) && oldStore.rows.length) {
    store.rows = oldStore.rows;
    store.answers = normalizeRows(oldStore.rows);
    store.lastSync = oldStore.lastSync || null;
    store.source = 'migrated-v1';
    store.validation = validate(store.answers);
    save(STORE_KEY, store);
  } else if (Array.isArray(store.rows) && store.rows.length && (!store.answers || !store.answers.length)) {
    store.answers = normalizeRows(store.rows);
    store.validation = validate(store.answers);
    save(STORE_KEY, store);
  }

  window.addEventListener('storage', event => {
    if (event.key === STORE_KEY) {
      store = read(STORE_KEY, store);
      store.answers = normalizeRows(store.rows || []);
      publish();
    }
    if (event.key === CONFIG_KEY) {
      config = Object.assign({}, DEFAULT_CONFIG, read(CONFIG_KEY, config));
      maybeAutoSync();
    }
  });
  window.addEventListener('DOMContentLoaded', maybeAutoSync);
})();
