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
    const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function normaliseRows(rows) {
    return rows.map((row, index) => {
      if (!row || typeof row !== 'object') return { id: String(index + 1), value: row };
      const pick = (...keys) => {
        for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
        return '';
      };
      const dateRaw = pick('date', 'Date', 'Question Date', 'questionDate', 'timestamp', 'Timestamp');
      const marksRaw = pick('marks', 'Marks', 'score', 'Score');
      const maxRaw = pick('max', 'Max', 'maxMarks', 'Max Marks');
      return Object.assign({}, row, {
        id: String(pick('id', 'ID', 'Id') || index + 1),
        date: parseDate(dateRaw),
        paper: pick('paper', 'Paper', 'gsPaper', 'GSPaper') || 'GS2',
        subject: pick('subject', 'Subject'),
        theme: pick('theme', 'Theme', 'topic', 'Topic', 'Subtopic', 'subtopic'),
        subtopic: pick('subtopic', 'Subtopic', 'theme', 'Theme', 'topic', 'Topic'),
        question: pick('question', 'Question', 'title', 'Title'),
        marks: toNumber(marksRaw, 0),
        max: toNumber(maxRaw, 15) || 15,
        score: toNumber(pick('score', 'Score', 'marks', 'Marks'), 0),
        status: pick('status', 'Status'),
        gapCategory: pick('gapCategory', 'Gap Category', 'gap', 'Gap')
      });
    });
  }

  // Repair any cached rows produced by an older normalisation schema.
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

  maybeAutoSync();
})();
