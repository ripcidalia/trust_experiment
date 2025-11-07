/**
 * @file src/data/sets.js
 * @brief Loads the trial-set definition (blocks/trials), assigns a set deterministically per
 *        participant, and enriches trial rows with per-trial assets and risk overrides.
 *
 * Key responsibilities
 *  - Resolve the active `set_id` with precedence: URL override (if allowed) → cached selection → hash(pid).
 *  - Fetch and validate `conditions/sets_v1.json`.
 *  - Normalize raw rows to internal schema: { true_location, suggestion, risk_key }.
 *  - Coordinate with the reputation module to ensure a review condition exists (read-only here).
 *
 * Invariants / Contracts
 *  - Reputation “single source of truth” is the reputation module. This file only ensures a label is
 *    available for downstream consumers; it does not freeze or mutate `CONFIG.review_condition`.
 *  - `blocks[].trials[]` returned here contain only structural fields; call
 *    `augmentTrialsWithRiskAndAssets` to attach per-trial assets and risk overrides.
 */

import { CONFIG, pid } from '../config.js';
import { pickBackground, pickDoorSkin, nextSmokePair, nextFirePair, pickVictimSkin, randSeeded } from './assets.js';
import { ensureReviewConditionAssigned, pickReviewConditionFallback7 } from '../trials/reputation.js';

/**
 * Load and normalize trial blocks for the chosen set.
 * Also ensures a reputation condition label is available for this session.
 * @returns {Promise<{ mode: 'set', blocks: {trials: Array, probes: number[]|null}[], set_id: string }>}
 */
export async function loadTrialsBlocks() {
  const sp = new URLSearchParams(location.search);
  const doReset = sp.get('reset') === '1';

  // Optional set override via URL (development).
  if (CONFIG.allow_url_override) {
    const urlSet = sp.get('set');
    if (urlSet) CONFIG.set_id = urlSet;
  }

  // Reputation condition (read-only here; reputation module is authoritative).
  const cohort = sp.get('cohort') || 'main';
  const ASSIGN_KEY = `rev_assign:${cohort}:${CONFIG.participant_id}`;

  // Ensure there is an assigned label, without freezing CONFIG from this module.
  let assignedLabel = window.ASSIGNED_REVIEW_CONDITION || CONFIG.review_condition || null;
  if (!assignedLabel) {
    try {
      await ensureReviewConditionAssigned();
      assignedLabel = window.ASSIGNED_REVIEW_CONDITION || CONFIG.review_condition || null;
    } catch (err) {
      console.warn('[assign] ensureReviewConditionAssigned failed in sets.js:', err);
      // Fallback: local cache then deterministic fallback. Do not freeze/write CONFIG here.
      try {
        const cached = JSON.parse(localStorage.getItem(ASSIGN_KEY) || 'null');
        if (cached && cached.label) {
          assignedLabel = cached.label;
        } else {
          assignedLabel = pickReviewConditionFallback7({ pid: CONFIG.participant_id });
          try {
            localStorage.setItem(
              ASSIGN_KEY,
              JSON.stringify({
                pid: CONFIG.participant_id,
                cohort,
                label: assignedLabel,
                ts: Date.now(),
                source: 'fallback'
              })
            );
          } catch {}
        }
      } catch {}
    }
  }

  const storageKey = `${CONFIG.local_key}::${CONFIG.participant_id}`;

  // Clear per-participant cached set if requested.
  if (doReset) {
    try { localStorage.removeItem(storageKey); } catch {}
  }

  // If no explicit set yet, try per-participant cached selection.
  if (!CONFIG.set_id) {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) CONFIG.set_id = stored;
    } catch {}
  }

  // Fetch sets definition.
  const url = new URL('conditions/sets_v1.json', window.location.href);
  console.log('[HRI] Fetching sets from:', url.toString());
  const res = await fetch(url, { cache: 'no-store' }).catch(e => {
    console.error('Fetch error:', e);
    throw e;
  });
  if (!res.ok) throw new Error(`Failed to load sets_v1.json (${res.status})`);
  const allSets = await res.json();

  // Validate and resolve available set IDs.
  const availableSetIds = Object.keys(allSets || {});
  if (!availableSetIds.length) {
    throw new Error('No sets available in sets_v1.json (empty or malformed).');
  }

  // Resolve set_id: URL override (if allowed) → cached → hash(pid).
  let setId = CONFIG.set_id;
  if (!setId) {
    const pidForSet =
      (typeof pid !== 'undefined' && pid) ||
      (typeof CONFIG !== 'undefined' && CONFIG.participant_id) ||
      'anon';
    setId = pickSetIdFromPid(pidForSet, availableSetIds);
    CONFIG.set_id = setId;
    try { localStorage.setItem(storageKey, setId); } catch {}
  }

  const chosen = allSets[setId];
  if (!chosen || !Array.isArray(chosen.blocks) || !chosen.blocks.length) {
    throw new Error(`Set '${setId}' malformed: missing 'blocks' array with content.`);
  }
  for (let b = 0; b < chosen.blocks.length; b++) {
    const block = chosen.blocks[b];
    if (!Array.isArray(block.trials) || !block.trials.length) {
      throw new Error(`Set '${setId}' block ${b} malformed: missing 'trials' array with content.`);
    }
  }

  console.log('[HRI] Using setId:', setId);

  // Normalize to internal structure.
  const blocks = chosen.blocks.map(blk => ({
    trials: (blk.trials || []).map(row => ({
      true_location: (row.victim === 'L' ? 'left' : 'right'),
      suggestion:    (row.suggestion === 'L' ? 'left' : 'right'),
      risk_key:      row.risk || null
    })),
    probes: Array.isArray(blk.probes) ? blk.probes.slice() : null
  }));

  return { mode: 'set', blocks, set_id: setId };
}

