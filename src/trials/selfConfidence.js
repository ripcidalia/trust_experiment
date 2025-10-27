/**
 * @file src/trials/selfConfidence.js
 * @description
 *  Single-question probe capturing the participant’s default preference in an
 *  emergency: their own judgement vs. a rescue robot’s judgement.
 *  The response is normalized into:
 *    - d.choice (0/1 index from jsPsych)
 *    - d.emergency_preference ('self' | 'robot')
 *    - d.responses (JSON payload for downstream parsers)
 *  The row is then logged through the central logger.
 */

import { logTrialRow } from '../logging/build.js';
import { applyLightUiTheme } from '../ui/theme.js';

export const selfConfidenceTrial = {
  type: jsPsychHtmlButtonResponse,

  on_start() {
    applyLightUiTheme();
  },

  stimulus:
    '<h2 style="margin-bottom:18px;text-align:center;">In an emergency situation, whose judgement do you generally trust more?</h2>',

  choices: ["My own judgement", "A rescue robot's judgement"],

  on_load() {
    // Center the jsPsych wrapper vertically for consistent presentation.
    const el = jsPsych.getDisplayElement();
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.justifyContent = 'center';
    el.style.alignItems = 'center';
    el.style.minHeight = '100vh';
    el.style.textAlign = 'center';
  },

  data: { trial_type: 'survey_button', event_type: 'emergency_trial' },

  on_finish: d => {
    // Normalize selection.
    d.choice = d.response; // 0 | 1
    const label = d.response === 0 ? 'self' : d.response === 1 ? 'robot' : null;
    d.emergency_preference = label;

    // Structured payload for generic survey collectors.
    d.responses = JSON.stringify({
      emergency_preference: label,
      emergency_choice_index: d.response
    });

    logTrialRow(d);
  }
};