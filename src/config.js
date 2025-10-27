/**
 * @file src/config.js
 * @description
 * Experiment configuration and participant/session utilities.
 * Keep values concise and environment-agnostic—runtime overrides can be passed via URL.
 */

export const pid = getPID();

/**
 * Central configuration object.
 * Many values can be overridden at runtime via `readConfigFromURL()`.
 */
export const CONFIG = {
  // Core task
  N: 20,
  drone_success_rate: 0.75,
  sequence: null,
  seed: null,

  // Drone timing (ms)
  drone_buffer_ms: 2000,        // scan sweep duration
  drone_anim_ms: 1050,          // travel (hop-to-door) duration
  drone_prebuffer_ms: 1000,     // scan cone “appear” lead-in

  // Entry (from off-screen to center)
  drone_entry_cruise_px_per_s: 460,
  drone_entry_decel_frac: 0.16, // last % distance eases out

  // Hop (center to suggested door)
  drone_hop_speed_px_per_s: 320,
  drone_hop_duration_scale: 1.10,
  drone_hop_min_ms: 900,

  // Exit (off-screen to the right)
  drone_exit_accel_frac: 0.16,
  drone_exit_accel_speed_px_per_s: 360,
  drone_exit_cruise_px_per_s: 520,
  drone_exit_edge_offset_px: 10,

  // Scan cone geometry & motion
  cone_apex_lift_px: 6,
  cone_apex_lift_ratio: 0.09,
  cone_apex_rel_y: 0.22,
  cone_apex_dx: -3,
  cone_dwell_ms: 220,
  cone_persp_max_squash: 0.35,
  cone_persp_max_skew_deg: 6,
  cone_persp_spread_x: 0.10,
  cone_persp_kickin: 0.70,

  // Decision window
  decision_timeout_ms: 4000,
  timer_warn_ms: 2000,
  timer_critical_ms: 1000,
  timer_action: 'auto_follow', // 'auto_follow' | 'none'

  // Environment (visual theming)
  env_warmth: 'warm',          // 'cool' | 'warm' | 'hot'
  env_show_pct: true,
  env_pulse_threshold: 1.0,

  // Scene transitions / blackout
  blackout_text: 'Relocating to next search area…',
  blackout_hold_ms: 1500,
  blackout_fade_ms: 450,

  // Outcome panel timing
  drone_exit_delay_ms: 350,
  panel_delay_after_open_ms: 300,
  panel_hold_ms: 1100,

  // Foreground FX (fire/smoke)
  // Absolute px fallbacks (used if fractional values are not applied at runtime)
  fire_inward_px: 110,
  smoke_inward_px: 100,
  smoke_rise_px: 100,
  smoke_opacity: 0.95,
  fire_base_inset_px: 80,
  smoke_base_inset_px: 80,
  smoke_y_offset_px: 120,

  // Preferred fraction-based geometry (overrides *_px in positioning when present)
  fire_inward_vw: 0.10,
  smoke_inward_vw: 0.09,
  smoke_rise_vh: 0.12,
  fire_base_inset_vw: 0.06,
  smoke_base_inset_vw: 0.06,
  smoke_y_offset_vh: 0.10,

  // Base FX periods (ms) for CSS keyframes
  fire_base_slide_period_ms: 1400,
  smoke_base_slide_period_ms: 1600,
  smoke_base_rise_period_ms: 1800,

  // Reputation / reviews
  review_condition: null,        // one of 7 labels or null for server/random
  review_set_size: 5,
  review_reveal_stagger_ms: 300,
  review_expected_map: {
    very_positive: +2.0,
    moderately_positive: +1.2,
    slightly_positive: +0.8,
    mixed: 0.0,
    slightly_negative: -0.8,
    moderately_negative: -1.2,
    very_negative: -2.0
  },

  // Mid-block trust probes (jittered cadence)
  trust_probe_every_min: 5,
  trust_probe_every_max: 6,

  // Training (single demo before main task)
  training: {
    enabled: true,           // `?train=0` disables
    n: 1,                    // count of auto-play demos
    p: 0.80,                 // visual-only correctness rate in demos
    dwell_ms: 1200,          // hover duration at suggested door
    show_decision_box: false,
    show_outcome: false,
    blackout_text: 'The main task will now begin.',
    blackout_hold_ms: 3000,
    blackout_fade_ms: 850
  },

  // Risk profiles (per-trial overrides; fractional geometry + speed/timeout multipliers)
  risk_levels: {
    low: {
      warmth: 'cool',
      fire_inward_vw: 0.10,
      smoke_inward_vw: 0.09,
      smoke_rise_vh: 0.06,
      fire_speed: 0.90,
      smoke_speed_h: 0.90,
      smoke_speed_v: 0.90,
      timeout_scale: 1.00,
      shake_amp_px: 0,
      shake_period_ms: 900,
      risk_value: 0.2
    },
    medium: {
      warmth: 'neutral',
      fire_inward_vw: 0.075,
      smoke_inward_vw: 0.065,
      smoke_rise_vh: 0.10,
      fire_speed: 1.00,
      smoke_speed_h: 1.00,
      smoke_speed_v: 1.00,
      timeout_scale: 0.95,
      shake_amp_px: 1.0,
      shake_period_ms: 800,
      risk_value: 0.5
    },
    high: {
      warmth: 'warm',
      fire_inward_vw: 0.045,
      smoke_inward_vw: 0.040,
      smoke_rise_vh: 0.14,
      fire_speed: 1.30,
      smoke_speed_h: 1.30,
      smoke_speed_v: 1.35,
      timeout_scale: 0.90,
      shake_amp_px: 2.2,
      shake_period_ms: 700,
      risk_value: 0.8
    },
    extreme: {
      warmth: 'hot',
      fire_inward_vw: 0.00,
      smoke_inward_vw: 0.00,
      smoke_rise_vh: 0.18,
      fire_speed: 1.60,
      smoke_speed_h: 1.60,
      smoke_speed_v: 1.65,
      timeout_scale: 0.85,
      shake_amp_px: 3.5,
      shake_period_ms: 600,
      risk_value: 1.0
    }
  }
};

