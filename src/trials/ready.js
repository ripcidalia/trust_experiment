/**
 * @file src/trials/ready.js
 * @description
 *  Pre-demo “Task Description” screen. Explains the one-trial demonstration and
 *  how the main task works. Advances only via the on-screen button.
 *
 * Data emitted:
 *  - trial_type: "training_intro"
 */

import { logTrialRow } from '../logging/build.js';
import { applyLightUiTheme } from '../ui/theme.js';

export const readyTrial = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  data: { trial_type: 'training_intro' },

  on_start: () => {
    applyLightUiTheme();
  },

  stimulus: `
    <div style="
      display:flex; flex-direction:column; justify-content:center; align-items:center;
      height:100vh; text-align:left; max-width:900px; margin:0 auto; padding:0 16px;
    ">
      <div>
        <h2 style="margin:0 0 10px 0;">Task Description</h2>

        <p>
          You will now see a <strong>single trial demonstration</strong> of the main task. In this demonstration, the drone will
          <em>enter</em> the scene, <em>scan two doors</em>, and then <em>position itself</em> above the door it <em>recommends</em>.
          At each search area, there is exactly one victim, always located behind one of the two doors.
          Due to the risk of fire spreading, there is only enough time to open <strong>one door</strong> before moving to the next area.
          The overall goal of the mission is to <strong>find as many victims as possible</strong>.
        </p>

        <p>
          During this one-trial demonstration, you will not have to make any decisions, and no outcomes will be shown.
          After the demonstration, the <strong>main task will begin automatically</strong>.
          A message will appear onscreen to indicate when the main task has started.
        </p>

        <p>
          In the main task, you will be prompted to decide whether to <strong>follow or ignore</strong> the drone's recommendation.
          You can respond either by clicking the on-screen buttons or by pressing the key
          <strong><kbd>F</kbd></strong> (to follow) or <strong><kbd>N</kbd></strong> (to not follow) on your keyboard.
          You will have a limited amount of time to make your choice, shown by a decaying slider timer.
          If no response is given before time runs out, the drone's recommendation will be followed automatically.
          After your decision, the chosen door will open, revealing whether a victim has been found.
        </p>

        <p>
          The main task consists of <strong>three blocks of 20 consecutive trials</strong>.
          During the main task, you will be periodically asked to answer a few short questions about your experience.
        </p>
      </div>

      <button id="demo-continue" style="
        margin-top:30px; padding:12px 28px; font-size:18px; border:none; border-radius:8px;
        background-color:#2a6ebb; color:#fff; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.1);
      ">
        Continue to the one trial demonstration and main task
      </button>
    </div>
  `,

  on_load: () => {
    document.getElementById('demo-continue')
      ?.addEventListener('click', () => jsPsych.finishTrial());
  },

  on_finish: (d) => {
    try { logTrialRow(d); } catch (_) {}
  }
};
