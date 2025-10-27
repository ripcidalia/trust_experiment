/**
 * @file src/ui/theme.js
 * @description
 * Theme utilities and inter-trial fade transitions. Provides helpers to:
 *  - Set jsPsych display background
 *  - Lock/unlock page scroll
 *  - Apply light/dark themes
 *  - Run a blackout transition between screens with optional hold
 */

import { blackoutShow, blackoutHide } from './overlays.js';

/**
 * Set the background color of the jsPsych display container.
 * @param {string} color - Any valid CSS color.
 */
export function setJsPsychDisplayBackground(color) {
  const el =
    typeof jsPsych !== 'undefined' && jsPsych.getDisplayElement
      ? jsPsych.getDisplayElement()
      : null;
  if (el) {
    el.style.background = color;
    el.style.backgroundColor = color;
  }
}

/**
 * Prevent page scrolling (use when showing fixed, full-viewport UIs).
 */
export function lockPageScroll() {
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

/**
 * Restore default page scrolling.
 */
export function unlockPageScroll() {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

/**
 * Apply the light UI theme and ensure the display background matches it.
 * Also hides any active blackout layer.
 */
export function applyLightUiTheme() {
  document.body.classList.remove('task-dark');
  try { blackoutHide(); } catch (_) {}
  setJsPsychDisplayBackground('var(--bg)');
}

/**
 * Apply the dark UI theme and set the display background to black.
 */
export function applyDarkUiTheme() {
  document.body.classList.add('task-dark');
  setJsPsychDisplayBackground('#000');
}

/**
 * Apply a theme and background based on a target value.
 * - 'dark'  → dark theme + black background
 * - 'light' → light theme + CSS var background
 * - Any CSS color → set that color and toggle .task-dark by a simple darkness heuristic
 *
 * @param {'dark'|'light'|string} target
 */
export function applyThemeAndBg(target) {
  if (target === 'dark') {
    document.body.classList.add('task-dark');
    setJsPsychDisplayBackground('#000');
    return;
  }
  if (target === 'light') {
    document.body.classList.remove('task-dark');
    setJsPsychDisplayBackground('var(--bg)');
    return;
  }

  // Custom color
  const color = String(target || '').trim();

  // Simple darkness check for black
  const looksBlack =
    /^#000(?:000)?$/i.test(color) ||
    /^black$/i.test(color) ||
    /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(color);

  if (looksBlack) document.body.classList.add('task-dark');
  else document.body.classList.remove('task-dark');

  setJsPsychDisplayBackground(color);
}

/**
 * Create a jsPsych transition trial that fades to black, optionally waits,
 * applies a theme/background, and then fades back in (unless fadeIn is false).
 *
 * @param {('dark'|'light'|string|object)} toOrOpts - Theme target or options object.
 * @param {number} [holdMaybe=0] - Hold time (ms) fully black when using shorthand.
 * @returns {object} jsPsych trial definition
 *
 * Options object:
 *   {
 *     to: 'dark' | 'light' | <css color>,
 *     holdMs: number,        // time to remain black between fades
 *     fadeIn: boolean        // false = stay black; true = fade back in
 *   }
 */
export function makeFadeTransition(toOrOpts, holdMaybe) {
  // Normalize args: allow (string, number) or ({ to, holdMs, fadeIn })
  const opts =
    typeof toOrOpts === 'object' && toOrOpts !== null
      ? toOrOpts
      : { to: toOrOpts, holdMs: holdMaybe };

  const {
    to = 'light',   // 'dark' | 'light' | CSS color
    holdMs = 0,     // additional time kept fully black
    fadeIn = true   // false: fade-out only and remain black
  } = opts;

  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: 'NO_KEYS',
    stimulus: '',
    on_load: () => {
      // 1) Fade to black (no text).
      blackoutShow('');

      const fade = window.CONFIG?.blackout_fade_ms ?? 450;

      // 2) Once fully black, set theme/bg while hidden.
      setTimeout(() => {
        applyThemeAndBg(to);

        // 3) Fade back in unless instructed to remain black.
        if (fadeIn) {
          setTimeout(() => {
            blackoutHide();
          }, Math.max(0, Number(holdMs) || 0));
        }
      }, fade + 40);
    },
    trial_duration: () => {
      const fade = window.CONFIG?.blackout_fade_ms ?? 450;
      const outDur = fade + 40;                          // fade to black
      const holdDur = Math.max(0, Number(holdMs) || 0);  // fully black hold
      const inDur = fadeIn ? fade + 60 : 0;              // fade back in (or skip)
      return outDur + holdDur + inDur;
    }
  };
}