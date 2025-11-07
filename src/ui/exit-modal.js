/**
 * @file src/ui/exit-modal.js
 * UI helpers for the early-exit flow:
 *  - Show/hide the confirmation modal (pausing/resuming jsPsych safely)
 *  - Swap to the final screens for "keep data" or "discard data"
 */

/**
 * Display the exit confirmation modal and pause the experiment.
 * Safe to call multiple times.
 * @param {any} jsPsych - The active jsPsych instance.
 */
export function showExitModal(jsPsych) {
  try { jsPsych.pauseExperiment?.(); } catch (_) {}
  document.getElementById('exit-modal')?.style.setProperty('display', 'flex');
}

/**
 * Hide the exit confirmation modal and resume the experiment.
 * @param {any} jsPsych - The active jsPsych instance.
 */
export function hideExitModal(jsPsych) {
  document.getElementById('exit-modal')?.style.setProperty('display', 'none');
  try { jsPsych.resumeExperiment?.(); } catch (_) {}
}

/**
 * Show the "ended early — data kept" screen and hide interactive UI elements.
 * Intended to be called after a confirmed early exit where the participant
 * consents to keep collected data.
 */
export function showEndScreenKeep() {
  document.getElementById('final-screen')?.style.setProperty('display', 'none');
  document.getElementById('final-keep-screen')?.style.setProperty('display', 'block');
  document.getElementById('jspsych-target')?.style.setProperty('display', 'none');
  document.getElementById('exit-btn')?.style.setProperty('display', 'none');
}

/**
 * Show the "withdrew — data discarded" screen and hide interactive UI elements.
 * Intended to be called after a confirmed early exit where the participant
 * opts to discard collected data.
 */
export function showEndScreenDiscard() {
  document.getElementById('final-screen')?.style.setProperty('display', 'none');
  document.getElementById('final-discard-screen')?.style.setProperty('display', 'block');
  document.getElementById('jspsych-target')?.style.setProperty('display', 'none');
  document.getElementById('exit-btn')?.style.setProperty('display', 'none');
}
