/**
 * @file src/trials/trust14.js
 * @description
 * Schaefer 14-item trust questionnaire (single-item flow with slider).
 * Presents items one by one in randomized order, captures 0–100 responses at
 * 10-point increments, reverse-codes flagged items, computes a percent score,
 * and logs a normalized payload via the central logger.
 *
 * Data emitted on finish:
 *  - trial_type: 'trust14'
 *  - trust14_order: string[]           // item ids in presented order
 *  - trust14_raw: Record<id, number>   // 0..100 as given
 *  - trust14_scored_vector: number[]   // reverse-coded where applicable
 *  - trust14_total_percent: number     // mean of scored_vector (0..100)
 *
 * Interaction:
 *  - Slider snaps to 10-point steps.
 *  - ← / → adjusts slider by −10 / +10.
 *  - Enter advances to next/finish.
 *  - Back/Next buttons for navigation; final button reads “Finish”.
 */

import { logTrialRow } from '../logging/build.js';
import { applyLightUiTheme } from '../ui/theme.js';
import { shuffleArray } from '../utils/rand.js';

let t14_keyHandler = null;

/**
 * Questionnaire items. `rc: true` items are reverse-coded (100 - value).
 */
const TRUST14_ITEMS = [
  { id: 'act_consistently',           text: 'act consistently',                   rc: false },
  { id: 'function_successfully',      text: 'function successfully',              rc: false },
  { id: 'malfunction',                text: 'malfunction',                        rc: true  },
  { id: 'have_errors',                text: 'have errors',                        rc: true  },
  { id: 'provide_feedback',           text: 'provide feedback',                   rc: false },
  { id: 'meet_needs_mission',         text: 'meet the needs of the mission',      rc: false },
  { id: 'provide_appropriate_info',   text: 'provide appropriate information',    rc: false },
  { id: 'communicate_with_people',    text: 'communicate with people',            rc: false },
  { id: 'perform_exactly_instructed', text: 'perform exactly as instructed',      rc: false },
  { id: 'follow_directions',          text: 'follow directions',                  rc: false },
  { id: 'dependable',                 text: 'be dependable',                      rc: false },
  { id: 'reliable',                   text: 'be reliable',                        rc: false },
  { id: 'unresponsive',               text: 'be unresponsive',                    rc: true  },
  { id: 'predictable',                text: 'be predictable',                     rc: false }
];

export const trust14Trial = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',

  on_start() {
    applyLightUiTheme();
    if (!window.__t14__) {
      const order = shuffleArray(TRUST14_ITEMS);
      window.__t14__ = { order, idx: 0, resp: {} };
    }
    t14_keyHandler = null;
  },

  stimulus: `
    <div id="t14_card" style="
      display:flex; flex-direction:column; justify-content:center; align-items:center;
      min-height:100vh; padding:80px 24px; box-sizing:border-box;
    ">
      <div style="width:min(980px, 94vw); text-align:left;">

        <div id="t14_counter" style="font-size:14px; color:#666; text-align:right; margin-bottom:28px;"></div>

        <div id="t14_qbox" style="margin:0 0 72px 0; min-height:84px; display:flex; align-items:flex-end;">
          <p id="t14_q" style="margin:0; font-size:22px; line-height:1.5;"></p>
        </div>

        <div style="width:min(780px, 100%); margin:0 auto;">
          <div id="t14_val" style="
            text-align:center; font-variant-numeric:tabular-nums;
            font-size:22px; margin-bottom:44px; font-weight:500;
          ">50%</div>

          <input type="range" id="t14_slider" min="0" max="100" step="10" value="50" list="t14_ticks" style="width:100%;">

          <div style="display:flex; justify-content:space-between; margin-top:32px; font-size:14px; color:#666;">
            <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
            <span>60</span><span>70</span><span>80</span><span>90</span><span>100</span>
          </div>

          <datalist id="t14_ticks">
            <option value="0"></option><option value="10"></option><option value="20"></option>
            <option value="30"></option><option value="40"></option><option value="50"></option>
            <option value="60"></option><option value="70"></option><option value="80"></option>
            <option value="90"></option><option value="100"></option>
          </datalist>
        </div>

        <div style="display:flex; justify-content:center; gap:24px; margin-top:96px;">
          <button id="t14_back" style="
            padding:12px 28px; font-size:18px; border:none; border-radius:8px;
            background:#e6eaf0; color:#111; cursor:pointer; display:none;
          ">Back</button>

          <button id="t14_next" style="
            padding:12px 28px; font-size:18px; border:none; border-radius:8px;
            background-color:#2a6ebb; color:#fff; cursor:pointer;
            box-shadow:0 6px 18px rgba(0,0,0,0.12);
          ">Next</button>
        </div>

      </div>
    </div>
  `,

  on_load() {
    const S      = window.__t14__;
    const qEl    = document.getElementById('t14_q');
    const cnt    = document.getElementById('t14_counter');
    const slider = document.getElementById('t14_slider');
    const valEl  = document.getElementById('t14_val');
    const back   = document.getElementById('t14_back');
    const next   = document.getElementById('t14_next');

    const render = () => {
      const n = S.order.length;
      const i = S.idx;
      const it = S.order[i];

      cnt.textContent = `Item ${i + 1} of ${n}`;
      qEl.innerHTML = `What percentage of the time will this robot <strong>${it.text}</strong>?`;

      const saved = S.resp[it.id];
      const startVal = typeof saved === 'number' ? saved : 50;
      slider.value = Math.round(startVal / 10) * 10;
      valEl.textContent = slider.value + '%';

      back.style.display = i === 0 ? 'none' : 'inline-block';
      next.textContent = i === n - 1 ? 'Finish' : 'Next';
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
        // Score: reverse-code where rc === true, then mean over all items (0..100).
        const rcIds = TRUST14_ITEMS.filter(x => x.rc).map(x => x.id);
        const orderIds = S.order.map(x => x.id);

        const raw = {};
        orderIds.forEach(id => { raw[id] = typeof S.resp[id] === 'number' ? S.resp[id] : 0; });

        const scoredVec = orderIds.map(id => (rcIds.includes(id) ? (100 - raw[id]) : raw[id]));
        const total = scoredVec.reduce((a, b) => a + b, 0) / orderIds.length;

        const payload = {
          trial_type: 'trust14',
          trust14_order: orderIds,
          trust14_raw: raw,
          trust14_scored_vector: scoredVec,
          trust14_total_percent: total
        };

        window.__t14__ = null;
        jsPsych.finishTrial(payload);
      }
    });

    // Keyboard: ← / → step by 10; Enter advances.
    const keyHandler = (e) => {
      if (e.key === 'ArrowRight') { slider.value = Math.min(100, Number(slider.value) + 10); snapTo10(); }
      if (e.key === 'ArrowLeft')  { slider.value = Math.max(0,   Number(slider.value) - 10); snapTo10(); }
      if (e.key === 'Enter')      { next.click(); }
    };
    t14_keyHandler = keyHandler;
    document.addEventListener('keydown', keyHandler);

    render();
  },

  on_finish: d => {
    if (t14_keyHandler) document.removeEventListener('keydown', t14_keyHandler);
    logTrialRow(d);
    t14_keyHandler = null;
  }
};