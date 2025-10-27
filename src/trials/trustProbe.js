/**
 * @file src/trials/trustProbe.js
 * @description
 * Single-item trust probe (0–100, 10-point step). Renders a slider with live value
 * readout and “Continue” button. Supports keyboard controls:
 *  - ← / → : step −10 / +10
 *  - Enter : submit
 *
 * Data emitted on finish:
 *  - trial_type: 'trust_probe'
 *  - event_type: 'trust_probe_mid'
 *  - probe_context: string | undefined     // e.g., 'after_trust40_pre', 'mid_block1_t5'
 *  - slider_value: number                  // 0..100 in steps of 10
 *  - is_fullscreen: boolean
 */

import { logTrialRow } from '../logging/build.js';
import { applyLightUiTheme } from '../ui/theme.js';

/**
 * Build a trust probe trial.
 * @param {string} [contextTag] - Optional tag describing the probe context.
 * @returns {import('jspsych').JsPsychPlugin} jsPsych trial definition.
 */
export function makeTrustProbeTrial(contextTag) {
  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: 'NO_KEYS',
    on_start: () => applyLightUiTheme(),
    stimulus: `
      <div id="trust_probe_card" style="
        display:flex; flex-direction:column; justify-content:center; align-items:center;
        min-height:100vh; padding:80px 24px; box-sizing:border-box; text-align:center;">
        <div style="width:min(780px,94vw); text-align:center;">

          <h2 style="margin:0 0 12px 0;">Right now, how much do you trust this drone?</h2>
          <p style="margin:0 0 22px 0; color:#666;">0 = never trust · 100 = always trust</p>

          <div id="trust_probe_val" style="
            text-align:center; font-variant-numeric:tabular-nums;
            font-size:22px; margin-bottom:44px; font-weight:500;">50%</div>

          <div style="width:min(780px,100%); margin:0 auto;">
            <input
              type="range" id="trust_probe_slider"
              min="0" max="100" step="10" value="50" list="trust_probe_ticks" style="width:100%;">
            <div style="display:flex; justify-content:space-between; margin-top:32px; font-size:14px; color:#666;">
              <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
              <span>60</span><span>70</span><span>80</span><span>90</span><span>100</span>
            </div>
            <datalist id="trust_probe_ticks">
              <option value="0"></option><option value="10"></option><option value="20"></option>
              <option value="30"></option><option value="40"></option><option value="50"></option>
              <option value="60"></option><option value="70"></option><option value="80"></option>
              <option value="90"></option><option value="100"></option>
            </datalist>
          </div>

          <div style="display:flex; justify-content:center; margin-top:96px;">
            <button id="trust_probe_next" style="
              padding:12px 28px; font-size:18px; border:none; border-radius:8px;
              background-color:#2a6ebb; color:#fff; cursor:pointer;
              box-shadow:0 6px 18px rgba(0,0,0,0.12);">Continue</button>
          </div>
        </div>
      </div>
    `,
    on_load: () => {
      const slider = /** @type {HTMLInputElement} */ (document.getElementById('trust_probe_slider'));
      const valEl  = document.getElementById('trust_probe_val');
      const next   = document.getElementById('trust_probe_next');

      const snapTo10 = () => {
        slider.value = String(Math.round(Number(slider.value) / 10) * 10);
        if (valEl) valEl.textContent = `${slider.value}%`;
      };

      slider.addEventListener('input', snapTo10);
      slider.addEventListener('change', snapTo10);

      const keyHandler = (e) => {
        if (e.key === 'ArrowRight') { slider.value = String(Math.min(100, Number(slider.value) + 10)); snapTo10(); }
        if (e.key === 'ArrowLeft')  { slider.value = String(Math.max(0,   Number(slider.value) - 10)); snapTo10(); }
        if (e.key === 'Enter')      { next?.click(); }
      };
      document.addEventListener('keydown', keyHandler);

      next?.addEventListener('click', () => {
        document.removeEventListener('keydown', keyHandler);
        jsPsych.finishTrial({
          trial_type: 'trust_probe',
          event_type: 'trust_probe_mid',
          probe_context: contextTag,
          slider_value: Number(slider.value)
        });
      });
    },
    on_finish: (d) => {
      d.is_fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
      logTrialRow(d);
    }
  };
}