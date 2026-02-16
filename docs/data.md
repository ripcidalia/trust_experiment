# Data logging and handling

This document describes how the experiment records participant data, buffers it locally for durability, uploads it in batches, and supports an explicit “discard my data” flow.

The logging stack is designed for browser-based studies where participants may have intermittent connectivity, close tabs mid-task, or run the study on mobile devices.

## Components

### Client-side
- **Uploader / durable queue:** `src/logging/index.js`  
  Enqueues rows, persists them locally, flushes in batches with exponential backoff, and attempts a last-chance send on navigation.

- **Persistence layer:** `src/logging/idb.js`  
  Stores the queue in IndexedDB when available, falling back to `localStorage` when it is not.

- **Row normalization:** `src/logging/build.js`  
  Converts jsPsych trial objects into normalized “event-centric” rows suitable for storage and analysis.

### Server-side (receiver)
- **Google Apps Script web app** (GAS)  
  Receives client batches and appends them to a Google Sheet using a fixed header schema. Unknown fields are preserved in an `extra_json` column. A deletion action is supported for the explicit discard flow.

---

## Data model

The logging schema is a tall-table format: **one row per retained event** (trial, probe, questionnaire, etc.).

### Retained event types (allow-list)

`buildRowsForLogging()` retains only high-signal events and filters out low-value transitions/instructions. The canonical event types include:

- `door_trial`
- `trust_probe_mid`
- `reputation_item`
- `reputation_probe`
- `questionnaire40pre`, `questionnaire40post`
- `questionnaire14mid1`, `questionnaire14mid2`
- `questionnaire` (generic survey-like screens)
- `demographics`
- `emergency_trial`

Non-interactive demonstration/training rows are excluded.

### Core columns (sheet schema)

The receiver writes rows into a fixed header, including:

- **Response & event identity**
  - `event_type`: canonical event type (e.g., `door_trial`, `questionnaire40pre`)
  - `response`: unified response field (event-type dependent; see below)

- **Indexing**
  - `block_index`: optional block number
  - `trial_index`: optional trial number

- **Task context**
  - `risk_key`, `risk_value`: per-trial risk state (if present)
  - `suggestion`: drone suggestion (`left`/`right`) when applicable
  - `followed`: whether participant followed suggestion (derived where possible)
  - `correct`: whether the outcome was correct (where applicable)
  - `rt_ms`: reaction time in milliseconds (derived from seconds when provided)

- **Questionnaires**
  - `qa_pairs_json`: JSON string of `[question, answer]` pairs when available
  - `questionnaire_score`: computed total score/percent for Trust questionnaires when available

- **Reputation / reviews**
  - `review_condition`, `review_expected`
  - `review_ids`, `review_tones`, `review_avatars`

- **Stimulus identifiers (filenames only)**
  - `victim_skin`, `background_src`, `door_src`

- **Identifiers and timestamps**
  - `session_id`: stable random UUID-like value for one run/session
  - `participant_id`: client-generated participant identifier (PID)
  - `set_id`: optional stimulus set identifier
  - `ts_client`: client timestamp (ISO string)
  - `ts_seq`: monotonic per-session sequence number (when emitted)
  - `row_id`: session-scoped unique ID (`session_id:ts_seq`) when available

- **Device summary**
  - `device_type`: `desktop` / `tablet` / `mobile`
  - `browser_name`, `browser_major`
  - `user_agent`: raw UA string (emitted once per session; omitted for later rows)

- **Versioning**
  - `client_version`: application version string

- **Forward compatibility**
  - `extra_json`: JSON blob containing any additional fields not in the canonical header

### Unified `response` field semantics

The client emits a single `response` column to simplify analysis:

- **Door trials (`door_trial`)**: JSON string `{"followed": <bool|null>, "correct": <bool|null>}`
- **Trust probes (`trust_probe_mid`)**: numeric slider value
- **Reputation probe (`reputation_probe`)**: delta / response value
- **Trust questionnaires**:
  - Trust-40 pre/post: a numeric score (and optionally a paired `(trust40, trust14_equiv)` string if both are present)
  - Trust-14 mid probes: numeric total percent/score where available
- **Demographics**: response string where present
- **Other events**: raw `response` value if present

> Note: full raw questionnaire answers are stored in `qa_pairs_json` when extractable.

---

## Local durability: queueing, persistence, and retries

### Storage layers

