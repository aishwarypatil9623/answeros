from pathlib import Path

ROOT = Path('.')

LIVE_EXPR = """const ANSWERS = (() => {
  const live = window.AnswerOS?.getAnswers?.() || [];
  if (live.length) {
    return live.map((a, i) => ({
      ...a,
      id: a.id || String(i + 1),
      date: a.date || '',
      paper: a.paper || 'Unknown',
      subject: a.subject || '',
      theme: a.theme || '',
      subtopic: a.subtopic || a.theme || a.question || `Answer ${i + 1}`,
      question: a.question || a.subtopic || '',
      marks: Number(a.marks ?? 0),
      max: Number(a.maxMarks ?? a.max ?? 15) || 15,
      maxMarks: Number(a.maxMarks ?? a.max ?? 15) || 15,
      score: Number(a.score ?? a.marks ?? 0),
      score10: Number.isFinite(Number(a.score10)) ? Number(a.score10) : null,
      directive: a.directive || '',
      demand: Number.isFinite(Number(a.demandAddressed)) ? Number(a.demandAddressed) : null,
      demandPct: Number.isFinite(Number(a.demandAddressed)) ? Number(a.demandAddressed) : null,
      demandAddressed: Number.isFinite(Number(a.demandAddressed)) ? Number(a.demandAddressed) : null,
      status: a.status || 'PROCESSED',
      gapCategory: a.gapCategory || '',
      feedback: a.feedback || '',
      learning: a.learning || '',
      pdfDate: a.pdfDate || '',
      bestIntro: a.bestIntro || '',
      idealSubheadings: Array.isArray(a.idealSubheadings) ? a.idealSubheadings : [],
      mustHavePoints: Array.isArray(a.mustHavePoints) ? a.mustHavePoints : [],
      valueAdditions: Array.isArray(a.valueAdditions) ? a.valueAdditions : [],
      keywords: Array.isArray(a.keywords) ? a.keywords : [],
      examples: Array.isArray(a.examples) ? a.examples : [],
      bestConclusion: a.bestConclusion || '',
      improvements: Array.isArray(a.improvements) ? a.improvements : [],
      topperEdge: a.topperEdge || '',
      demandBreakdown: Array.isArray(a.demandBreakdown) ? a.demandBreakdown : []
    }));
  }
  return ["""


def matching_close(text, open_pos):
    depth = 0
    quote = None
    escape = False
    line_comment = False
    block_comment = False
    i = open_pos
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ''
        if line_comment:
            if ch == '\n': line_comment = False
            i += 1; continue
        if block_comment:
            if ch == '*' and nxt == '/': block_comment = False; i += 2; continue
            i += 1; continue
        if quote:
            if escape: escape = False
            elif ch == '\\': escape = True
            elif ch == quote: quote = None
            i += 1; continue
        if ch == '/' and nxt == '/': line_comment = True; i += 2; continue
        if ch == '/' and nxt == '*': block_comment = True; i += 2; continue
        if ch in ('\"', "'", '`'):
            quote = ch; i += 1; continue
        if ch == '[': depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0: return i
        i += 1
    return -1


def adapt(path):
    text = path.read_text(encoding='utf-8')
    original = text

    if 'answeros-data.js' not in text and '</head>' in text:
        text = text.replace('</head>', '<script src="answeros-data.js"></script>\n</head>', 1)

    marker = 'const ANSWERS = ['
    if marker in text and 'const ANSWERS = (() => {' not in text:
        start = text.index(marker)
        open_pos = start + text[start:].index('[')
        close_pos = matching_close(text, open_pos)
        if close_pos == -1:
            raise RuntimeError(f'Could not match ANSWERS array in {path}')
        replacement = LIVE_EXPR + text[open_pos + 1:close_pos] + '];\n})();'
        text = text[:start] + replacement + text[close_pos + 1:]

    # Upgrade older shared-store adapters to the canonical mapping.
    legacy_anchor = "date: a.date || a.Date || a.timestamp || a.Timestamp || '',"
    if legacy_anchor in text:
        start = text.rfind('const ANSWERS = (() => {', 0, text.index(legacy_anchor))
        if start != -1:
            end_marker = '\n  return ['
            end = text.find(end_marker, start)
            if end != -1:
                fallback = text[end + len(end_marker):]
                text = text[:start] + LIVE_EXPR + fallback

    # All Answers historically uses `demand` for the checklist array, while
    # Analytics uses it as the numeric percentage. Keep the canonical numeric
    # field and point the checklist UI at the canonical breakdown instead.
    text = text.replace('(a.demand||[]).map(', '((a.demandBreakdown || a.demand || [])).map(')
    text = text.replace('a.demand.map(', '(a.demandBreakdown || a.demand || []).map(')

    hook = """\n<script>\nwindow.addEventListener('answeros:data-updated', function(){\n  if (window.__answerosLiveReloadBound) return;\n  window.__answerosLiveReloadBound = true;\n  setTimeout(function(){ location.reload(); }, 50);\n});\n</script>\n"""
    if 'answeros:data-updated' not in text and '</body>' in text:
        text = text.replace('</body>', hook + '</body>', 1)

    if text != original:
        path.write_text(text, encoding='utf-8')
        return True
    return False


changed = []
for path in sorted(ROOT.glob('*.html')):
    if path.name in {'answeros-settings.html'}:
        continue
    if adapt(path): changed.append(path.name)

print('Adapted:', ', '.join(changed) if changed else 'none')
