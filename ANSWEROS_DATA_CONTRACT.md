# AnswerOS Data Contract v2

`answeros-data.js` is the single source of truth for answer-row normalization and Google Sheet synchronization.

## Canonical answer object

Every page receives the same normalized object from `window.AnswerOS.getAnswers()`.

### Identity / classification
- `id`
- `date` — canonical `YYYY-MM-DD`; rows without a valid date are excluded from the default answer feed and remain available through `getAnswers({includeInvalid:true})` for diagnostics.
- `paper` — e.g. `GS1`, `GS2`, `GS3`, `GS4`, `Essay`, `PSIR`
- `subject`
- `theme`
- `subtopic`
- `question`
- `directive`

### Scoring
- `marks`
- `maxMarks`
- `score10` — normalized score on a 0–10 scale
- `score` — marks obtained

### Evaluation
- `demandAddressed` — normalized 0–100 percentage
- `demandPct` — alias of `demandAddressed`
- `demand` — compatibility alias for the numeric percentage
- `demandBreakdown[]` — optional checklist of question demands, when available
- `status`
- `gapCategory`
- `feedback`
- `learning`

### Answer-building value addition
- `bestIntro`
- `idealSubheadings[]`
- `mustHavePoints[]`
- `valueAdditions[]`
- `keywords[]`
- `examples[]`
- `bestConclusion`
- `improvements[]`
- `topperEdge`

## Rules

1. Pages must consume `window.AnswerOS.getAnswers()` rather than defining their own Sheet-column mapping.
2. Raw Sheet rows remain available through `getRows()` for debugging/export.
3. A row must have a valid date plus a question, subtopic, or subject to enter the default answer feed.
4. Missing/invalid dates are never rendered as `Invalid Date`; malformed rows are surfaced through `validate()` instead.
5. Missing demand remains `null`; UI must render `—`, never `NaN%`.
6. Demand values from `0–1` are interpreted as fractions and converted to `0–100`; values already in `0–100` are retained.
7. Google Sheets / Excel serial dates are supported.
8. JSON sync responses may expose `rows`, `data`, or `answers`; CSV responses are also accepted.
9. `metrics()` provides shared derived statistics so future modules can avoid duplicating calculations.
10. `validate()` exposes row-level errors and warnings without silently deleting raw data.
11. The v1 local store is migrated automatically into the v2 store.
12. UI-specific compatibility adapters may translate canonical fields for legacy components, but the Sheet mapping itself remains centralized in `answeros-data.js`.

## Shared API

```text
AnswerOS.VERSION
AnswerOS.SCHEMA
AnswerOS.normalizeRow(row)
AnswerOS.normalizeRows(rows)
AnswerOS.validate()
AnswerOS.metrics()
AnswerOS.getStore()
AnswerOS.getRows()
AnswerOS.getAnswers()
AnswerOS.getAnswers({includeInvalid:true})
AnswerOS.getConfig()
AnswerOS.setConfig(patch)
AnswerOS.setRows(rows)
AnswerOS.sync()
AnswerOS.subscribe(callback)
```

## Architecture

```text
Google Sheet / JSON / CSV
          ↓
   answeros-data.js
          ↓
   canonical answer rows
          ↓
 ┌────────┼─────────┬──────────┐
 ↓        ↓         ↓          ↓
Dashboard Analytics All Answers Future modules
```

The repository workflow automatically reapplies the shared adapter whenever `answeros-data.js` or the adapter script changes. This keeps the Sheet schema-to-UI mapping in one place and prevents dashboard, analytics, answer-list, calendar and future PYQ/revision modules from drifting into different interpretations of the same row.
