/**
 * @file src/ui/overlays.js
 * @description
 * Controls full-screen overlays used across the experiment:
 *  - Blackout layer shown between trials (optional text reveal after fade)
 *  - Loading overlay for initial boot and long operations
 *
 * Notes
 *  - Blackout respects the exit modal: when the modal is open the blackout
 *    passes pointer events through so the modal stays interactive.
 *  - Text on the blackout layer fades in only after the screen is fully black.
 *  - All timing values are configurable through `window.CONFIG`.
 */

/**
 * Show the full-screen blackout layer.
 * The screen fades to black; optional text appears after the fade completes.
 *
 * @param {string} [text] - Optional copy to show centered on the blackout.
 */
export function blackoutShow(text) {
  if (hasExperimentEnded()) return;

  const el = getOrCreateBlackoutLayer();
  const t = el.querySelector('.blackout-text');
  if (t) {
    t.textContent = '';
    t.style.opacity = ''; // reset any prior fade-in
  }
  if (!el || !t) return;

  // Cancel any pending text reveal from a previous call.
  if (el._TimeoutId) {
    clearTimeout(el._TimeoutId);
    el._TimeoutId = null;
  }

  // Prepare: hide the text during the fade-to-black.
  t.textContent = '';
  t.style.opacity = '0';

  el.style.display = 'block';

  // Allow exit modal interaction to pass through when it is open.
  el.style.pointerEvents = isExitModalOpen() ? 'none' : 'auto';

  // Start the blackout fade.
  requestAnimationFrame(() => el.classList.add('show'));

  // After the blackout fade finishes, reveal the text (if provided).
  const fadeMs = window.CONFIG?.blackout_fade_ms ?? 450;
  el._TimeoutId = setTimeout(() => {
    el._TimeoutId = null;
    if (!text) return; // pure black, no caption
    t.textContent = text;
    t.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 300,
      easing: 'ease-out',
      fill: 'forwards'
    });
  }, fadeMs);
}

/**
 * Hide the blackout layer with a fade-out, then remove from flow.
 */
export function blackoutHide() {
  const el = getOrCreateBlackoutLayer();
  if (!el.classList.contains('show')) return; // already hidden
  el.classList.remove('show');

  const fade = window.CONFIG?.blackout_fade_ms ?? 260;
  setTimeout(() => {
    el.style.display = 'none';
    const t = el.querySelector('.blackout-text');
    if (t) t.textContent = '';
  }, fade);
}

/**
 * Display the loading overlay with optional message.
 * If loading is slow, the message is updated after a delay.
 *
 * @param {string} [text="Loading experiment…"] - Optional status text.
 */
export function showLoadingOverlay(text) {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;

  const t = el.querySelector('.loading-text');
  if (t && text) t.textContent = text;

  el.style.display = 'flex';
  // Defer adding the visibility class to allow the CSS transition to run.
  requestAnimationFrame(() => el.classList.add('visible'));

  // Slow-start hint for cold loads.
  clearTimeout(showLoadingOverlay._slowTimer);
  showLoadingOverlay._slowTimer = setTimeout(() => {
    if (el.classList.contains('visible')) {
      if (t && (!text || text === 'Loading experiment…')) {
        t.textContent = 'Setting things up… almost there';
      }
    }
  }, 8000);
}

/**
 * Hide the loading overlay and clear any slow-load timer.
 */
export function hideLoadingOverlay() {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;

  el.classList.remove('visible');
  clearTimeout(showLoadingOverlay._slowTimer);

  // Allow the fade-out to complete before removing from flow.
  setTimeout(() => {
    el.style.display = 'none';
  }, 220);
}

/**
 * Ensure the blackout layer exists and return it.
 * @returns {HTMLDivElement}
 */
function getOrCreateBlackoutLayer() {
  let el = document.getElementById('blackout');
  if (!el) {
    el = document.createElement('div');
    el.id = 'blackout';
    el.innerHTML = '<div class="blackout-text"></div>';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Whether the exit modal is currently visible.
 * @returns {boolean}
 */
function isExitModalOpen() {
  const m = document.getElementById('exit-modal');
  return !!m && getComputedStyle(m).display === 'flex';
}

/**
 * Guard: prevent blackout actions after the experiment has ended.
 * @returns {boolean}
 */
function hasExperimentEnded() {
  return (
    !!window.__MANUAL_END__ ||
    !!window.__END_REASON__ ||
    document.getElementById('final-screen')?.style.display === 'block' ||
    document.getElementById('final-keep-screen')?.style.display === 'block' ||
    document.getElementById('final-discard-screen')?.style.display === 'block'
  );
}
