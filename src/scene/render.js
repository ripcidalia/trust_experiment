/**
 * @file src/scene/render.js
 * @summary
 *  Generates the scene HTML for a single door-trial instance:
 *   - Background image
 *   - Left/right doors (positioned later by positioning.js)
 *   - Foreground FX layers (smoke/fire)
 *   - Drone overlay with animated rotors
 *   - HUD widgets: trial counter, decision box, mission panel
 *
 * The container returned by `renderSceneHtml` is consumed by jsPsych and then
 * measured/positioned by `positionSceneOverlays()`.
 */

/**
 * Static source-space coordinates for the doors, in pixels, relative to the
 * original background asset (before scaling). These are written to data
 * attributes and converted to screen-space by positioning.js.
 */
export const SCENE_LAYOUT = {
  leftDoorX:  479,
  leftDoorY:  248,
  rightDoorX: 1132,
  rightDoorY: 248
};

/**
 * Build the HTML markup for the scene.
 *
 * @param {Object} params
 * @param {'left'|'right'|'none'} [params.suggestion='none']  — Drone’s recommended door (for copy only).
 * @param {'left'|'right'|null} [params.true_location=null]   — Ground truth for this trial.
 * @param {number} [params.trial_num=1]                       — 1-based index of current trial.
 * @param {number} [params.trial_total=1]                     — Total number of trials.
 * @param {string} params.background_src                      — Background image URL.
 * @param {string} params.door_src                            — Door image URL (reused left/right).
 * @param {string} params.smoke_left_src                      — Left smoke image URL.
 * @param {string} params.smoke_right_src                     — Right smoke image URL.
 * @param {string} params.fire_left_src                       — Left fire image URL.
 * @param {string} params.fire_right_src                      — Right fire image URL.
 * @returns {string} HTML string for injection into the jsPsych display element.
 *
 * Notes:
 *  - `.scene-root` carries `data-true` for downstream logic.
 *  - `.overlay` elements (doors) include `data-orig-x`/`data-orig-y` with
 *    source-space positions used by positioning.js to compute screen placement.
 *  - Foreground FX elements have classes consumed by CSS and positioning.js.
 *  - The decision box and mission panel are hidden by default; they are driven
 *    by doorTrial.js during the interaction.
 */
export function renderSceneHtml({
  suggestion = 'none',
  true_location = null,
  trial_num = 1,
  trial_total = 1,
  background_src,
  door_src,
  smoke_left_src,
  smoke_right_src,
  fire_left_src,
  fire_right_src
}) {
  const droneHtml = `
    <div class="overlay-drone">
      <img src="assets/drone.png" class="drone-body" alt="Drone">
      <div class="rotor rotor-left"><div class="disc"></div></div>
      <div class="rotor rotor-right"><div class="disc"></div></div>
    </div>`;

  return `
    <div class="scene-root" style="opacity:0" data-true="${true_location}">
      <div class="scene-frame">
        <!-- Trial counter (fixed position via CSS) -->
        <div class="trial-counter" aria-hidden="true">
          <span class="tc-label">Search Area</span>
          <span class="tc-index">${trial_num}</span>
          <span class="tc-of">of</span>
          <span class="tc-total">${trial_total}</span>
        </div>

        <!-- Background -->
        <img src="${background_src}" class="background" alt="">

        <!-- Foreground FX (z: above background, below HUD) -->
        <img src="${smoke_left_src}"  class="fx-layer smoke-left"  alt="" aria-hidden="true">
        <img src="${smoke_right_src}" class="fx-layer smoke-right" alt="" aria-hidden="true">
        <img src="${fire_left_src}"   class="fx-layer fire-left"   alt="" aria-hidden="true">
        <img src="${fire_right_src}"  class="fx-layer fire-right"  alt="" aria-hidden="true">

        <!-- Door reveals (initially hidden; controlled by doorTrial.js) -->
        <img src="assets/empty.png" class="revealed-image left-revealed"  data-side="left"  alt="">
        <img src="assets/empty.png" class="revealed-image right-revealed" data-side="right" alt="">

        <!-- Door overlays; positioned by positioning.js using data-orig-* -->
        <div class="overlay left-door"
             data-orig-x="${SCENE_LAYOUT.leftDoorX}"
             data-orig-y="${SCENE_LAYOUT.leftDoorY}">
          <img src="${door_src}" class="door-image" alt="">
        </div>

        <div class="overlay right-door"
             data-orig-x="${SCENE_LAYOUT.rightDoorX}"
             data-orig-y="${SCENE_LAYOUT.rightDoorY}">
          <img src="${door_src}" class="door-image" alt="">
        </div>

        ${droneHtml}

        <!-- Decision box (shown/hidden and animated by doorTrial.js) -->
        <div id="decision-box" role="group" aria-label="Decision panel">
          <div class="decision-controls">
            <button id="btn-follow" class="primaryBtn">Follow drone (F)</button>
            <button id="btn-ignore" class="secondaryBtn">Choose other door (N)</button>
          </div>

          <p id="decision-text" style="margin-top:2px;">The drone recommends …</p>

          <div class="env-row" style="margin-bottom:6px;">
            <div class="env-label">Environmental Integrity</div>
            <div class="env-wrap"><div class="env-fill" id="env-fill"></div></div>
            <div class="env-pct" id="env-pct">100%</div>
          </div>
        </div>

        <!-- Mission outcome panel (success/failure) -->
        <div id="mission-panel" class="mission-panel" aria-live="polite" aria-atomic="true">
          <div class="mp-badge" id="mp-badge">SUCCESS</div>
          <div class="mp-title" id="mp-title">Victim Found</div>
        </div>
      </div>
    </div>`;
}
