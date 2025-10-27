/**
 * @file src/utils/misc.js
 * @description
 * Miscellaneous utilities:
 *  - Mobile orientation/size gate for phones/tablets
 *  - Deterministic PRNG (mulberry32)
 *  - Mobile/tablet detection heuristic (IS_MOBILE)
 */

/**
 * Block progress on mobile/tablet until the device is in landscape
 * and meets a minimum width. No-op on desktop.
 * Shows the #rotate-gate fragment and resolves once conditions are met.
 */
export async function waitForMobileGate() {
  if (!IS_MOBILE) return;                // desktop: skip
  if (mobileGateSatisfied()) return;     // already OK

  const gate = document.getElementById('rotate-gate');
  const tip  = document.getElementById('gate-tip');
  const btn  = document.getElementById('gate-check');

  function updateTip() {
    tip.textContent =
      `Current view: ${window.innerWidth}×${window.innerHeight}px. ` +
      `Rotate to landscape and ensure ≥ ${MIN_LANDSCAPE_WIDTH}px width.`;
  }

  gate.style.display = 'flex';
  updateTip();

  return new Promise((resolve) => {
    const check = () => {
      updateTip();
      if (mobileGateSatisfied()) {
        window.removeEventListener('resize', check);
        window.removeEventListener('orientationchange', check);
        gate.style.display = 'none';
        resolve();
      }
    };
    window.addEventListener('resize', check, { passive: true });
    window.addEventListener('orientationchange', check, { passive: true });
    btn.addEventListener('click', check, { once: true });
  });
}

/**
 * Mulberry32 PRNG factory.
 * @param {number} a - 32-bit seed.
 * @returns {() => number} Function returning a float in [0,1).
 */
export function mulberry32(a) {
  a |= 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Conservative phone/tablet detection.
 * - True for phones/tablets (incl. iPadOS w/ desktop UA)
 * - False for desktop/touch laptops unless the screen is small
 */
export const IS_MOBILE = (() => {
  const ua = navigator.userAgent || '';
  const hasTouch = (navigator.maxTouchPoints || 0) > 1;
  const uaPhone  = /Android|iPhone|iPod|Mobile/i.test(ua);
  const uaTablet = /iPad|Tablet/i.test(ua);
  const isIPadOS = /\bMacintosh\b/.test(ua) && hasTouch;  // iPadOS quirk
  const smallScreen = Math.min(screen.width, screen.height) <= 820; // CSS px
  return uaPhone || uaTablet || isIPadOS || (hasTouch && smallScreen);
})();

/** Minimum required width (px) for mobile landscape gate. */
const MIN_LANDSCAPE_WIDTH = 640;

/** Match current orientation heuristically. */
function isLandscape() {
  return (
    (window.matchMedia &&
      window.matchMedia('(orientation: landscape)').matches) ||
    window.innerWidth > window.innerHeight
  );
}

/** True if viewport meets minimum width for the task. */
function hasEnoughWidth() {
  return window.innerWidth >= MIN_LANDSCAPE_WIDTH;
}

/** Gate condition: landscape AND wide enough. */
function mobileGateSatisfied() {
  return isLandscape() && hasEnoughWidth();
}
