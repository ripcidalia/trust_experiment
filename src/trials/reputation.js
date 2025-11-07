/**
 * @file src/trials/reputation.js
 * @description
 *  Reputation/reviews flow:
 *   - Deterministic assignment of a 7-level review condition per participant.
 *   - Loading and sampling of review snippets per assigned tone mix.
 *   - Avatar assignment (base id + mood) with no immediate repeats.
 *   - Rendering of the reviews page and follow-up reputation probe.
 *   - Logging of both the shown reviews and the probe response.
 *
 *  The review condition is the single source of truth for what the participant
 *  should see in the review stage. It is retrieved (and cached) from the server
 *  and then frozen onto CONFIG and window to prevent accidental mutation.
 */

import { CONFIG } from '../config.js';
import { LOG_ENDPOINT } from '../logging/index.js';
import { logTrialRow } from '../logging/build.js';
import { applyLightUiTheme } from '../ui/theme.js';

/* -----------------------------------------------------------------------------
 * Condition assignment and freezing
 * -------------------------------------------------------------------------- */

/**
 * Freeze the resolved review condition to CONFIG.review_condition and
 * window.ASSIGNED_REVIEW_CONDITION to prevent downstream drift.
 * Idempotent: safe to call more than once with the same label.
 */
function freezeReviewCondition(label) {
  const desc = Object.getOwnPropertyDescriptor(CONFIG, 'review_condition');
  if (desc && desc.writable === false && desc.value !== label) {
    console.warn('[reputation] CONFIG.review_condition already frozen to a different value:', desc.value, '≠', label);
  }

  try {
    if (CONFIG.review_condition !== label) CONFIG.review_condition = label;
  } catch (_) {}

  const d = Object.getOwnPropertyDescriptor(CONFIG, 'review_condition');
  if (!d || d.writable) {
    Object.defineProperty(CONFIG, 'review_condition', {
      value: label, writable: false, configurable: false, enumerable: true
    });
  }

  if (window.ASSIGNED_REVIEW_CONDITION !== label) {
    try { window.ASSIGNED_REVIEW_CONDITION = label; } catch (_) {}
  }
  const dw = Object.getOwnPropertyDescriptor(window, 'ASSIGNED_REVIEW_CONDITION');
  if (!dw || dw.writable) {
    Object.defineProperty(window, 'ASSIGNED_REVIEW_CONDITION', {
      value: label, writable: false, configurable: false
    });
  }
}

/**
 * Ensure a participant has a stable, cached review condition.
 * 1) Check localStorage cache for the cohort.
 * 2) If missing, request assignment from server.
 * 3) Persist and freeze the result.
 *
 * @returns {Promise<string>} assigned label (one of the 7 conditions)
 */
export async function ensureReviewConditionAssigned() {
  if (window.ASSIGNED_REVIEW_CONDITION) return window.ASSIGNED_REVIEW_CONDITION;

  const sp = new URLSearchParams(location.search);
  const cohort = sp.get('cohort') || 'main';
  const pid = CONFIG.participant_id;
  const ASSIGN_KEY = `rev_assign:${cohort}:${pid}`;

  // Fast path: cached value
  try {
    const cached = JSON.parse(localStorage.getItem(ASSIGN_KEY) || 'null');
    if (cached && cached.label && cached.cohort === cohort && cached.pid === pid) {
      freezeReviewCondition(cached.label);
      return cached.label;
    }
  } catch (_) {}

  // Server assignment
  const serverLabel = await fetchAssignedReviewCondition({ participant_id: pid, cohort });

  // Persist + freeze
  try {
    localStorage.setItem(ASSIGN_KEY, JSON.stringify({ pid, cohort, label: serverLabel, ts: Date.now() }));
  } catch (_) {}
  freezeReviewCondition(serverLabel);
  return serverLabel;
}

/**
 * Call the Apps Script endpoint to assign a review condition for a participant.
 * @param {{participant_id: string, cohort?: string}} param0
 * @returns {Promise<string>} assigned condition label
 * @throws if response not ok or missing fields
 */