/**
 * Attach per-trial visual assets and risk-derived overrides.
 * - Chooses background/door/FX/victim skins with no immediate repeats.
 * - Computes risk overrides from the `risk_key` or a random draw if absent.
 * @param {{true_location:string, suggestion:string, risk_key?:string}[]} trials
 * @returns {Array}
 */
export function augmentTrialsWithRiskAndAssets(trials) {
  return trials.map(t => {
    const background_src = pickBackground();
    const door_src       = pickDoorSkin();
    const { left: smoke_left_src, right: smoke_right_src } = nextSmokePair();
    const { left: fire_left_src,  right: fire_right_src  } = nextFirePair();

    // Use provided risk key, else draw with fixed proportions: 25/35/25/15 (low/medium/high/extreme)
    const rk = t.risk_key || (() => {
      const r = randSeeded();
      return (r < 0.25) ? 'low' : (r < 0.60) ? 'medium' : (r < 0.85) ? 'high' : 'extreme';
    })();

    const baseTimeout    = (window.CONFIG.decision_timeout_ms ?? 4000);
    const risk_overrides = makeRiskOverrides(rk, baseTimeout, window.CONFIG);

    return {
      ...t,
      victim_src:      pickVictimSkin(),
      envWarmth:       risk_overrides.warmth,
      risk_value:      risk_overrides.risk_value,
      background_src,
      door_src,
      smoke_left_src,
      smoke_right_src,
      fire_left_src,
      fire_right_src,
      risk_overrides
    };
  });
}

/**
 * Build non-interactive training/demo trials with randomized left/right and assets.
 * @param {number} N
 * @param {() => number} randFn
 * @returns {Array}
 */
export function generateTrainingTrials(N, randFn) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const true_location = randFn() < 0.5 ? 'left' : 'right';
    const suggestion    = randFn() < 0.5 ? 'left' : 'right';

    const background_src = pickBackground();
    const door_src       = pickDoorSkin();
    const { left: smoke_left_src, right: smoke_right_src } = nextSmokePair();
    const { left: fire_left_src,  right: fire_right_src  } = nextFirePair();

    out.push({
      true_location,
      suggestion,
      victim_src: pickVictimSkin(),
      envWarmth:  CONFIG.env_warmth || 'warm',
      background_src,
      door_src,
      smoke_left_src,
      smoke_right_src,
      fire_left_src,
      fire_right_src
    });
  }
  return out;
}

/**
 * Deterministically pick a set id from a list using FNV-1a hash of the participant id.
 * @param {string} pid
 * @param {string[]} setIds
 * @returns {string}
 */
function pickSetIdFromPid(pid, setIds) {
  let h = 2166136261 >>> 0;
  const s = String(pid || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return setIds[h % setIds.length];
}

/**
 * Compute a minimum allowable decision time so the sequence
 * (prebuffer + scan + hop + brief window) can complete without clipping.
 * @param {any} cfg
 * @returns {number} ms
 */
function computeMinDecisionTimeMs(cfg) {
  const preMs  = (cfg.drone_prebuffer_ms ?? 1000);
  const scan   = (cfg.drone_buffer_ms ?? 1200);
  const hop    = (cfg.drone_anim_ms ?? 1100);
  const margin = 900;
  return preMs + scan + hop + margin;
}

/**
 * Map a risk key to per-trial overrides and clamp decision timeout so earlier phases fit.
 * @param {'low'|'medium'|'high'|'extreme'} riskKey
 * @param {number} baseTimeoutMs
 * @param {any} cfg
 * @returns {{
 *   risk_key: string,
 *   warmth: string,
 *   fire_inward_px: number,
 *   smoke_inward_px: number,
 *   smoke_rise_px: number,
 *   decision_timeout_ms: number,
 *   shake_amp_px: number,
 *   shake_period_ms: number,
 *   risk_value: number
 * }}
 */
function makeRiskOverrides(riskKey, baseTimeoutMs, cfg) {
  const R = cfg.risk_levels[riskKey] || cfg.risk_levels.medium;
  const minAllowed     = computeMinDecisionTimeMs(cfg);
  const scaledTimeout  = Math.round(baseTimeoutMs * (R.timeout_scale ?? 1));
  const adjustedTimeout = Math.max(minAllowed, scaledTimeout);

  return {
    risk_key:           riskKey,
    warmth:             R.warmth,
    fire_inward_px:     R.fire_inward_px,
    smoke_inward_px:    R.smoke_inward_px,
    smoke_rise_px:      R.smoke_rise_px,
    decision_timeout_ms: adjustedTimeout,
    shake_amp_px:       R.shake_amp_px,
    shake_period_ms:    R.shake_period_ms,
    risk_value:         R.risk_value
  };
}
