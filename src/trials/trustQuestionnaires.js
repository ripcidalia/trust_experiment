/**
 * @file src/trials/trustQuestionnaires.js
 * @description
 * Unified implementation of the Schaefer trust questionnaires (40-item and 14-item subset).
 * Defines the full 40-item pool once, marking reverse-coded and 14-subset items, and provides
 * a factory function to generate either questionnaire with identical structure, interaction
 * behavior, and data output format.
 *
 * Behavior:
 *  - Presents items sequentially in randomized order.
 *  - Records 0–100 slider responses in 10-point increments.
 *  - Reverse-codes flagged items before computing mean percent scores.
 *  - Emits a structured payload through the central logger, preserving legacy field names.
 *  - For the 40-item questionnaire, additionally computes the equivalent 14-item results
 *    (based on the same responses) to support later comparison and validation analyses.
 *
 * Factory interface:
 *  makeTrustTrial(mode, opts)
 *    mode: 't40' | 't14'               // choose full or subset version
 *    opts.trialType (optional)         // override default trial_type string
 *
 * Data emitted on finish (per mode):
 *  - trial_type: 'trust40_pre' | 'trust14'
 *  - trust40_order / trust14_order: string[]                 // item IDs in presented order
 *  - trust40_raw   / trust14_raw: Record<id, number>         // raw 0–100 responses
 *  - trust40_scored_vector / trust14_scored_vector: number[] // reverse-coded where applicable
 *  - trust40_total_percent / trust14_total_percent: number   // mean of scored_vector (0–100)
 *
 * Additional fields for 40-item trials (derived 14-item subset):
 *  - trust14_equiv_order: string[]                // 14-item subset in presented order
 *  - trust14_equiv_raw: Record<id, number>        // corresponding raw responses
 *  - trust14_equiv_scored_vector: number[]        // reverse-coded 14-item subset
 *  - trust14_equiv_total_percent: number          // mean of 14-item subset (0–100)
 *
 * Interaction:
 *  - Slider snaps to 10-point steps.
 *  - ← / → keys adjust slider by −10 / +10.
 *  - Enter advances (Next/Finish).
 *  - Back/Next buttons for navigation; Back hidden on the first item.
 *
 * Exports:
 *  - trust40Trial : preconfigured 40-item version
 *  - trust14Trial : preconfigured 14-item subset version
 */


import { logTrialRow } from '../logging/build.js';
import { applyLightUiTheme } from '../ui/theme.js';
import { shuffleArray } from '../utils/rand.js';

// ---- Canonical item bank (40). Mark the 14-subset with is14: true. ----
// rc = reverse-coded (100 - value), is14 = part of the 14-item subset.
const TRUST_ITEMS = [
  { id: 'act_consistently',           text: 'act consistently',                                       rc: false, is14: true  },
  { id: 'protect_people',             text: 'protect people',                                         rc: false, is14: false },
  { id: 'act_as_part_of_team',        text: 'act as part of the team',                                rc: false, is14: false },
  { id: 'function_successfully',      text: 'function successfully',                                  rc: false, is14: true  },
  { id: 'malfunction',                text: 'malfunction',                                            rc: true,  is14: true  },
  { id: 'clearly_communicate',        text: 'clearly communicate',                                    rc: false, is14: false },
  { id: 'require_freq_maintenance',   text: 'require frequent maintenance',                           rc: true,  is14: false },
  { id: 'openly_communicate',         text: 'openly communicate',                                     rc: false, is14: false },
  { id: 'have_errors',                text: 'have errors',                                            rc: true,  is14: true  },
  { id: 'better_than_novice',         text: 'perform a task better than a novice human user',         rc: false, is14: false },
  { id: 'friend_vs_foe',              text: 'know the difference between friend and foe',             rc: false, is14: false },
  { id: 'provide_feedback',           text: 'provide feedback',                                       rc: false, is14: true  },
  { id: 'adequate_decision_making',   text: 'possess adequate decision-making capability',            rc: false, is14: false },
  { id: 'warn_risks',                 text: 'warn people of potential risks in the environment',      rc: false, is14: false },
  { id: 'meet_needs_mission',         text: 'meet the needs of the mission',                          rc: false, is14: true  },
  { id: 'provide_appropriate_info',   text: 'provide appropriate information',                        rc: false, is14: true  },
  { id: 'communicate_with_people',    text: 'communicate with people',                                rc: false, is14: true  },
  { id: 'work_best_with_team',        text: 'work best with a team',                                  rc: false, is14: false },
  { id: 'keep_classified_secure',     text: 'keep classified information secure',                     rc: false, is14: false },
  { id: 'perform_exactly_instructed', text: 'perform exactly as instructed',                          rc: false, is14: true  },
  { id: 'make_sensible_decisions',    text: 'make sensible decisions',                                rc: false, is14: false },
  { id: 'work_close_to_people',       text: 'work in close proximity with people',                    rc: false, is14: false },
  { id: 'tell_truth',                 text: 'tell the truth',                                         rc: false, is14: false },
  { id: 'many_functions',             text: 'perform many functions at one time',                     rc: false, is14: false },
  { id: 'follow_directions',          text: 'follow directions',                                      rc: false, is14: true  },
  { id: 'considered_part_team',       text: 'be considered part of the team',                         rc: false, is14: false },
  { id: 'responsible',                text: 'be responsible',                                         rc: false, is14: false },
  { id: 'supportive',                 text: 'be supportive',                                          rc: false, is14: false },
  { id: 'incompetent',                text: 'be incompetent',                                         rc: true,  is14: false },
  { id: 'dependable',                 text: 'be dependable',                                          rc: false, is14: true  },
  { id: 'friendly',                   text: 'be friendly',                                            rc: false, is14: false },
  { id: 'reliable',                   text: 'be reliable',                                            rc: false, is14: true  },
  { id: 'pleasant',                   text: 'be pleasant',                                            rc: false, is14: false },
  { id: 'unresponsive',               text: 'be unresponsive',                                        rc: true,  is14: true  },
  { id: 'autonomous',                 text: 'be autonomous',                                          rc: false, is14: false },
  { id: 'predictable',                text: 'be predictable',                                         rc: false, is14: true  },
  { id: 'conscious',                  text: 'be conscious',                                           rc: false, is14: false },
  { id: 'lifelike',                   text: 'be lifelike',                                            rc: false, is14: false },
  { id: 'good_teammate',              text: 'be a good teammate',                                     rc: false, is14: false },
  { id: 'led_astray',                 text: 'be led astray by unexpected changes in the environment', rc: false, is14: false }
];

