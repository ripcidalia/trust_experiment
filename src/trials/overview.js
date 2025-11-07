/**
 * @file src/trials/overview.js
 * @description
 *  Introductory screen that explains the rescuer role and outlines the task.
 *  Advances only via the on-screen “Next” button (no keyboard shortcuts).
 *
 * Data emitted:
 *  - trial_type: "overview_rescuer"
 */

import { logTrialRow } from '../logging/build.js';

export const overviewTrial = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  data: { trial_type: 'overview_rescuer' },

  stimulus: `
    <div style="
      display:flex; flex-direction:column; justify-content:center; align-items:center;
      height:100vh; text-align:left; max-width:900px; margin:0 auto; padding:0 16px;
    ">
      <div>
        <h2 style="margin:0 0 10px 0;">Experiment Overview</h2>
        <p>
          In this experiment, you will take on the role of a <strong>rescuer</strong> participating in a simulated
          <strong>urban search and rescue (SAR)</strong> mission. Your objective is to locate and save victims trapped
          inside a damaged building by making a series of <em>door-by-door</em> decisions.
        </p>
        <p>
          To support you in this mission, you will receive advice from a simulated version of an
          <strong>autonomous aerial robot (drone)</strong> that assists human firefighters in similar real-world operations.
          In such scenarios, the drone analyzes sensor data and provides recommendations about which door it believes
          is most likely to contain trapped victims. In the performed trials, this drone behavior has been simulated.
        </p>
        <p>
          As the rescuer, you must decide in each situation whether to <strong>follow the drone’s advice</strong> or
          <strong>rely on your own judgment</strong>. Keep in mind that the drone is <strong>not infallible</strong> — it may
          sometimes make incorrect or misleading recommendations due to sensor noise, smoke, or complex environmental conditions.
        </p>
        <p>
          Before beginning the mission, you will be asked several questions about your <strong>initial perception of this
          specific drone</strong>. These questions focus on your <strong>level of trust</strong> in the abilities and
          behavior of the drone as your teammate in the rescue task.
        </p>
        <p>Please read the following <strong>drone description</strong> carefully before answering the upcoming questionnaire.</p>
      </div>

      <button id="next-button" style="
        margin-top:30px; padding:12px 28px; font-size:18px; border:none; border-radius:8px;
        background-color:#2a6ebb; color:#fff; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.1);
      ">
        Next
      </button>
    </div>
  `,

  on_load: () => {
    const btn = document.getElementById('next-button');
    btn?.addEventListener('click', () => jsPsych.finishTrial());
  },

  on_finish: (d) => {
    try { logTrialRow(d); } catch (_) {}
  }
};
