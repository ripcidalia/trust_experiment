/**
 * @file src/trials/robotDescription.js
 * @description
 *  Two-step introduction prior to the initial trust questionnaire:
 *   - Screen A: concise robot (drone) description with illustration.
 *   - Screen B: confirmation gate before proceeding to the questionnaire.
 *  Tracks optional “go back” revisits and logs the trial row.
 */

import { logTrialRow } from '../logging/build.js';

export const robotDescriptionTrial = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: `
    <div id="robot-desc-root" style="
      display:flex; flex-direction:column; justify-content:center; align-items:center;
      min-height:100vh; text-align:left; padding:20px; box-sizing:border-box;
    ">

      <!-- Screen A: description -->
      <section id="desc-screen" style="width:100%; max-width:900px; margin:0 auto;">
        <img
          src="assets/drone_description.png"
          alt="Rescue drone"
          style="width:100%; max-width:700px; border:none; box-shadow:none; margin:0 auto 25px auto; display:block;"
        />

        <div>
          <p>
            The simulated robot you will interact with in this experiment (pictured above) is an
            <em>autonomous aerial search-and-rescue drone</em> designed to assist human rescuers during indoor emergency operations.
            It helps identify victims, assess hazardous environments, and recommend which areas should be entered next to maximize
            safety and rescue efficiency.
          </p>
          <p>
            The drone operates <strong>semi-autonomously</strong>: it uses onboard cameras and thermal sensors to detect signs of life,
            analyzes the data, and communicates its recommendations to you — the human rescuer — by moving towards the recommended door.
            Although it is equipped with advanced perception and navigation algorithms, it can still make <strong>errors</strong>,
            particularly in situations involving poor visibility, debris, or heat interference.
          </p>
          <p>
            During the mission, you will act as the <strong>decision-maker</strong> responsible for evaluating the drone’s advice
            and choosing whether to follow it or not. Your performance will depend on your ability to balance your own judgment
            with the information provided by the drone. The overall goal is to <strong>find as many victims as possible</strong>.
          </p>

          <div style="display:flex; justify-content:center; margin-top:24px;">
            <button id="continue-button" style="
              padding:12px 28px; font-size:18px; border:none; border-radius:8px;
              background-color:#2a6ebb; color:#fff; cursor:pointer;
              box-shadow:0 4px 14px rgba(0,0,0,0.1);
            ">
              Continue
            </button>
          </div>
        </div>
      </section>

      <!-- Screen B: confirmation -->
      <section id="confirm-screen" style="width:100%; max-width:900px; margin:0 auto; display:none;">
        <p style="font-size:18px; line-height:1.5; margin-top:10px;">
          Now that you are familiar with this drone, please answer the following questions about it,
          <strong>based on your own perception</strong>. Please note that after you continue to the questionnaire, you will not be able to return to this page.
        </p>

        <div style="display:flex; justify-content:center; gap:12px; margin-top:24px; flex-wrap:wrap;">
          <button id="confirm-back" style="
            padding:12px 24px; font-size:18px; border:1px solid #888; border-radius:8px;
            background:#fff; color:#333; cursor:pointer;
            box-shadow:0 2px 8px rgba(0,0,0,0.06);
          ">
            Go back to the drone description
          </button>

          <button id="confirm-proceed" style="
            padding:12px 24px; font-size:18px; border:none; border-radius:8px;
            background-color:#2a6ebb; color:#fff; cursor:pointer;
            box-shadow:0 4px 14px rgba(0,0,0,0.1);
          ">
            Proceed to questionnaire
          </button>
        </div>
      </section>

    </div>
  `,
  on_load: function () {
    const desc = document.getElementById('desc-screen');
    const conf = document.getElementById('confirm-screen');
    const btnContinue = document.getElementById('continue-button');
    const btnProceed  = document.getElementById('confirm-proceed');
    const btnBack     = document.getElementById('confirm-back');

    // Count number of returns from confirmation → description.
    let revisits = 0;

    const showDesc = () => {
      desc.style.display = '';
      conf.style.display = 'none';
      btnContinue?.focus({ preventScroll: true });
    };
    const showConfirm = () => {
      desc.style.display = 'none';
      conf.style.display = '';
      btnProceed?.focus({ preventScroll: true });
    };

    btnContinue?.addEventListener('click', showConfirm);
    btnBack?.addEventListener('click', () => { revisits += 1; showDesc(); });
    btnProceed?.addEventListener('click', () => {
      // Persist visit count across the questionnaire boundary for logging.
      window.__robot_desc_revisits = (window.__robot_desc_revisits || 0) + revisits;
      jsPsych.finishTrial();
    });

    showDesc();
  },
  data: { trial_type: 'robot_description' },
  on_finish: d => {
    d.robot_desc_revisits = window.__robot_desc_revisits || 0;
    logTrialRow(d);
  }
};