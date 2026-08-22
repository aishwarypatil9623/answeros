# AnswerOS Data Contract v2

`answeros-data.js` is the single source of truth for answer-row normalization and Google Sheet synchronization.

## Canonical answer object

Every page receives the same normalized object from `window.AnswerOS.getAnswers()`.

### Identity / classification
- `id`
- `date` — canonical `YYYY-MM-DD`
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
- `demand` — compatibility alias
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
- `demandBreakdown[]`

## Rules

1. Pages must consume `window.AnswerOS.getAnswers()` rather than defining their own Sheet-column mapping.
2. Raw Sheet rows remain available through `getRows()` for debugging/export.
3. Missing/invalid dates become an empty string; UI must render them as unavailable, never as `Invalid Date`.
4. Missing demand remains `null`; UI must render `—`, never `NaN%`.
5. Demand values from `0–1` are interpreted as fractions and converted to `0–100`; values already in `0–100` are retained.
6. Google Sheets / Excel serial dates are supported.
7. JSON sync responses may expose `rows`, `data`, or `answers`; CSV responses are also accepted.
8. `metrics()` provides shared derived statistics so future modules can avoid duplicating calculations.
9. `validate()` exposes row-level errors and warnings without silently deleting data.
10. The v1 local store is migrated automatically into the v2 store.

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

This keeps the Sheet schema-to-UI mapping in one place and prevents dashboard, analytics, PYQ, revision and answer-list pages from drifting into different interpretations of the same row.