1. **In-memory tail buffer**: `window.__LOG_BUFFER__`  
   Keeps a recent mirror of enqueued rows. Used for a last-chance `sendBeacon()` attempt on page unload/navigation.

2. **IndexedDB queue** (preferred)  
   - DB: `trustdoors-logs`
   - Object store: `events`
   - Entries: `{ createdAt: <ms>, row: <object> }` with auto-increment key

3. **localStorage fallback**  
   If IndexedDB is unavailable or fails to open, rows are appended to the `log_queue_ls` array in localStorage.

### Enqueue and batch flushing

- Batch size: **25 rows**
- When a row is enqueued:
  - it is appended to `window.__LOG_BUFFER__`
  - persisted via IndexedDB/localStorage
  - a flush is scheduled shortly afterward (`~250ms`)

### Retry behavior

- Upload failures trigger exponential backoff:
  - starts at **0.5s**, doubles each attempt, caps at **30s**
- Successful uploads delete flushed items from the persistent queue.

### Last-chance delivery (`sendBeacon`)

On navigation away from the page, the app may attempt a best-effort delivery:

- `flushSyncBeacon()` sends the most recent rows (tail slice)
- payload is capped at ~60KB (conservative)
- transport: `navigator.sendBeacon()` with `application/x-www-form-urlencoded`

This improves resilience for unexpected exits but is not guaranteed (beacons are best-effort by browser design).

---

## Upload protocol

### Endpoint

The client posts to a Google Apps Script web app endpoint (defined by `LOG_ENDPOINT` in `src/logging/index.js`).

### Request format

- Method: `POST`
- Content-Type: `application/x-www-form-urlencoded;charset=UTF-8`
- Body: `payload=<urlencoded JSON>`

Example payload JSON:
```json
{
  "rows": [
    { "event_type": "door_trial", "participant_id": "R8F3K2J1A", "...": "..." },
    { "event_type": "trust_probe_mid", "participant_id": "R8F3K2J1A", "...": "..." }
  ]
}
```

### Success conditions

The uploader treats common redirect/opaque responses as success (to accommodate Apps Script hosting and redirects), including:

* standard `2xx` responses
* `302` redirects
* `opaqueredirect` / `opaque` fetch response types

---

## Server-side storage (Google Sheets)

The Apps Script receiver:

1. Ensures the target sheet exists and the header matches the canonical schema.
2. Maps incoming row objects into header-ordered arrays.
3. Writes unknown keys into `extra_json` (last column).
4. Optionally de-duplicates rows by `row_id` if present, by maintaining a set of observed IDs.

This approach supports incremental schema evolution: new client fields are still retained (in `extra_json`) even before the header is updated.

---

## Discard / withdrawal flow

Participants can exit early and choose whether to keep or discard their data. The discard option attempts to remove both **local** buffered data and **server-side** stored rows.

### Local discard

`clearLocalQueue()`:

* clears the in-memory buffer `window.__LOG_BUFFER__`
* clears IndexedDB queue if available
* otherwise clears `localStorage.log_queue_ls`

### Server-side deletion request

`requestDeleteByParticipant(participantId)` sends:

* `action=delete_by_participant`
* `participant_id=<PID>`

Delivery method:

* uses `sendBeacon()` when available (to survive navigation)
* falls back to `fetch()` with `keepalive: true`

The Apps Script handler deletes all rows in the events sheet that match `participant_id` and also deletes any assignment rows associated with that participant (if applicable).

> Implementation note: server-side deletion is best-effort from the client’s perspective; if the participant is offline at the moment of discard, the deletion request may not reach the server.

---

## Privacy and data minimization (implementation-focused)

The logging system is designed to record what is needed for behavioral analysis while avoiding direct identifiers.

* `participant_id` is generated client-side and is not inherently identifying.
* Coarse device and browser metadata are recorded.
* Raw `user_agent` is included **only once per session**; if this is not permitted by your ethics protocol, it can be removed by omitting the UA emission in `src/logging/build.js`.
* The receiver stores a stable schema and preserves unexpected fields in `extra_json` for robustness.

---

## Operational notes

* **Schema changes:** if new fields are added, they will be preserved in `extra_json` immediately. If they are desired as first-class columns, updating the Apps Script `HEADER` is required.
* **Versioning:** `client_version` should be updated when row schema meaning changes, to simplify downstream analysis and auditing.
* **Reproducibility:** if relying on seeded randomization, ensure `seed` and any condition identifiers are stamped into rows (the app already stamps key config properties via jsPsych data properties).
