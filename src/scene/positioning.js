/**
 * @file src/scene/positioning.js
 * @summary
 *  Layout engine for the door scene:
 *   - Scales the background to the visible viewport (contain).
 *   - Positions/sizes doors, revealed images, smoke/fire layers, and the drone.
 *   - Wires FX (one-shot, trial-synced) without restarting on relayouts.
 *   - Exposes a resize listener helper for responsive updates.
 */

/**
 * Measure the scene and place all visual layers relative to the scaled background.
 * Uses natural image sizes when available for accurate aspect ratios.
 * FX timing is synchronized to the current trial via CONFIG._fx_trial_* fields.
 *
 * @param {HTMLElement} display_element The jsPsych display element holding .scene-frame
 */
export async function positionSceneOverlays(display_element) {
  const frame = display_element.querySelector('.scene-frame');
  if (!frame) return;

  const bg = frame.querySelector('.background');
  await decodeImageAsync(bg);

  // If the background hasn't populated intrinsic dimensions yet, retry on load.
  if (!(bg.naturalWidth > 0 && bg.naturalHeight > 0)) {
    bg.addEventListener('load', () => positionSceneOverlays(display_element), { once: true });
    console.warn('[FX] background not ready; retrying on load');
    return;
  }

  // Source dimensions
  const origBgW = bg.naturalWidth || bg.width;
  const origBgH = bg.naturalHeight || bg.height;

  // Visible container (inside fixed #jspsych-target)
  const viewportW = display_element.clientWidth || window.innerWidth;
  const viewportH = display_element.clientHeight || window.innerHeight;

  // Contain background within viewport (preserve aspect)
  const scale = Math.min(viewportW / origBgW, viewportH / origBgH);
  const dispBgW = Math.round(origBgW * scale);
  const dispBgH = Math.round(origBgH * scale);

  // --- helpers for unit coercion (fraction of basis or px) ---
  const asPxFromFracOrPx = ({ frac = null, px = null, basisPx = 0 }) =>
    (typeof frac === 'number' && isFinite(frac))
      ? Math.round(frac * basisPx)
      : Math.round(px || 0);

  // ---------- Smoke / Fire layers (left & right) ----------
  const smokeL = frame.querySelector('.smoke-left');
  const smokeR = frame.querySelector('.smoke-right');
  const fireL  = frame.querySelector('.fire-left');
  const fireR  = frame.querySelector('.fire-right');

  await Promise.all([smokeL, smokeR, fireL, fireR].map(decodeImageAsync));

  // Scale each FX image to match the background height (preserve aspect)
  const scaleToBgHeight = (imgEl) => {
    if (!imgEl) return { w: 0, h: 0 };
    const natW = imgEl.naturalWidth || 0;
    const natH = imgEl.naturalHeight || 1;
    const s = dispBgH / natH;
    return { w: Math.round(natW * s), h: dispBgH };
  };

  const sL = scaleToBgHeight(smokeL);
  const sR = scaleToBgHeight(smokeR);
  const fL = scaleToBgHeight(fireL);
  const fR = scaleToBgHeight(fireR);

  if (smokeL) { smokeL.style.height = sL.h + 'px'; smokeL.style.width = sL.w + 'px'; }
  if (smokeR) { smokeR.style.height = sR.h + 'px'; smokeR.style.width = sR.w + 'px'; }
  if (fireL)  { fireL.style.height  = fL.h + 'px'; fireL.style.width  = fL.w + 'px'; }
  if (fireR)  { fireR.style.height  = fR.h + 'px'; fireR.style.width  = fR.w + 'px'; }

  // Insets and maximum inward slides (px or fraction of width)
  const smokePad = asPxFromFracOrPx({
    frac: window.CONFIG?.smoke_base_inset_vw,
    px:   window.CONFIG?.smoke_base_inset_px,
    basisPx: dispBgW
  });
  const firePad = asPxFromFracOrPx({
    frac: window.CONFIG?.fire_base_inset_vw,
    px:   window.CONFIG?.fire_base_inset_px,
    basisPx: dispBgW
  });
  const maxSmokeInward = asPxFromFracOrPx({
    frac: window.CONFIG?.smoke_inward_vw,
    px:   window.CONFIG?.smoke_inward_px,
    basisPx: dispBgW
  });
  const maxFireInward = asPxFromFracOrPx({
    frac: window.CONFIG?.fire_inward_vw,
    px:   window.CONFIG?.fire_inward_px,
    basisPx: dispBgW
  });

  const smoke_offset = maxSmokeInward + smokePad;
  const fire_offset  = maxFireInward + firePad;

  // Position from edges (negative offset to start off-screen)
  if (smokeL) { smokeL.style.left  = (-smoke_offset) + 'px'; smokeL.style.right = 'auto'; }
  if (fireL)  { fireL.style.left   = (-fire_offset)  + 'px'; fireL.style.right  = 'auto'; }
  if (smokeR) { smokeR.style.right = (-smoke_offset) + 'px'; smokeR.style.left  = 'auto'; }
  if (fireR)  { fireR.style.right  = (-fire_offset)  + 'px'; fireR.style.left   = 'auto'; }

  // Smoke vector components (rise + inward slide)
  const smokeRise = asPxFromFracOrPx({
    frac: window.CONFIG?.smoke_rise_vh,
    px:   window.CONFIG?.smoke_rise_px,
    basisPx: dispBgH
  });
  const smokeSlide = maxSmokeInward;
  const fireSlide  = maxFireInward;

  const smokeY0 = asPxFromFracOrPx({
    frac: window.CONFIG?.smoke_y_offset_vh,
    px:   window.CONFIG?.smoke_y_offset_px,
    basisPx: dispBgH
  });

  // Parametric vectors for one-shot FX (0→1): base (tx0,ty0) + delta (dtx,dty)
  if (smokeL) {
    smokeL.style.setProperty('--tx0', '0px');
    smokeL.style.setProperty('--ty0', smokeY0 + 'px');
    smokeL.style.setProperty('--dtx',  smokeSlide + 'px');
    smokeL.style.setProperty('--dty', -smokeRise  + 'px');
  }
  if (smokeR) {
    smokeR.style.setProperty('--tx0', '0px');
    smokeR.style.setProperty('--ty0', smokeY0 + 'px');
    smokeR.style.setProperty('--dtx', -smokeSlide + 'px');
    smokeR.style.setProperty('--dty', -smokeRise  + 'px');
  }
  if (fireL) {
    fireL.style.setProperty('--tx0', '0px');
    fireL.style.setProperty('--ty0', '0px');
    fireL.style.setProperty('--dtx',  fireSlide + 'px');
    fireL.style.setProperty('--dty',  '0px');
  }
  if (fireR) {
    fireR.style.setProperty('--tx0', '0px');
    fireR.style.setProperty('--ty0', '0px');
    fireR.style.setProperty('--dtx', -fireSlide + 'px');
    fireR.style.setProperty('--dty',  '0px');
  }

  // ---------- FX timing (one-shot, synced to trial progress) ----------
  const _cfg = window.CONFIG || {};
  const trialPlannedMs = Math.max(500, Number(_cfg._fx_trial_duration_ms) || 1800);
  const startedAt = Number(_cfg._fx_trial_start_ts) || performance.now();
  const elapsed = Math.max(0, performance.now() - startedAt);

  // If relayout happens after the planned period, extend slightly so we never “jump”.
  const trialMs = (elapsed >= trialPlannedMs - 50) ? elapsed + 500 : trialPlannedMs;

  const applySyncedOneShot = (el, ms) => {
    if (!el) return;
    el.style.setProperty('--fx-period', String(ms) + 'ms');
    el.style.setProperty('--fx-iter', '1');
    el.style.setProperty('--fx-fill', 'both');
    // Negative delay = jump animation to the elapsed position immediately.
    el.style.animationDelay = (-elapsed) + 'ms';
    el.style.animationName = 'fxProgress';
  };

  applySyncedOneShot(fireL,  trialMs);
  applySyncedOneShot(fireR,  trialMs);
  applySyncedOneShot(smokeL, trialMs);
  applySyncedOneShot(smokeR, trialMs);

  // Opacity configuration for smoke
  const sOpacity = (window.CONFIG?.smoke_opacity ?? 0.32);
  [smokeL, smokeR].forEach(el => { if (el) el.style.setProperty('--smoke-opacity', String(sOpacity)); });

  // ---------- Frame & background pixel size (match the scaled background) ----------
  frame.style.width  = dispBgW + 'px';
  frame.style.height = dispBgH + 'px';
  bg.style.width     = dispBgW + 'px';
  bg.style.height    = dispBgH + 'px';

  // ---------- Door overlays & revealed images ----------
  const overlays = frame.querySelectorAll('.overlay');
  overlays.forEach((el) => {
    const origX   = parseFloat(el.getAttribute('data-orig-x')) || 0;
    const origY   = parseFloat(el.getAttribute('data-orig-y')) || 0;
    const doorImg = el.querySelector('.door-image');

    const doorW = doorImg.naturalWidth  || doorImg.width  || 360;
    const doorH = doorImg.naturalHeight || doorImg.height || Math.round(doorW * 1.3);

    const dispW = Math.round(doorW * scale);
    const dispH = Math.round(doorH * scale);
    const dispLeft = Math.round(origX * scale);
    const dispTop  = Math.round(origY * scale);

    el.style.left   = dispLeft + 'px';
    el.style.top    = dispTop  + 'px';
    el.style.width  = dispW    + 'px';
    el.style.height = dispH    + 'px';

    const revealed = el.classList.contains('left-door')
      ? frame.querySelector('.left-revealed')
      : frame.querySelector('.right-revealed');

    if (revealed) {
      const naturalW = revealed.naturalWidth  || 0;
      const naturalH = revealed.naturalHeight || 0;

      let revW = naturalW ? Math.round(naturalW * scale) : Math.round(dispW * 0.9);
      let revH = naturalH ? Math.round(naturalH * scale) : Math.round(dispH * 0.9);

      const fitFactor = 1;
      revW = Math.round(revW * fitFactor);
      revH = Math.round(revH * fitFactor);

      const revLeftInside = Math.round((dispW - revW) / 2);
      const fractionUpFromBottom = 0.45;
      const targetY_fromTop = dispH - (dispH * fractionUpFromBottom);
      const revTopInside = Math.round(targetY_fromTop - (revH / 2));

      revealed.style.width  = revW + 'px';
      revealed.style.height = revH + 'px';
      revealed.style.left   = (dispLeft + revLeftInside) + 'px';
      revealed.style.top    = (dispTop  + revTopInside)  + 'px';
    }
  });

  // ---------- Drone centered between doors (horizontally) and vertically centered ----------
  const leftEl  = frame.querySelector('.left-door');
  const rightEl = frame.querySelector('.right-door');
  const drone   = frame.querySelector('.overlay-drone');

  if (drone && leftEl && rightEl) {
    const leftW = parseFloat(leftEl.style.width)  || 0;
    const leftL = parseFloat(leftEl.style.left)   || 0;
    const rightW= parseFloat(rightEl.style.width) || 0;
    const rightL= parseFloat(rightEl.style.left)  || 0;

    const leftCenter  = leftL  + leftW  / 2;
    const rightCenter = rightL + rightW / 2;

    const bodyImg = drone.querySelector('.drone-body');
    await decodeImageAsync(bodyImg);

    const natW = bodyImg?.naturalWidth  || 160;
    const natH = bodyImg?.naturalHeight || 100;

    const droneDispW = Math.round(natW * scale);
    const droneDispH = Math.round(natH * scale);

    drone.style.width  = droneDispW + 'px';
    drone.style.height = droneDispH + 'px';

    const midX = (leftCenter + rightCenter) / 2;
    drone.style.left = Math.round(midX - droneDispW / 2) + 'px';
    drone.style.top  = Math.round((dispBgH - droneDispH) / 2) + 'px';
  }
}

/**
 * Attach a debounced resize listener that re-positions the scene.
 * Returns a disposer to remove the listener.
 *
 * @param {HTMLElement} display_element
 * @returns {() => void} disposer
 */
export function attachScenePositioning(display_element) {
  positionSceneOverlays(display_element);
  let to = null;
  const handler = () => {
    if (to) clearTimeout(to);
    to = setTimeout(() => positionSceneOverlays(display_element), 80);
  };
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}

/**
 * Resolve when an <img> has dimensions available.
 * Uses HTMLImageElement.decode() when available, otherwise onload/onerror.
 * @param {HTMLImageElement|null} img
 * @returns {Promise<void>}
 */
function decodeImageAsync(img) {
  if (!img) return Promise.resolve();
  if ('decode' in img) return img.decode().catch(() => Promise.resolve());
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth) return resolve();
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}