/**
 * Apply URL overrides to CONFIG.
 * Supported parameters (examples):
 *  - N=20, p=0.75, seed=123, buffer=900, anim=1200
 *  - warmth=cool|warm|hot
 *  - env_pulse=0.3, env_show_pct=0|1
 *  - timeout=4000 (alias: timer)
 *  - rev=very_positive|…|very_negative
 *  - train=0|1, trainDemos=1, trainP=0.8, trainDwell=1200
 *  - seq=L R pairs: ?seq=LR,RL,LR (maps to [{true_location,suggestion}, …])
 */
export function readConfigFromURL() {
  const sp = new URLSearchParams(location.search);

  const N = parseInt(sp.get('N'), 10);
  const p = parseFloat(sp.get('p'));
  const seed = parseInt(sp.get('seed'), 10);
  const seq = parseSequenceParam();

  const buf = parseInt(sp.get('buffer'), 10);
  const anim = parseInt(sp.get('anim'), 10);

  const warmth = sp.get('warmth');
  const pulse = parseFloat(sp.get('env_pulse'));
  const showPct = sp.get('env_show_pct');

  const timeout = parseInt(sp.get('timeout') || sp.get('timer'), 10);
  const rev = sp.get('rev');

  const trainFlag = sp.get('train');
  const trainDemos = parseInt(sp.get('trainDemos'), 10);
  const trainP = parseFloat(sp.get('trainP'));
  const trainDwell = parseInt(sp.get('trainDwell'), 10);

  if (!isNaN(N) && N > 0) CONFIG.N = N;
  if (!isNaN(p) && p >= 0 && p <= 1) CONFIG.drone_success_rate = p;
  if (!isNaN(seed)) CONFIG.seed = seed;
  if (seq && seq.length > 0) CONFIG.sequence = seq;

  if (!isNaN(buf) && buf >= 0) CONFIG.drone_buffer_ms = buf;
  if (!isNaN(anim) && anim >= 0) CONFIG.drone_anim_ms = anim;

  if (warmth === 'cool' || warmth === 'warm' || warmth === 'hot') CONFIG.env_warmth = warmth;
  if (!isNaN(pulse) && pulse >= 0 && pulse <= 1) CONFIG.env_pulse_threshold = pulse;

  if (showPct === '0' || showPct === 'false') CONFIG.env_show_pct = false;
  if (showPct === '1' || showPct === 'true') CONFIG.env_show_pct = true;

  if (!isNaN(timeout) && timeout >= 0) CONFIG.decision_timeout_ms = timeout;

  if (
    ['very_positive', 'moderately_positive', 'slightly_positive', 'mixed',
     'slightly_negative', 'moderately_negative', 'very_negative'].includes(rev)
  ) {
    CONFIG.review_condition = rev;
  }

  if (trainFlag === '0' || trainFlag === 'false') CONFIG.training.enabled = false;
  if (!isNaN(trainDemos) && trainDemos >= 0) CONFIG.training.demos = trainDemos; // note: separate from `training.n`
  if (!isNaN(trainP) && trainP >= 0 && trainP <= 1) CONFIG.training.p = trainP;
  if (!isNaN(trainDwell) && trainDwell >= 200) CONFIG.training.dwell_ms = trainDwell;
}

