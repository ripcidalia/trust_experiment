# Configuration

This project is configured through a single central object exported from `src/config.js`:

- `CONFIG`: default experiment parameters (task size, timing, visuals, training, risk profiles).
- `readConfigFromURL()`: optional runtime overrides via URL query parameters.
- `pid`: participant identifier minted (or reused) on load.

The configuration is intentionally **environment-agnostic**: it can run from any static host, and most values can be overridden at runtime without editing source code.

---

## Where configuration is applied

At runtime, the bootstrap code (see `src/main.js`) mirrors configuration to `window.CONFIG` and stamps selected values into jsPsych rows (e.g., `participant_id`, `seed`, task size). This makes analysis reproducible and supports debugging from exported logs.

---

## Participant ID (PID)

`pid` is created by `getPID()` and follows these rules:

1. **Explicit override**  
   If the URL contains `?participant_id=...` or `?participant=...`, that value is used and persisted to `localStorage`.

2. **Continuation URLs (`old=1`)**  
   If the URL contains `?old=1`, the code reuses `localStorage.pid` (or mints one if missing).

3. **Refresh / double-click guard (~4 seconds)**  
   On a “fresh” URL (no `old=1`), the loader checks `localStorage.last_boot_ts` + `last_boot_pid`.  
   If a PID was minted within the last ~4 seconds, it reuses it and rewrites the URL to include `old=1`.  
   This reduces accidental multi-tab or double-click creation of multiple participant IDs.

PID format: a short random string such as `R8F3K2J1A` (prefix `R` + uppercase base36 suffix).

---

## Core task parameters

- `CONFIG.N`  
  Number of main task trials (door trials) to generate/run.

- `CONFIG.drone_success_rate`  
  Probability that the drone’s suggestion matches the “true” victim location (used when sequences are generated stochastically).

- `CONFIG.sequence`  
  Optional explicit trial sequence (array of objects `{ true_location, suggestion }`).  
  When present, it overrides stochastic generation and provides deterministic trial composition.

- `CONFIG.seed`  
  Optional seed value for deterministic randomization (when used by the task generators).

---

## Timing controls

### Drone / animation timing (ms)
- `drone_buffer_ms`: scan sweep duration
- `drone_prebuffer_ms`: scan cone lead-in
- `drone_anim_ms`: travel / hop duration (center → door)

### Drone motion model (px/s and easing)
- entry: `drone_entry_cruise_px_per_s`, `drone_entry_decel_frac`
- hop: `drone_hop_speed_px_per_s`, `drone_hop_duration_scale`, `drone_hop_min_ms`
- exit: `drone_exit_accel_frac`, `drone_exit_accel_speed_px_per_s`, `drone_exit_cruise_px_per_s`, `drone_exit_edge_offset_px`

### Decision window
- `decision_timeout_ms`: max time to choose a door
- `timer_warn_ms`, `timer_critical_ms`: threshold styling / warning cues
- `timer_action`: what happens on timeout
  - `'auto_follow'`: automatically follow the drone suggestion
  - `'none'`: do nothing / handle elsewhere

---

## Visual theming and environment

- `env_warmth`: `'cool' | 'warm' | 'hot'` (base theme)
- `env_show_pct`: show/hide environment integrity percentage
- `env_pulse_threshold`: threshold at which pulsing cues engage

---

## Scene transitions / blackout

- `blackout_text`: message shown during fades
- `blackout_hold_ms`: how long blackout remains visible
- `blackout_fade_ms`: fade duration

---

## Foreground FX (fire/smoke)

The FX system supports both absolute pixel fallbacks and fraction-based geometry (preferred):

- Pixel fallbacks: `fire_inward_px`, `smoke_inward_px`, `smoke_rise_px`, etc.
- Fraction-based geometry:
  - `fire_inward_vw`, `smoke_inward_vw` (relative to viewport width)
  - `smoke_rise_vh`, `smoke_y_offset_vh` (relative to viewport height)
  - base insets: `fire_base_inset_vw`, `smoke_base_inset_vw`

Animation base periods (ms):
- `fire_base_slide_period_ms`
- `smoke_base_slide_period_ms`
- `smoke_base_rise_period_ms`

---

## Reputation / reviews

- `review_condition`: optional fixed label (one of 7), otherwise assigned at runtime
- `review_set_size`: number of reviews shown
- `review_reveal_stagger_ms`: stagger animation between cards
- `review_expected_map`: maps each label to an “expected reputation” numeric value:

`very_positive (+2.0), moderately_positive (+1.2), slightly_positive (+0.8), mixed (0.0), slightly_negative (-0.8), moderately_negative (-1.2), very_negative (-2.0)`

---

## Training block

`CONFIG.training` controls the non-interactive demo shown before the main task:

- `enabled`: toggles training
- `n`: number of demos (auto-play)
- `p`: correctness rate in demos (visual-only)
- `dwell_ms`: hover duration at suggested door
- `show_decision_box`, `show_outcome`: presentation toggles
- training-specific blackout message and timing:
  - `blackout_text`, `blackout_hold_ms`, `blackout_fade_ms`

> Note: `readConfigFromURL()` currently writes `CONFIG.training.demos` when `trainDemos` is set. If the codebase uses `training.n` as the canonical field, treat `training.demos` as legacy/compatibility.

---

## Risk profiles

`CONFIG.risk_levels` defines per-trial overrides for low/medium/high/extreme risk states:

Each risk profile can control:
- warmth (visual theme)
- FX geometry fractions (fire/smoke encroachment and rise)
- FX animation speed multipliers (`fire_speed`, `smoke_speed_h`, `smoke_speed_v`)
- decision timeout scaling (`timeout_scale`)
- shake parameters (`shake_amp_px`, `shake_period_ms`)
- `risk_value` scalar (0–1)

---

## URL parameters (runtime overrides)

`readConfigFromURL()` supports the following query parameters:

### Core
- `N`: integer number of main trials  
  Example: `?N=30`
- `p`: drone success rate in [0,1]  
  Example: `?p=0.65`
- `seed`: integer seed  
  Example: `?seed=123`
- `seq`: explicit sequence as comma-separated pairs `LR` / `RL`  
  Example: `?seq=LR,RL,LR`  
  Interpreted as `[{true_location:'left', suggestion:'right'}, ...]`

### Timing
- `buffer`: overrides `drone_buffer_ms`  
- `anim`: overrides `drone_anim_ms`
- `timeout` (alias `timer`): overrides `decision_timeout_ms`

### Environment
- `warmth`: `cool|warm|hot` (base theme)
- `env_pulse`: float in [0,1] for `env_pulse_threshold`
- `env_show_pct`: `0|1|false|true` for `env_show_pct`

### Reviews
- `rev`: one of the 7 review labels (forces `review_condition`)

### Training
- `train`: `0|1|false|true` toggles `training.enabled`
- `trainDemos`: integer (written to `training.demos`)
- `trainP`: float in [0,1] (written to `training.p`)
- `trainDwell`: integer ms (minimum 200)

### PID overrides
- `participant_id` / `participant`: force PID
- `old=1`: continuation mode (reuse PID)

---
