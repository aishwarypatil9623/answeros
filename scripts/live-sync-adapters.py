from pathlib import Path

ROOT = Path('.')

LIVE_EXPR = """const ANSWERS = (() => {
  const live = window.AnswerOS?.getAnswers?.() || [];
  if (live.length) {
    return live.map((a, i) => ({
      date: a.date || a.Date || a.timestamp || a.Timestamp || '',
      paper: a.paper || a.Paper || a.gsPaper || a.GSPaper || a.subject || a.Subject || 'GS2',
      subject: a.subject || a.Subject || a.paper || a.Paper || '',
      subtopic: a.subtopic || a.Subtopic || a.theme || a.Theme || a.topic || a.Topic || a.question || a.Question || `Answer ${i + 1}`,
      question: a.question || a.Question || a.title || a.Title || '',
      marks: Number(a.marks ?? a.Marks ?? a.score ?? a.Score ?? 0),
      max: Number(a.max ?? a.Max ?? a.maxMarks ?? a['Max Marks'] ?? 15),
      status: a.status || a.Status || 'PROCESSED',
      gapCategory: a.gapCategory || a['Gap Category'] || a.gap || ''
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

    # Pages that render from the shared store should refresh their own view when another tab syncs.
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
