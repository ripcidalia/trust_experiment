# Architecture

This repository implements a browser-based jsPsych experiment with:

- Deterministic participant/session identifiers
- Condition-set assignment (block/trial structures loaded from JSON)
- A rich interactive task trial (“two doors + drone recommendation”)
- Durable client-side logging (IndexedDB / localStorage fallback)
- Server receiver (Google Apps Script) writing to Google Sheets

---

## Runtime overview

At runtime, the system has four main “pipelines”:

1. **Configuration pipeline**
   - `src/config.js` defines `CONFIG` defaults.
   - `readConfigFromURL()` allows runtime overrides via query parameters.

2. **Experiment timeline pipeline**
   - Trial modules (`src/trials/*`) define jsPsych trial objects.
   - `src/trials/blocks.js` assembles the main door-trial phase into the jsPsych timeline.

3. **Condition-set pipeline**
   - `conditions/sets_v1.json` contains set definitions (3 blocks each).
   - `src/data/sets.js` selects which set applies to a participant and loads it.

4. **Logging pipeline**
   - Trial results are normalized into compact rows (`src/logging/build.js`).
   - Rows are queued durably (IndexedDB, fallback localStorage) (`src/logging/idb.js`)
   - Rows are uploaded in batches with retry/backoff (`src/logging/index.js`)
   - A pagehide sendBeacon attempts last-ditch delivery.

---

## Timeline composition (door-trial phase)

### Orchestrator: `initExperiment(timeline)` in `src/trials/blocks.js`

Responsibilities:

- Load the assigned set (`loadTrialsBlocks()`)
- Enrich trials with per-trial assets and risk overrides (`augmentTrialsWithRiskAndAssets`)
- Append trials to the jsPsych timeline using `createDoorTrial(...)`
- Insert trust probes:
  - Explicit indices from set block definitions (`block.probes`)
  - Or cadence-based gaps (`CONFIG.trust_probe_every_min/max`)
- Insert Trust-14 questionnaires at two midpoints:
  - event types: `questionnaire14mid1`, `questionnaire14mid2`

The door-trial phase is always structured:

Block 1 → Trust-14 Mid1 → Block 2 → Trust-14 Mid2 → Block 3

---

## Door trial implementation

### Factory: `createDoorTrial(t, idx, total, opts)` in `src/trials/doorTrial.js`

The door trial is a jsPsych HTML-keyboard-response trial with `choices: 'NO_KEYS'` (all control is custom).

Key modules it uses:

- Scene rendering: `src/scene/render.js`
- Overlay positioning + responsive layout: `src/scene/positioning.js`
- UI overlays (blackout): `src/ui/overlays.js`
- Theming helpers: `src/ui/theme.js`
- Asset sampling: `src/data/assets.js`

Important runtime behaviors:

- Applies dark UI theme on start.
- Renders the full scene HTML, fades it in after load.
- Runs an integrity countdown (“Environmental Integrity”) across active phases.
- Performs:
  - drone entry animation
  - scan cone sweep
  - hop to suggested door
  - decision HUD (Follow/Ignore)
  - reveal + outcome panel
  - blackout transition to next trial

### Risk overrides

Each trial may contain `risk_overrides`. During `on_load`, the trial temporarily mutates `window.CONFIG` fields (fire/smoke geometry and active risk key), then restores them in `on_finish`.

This allows per-trial risk styling and timing while keeping global defaults intact.

---

## Condition sets

### Source of truth: `conditions/sets_v1.json`

A set contains 3 blocks:

- `blocks[].probes`: indices where trust probes are inserted
- `blocks[].trials[]`: compact trial rows:
  - `victim`: L/R
  - `suggestion`: L/R
  - `risk`: low/medium/high/extreme

### Loader/selector: `src/data/sets.js`

`sets.js` is responsible for:

- Resolving an assigned `set_id` with precedence:
  1) URL override (if enabled)
  2) cached selection (localStorage)
  3) deterministic hash(pid)

- Fetching and validating `conditions/sets_v1.json`

- Normalizing rows to internal schema:
  - `true_location: left|right`
  - `suggestion: left|right`
  - `risk_key: low|medium|high|extreme`

- Coordinating with reputation assignment (read-only in this module; reputation module owns truth)

After loading, `blocks.js` calls `augmentTrialsWithRiskAndAssets(trials)` to attach:

- Per-trial background/door/victim/FX assets
- Per-trial `risk_overrides` derived from `CONFIG.risk_levels`

---

## Data flow and logging

### Trial → normalized row

All jsPsych trial objects emit raw `data` objects. Those are converted into compact “rows” by:

- `buildRowsForLogging(allTrials)` in `src/logging/build.js`

This function:

- maps each trial to an `event_type` (door trial, trust probe, questionnaire, etc.)
- computes derived signals like:
  - `followed` (choice matches suggestion)
  - `rt_ms`
  - questionnaire scores (trust40/trust14)
- adds session identifiers and UA summary fields
- preserves unknown fields for `extra_json`

### Durable queue + uploader

Once rows are built:

- `logTrialRow(d)` → `logEnqueue(rows)` (`src/logging/index.js`)
- `logEnqueue`:
  - appends to an in-memory tail buffer (`window.__LOG_BUFFER__`)
  - persists rows to IndexedDB (`src/logging/idb.js`) or localStorage fallback
  - schedules a near-term flush

Upload behavior:

- Flushes batches of 25
- Exponential backoff up to 30s
- `sendBeacon` attempts on `pagehide` to reduce loss on navigation/close

### Server receiver (Google Apps Script)

The server endpoint:

- accepts batches as form-encoded `payload=<json>`
- writes to `events` sheet with a canonical schema (HEADER array)
- de-duplicates rows via `row_id`
- supports:
  - hard delete by participant (`action=delete_by_participant`)
  - optional soft delete (`action=mark_withdrawn`)
  - condition assignment endpoint (`op=assign`) with balancing logic

(See `docs/data.md` for the schema and server API surface.)

---

## Where to look when modifying the experiment

Common edits map cleanly to modules:

- Change trial timing/visuals: `src/config.js` and `src/trials/doorTrial.js`
- Change probe frequency: `CONFIG.trust_probe_every_*` or set `blocks[].probes`
- Change block/trial structure: `conditions/sets_v1.json`
- Change which assets appear: `augmentTrialsWithRiskAndAssets` (in `src/data/sets.js`) and `src/data/assets.js`
- Change what gets logged: `src/logging/build.js` + Apps Script HEADER