// ---- Factory: builds a jsPsych trial for 40 or 14 items ----
// mode: 't40' | 't14'
// opts.trialType: override trial_type string (defaults keep your current shapes)
// opts.domPrefix: id prefix (defaults 't40' | 't14')
export function makeTrustTrial(mode, opts = {}) {
  const is40 = mode === 't40';
  const is14 = mode === 't14';

  const domPrefix  = opts.domPrefix || (is40 ? 't40' : 't14');

  const subset = is40 ? TRUST_ITEMS.slice() : TRUST_ITEMS.filter(x => x.is14);

  // IMPORTANT: keep existing payload keys
  const keyMap = is40
    ? {
        trial_type: opts.trialType || 'trust40_pre',
        orderKey: 'trust40_order',
        rawKey: 'trust40_raw',
        scoredKey: 'trust40_scored_vector',
        totalKey: 'trust40_total_percent',
        stateSlot: '__t40__'
      }
    : {
        trial_type: opts.trialType || 'trust14', 
        orderKey: 'trust14_order',
        rawKey: 'trust14_raw',
        scoredKey: 'trust14_scored_vector',
        totalKey: 'trust14_total_percent',
        stateSlot: '__t14__'
      };

  let keyHandlerRef = null;

  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: 'NO_KEYS',

    on_start() {
      applyLightUiTheme();

      if (!window[keyMap.stateSlot]) {
        const order = shuffleArray(subset);
        window[keyMap.stateSlot] = { order, idx: 0, resp: {} };
      }
      keyHandlerRef = null;
    },

    stimulus: `
      <div id="${domPrefix}_card" style="
        display:flex; flex-direction:column; justify-content:center; align-items:center;
        min-height:100vh; padding:80px 24px; box-sizing:border-box;
      ">
        <div style="width:min(980px, 94vw); text-align:left;">

          <div id="${domPrefix}_counter" style="font-size:14px; color:#666; text-align:right; margin-bottom:28px;"></div>

          <div id="${domPrefix}_qbox" style="margin:0 0 72px 0; min-height:84px; display:flex; align-items:flex-end;">
            <p id="${domPrefix}_q" style="margin:0; font-size:22px; line-height:1.5;"></p>
          </div>

          <div style="width:min(780px, 100%); margin:0 auto;">
            <div id="${domPrefix}_val" style="
              text-align:center; font-variant-numeric:tabular-nums;
              font-size:22px; margin-bottom:44px; font-weight:500;
            ">50%</div>

            <input type="range" id="${domPrefix}_slider" min="0" max="100" step="10" value="50" list="${domPrefix}_ticks" style="width:100%;">

            <div style="display:flex; justify-content:space-between; margin-top:32px; font-size:14px; color:#666;">
              <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
              <span>60</span><span>70</span><span>80</span><span>90</span><span>100</span>
            </div>

            <datalist id="${domPrefix}_ticks">
              <option value="0"></option><option value="10"></option><option value="20"></option>
              <option value="30"></option><option value="40"></option><option value="50"></option>
              <option value="60"></option><option value="70"></option><option value="80"></option>
              <option value="90"></option><option value="100"></option>
            </datalist>
          </div>

          <div style="display:flex; justify-content:center; gap:24px; margin-top:96px;">
            <button id="${domPrefix}_back" style="
              padding:12px 28px; font-size:18px; border:none; border-radius:8px;
              background:#e6eaf0; color:#111; cursor:pointer; display:none;
            ">Back</button>

            <button id="${domPrefix}_next" style="
              padding:12px 28px; font-size:18px; border:none; border-radius:8px;
              background-color:#2a6ebb; color:#fff; cursor:pointer;
              box-shadow:0 6px 18px rgba(0,0,0,0.12);
            ">Next</button>
          </div>
        </div>
      </div>
    `,

    on_load() {
      const S      = window[keyMap.stateSlot];
      const qEl    = document.getElementById(`${domPrefix}_q`);
      const cnt    = document.getElementById(`${domPrefix}_counter`);
      const slider = document.getElementById(`${domPrefix}_slider`);
      const valEl  = document.getElementById(`${domPrefix}_val`);
      const back   = document.getElementById(`${domPrefix}_back`);
      const next   = document.getElementById(`${domPrefix}_next`);

      const render = () => {
        const n  = S.order.length;
        const i  = S.idx;
        const it = S.order[i];

        cnt.textContent = `Item ${i + 1} of ${n}`;
        qEl.innerHTML = `What percentage of the time will this robot <strong>${it.text}</strong>?`;

        const saved = S.resp[it.id];
        const startVal = typeof saved === 'number' ? saved : 50;
        slider.value = Math.round(startVal / 10) * 10;
        valEl.textContent = slider.value + '%';

        back.style.display = i === 0 ? 'none' : 'inline-block';
        next.textContent   = i === n - 1 ? 'Finish' : 'Next';
      };

      const save = () => {
        const it = S.order[S.idx];
        S.resp[it.id] = Number(slider.value);
      };

      const snapTo10 = () => {
        slider.value = Math.round(Number(slider.value) / 10) * 10;
        valEl.textContent = slider.value + '%';
      };

      slider.addEventListener('input', snapTo10);
      slider.addEventListener('change', snapTo10);

      back.addEventListener('click', () => {
        save();
        if (S.idx > 0) { S.idx--; render(); }
      });

      next.addEventListener('click', () => {
        save();
        if (S.idx < S.order.length - 1) {
          S.idx++;
          render();
        } else {
          // Score (reverse-code rc items) and emit payload with the original key names.
          const rcIds    = TRUST_ITEMS.filter(x => x.rc).map(x => x.id);
          const orderIds = S.order.map(x => x.id);

          // Raw map: ensure every presented id has a numeric value (default 0).
          const raw = {};
          orderIds.forEach(id => { raw[id] = (typeof S.resp[id] === 'number') ? S.resp[id] : 0; });

          // Main (current subset) scoring
          const scoredVec = orderIds.map(id => rcIds.includes(id) ? (100 - raw[id]) : raw[id]);
          const total     = scoredVec.reduce((a, b) => a + b, 0) / orderIds.length;

          // Base payload — legacy keys preserved 1:1.
          const payload = {
            trial_type: keyMap.trial_type,
            [keyMap.orderKey]: orderIds,
            [keyMap.rawKey]: raw,
            [keyMap.scoredKey]: scoredVec,
            [keyMap.totalKey]: total
          };

          // If this is the 40-item run, also compute the "as-if 14" equivalent.
          if (is40) {
            // Preserve the presented order for the 14 subset by filtering orderIds
            const orderIds14 = orderIds.filter(id => {
              const meta = TRUST_ITEMS.find(x => x.id === id);
              return meta && meta.is14 === true;
            });

            // Raw answers for those ids (already in raw)
            const raw14 = {};
            orderIds14.forEach(id => { raw14[id] = raw[id]; });

            // Reverse-code where applicable
            const scoredVec14 = orderIds14.map(id => rcIds.includes(id) ? (100 - raw[id]) : raw[id]);
            const total14 = orderIds14.length > 0
              ? scoredVec14.reduce((a, b) => a + b, 0) / orderIds14.length
              : 0;

            // Append — using distinct names so legacy log parsers remain stable.
            payload.trust14_equiv_order = orderIds14;
            payload.trust14_equiv_raw = raw14;
            payload.trust14_equiv_scored_vector = scoredVec14;
            payload.trust14_equiv_total_percent = total14;
          }

          // Clear state and finish.
          window[keyMap.stateSlot] = null;
          jsPsych.finishTrial(payload);
        }
      });

      // Keyboard controls
      const keyHandler = (e) => {
        if (e.key === 'ArrowRight') { slider.value = Math.min(100, Number(slider.value) + 10); snapTo10(); }
        if (e.key === 'ArrowLeft')  { slider.value = Math.max(0,   Number(slider.value) - 10); snapTo10(); }
        if (e.key === 'Enter')      { next.click(); }
      };
      keyHandlerRef = keyHandler;
      document.addEventListener('keydown', keyHandler);

      render();
    },

    on_finish: d => {
      if (keyHandlerRef) {
        document.removeEventListener('keydown', keyHandlerRef);
        keyHandlerRef = null;
      }
      logTrialRow(d);
    }
  };
}

// Ready-made exports.
export const trust40Trial = makeTrustTrial('t40');
export const trust14Trial = makeTrustTrial('t14');