/**
 * Generate or reuse a participant identifier (PID).
 * Behavior:
 *  - Respects explicit URL overrides (?participant_id=… | ?participant=…).
 *  - Uses `old=1` URL flag to avoid minting new IDs on refresh.
 *  - Guards double-click/rapid multi-tab by reusing a PID within ~4s.
 */
function getPID() {
  const sp = new URLSearchParams(location.search);

  // Explicit override (e.g., lab integration)
  let override = sp.get('participant_id') || sp.get('participant');
  if (override) {
    try { localStorage.setItem('pid', override); } catch (_) {}
    return override;
  }

  // Continuation URL
  if (sp.get('old') === '1') {
    let existing = localStorage.getItem('pid');
    if (!existing) {
      existing = 'R' + Math.random().toString(36).slice(2, 10).toUpperCase();
      try { localStorage.setItem('pid', existing); } catch (_) {}
    }
    return existing;
  }

  // New participant (with double-click guard)
  try {
    const lastTs = parseInt(localStorage.getItem('last_boot_ts') || '0', 10);
    const lastPid = localStorage.getItem('last_boot_pid');
    const now = Date.now();
    if (lastPid && now - lastTs < 4000) {
      try { localStorage.setItem('pid', lastPid); } catch (_) {}
      sp.set('old', '1');
      const newUrl = location.pathname + '?' + sp.toString() + location.hash;
      history.replaceState(null, '', newUrl);
      return lastPid;
    }
  } catch (_) {}

  // Mint new, persist, and mark URL as “old”
  const newPid = 'R' + Math.random().toString(36).slice(2, 10).toUpperCase();
  try {
    localStorage.setItem('pid', newPid);
    localStorage.setItem('last_boot_pid', newPid);
    localStorage.setItem('last_boot_ts', String(Date.now()));
  } catch (_) {}

  sp.set('old', '1');
  const newUrl = location.pathname + '?' + sp.toString() + location.hash;
  history.replaceState(null, '', newUrl);
  return newPid;
}

/**
 * Parse `?seq=LR,RL,…` into an array of trial objects:
 *   { true_location: 'left'|'right', suggestion: 'left'|'right' }
 */
function parseSequenceParam() {
  const p = new URLSearchParams(location.search).get('seq');
  if (!p) return null;

  const map = { L: 'left', R: 'right' };
  return p
    .split(',')
    .map(pairStr => {
      const pair = pairStr.trim().toUpperCase();
      if (pair.length < 2) return null;
      const v = map[pair[0]];
      const s = map[pair[1]];
      if (!v || !s) return null;
      return { true_location: v, suggestion: s };
    })
    .filter(Boolean);
}