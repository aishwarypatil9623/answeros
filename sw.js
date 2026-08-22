const CACHE_NAME = 'answeros-live-v1';

function findMatchingBracket(text, openPos) {
  let depth = 0, quote = null, escape = false, lineComment = false, blockComment = false;
  for (let i = openPos; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1] || '';
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && nx === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && nx === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && nx === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function adapt(html) {
  if (!html.includes('answeros-data.js')) {
    html = html.replace('</head>', '<script src="answeros-data.js"></script>\n</head>');
  }
  const marker = 'const ANSWERS = [';
  if (!html.includes(marker) || html.includes('const ANSWERS = (() => {')) return html;
  const start = html.indexOf(marker);
  const open = start + html.slice(start).indexOf('[');
  const close = findMatchingBracket(html, open);
  if (close < 0) return html;
  const live = `const ANSWERS = (() => {\n  const live = window.AnswerOS?.getAnswers?.() || [];\n  if (live.length) return live.map((a, i) => ({\n    date: a.date || a.Date || a.timestamp || a.Timestamp || '',\n    paper: a.paper || a.Paper || a.gsPaper || a.GSPaper || a.subject || a.Subject || 'GS2',\n    subject: a.subject || a.Subject || a.paper || a.Paper || '',\n    subtopic: a.subtopic || a.Subtopic || a.theme || a.Theme || a.topic || a.Topic || a.question || a.Question || ('Answer ' + (i + 1)),\n    question: a.question || a.Question || a.title || a.Title || '',\n    marks: Number(a.marks ?? a.Marks ?? a.score ?? a.Score ?? 0),\n    max: Number(a.max ?? a.Max ?? a.maxMarks ?? a['Max Marks'] ?? 15),\n    status: a.status || a.Status || 'PROCESSED',\n    gapCategory: a.gapCategory || a['Gap Category'] || a.gap || ''\n  }));\n  return [`;
  return html.slice(0, start) + live + html.slice(open + 1, close) + '];\n})();' + html.slice(close + 1);
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || !url.pathname.endsWith('.html')) return;
  event.respondWith((async () => {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response.ok) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;
    const html = await response.text();
    return new Response(adapt(html), { status: response.status, statusText: response.statusText, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  })());
});