export async function fetchAssignedReviewCondition({ participant_id, cohort = 'main' } = {}) {
  const body = new URLSearchParams();
  body.set('op', 'assign');
  body.set('token', ASSIGN_TOKEN);
  body.set('participant_id', participant_id);
  body.set('cohort', cohort);

  const resp = await fetch(ASSIGN_ENDPOINT, { method: 'POST', body, credentials: 'omit' });
  if (!resp.ok) throw new Error('assign HTTP ' + resp.status);
  const json = await resp.json();
  if (!json || !json.ok || !json.condition) throw new Error('assign failed');
  return json.condition;
}

/* -----------------------------------------------------------------------------
 * Reviews data loading / sampling
 * -------------------------------------------------------------------------- */

/**
 * Load reviews JSON from disk. Ensures tone buckets exist.
 * @returns {Promise<null|Record<string, Array>>}
 */
export async function loadReviewsJSON() {
  try {
    const res = await fetch('assets/reviews/reviews.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('reviews fetch failed');
    const data = await res.json();
    const buckets = ['very_positive', 'slightly_positive', 'mixed', 'slightly_negative', 'very_negative'];
    for (const k of buckets) if (!Array.isArray(data[k])) data[k] = [];
    return data;
  } catch (e) {
    console.warn('Reviews JSON missing/invalid; disabling review stage.', e);
    return null;
  }
}

/**
 * Pick a set of 5 reviews according to the assigned 7-level condition.
 * If the provided condition is invalid/missing, a valid label is chosen randomly.
 *
 * @param {object} reviewsData - tone → array of review objects
 * @param {string} condition   - assigned label (7-level)
 * @param {Function} rand      - RNG in [0,1)
 * @returns {Array<object>}    - 5 reviews, each stamped with .tone
 */
export function pickReviewSet(reviewsData, condition, rand = Math.random) {
  const valid7 = [
    'very_positive', 'moderately_positive', 'slightly_positive',
    'mixed',
    'slightly_negative', 'moderately_negative', 'very_negative'
  ];
  const cond = (condition && valid7.includes(condition))
    ? condition
    : valid7[Math.floor(rand() * valid7.length)];

  // Tone mix recipe for 5-card set per condition
  const recipe = ({
    very_positive:       { very_positive: 5 },
    moderately_positive: { very_positive: 2, slightly_positive: 2, mixed: 1 },
    slightly_positive:   { very_positive: 1, slightly_positive: 2, mixed: 2 },
    mixed:               { very_positive: 1, slightly_positive: 1, mixed: 1, slightly_negative: 1, very_negative: 1 },
    slightly_negative:   { very_negative: 1, slightly_negative: 2, mixed: 2 },
    moderately_negative: { very_negative: 2, slightly_negative: 2, mixed: 1 },
    very_negative:       { very_negative: 5 }
  })[cond];

  const picks = [];
  for (const [tone, k] of Object.entries(recipe)) {
    const pool = reviewsData[tone] || [];
    const take = sampleK(pool, k, rand);
    picks.push(...take.map(r => ({ ...r, tone })));
  }

  // Backfill if a bucket is short
  if (picks.length < 5) {
    const need = 5 - picks.length;
    const fallback = (reviewsData[cond] && reviewsData[cond].length) ? reviewsData[cond] : (reviewsData.mixed || []);
    picks.push(...sampleK(fallback, need, rand).map(r => ({ ...r, tone: cond })));
  }

  // Shuffle final order
  return sampleK(picks, 5, rand);
}

/* -----------------------------------------------------------------------------
 * Avatars
 * -------------------------------------------------------------------------- */

/**
 * Assign avatars (baseId + mood + src) to each review, avoiding adjacent baseId
 * repeats where possible. If the set length exceeds the unique pool, spill over
 * by cycling the pool while avoiding immediate repeats.
 */
export function assignAvatarsToReviewSet(reviewSet, randFn = Math.random) {
  const k = reviewSet.length;
  const uniqueNeeded = Math.min(k, AVATAR_IDS.length);
  const chosenBaseIds = sampleBaseIdsNoRepeat(uniqueNeeded, randFn);

  // Spillover if more cards than unique bases
  let spill = [];
  if (k > chosenBaseIds.length) {
    const extrasNeeded = k - chosenBaseIds.length;
    const pool = AVATAR_IDS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(randFn() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let last = chosenBaseIds[chosenBaseIds.length - 1] || null;
    while (spill.length < extrasNeeded) {
      const candidate = pool[spill.length % pool.length];
      if (candidate !== last) {
        spill.push(candidate);
        last = candidate;
      } else {
        const alt = pool.find(x => x !== last);
        spill.push(alt || candidate);
        last = alt || candidate;
      }
    }
  }

  const allBaseIds = chosenBaseIds.concat(spill);

  reviewSet.forEach((r, idx) => {
    const baseId = allBaseIds[idx % allBaseIds.length];
    const mood = MOOD_FOR_TONE[r.tone] || 'neutral';
    r.avatar = { baseId, mood, src: avatarSrc(baseId, mood) };
  });

  // Avoid adjacent duplicates if we can
  for (let i = 1; i < reviewSet.length; i++) {
    if (reviewSet[i].avatar.baseId === reviewSet[i - 1].avatar.baseId) {
      for (let j = i + 1; j < reviewSet.length; j++) {
        if (reviewSet[j].avatar.baseId !== reviewSet[i - 1].avatar.baseId) {
          const tmp = reviewSet[i].avatar;
          reviewSet[i].avatar = reviewSet[j].avatar;
          reviewSet[j].avatar = tmp;
          break;
        }
      }
    }
  }
  return reviewSet;
}

/**
 * List all avatar image URLs (all base × moods).
 * Useful for preloading.
 */
export function listAllAvatarImages() {
  const out = [];
  for (const id of AVATAR_IDS) {
    for (const m of AVATAR_MOODS) out.push(avatarSrc(id, m));
  }
  return out;
}

/* -----------------------------------------------------------------------------
 * Trials
 * -------------------------------------------------------------------------- */

/**
 * Reviews list (cards) with staggered reveal and a guarded continue button.
 * Emits metadata about the shown set for later pairing with the probe.
 */
export function makeReviewsTrial({ reviewSet, condition, expectedReputation }) {
  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: 'NO_KEYS',
    on_start: () => { applyLightUiTheme(); },
    stimulus: `
      <div style="
        min-height:100vh; display:flex; align-items:center; justify-content:center;
        padding:32px 18px; box-sizing:border-box;">
        <div style="width:min(980px,94vw);">
          <h2 style="margin:0 0 12px 0; text-align:center;">What other rescuers say</h2>
          <p style="margin:0 0 22px 0; color:#555; text-align:center;">
            The following short reviews summarize experiences from other team members using this drone.
          </p>

          <div id="rv-grid" style="
            display:flex; flex-wrap:wrap; justify-content:center; align-items:stretch;
            gap:14px; margin:0 auto; width:100%;
          ">
            ${reviewSet.map((r) => `
              <div class="rv-card" data-id="${r.id}" style="
                width:300px; max-width:92vw;
                display:flex; gap:16px; align-items:center;
                background:#fff; border-radius:12px; padding:14px; box-shadow:0 6px 20px rgba(10,10,20,.06);
                opacity:0; transform: translateY(8px);
                transition: opacity 220ms ease, transform 220ms cubic-bezier(.2,.9,.1,1);
              ">
                <img src="${r.avatar?.src || ''}" alt="" style="
                  width:84px; height:84px; border-radius:50%; object-fit:cover; background:#e9eef6; display:block; flex:0 0 auto;">
                <div style="flex:1 1 auto;">
                  <div style="font-size:15px; line-height:1.4; color:#333;">${r.text}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div style="display:flex; justify-content:center; margin-top:22px;">
            <button id="rv-continue" disabled aria-disabled="true" style="
              padding:10px 20px; border:none; border-radius:10px;
              background:#2a6ebb; color:#fff; font-weight:700;
              cursor:not-allowed; opacity:.55;">
              Continue
            </button>
          </div>
        </div>
      </div>
    `,
    on_load: () => {
      const cards = Array.from(document.querySelectorAll('.rv-card'));
      const step  = (window.CONFIG?.review_reveal_stagger_ms ?? 220);
      const btn   = document.getElementById('rv-continue');

      // Staggered reveal
      cards.forEach((el, i) => {
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, i * step);
      });

      // Enable continue after last reveal
      const transitionMs = 240;
      const totalRevealMs = (cards.length - 1) * step + transitionMs + 60;
      setTimeout(() => {
        btn.disabled = false;
        btn.setAttribute('aria-disabled', 'false');
        btn.style.opacity = '1';
        btn.style.cursor  = 'pointer';
      }, Math.max(0, totalRevealMs));

      btn.addEventListener('click', () => {
        if (!btn.disabled) jsPsych.finishTrial();
      });
    },
    data: {
      trial_type: 'reviews_set',
      event_type: 'reputation_item',
      review_condition: condition,
      review_expected: expectedReputation,
      review_ids: reviewSet.map(r => r.id).join(','),
      review_tones: reviewSet.map(r => r.tone).join(','),
      review_avatars: reviewSet.map(r => `${r.avatar?.baseId || ''}:${r.avatar?.mood || ''}`).join(',')
    },
    on_finish: d => {
      // Preserve condition even if plugin/version drops data fields
      if (typeof d.review_condition === 'undefined') d.review_condition = condition;
      // Cache for probe pairing
      window.__PENDING_REPUTATION__ = d;
      try { sessionStorage.setItem('pending_reputation', JSON.stringify(d)); } catch (_) {}
    }
  };
}

/**
 * Reputation probe (5-button: Much worse → Much better).
 * Merges with the pending review display metadata and logs a single combined row.
 */
export const reputationProbeTrial = {
  type: jsPsychHtmlButtonResponse,
  on_start: () => {
    applyLightUiTheme();
    // Restore pending review metadata if needed (e.g., across refresh)
    try {
      if (!window.__PENDING_REPUTATION__) {
        const s = sessionStorage.getItem('pending_reputation');
        if (s) window.__PENDING_REPUTATION__ = JSON.parse(s);
      }
    } catch (_) {}
  },
  stimulus:
    '<h2 style="margin-bottom:12px;text-align:center;">How did these reviews change your opinion of the drone?</h2>' +
    '<p style="margin-bottom:10px;text-align:center;">My opinion on this drone is now:</p>',
  choices: ['Much worse', 'Worse', 'The same', 'Better', 'Much better'],
  on_load: function () {
    // Center jsPsych wrapper
    const el = jsPsych.getDisplayElement();
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.justifyContent = 'center';
    el.style.alignItems = 'center';
    el.style.minHeight = '100vh';
    el.style.textAlign = 'center';
  },
  data: { trial_type: 'reputation_probe', event_type: 'reputation_probe' },
  on_finish: d => {
    const map = [-2, -1, 0, 1, 2];
    d.reputation_probe_choice = d.response;          // 0..4
    d.reputation_probe_delta  = map[d.response];     // -2..+2

    const pending = window.__PENDING_REPUTATION__;
    if (pending) {
      // Use canonical assignment for logging
      let condForLog = pending.review_condition ?? window.ASSIGNED_REVIEW_CONDITION ?? CONFIG.review_condition ?? null;
      if (condForLog && window.ASSIGNED_REVIEW_CONDITION && condForLog !== window.ASSIGNED_REVIEW_CONDITION) {
        console.warn('[reputation] pending.condition != ASSIGNED; correcting for log:', pending.review_condition, '→', window.ASSIGNED_REVIEW_CONDITION);
        condForLog = window.ASSIGNED_REVIEW_CONDITION;
      }

      const expectedForLog =
        (condForLog && window.CONFIG?.review_expected_map &&
         Object.prototype.hasOwnProperty.call(window.CONFIG.review_expected_map, condForLog))
          ? window.CONFIG.review_expected_map[condForLog]
          : null;

      const combined = {
        ...pending,
        event_type: 'reputation_item',
        review_condition: condForLog,
        review_expected: expectedForLog,
        response: JSON.stringify({
          response: (typeof d.reputation_probe_delta === 'number')
            ? d.reputation_probe_delta
            : (d.response ?? null),
          expected: expectedForLog
        })
      };

      window.__PENDING_REPUTATION__ = null;
      try { sessionStorage.removeItem('pending_reputation'); } catch (_) {}
      logTrialRow(combined);
    } else {
      logTrialRow(d);
    }
  }
};

/* -----------------------------------------------------------------------------
 * Assignment helpers (balanced sequence over a 50-participant cycle)
 * -------------------------------------------------------------------------- */

/** Target counts per 50 participants for each condition label. */
export const REVIEW_COUNTS_50 = {
  very_positive: 4,
  moderately_positive: 8,
  slightly_positive: 10,
  mixed: 5,
  slightly_negative: 10,
  moderately_negative: 9,
  very_negative: 4
};

/**
 * Build a prefix-balanced sequence of length Σ(counts).
 * At each position k, choose label with maximal (desired_so_far − used_so_far),
 * tiebroken deterministically by a hash.
 */
export function buildFairSequence(counts, seed = 13) {
  const labels = Object.keys(counts);
  const total = labels.reduce((s, l) => s + counts[l], 0);
  const used = Object.fromEntries(labels.map(l => [l, 0]));
  const seq = [];

  function tieKey(label, k) {
    let h = seed;
    for (const ch of (label + '#' + k)) h = (h * 1664525 + ch.charCodeAt(0) + 1013904223) >>> 0;
    return h;
  }

  for (let k = 1; k <= total; k++) {
    let best = null, bestDef = -Infinity, bestTie = 0;
    for (const l of labels) {
      const desiredSoFar = counts[l] * (k / total);
      const deficit = desiredSoFar - used[l];
      if (deficit > bestDef + 1e-12) {
        best = l; bestDef = deficit; bestTie = tieKey(l, k);
      } else if (Math.abs(deficit - bestDef) <= 1e-12) {
        const t = tieKey(l, k);
        if (t > bestTie) { best = l; bestTie = t; }
      }
    }
    used[best]++; seq.push(best);
  }
  return seq;
}

/**
 * Deterministic client fallback (URL override via ?rev= takes precedence).
 * Produces one of the 7 condition labels.
 */
export function pickReviewConditionFallback7({ pid } = {}) {
  const sp = new URLSearchParams(location.search);
  const override = sp.get('rev');
  if (override && REVIEW_SLOTS7.includes(override)) return override;
  const idx = hashToBucket(String(pid) + '::reviews7', REVIEW_SLOTS7.length);
  return REVIEW_SLOTS7[idx];
}

/* -----------------------------------------------------------------------------
 * Constants and small utilities
 * -------------------------------------------------------------------------- */

const AVATAR_IDS = ['ff01','ff02','ff03','ff04','ff05','ff06','ff07','ff08','ff09','ff10','ff11','ff12','ff13','ff14'];
const AVATAR_MOODS = ['happy', 'neutral', 'sad'];

const MOOD_FOR_TONE = {
  very_positive: 'happy',
  slightly_positive: 'neutral',
  mixed: 'neutral',
  slightly_negative: 'neutral',
  very_negative: 'sad'
};

// Apps Script assignment shares the same endpoint as logging (op=assign)
const ASSIGN_ENDPOINT = LOG_ENDPOINT;
// Server-validated token (must match server config)
const ASSIGN_TOKEN = 'A39tK5vR9z1wQ2L7';

// Prebuilt fair sequence over one 50-participant cycle
const REVIEW_SLOTS7 = buildFairSequence(REVIEW_COUNTS_50);

/** Fisher–Yates sample of k items without replacement. */
function sampleK(arr, k, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(k, a.length)));
}

/** Hash string → bucket 0..m-1 (FNV-1a style core). */
function hashToBucket(str, m) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h % m;
}

/** Build avatar image path for a base id + mood. */
function avatarSrc(baseId, mood) {
  return `assets/reviews/${baseId}_${mood}.png`;
}

/** Return up to k distinct base IDs; if k > pool, return all shuffled. */
function sampleBaseIdsNoRepeat(k, randFn = Math.random) {
  const pool = AVATAR_IDS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(randFn() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(k, pool.length));
}
