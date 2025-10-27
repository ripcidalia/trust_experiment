/**
 * @file src/trials/demographics.js
 * @summary
 *  jsPsych trial that collects basic demographics (gender and age group).
 *  - Keyboard input is disabled; the participant proceeds via a button.
 *  - “Self-describe” enables a free-text field (optional but validated when chosen).
 *  - On submit, data is serialized and sent through jsPsych.finishTrial, then logged.
 *
 * Data shape emitted to the logger:
 *  {
 *    trial_type: 'demographics',
 *    event_type: 'demographics',
 *    response: '{"gender_option":"...","gender_self_desc":"...","age_range":"..."}',
 *    gender_option: 'woman' | 'man' | 'non-binary' | 'prefer_not_to_say' | 'self_describe',
 *    gender_self_desc: string,     // empty unless gender_option === 'self_describe'
 *    age_range: '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'prefer_not_to_say'
 *  }
 */

import { logTrialRow } from '../logging/build.js';

export const demographicsTrial = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: `
    <div id="demographics-root" style="
      display:flex; flex-direction:column; justify-content:center; align-items:center;
      min-height:100vh; text-align:left; padding:20px; box-sizing:border-box;
    ">
      <section style="width:100%; max-width:900px; margin:0 auto;">
        <h2 style="margin:0 0 14px 0; font-size:26px; font-weight:700;">Before we begin</h2>
        <p style="margin:0 0 24px 0; font-size:16px; line-height:1.55;">
          Please answer a few brief demographic questions. You can skip by selecting “Prefer not to say”.
        </p>

        <!-- Gender -->
        <fieldset style="border:none; padding:0; margin:0 0 22px 0;">
          <legend style="font-weight:600; margin-bottom:10px;">With which gender do you identify?</legend>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="gender" value="woman"> <span>Woman</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="gender" value="man"> <span>Man</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="gender" value="non-binary"> <span>Non-binary</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="gender" value="prefer_not_to_say"> <span>Prefer not to say</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; grid-column:1 / -1; cursor:pointer;">
              <input id="g-other-radio" type="radio" name="gender" value="self_describe">
              <span>Prefer to self-describe</span>
            </label>
            <input id="g-other-text" type="text" placeholder="Please specify (optional)"
              style="grid-column:1 / -1; padding:10px 12px; border-radius:8px; border:1px solid #ccc; font-size:16px;"
              disabled />
          </div>
        </fieldset>

        <!-- Age range -->
        <fieldset style="border:none; padding:0; margin:0 0 10px 0;">
          <legend style="font-weight:600; margin-bottom:10px;">What is your age group?</legend>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="18-24"> <span>18–24</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="25-34"> <span>25–34</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="35-44"> <span>35–44</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="45-54"> <span>45–54</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="55-64"> <span>55–64</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="65+"> <span>65+</span>
            </label>
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="radio" name="age" value="prefer_not_to_say"> <span>Prefer not to say</span>
            </label>
          </div>
        </fieldset>

        <!-- Continue -->
        <div style="display:flex; justify-content:center; margin-top:22px;">
          <button id="demo-continue" style="
            padding: 12px 28px; font-size: 18px; border: none; border-radius: 8px;
            background-color: #2a6ebb; color: white; cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.1);
          ">
            Continue
          </button>
        </div>

        <!-- Inline validation note -->
        <p id="demo-warn" style="text-align:center; color:#b00020; margin-top:10px; display:none;">
          Please select a gender and an age range (or choose “Prefer not to say”).
        </p>
      </section>
    </div>
  `,

  /**
   * Wire UI behavior: enable self-describe text when chosen; validate; submit.
   */
  on_load: function () {
    const gOtherRadio = document.getElementById('g-other-radio');
    const gOtherText  = document.getElementById('g-other-text');
    const warn        = document.getElementById('demo-warn');
    const btn         = document.getElementById('demo-continue');

    /**
     * Enable the free-text input only when “self_describe” is selected.
     */
    function syncOther() {
      if (gOtherRadio?.checked) {
        gOtherText.disabled = false;
        gOtherText.focus({ preventScroll: true });
      } else {
        gOtherText.value = '';
        gOtherText.disabled = true;
      }
    }

    document
      .querySelectorAll('input[name="gender"]')
      .forEach(el => el.addEventListener('change', syncOther));
    syncOther();

    /**
     * Validate inputs and finalize the trial.
     */
    btn.addEventListener('click', () => {
      const gSel = document.querySelector('input[name="gender"]:checked');
      const aSel = document.querySelector('input[name="age"]:checked');

      if (!gSel || !aSel) {
        warn.style.display = '';
        return;
      }

      const gender_option = gSel.value;
      const gender_self_desc =
        gender_option === 'self_describe' ? (gOtherText.value || '').trim() : '';

      // If “self_describe” is selected, require a non-empty text (or choose another option).
      if (gender_option === 'self_describe' && gender_self_desc.length === 0) {
        warn.textContent = 'Please write your self-description or choose another option.';
        warn.style.display = '';
        gOtherText.focus({ preventScroll: true });
        return;
      }

      const age_range = aSel.value;

      // Submit data and end trial
      jsPsych.finishTrial({
        trial_type: 'demographics',
        event_type: 'demographics',
        response: JSON.stringify({
          gender_option,
          gender_self_desc,
          age_range
        }),
        gender_option,
        gender_self_desc,
        age_range
      });
    });
  },

  /**
   * Forward the demographic row to the logging pipeline.
   */
  on_finish: d => {
    try { logTrialRow(d); } catch (_) {}
  }
};
