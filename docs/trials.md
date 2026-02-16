# Trial modules

This document describes the trial layer of the experiment: the modules in `src/trials/` that define jsPsych trial objects and assemble the interactive task timeline.

The trial system is responsible for:

- Defining the behavioral task (door trials)
- Inserting trust probes and questionnaires
- Structuring the experiment into blocks
- Emitting trial data for logging

---

## Overview

Trial logic is split into:

- **Core task trial**
  - `doorTrial.js` — the main interactive task

- **Experiment orchestration**
  - `blocks.js` — builds the main door-trial phase and inserts probes/questionnaires

- **Questionnaires**
  - `trust40pre.js`, `trust40post.js`
  - `trust14mid.js`

- **Probes**
  - `trustProbe.js`
  - `reputationProbe.js`

- **Reputation exposure**
  - `reputation.js` (reviews presentation)

Each module exports a function returning a jsPsych-compatible trial object.

---

## `doorTrial.js`

### Purpose
Implements the main behavioral task: choosing between two doors after observing a drone scan and recommendation.

### Export
```js
createDoorTrial(trialData, trialIndex, totalTrials, opts)
````

### Inputs

* `trialData`

  * `true_location`: `"left" | "right"`
  * `suggestion`: `"left" | "right"`
  * `risk_key`
  * optional `risk_overrides`
* `trialIndex`
* `totalTrials`
* `opts`

  * `demo`: boolean
  * `dwellMs`: demo dwell duration

### Behavior

A door trial includes:

1. Scene render (background, doors, drone, fire/smoke overlays)
2. Drone entry animation
3. Scan cone sweep
4. Drone hop to suggested door
5. Decision HUD:

   * Follow (`F`)
   * Ignore (`N`)
6. Door reveal
7. Outcome panel (success/failure)
8. Blackout transition

### Timer and integrity system

* Countdown runs across active phases
* Visual urgency increases near timeout
* May auto-follow suggestion if timer expires

### Risk overrides

Per-trial overrides modify:

* FX geometry
* animation speed
* shake intensity
* decision timeout scaling

Overrides temporarily mutate `window.CONFIG` during the trial and are restored afterward.

### Logged data

Each door trial emits:

* `choice`
* `reaction_time_s`
* `correct`
* `suggestion`
* `timed_out`
* `risk_key`
* `risk_value`
* `decision_timeout_ms_used`

These fields are normalized by the logging pipeline.

---

## `blocks.js`

### Purpose

Assembles the main door-trial phase and inserts trust probes and midpoint questionnaires.

### Export

```js
initExperiment(timeline)
```

### Responsibilities

1. Load assigned condition set
2. Enrich trials with assets + risk overrides
3. Append door trials to timeline
4. Insert:

   * trust probes within blocks
   * Trust-14 questionnaires between blocks

### Block structure

The experiment always runs:

```
Block 1
Trust-14 Midpoint 1
Block 2
Trust-14 Midpoint 2
Block 3
```

### Probe insertion

Two modes:

**Explicit indices**

* Provided in condition set (`block.probes`)
* Probes inserted after specified trials

**Cadence-based**

* Random gaps drawn from:

  * `CONFIG.trust_probe_every_min`
  * `CONFIG.trust_probe_every_max`

---

## `trustProbe.js`

### Purpose

Captures real-time trust in the drone during the task.

### Export

```js
makeTrustProbeTrial(context)
```

### Behavior

* Slider-style response
* Context stamped (block, timing, etc.)
* Inserted between trials

### Logged fields

* `slider_value`
* probe context identifiers
* timestamps

Mapped to event type:

```
trust_probe_mid
```

---

## `trust14mid.js`

### Purpose

Mid-task trust measurement using the Trust-14 instrument.

### Usage

Inserted twice:

* after Block 1
* after Block 2

### Logged fields

* full response pairs
* computed Trust-14 score

Mapped to event types:

```
questionnaire14mid1
questionnaire14mid2
```

---

## `trust40pre.js` / `trust40post.js`

### Purpose

Pre- and post-task trust measurement using the Trust-40 instrument.

### Placement

Outside the main door-trial phase in the top-level timeline.

### Logged fields

* raw answers
* Trust-40 score
* derived Trust-14-equivalent score (if computed)

Mapped to event types:

```
questionnaire40pre
questionnaire40post
```

---

## `reputation.js`

### Purpose

Displays review sets representing the drone’s reputation.

### Behavior

* Shows multiple reviews (cards/avatars/text)
* Controlled by:

  * `CONFIG.review_condition`
  * assignment service / condition logic

### Logged fields

* review identifiers
* tone distribution
* expected reputation value

Mapped to:

```
reputation_item
```

---

## `reputationProbe.js`

### Purpose

Captures participant’s perception of the drone’s reputation after exposure.

### Logged fields

* probe response / delta
* context identifiers

Mapped to:

```
reputation_probe
```

---

## Trial → logging pipeline

All trial modules:

1. Emit jsPsych `data` objects
2. Data is normalized by:

   ```
   src/logging/build.js
   ```
3. Converted into event-centric rows
4. Enqueued to durable logging queue
5. Uploaded to server in batches

For full schema and upload details:
See `docs/data.md`.

---

## Adding a new trial

To add a new trial type:

1. Create module in `src/trials/`
2. Export a function returning a jsPsych trial object
3. Stamp:

   * `event_type`
   * key fields required for analysis
4. Append to timeline via:

   * `initExperiment()` (main task)
   * or top-level timeline builder

The logging pipeline will automatically capture unknown fields and store them in `extra_json`.

---

## Modifying existing trials

Common changes:

| Goal                   | Where to edit                               |
| ---------------------- | ------------------------------------------- |
| change timing          | `CONFIG` in `src/config.js`                 |
| change visuals         | `doorTrial.js`                              |
| change probe frequency | `blocks.js` or `CONFIG.trust_probe_every_*` |
| change logged fields   | `src/logging/build.js`                      |
| change block structure | `conditions/sets_v1.json`                   |

---

## Design principles

The trial layer is designed to:

* separate **task logic** from **timeline orchestration**
* keep **logging independent** of UI rendering
* allow **condition sets** to fully define block/trial composition
* support **reproducibility** via config stamping and seed usage
* enable **reuse** in future experiments by swapping sets, assets, or probe modules
