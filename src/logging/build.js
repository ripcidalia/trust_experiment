/**
 * @file src/logging/build.js
 * @summary
 *  Normalizes jsPsych trial data into a compact, event-centric row format for logging.
 *  - Filters to high-signal event types (door trials, reputation, questionnaires, etc.).
 *  - Derives useful features (e.g., followed, rt_ms, questionnaire scores).
 *  - Emits user-agent summary once per session; detailed unknown fields are preserved.
 */

import { logEnqueue } from './index.js';

const APP_VERSION = '0.1.0';

/** Stable client session identifier used to correlate rows from a single run. */
const SESSION_ID =
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Convert an array of jsPsych trial objects into normalized rows suitable for upload.
 * @param {Array<Record<string, any>>} allTrials
 * @returns {Array<Record<string, any>>}
 */
export function buildRowsForLogging(allTrials) {
  const ua = navigator.userAgent;
  const nowIso = new Date().toISOString();
  const setId = (window.CONFIG && window.CONFIG.set_id) ? window.CONFIG.set_id : null;

  /** Return file name (without path) or null. */
  const baseName = (s) => (s && typeof s === 'string') ? s.split('/').pop() : null;

  /** Lightweight UA parsing to capture device type and browser family. */
  function parseUA(uaStr) {
    const S = uaStr || '';
    let browser_name = 'Other', browser_major = null;

    // Order matters: check vendors that mask as Chrome first.
    const matchers = [
      [/Edg\/(\d+)/i, 'Edge'],
      [/OPR\/(\d+)/i, 'Opera'],
      [/Chrome\/(\d+)/i, 'Chrome'],
      [/Firefox\/(\d+)/i, 'Firefox'],
      [/Version\/(\d+).+Safari/i, 'Safari'],
      [/Safari\/(\d+)/i, 'Safari'],
    ];
    for (const [rx, name] of matchers) {
      const m = S.match(rx);
      if (m) { browser_name = name; browser_major = Number(m[1]); break; }
    }

    let device_type = 'desktop';
    if (/\b(iPad|Tablet)\b/i.test(S) || /Android(?!.*Mobile)/i.test(S)) device_type = 'tablet';
    else if (/\b(Android|iPhone|iPod|Mobile)\b/i.test(S)) device_type = 'mobile';

    return { device_type, browser_name, browser_major };
  }

  /** Allow-list of high-signal events to retain. */
  const ALLOW_TYPES = new Set([
    'door_trial',
    'trust_probe_mid',
    'reputation_item',
    'reputation_probe',
    'questionnaire40pre',
    'questionnaire40post',
    'questionnaire14mid1',
    'questionnaire14mid2',
    'questionnaire',
    'demographics',
    'emergency_trial'
  ]);

  /** Low-value instruction/transition screens to drop. */
  const IGNORE_TRIAL_TYPES = new Set([
    'training_intro', 'overview_rescuer', 'robot_description',
    'fade_transition', 'transition'
  ]);

  // Emit raw UA only once (first retained row).
  if (typeof window.__UA_EMITTED__ !== 'boolean') window.__UA_EMITTED__ = false;
  const { device_type, browser_name, browser_major } = parseUA(ua);

  /** Convert object of answers to a list of [question, answer] pairs for storage. */
  function pairsFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const out = [];
    for (const [k, v] of Object.entries(obj)) out.push([String(k), v]);
    return out;
  }

  /**
   * Extract questionnaire payload in a consistent shape:
   *  - qa_pairs_json: JSON string of [question, answer] pairs when available
   *  - questionnaire_score: computed total (Trust-40/Trust-14) or null
   */
  function extractQuestionnaireFields(d) {
    // Do not treat demographics as a scored questionnaire
    if (d.event_type === 'demographics') {
      return { qa_pairs_json: null, questionnaire_score: null };
    }

    // Trust-40
    if (d.trust40_raw) {
      return {
        qa_pairs_json: JSON.stringify(pairsFromObject(d.trust40_raw)),
        questionnaire_score:
          (typeof d.trust40_total_percent === 'number') ? d.trust40_total_percent
          : (typeof d.trust40_total_score === 'number') ? d.trust40_total_score
          : null
      };
    }

    // Trust-14
    if (d.trust14_raw) {
      return {
        qa_pairs_json: JSON.stringify(pairsFromObject(d.trust14_raw)),
        questionnaire_score:
          (typeof d.trust14_total_percent === 'number') ? d.trust14_total_percent
          : (typeof d.trust14_total_score === 'number') ? d.trust14_total_score
          : null
      };
    }

    // Generic jsPsych survey-style trials (responses often a JSON string)
    if (typeof d.responses === 'string' && d.responses.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(d.responses);
        return {
          qa_pairs_json: JSON.stringify(pairsFromObject(parsed)),
          questionnaire_score: null
        };
      } catch {
        /* ignore parse errors; fall through */
      }
    }

    return { qa_pairs_json: null, questionnaire_score: null };
  }

  /** Map the trial payload to a canonical event_type used by the logger. */
  function mapEventType(d) {
    if (d.event_type) return d.event_type; // respect explicit stamping upstream

    const tt = d.trial_type || '';

    // Door trials (true_location present is a strong signal)
    if (typeof d.true_location !== 'undefined' || tt === 'door') return 'door_trial';

    // Trust probes
    if (tt === 'trust_probe') return 'trust_probe_mid';

    // Reviews list + reputation probe
    if (tt === 'reviews_set') return 'reputation_item';
    if (tt === 'reputation_probe') return 'reputation_probe';

    // Trust-40/14 & other questionnaire screens
    if (tt === 'trust40_pre')  return 'questionnaire40pre';
    if (tt === 'trust40_post') return 'questionnaire40post';
    if (tt === 'trust14_mid1') return 'questionnaire14mid1';
    if (tt === 'trust14_mid2') return 'questionnaire14mid2';

    // Fallback: survey-like payloads
    if (d.trust40_raw || d.trust14_raw || d.responses) return 'questionnaire';

    // Otherwise, keep the original (may be filtered out later).
    return tt;
  }

  return allTrials.map(d => {
    const et = mapEventType(d);

    // Drop low-value or non-allowed events early.
    if (IGNORE_TRIAL_TYPES.has(d.trial_type || '') || !ALLOW_TYPES.has(et)) {
      return null;
    }

    // Skip non-interactive demonstration trials.
    if (d.is_demo === true || et === 'training_demo' || d.trial_type === 'training_demo') {
      return null;
    }

    const rt_ms = (typeof d.reaction_time_s === 'number')
      ? Math.round(d.reaction_time_s * 1000)
      : null;

    const followed =
      (typeof d.choice !== 'undefined' && typeof d.suggestion !== 'undefined')
        ? (String(d.choice) === String(d.suggestion))
        : null;

    const risk_key =
      (typeof d.risk_key !== 'undefined')
        ? d.risk_key
        : (d.risk_overrides && d.risk_overrides.risk_key) ? d.risk_overrides.risk_key : null;

    const risk_value =
      (typeof d.risk_value !== 'undefined')
        ? d.risk_value
        : (d.risk_overrides && typeof d.risk_overrides.risk_value !== 'undefined') ? d.risk_overrides.risk_value : null;

    const probe_id = d.probe_context || d.probe_id || null;
    const uaField = window.__UA_EMITTED__ ? null : ua;

    /** Provide a single `response` field per event type for easier analysis downstream. */
    function unifiedResponse(d, et) {
      if (et === 'door_trial') {
        let f = (typeof d.followed === 'boolean') ? d.followed : null;
        if (f === null && typeof d.choice !== 'undefined' && typeof d.suggestion !== 'undefined') {
          f = String(d.choice) === String(d.suggestion);
        }
        const c = (typeof d.correct === 'boolean') ? d.correct : null;
        return JSON.stringify({ followed: f, correct: c });
      }
      if (et === 'trust_probe_mid') {
        return (typeof d.slider_value !== 'undefined') ? Number(d.slider_value) : null;
      }
      if (et === 'reputation_probe') {
        if (typeof d.reputation_probe_delta !== 'undefined') return d.reputation_probe_delta;
        if (typeof d.response !== 'undefined') return d.response;
        return null;
      }
      if (et === 'emergency_trial') {
        return d.emergency_preference ?? (d.response === 0 ? 'self' : d.response === 1 ? 'robot' : null);
      }
      if (et === 'questionnaire40pre' || et === 'questionnaire40post') {
        return d.trust40_total_percent ?? d.trust40_total_score ?? null;
      }
      if (et === 'questionnaire14mid1' || et === 'questionnaire14mid2') {
        return d.trust14_total_percent ?? d.trust14_total_score ?? null;
      }
      if (et === 'demographics') {
        return (typeof d.response === 'string') ? d.response : null;
      }
      return (typeof d.response !== 'undefined') ? d.response : null;
    }

    const row = {
      // identifiers / meta
      session_id:   (typeof d.session_id !== 'undefined') ? d.session_id : SESSION_ID,
      participant_id: d.participant_id || '',
      set_id:       setId,
      block_index:  (typeof d.block_index !== 'undefined') ? d.block_index : null,
      trial_index:  (typeof d.trial_index !== 'undefined') ? d.trial_index : null,
      event_type:   et,
      ts_client:    nowIso,
      ts_seq:       (typeof d._ts_seq !== 'undefined') ? d._ts_seq : null,
      row_id:       (typeof d._ts_seq !== 'undefined') ? (SESSION_ID + ':' + d._ts_seq) : null,
      is_fullscreen: !!document.fullscreenElement,

      // UA summary (raw UA only on first emitted row)
      device_type,
      browser_name,
      browser_major,
      user_agent: uaField,

      // misc
      seed: d.seed || '',

      // task / risk
      risk_key,
      risk_value,
      suggestion: (typeof d.suggestion !== 'undefined') ? d.suggestion : null,
      followed,
      correct: (typeof d.correct !== 'undefined') ? d.correct : null,
      rt_ms,

      // probes
      probe_id,
      response: unifiedResponse(d, et),

      // reputation/reviews
      review_condition: (typeof d.review_condition !== 'undefined') ? d.review_condition : null,
      review_expected:  (typeof d.review_expected  !== 'undefined') ? d.review_expected  : null,
      review_ids:       (typeof d.review_ids       !== 'undefined') ? d.review_ids       : null,
      review_tones:     (typeof d.review_tones     !== 'undefined') ? d.review_tones     : null,
      review_avatars:   (typeof d.review_avatars   !== 'undefined') ? d.review_avatars   : null,

      // environment (filenames only)
      victim_skin:    baseName(d.victim_src),
      background_src: baseName(d.background_src),
      door_src:       baseName(d.door_src),

      // versioning
      client_version: APP_VERSION,

      // legacy passthrough (also duplicated to extra_json server-side)
      trial_type:          d.trial_type || (typeof d.true_location !== 'undefined' ? 'door' : ''),
      true_location:       (typeof d.true_location !== 'undefined') ? d.true_location : null,
      reaction_time_s:     (typeof d.reaction_time_s !== 'undefined') ? d.reaction_time_s : null,
      slider_value:        (typeof d.slider_value !== 'undefined') ? d.slider_value : null,
      emergency_choice_index: (d.trial_type === 'survey_button') ? d.choice : null,

      ts: nowIso
    };

    // Record that we've emitted UA once; subsequent rows omit it.
    if (!window.__UA_EMITTED__ && uaField) window.__UA_EMITTED__ = true;

    // Questionnaire payload (if applicable).
    const ets = row.event_type || '';
    const isQ = ets === 'questionnaire' || ets.startsWith('questionnaire') || ets === 'demographics';
    const qf = isQ ? extractQuestionnaireFields(d) : { qa_pairs_json: null, questionnaire_score: null };
    row.qa_pairs_json = qf.qa_pairs_json;
    row.questionnaire_score = qf.questionnaire_score;

    // Pass through unknown fields; Apps Script groups them under extra_json.
    const RESERVED = new Set(Object.keys(row));
    for (const [k, v] of Object.entries(d)) {
      if (!RESERVED.has(k)) row[k] = v;
    }

    return row;
  }).filter(Boolean);
}

/**
 * Enqueue a single trial row for upload (with monotonic per-session sequence).
 * @param {Record<string, any>} d jsPsych trial data object
 */
export function logTrialRow(d) {
  if (window.__DISCARD_DATA__) return;
  try {
    if (typeof window.LOG_SEQ !== 'number') window.LOG_SEQ = 1;
    d._ts_seq = window.LOG_SEQ++;
    const rows = buildRowsForLogging([d]);
    logEnqueue(rows);
  } catch (e) {
    console.warn('Failed to build/log trial row:', e);
  }
}
