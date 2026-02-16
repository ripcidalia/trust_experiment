# Experiment flow

This experiment is implemented as a jsPsych timeline composed of:

- Intro / instruction screens
- Reputation (reviews) stage + probe
- Trust questionnaire(s)
- A short demonstration (non-interactive)
- Three blocks of “two doors + drone recommendation” trials
- Interleaved trust probes and two mid-block Trust-14 questionnaires
- Final questionnaires / demographics (depending on the top-level timeline)

The core task is the **door trial**: participants must choose between a left and right door after a drone scans the scene and recommends one door.

---

## High-level timeline

The **door-trial phase** is orchestrated by `src/trials/blocks.js` via `initExperiment(timeline)`:

1. **Block 1** (door trials + mid-block probes)
2. **Trust-14 midpoint #1** (`questionnaire14mid1`) + single trust probe
3. **Block 2** (door trials + mid-block probes)
4. **Trust-14 midpoint #2** (`questionnaire14mid2`) + single trust probe
5. **Block 3** (door trials + mid-block probes)

Each block contains a list of trials from an assigned condition set (see “Condition sets”).

---

## Door trial: what the participant experiences

A single door trial (`src/trials/doorTrial.js`) consists of the following phases:

1. **Scene render**
   - Background, two doors, fire/smoke overlays, drone, HUD elements are rendered.
   - The scene fades in from transparent after load.

2. **Drone entry**
   - Drone enters from off-screen left to the center at a configured cruise speed, easing to a stop.
   - The “Environmental Integrity” countdown spans the entire active phase (entry + scan + hop + decision).

3. **Scan sweep (“cone scan”)**
   - A scan cone appears and performs a sweep: down → left dwell → right dwell → down → fade.
   - The cone apex tracks the drone position during the sweep.

4. **Drone hop to suggested door**
   - Drone moves to the door it recommends (left/right), using speed-based duration and easing.
   - Hover motion remains active during/after the hop.

5. **Decision HUD**
   - A HUD appears stating: “The drone recommends the LEFT/RIGHT door.”
   - Participant chooses:
     - **Follow** (keyboard: `F`) → choose the recommended door
     - **Ignore** (keyboard: `N`) → choose the opposite door
   - If the integrity timer expires, the trial can auto-follow depending on timer state/action.

6. **Door reveal + outcome**
   - The chosen door opens.
   - The victim is revealed behind the chosen door (or not).
   - An outcome panel shows **SUCCESS** (victim found) or **FAILURE** (no victim found).

7. **Blackout transition**
   - A blackout overlay (“Relocating to next search area…”) is shown between trials (except after the final trial in the block/sequence).
   - Trial ends and logs are emitted.

---

## Decision timing and “Environmental Integrity”

The door trial maintains a countdown bar (“Environmental Integrity”):

- The timer visually changes color (blue → white → red) as time runs down.
- Below a threshold (`CONFIG.env_pulse_threshold`), UI elements pulse (“heartbeat”).
- Timeout behavior:
  - If the timer reaches 0 while the HUD is expanded, the trial will trigger a follow action.
  - If it hits 0 before expansion, it arms an “auto-follow on next decision moment.”

Timing inputs come from:

- `CONFIG.drone_entry_*`, `CONFIG.drone_prebuffer_ms`, `CONFIG.drone_buffer_ms`, `CONFIG.drone_anim_ms`
- `CONFIG.decision_timeout_ms` (or risk override per trial)
- Risk scaling may shorten the available decision window.

---

## Interleaved trust probes

Trust probes are created by `makeTrustProbeTrial(context)` and inserted by `src/trials/blocks.js`.

There are two insertion modes:

### 1) Explicit probe indices (preferred in sets)
If the block definition includes `block.probes` (e.g., `[6, 10, 15]`), probes are inserted after those trial numbers (1-based), excluding the final trial.

Flow:
- door trial
- fade transition (light)
- trust probe (`trust_probe_mid`)
- fade transition (dark)

### 2) Cadence-based probes (fallback)
If explicit indices are not provided, probes are inserted based on a randomized cadence:

- Gaps drawn uniformly from `[CONFIG.trust_probe_every_min, CONFIG.trust_probe_every_max]`

This ensures probes are spaced within a block without needing fixed indices.

---

## Midpoint Trust-14 questionnaires

Between blocks:

- A fade transition is shown
- A Trust-14 questionnaire is presented
- A single trust probe follows immediately afterward

These are stamped with event types:

- `questionnaire14mid1`
- `questionnaire14mid2`

This creates two mid-task checkpoints to track trust changes during the main task.

---

## Condition sets (blocks/trials)

Trial structure comes from `conditions/sets_v1.json`.

- A **set** contains exactly **3 blocks**
- Each block contains:
  - `probes`: explicit indices for trust probe insertion
  - `trials`: 20 trials (in your current config)

Each trial row uses a compact schema:

- `victim`: `"L"` or `"R"` (true victim location)
- `suggestion`: `"L"` or `"R"` (drone recommendation)
- `risk`: `"low" | "medium" | "high" | "extreme"`

At runtime, these are normalized to:

- `true_location: "left" | "right"`
- `suggestion: "left" | "right"`
- `risk_key: one of the risk levels`

The normalization + selection of which set a participant receives is handled by `src/data/sets.js` (see architecture doc).

---

## Training / demonstration trial

A demonstration mode exists in the door trial code (`opts.demo`):

- Shows “Demonstration – no interaction required”
- Victim reveal is suppressed (both sides show empty)
- After a fixed dwell period, the demo ends and transitions into the main task.

The demo parameters (dwell, text, etc.) come from `CONFIG.training`.

---

## Logged outcomes (door trial)

Each door trial writes (at least) the following fields:

- `choice`: `"left" | "right"`
- `reaction_time_s`
- `correct` (whether chosen door matched `true_location`)
- `suggestion`
- `timed_out` (true if integrity timer hit zero)
- risk fields (`risk_key`, `risk_value`, shake params)
- `decision_timeout_ms_used`

All trial rows go through the central logger, which buffers locally and uploads to the server endpoint.

For the full data schema and logging pipeline, see: `docs/data.md`.
