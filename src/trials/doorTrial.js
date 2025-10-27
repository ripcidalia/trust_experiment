/**
 * @file src/trials/doorTrial.js
 * @description
 *  Builds a jsPsych HTML-keyboard trial for the "two doors + drone" scene.
 *  - Renders the scene (background, doors, fire/smoke, drone, HUD).
 *  - Drives drone entry → scan sweep → hop to suggested door.
 *  - Shows a compact→expanded decision HUD (follow vs ignore).
 *  - Maintains an “Environmental Integrity” countdown (visual + rhythm).
 *  - Opens the chosen door, shows success/failure panel, blackout, then ends.
 *
 * Export
 *  - createDoorTrial(t, idx, total, opts): jsPsych-compatible trial factory.
 *
 * Data written on finish (subset):
 *  {
 *    choice: 'left'|'right',
 *    reaction_time_s: number,
 *    correct: boolean,
 *    suggestion: 'left'|'right',
 *    timed_out: boolean,
 *    risk_*: …,
 *    decision_timeout_ms_used: number
 *  }
 */

import { CONFIG } from '../config.js';
import { renderSceneHtml } from '../scene/render.js';
import { positionSceneOverlays, attachScenePositioning } from '../scene/positioning.js';
import { blackoutShow, blackoutHide } from '../ui/overlays.js';
import { lockPageScroll, setJsPsychDisplayBackground, applyDarkUiTheme } from '../ui/theme.js';
import { pickVictimSkin, pickEmptySkin } from '../data/assets.js';
import { logTrialRow } from '../logging/build.js';
import { IS_MOBILE } from '../utils/misc.js';

/**
 * Create a door task trial.
 * @param {object} t            Trial payload (true_location, suggestion, victim/empty/background/FX src, risk_overrides, etc.)
 * @param {number} idx          Zero-based trial index within block.
 * @param {number} total        Total trials in block.
 * @param {object} [opts]       { training?: boolean, demo?: boolean }
 * @returns {object}            jsPsych trial config.
 */
export function createDoorTrial(t, idx, total, opts = {}) {
  const trial = {
    type: jsPsychHtmlKeyboardResponse,

    on_start: () => {
      applyDarkUiTheme();
    },

    stimulus: () => {
      const html = renderSceneHtml({
        suggestion: t.suggestion,
        true_location: t.true_location,
        trial_num: idx + 1,
        trial_total: total,
        background_src: t.background_src,
        door_src: t.door_src,
        smoke_left_src: t.smoke_left_src,
        smoke_right_src: t.smoke_right_src,
        fire_left_src: t.fire_left_src,
        fire_right_src: t.fire_right_src
      });
      // Start transparent; fade in on load.
      return html.replace('<div class="scene-root"', '<div class="scene-root" style="opacity:0"');
    },

    choices: 'NO_KEYS',
    response_ends_trial: false,
    trial_duration: null,

    data: {
      ...t,
      trial_index: idx,
      trial_total: total,
      is_training: !!opts.training,
      is_demo: !!opts.demo,
      event_type: opts.demo ? 'training_demo' : 'door_trial'
    },

    on_finish: d => {
      try { logTrialRow(d); } catch (_) {}
    },

    on_load: function () {
      lockPageScroll();
      setJsPsychDisplayBackground('#000');

      const frame  = jsPsych.getDisplayElement();
      const rootEl = frame.querySelector('.scene-root');
      const isLast = (idx === total - 1);
      const isDemo = !!opts.demo;

      // Apply scene warmth (risk-color overlay)
      const warmth = t.envWarmth || CONFIG.env_warmth || 'warm';
      if (rootEl) {
        rootEl.classList.remove('warmth-cool', 'warmth-warm', 'warmth-hot');
        rootEl.classList.add(`warmth-${warmth}`);
      }

      // Refresh FX sources (if randomized upstream)
      try {
        const smL = frame.querySelector('.smoke-left');
        const smR = frame.querySelector('.smoke-right');
        const fiL = frame.querySelector('.fire-left');
        const fiR = frame.querySelector('.fire-right');
        if (smL && t.smoke_left_src)  smL.src = t.smoke_left_src;
        if (smR && t.smoke_right_src) smR.src = t.smoke_right_src;
        if (fiL && t.fire_left_src)   fiL.src = t.fire_left_src;
        if (fiR && t.fire_right_src)  fiR.src = t.fire_right_src;
      } catch (_) {}

      // Per-trial risk overrides applied to CONFIG (restored on finish)
      const _cfg = window.CONFIG;
      const _savedFx = {
        fire_inward_px: _cfg.fire_inward_px,
        smoke_inward_px: _cfg.smoke_inward_px,
        smoke_rise_px: _cfg.smoke_rise_px,
        fire_inward_vw: _cfg.fire_inward_vw,
        smoke_inward_vw: _cfg.smoke_inward_vw,
        smoke_rise_vh: _cfg.smoke_rise_vh,
        _active_risk_key: _cfg._active_risk_key
      };
      if (t.risk_overrides) {
        _cfg.fire_inward_px  = t.risk_overrides.fire_inward_px;
        _cfg.smoke_inward_px = t.risk_overrides.smoke_inward_px;
        _cfg.smoke_rise_px   = t.risk_overrides.smoke_rise_px;
        _cfg._active_risk_key = t.risk_overrides.risk_key;

        // Expose fractional geometry for the scene renderer.
        const R = _cfg.risk_levels[_cfg._active_risk_key] || {};
        _cfg.fire_inward_vw  = R.fire_inward_vw;
        _cfg.smoke_inward_vw = R.smoke_inward_vw;
        _cfg.smoke_rise_vh   = R.smoke_rise_vh;
      }

      positionSceneOverlays(frame).then(() => {
        // Cache door/frame metrics for fast access during FX phase.
        function cacheFxMetrics(frameEl) {
          const scene = frameEl.querySelector('.scene-frame');
          const left  = frameEl.querySelector('.left-door');
          const right = frameEl.querySelector('.right-door');

          const rect = scene.getBoundingClientRect();
          const toBox = (ov) => ({
            left:   parseFloat(ov.style.left)   || 0,
            top:    parseFloat(ov.style.top)    || 0,
            width:  parseFloat(ov.style.width)  || 0,
            height: parseFloat(ov.style.height) || 0
          });

          window.__FX_METRICS__ = {
            frameW: rect.width,
            frameH: rect.height,
            leftDoor:  toBox(left),
            rightDoor: toBox(right)
          };
        }
        cacheFxMetrics(frame);

        // Demo overlay (visual-only, no interaction)
        if (isDemo) {
          const overlay = document.createElement('div');
          overlay.textContent = 'Demonstration – no interaction required';
          Object.assign(overlay.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontSize: '32px',
            fontWeight: '700',
            textShadow: '0 0 10px rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.35)',
            padding: '12px 24px',
            borderRadius: '12px',
            pointerEvents: 'none',
            zIndex: '9999',
            textAlign: 'center'
          });
          frame.appendChild(overlay);
          setTimeout(() => {
            overlay.style.transition = 'opacity 800ms ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 900);
          }, 2500);
        }

        /** Utility: accumulate timeouts for cleanup. */
        const pendingTO = [];
        const setTO = (fn, ms) => {
          const id = setTimeout(fn, ms);
          pendingTO.push(id);
          return id;
        };

        const cleanupResize = attachScenePositioning(frame);

        const true_location = rootEl ? rootEl.getAttribute('data-true') : null;
        const leftRevealed  = frame.querySelector('.left-revealed');
        const rightRevealed = frame.querySelector('.right-revealed');
        const skin = t.victim_src || pickVictimSkin();
        const empty = pickEmptySkin();


        cacheFxMetrics(frame);

        // Victim visibility is decided at reveal; keep hidden initially.
        if (isDemo) {
          if (leftRevealed)  leftRevealed.src  = empty;
          if (rightRevealed) rightRevealed.src = empty;
        } else {
          if (leftRevealed)  leftRevealed.src  = (true_location === 'left')  ? skin : empty;
          if (rightRevealed) rightRevealed.src = (true_location === 'right') ? skin : empty;
        }
        if (leftRevealed)  leftRevealed.style.visibility  = 'hidden';
        if (rightRevealed) rightRevealed.style.visibility = 'hidden';

        // Fade scene in.
        requestAnimationFrame(() => { rootEl.style.opacity = '1'; });

        // ---------- FX duration anchoring ----------
        // Choose a duration that safely spans entry, scan, hop, decision, and reveal.
        const approxVisibleMs =
          (CONFIG.drone_entry_ms       ?? 2500) +
          (CONFIG.drone_prebuffer_ms   ?? 1000) +
          (CONFIG.drone_buffer_ms      ?? 1200) +
          (CONFIG.drone_anim_ms        ?? 1200) +
          (CONFIG.decision_timeout_ms  ?? 5000) +
          2000 + // door open + panel hold
          2500;  // buffer to survive blackout transitions

        // DOM refs commonly used
        const leftDoorOverlay  = frame.querySelector('.left-door');
        const rightDoorOverlay = frame.querySelector('.right-door');
        const droneEl          = frame.querySelector('.overlay-drone');
        const decisionBox      = frame.querySelector('#decision-box');
        const decisionText     = frame.querySelector('#decision-text');
        const btnFollow        = frame.querySelector('#btn-follow');
        const btnIgnore        = frame.querySelector('#btn-ignore');
        const suggestion       = t.suggestion;
        const trialStart       = performance.now();

        let responded = false;
        let timerId = null;
        let timedOut = false;

        // Geometry helpers
        const getLT = (el) => {
          const cs = getComputedStyle(el);
          return { left: parseFloat(cs.left) || 0, top: parseFloat(cs.top) || 0 };
        };

        const moveTo = (el, toLeft, toTop, durationMs, easing = 'linear') =>
          new Promise((resolve) => {
            const from = getLT(el);
            const keyframes = (typeof toTop === 'number')
              ? [{ left: from.left + 'px', top: from.top + 'px' },
                 { left: toLeft + 'px',    top: toTop  + 'px' }]
              : [{ left: from.left + 'px' }, { left: toLeft + 'px' }];

            const anim = el.animate(keyframes, {
              duration: Math.max(0, durationMs),
              easing,
              fill: 'forwards',
              composite: 'replace'
            });

            const finish = () => {
              if (typeof toLeft === 'number') el.style.left = toLeft + 'px';
              if (typeof toTop  === 'number') el.style.top  = toTop  + 'px';
              resolve();
            };
            anim.addEventListener?.('finish', finish, { once: true });
            anim.finished?.then(finish).catch(finish);
          });

        const moveTransformTo = (el, toX, toY, durationMs, easing = 'cubic-bezier(.3,.3,.9,1)') => {
          const fromX = parseFloat(el.style.getPropertyValue('--tx')) || 0;
          const fromY = parseFloat(el.style.getPropertyValue('--ty')) || 0;
          const wasPaused = el.classList.contains('paused');
          el.classList.add('paused');
          const anim = el.animate(
            [
              { transform: `translate(${fromX}px, ${fromY}px) translateY(0px)` },
              { transform: `translate(${toX}px, ${toY}px) translateY(0px)` }
            ],
            { duration: Math.max(0, durationMs), easing, fill: 'forwards' }
          );
          return anim.finished.catch(() => {}).then(() => {
            el.style.setProperty('--tx', `${toX}px`);
            el.style.setProperty('--ty', `${toY}px`);
            anim.cancel();
            if (!wasPaused) el.classList.remove('paused');
          });
        };

        const wait = (ms) => new Promise(r => setTimeout(r, ms));

        // Door baseline + mid helpers
        const doorBottom = (ov) => {
          const t = parseFloat(ov.style.top)   || 0;
          const h = parseFloat(ov.style.height)|| 0;
          return t + h;
        };
        const doorMidX = (leftOv, rightOv) => {
          const l  = parseFloat(leftOv.style.left)  || 0;
          const lw = parseFloat(leftOv.style.width) || 0;
          const r  = parseFloat(rightOv.style.left) || 0;
          const rw = parseFloat(rightOv.style.width)|| 0;
          return (l + lw / 2 + r + rw / 2) / 2;
        };

        // Integrity countdown wiring
        let rafId = null;
        let t0 = null;
        let totalMs = null;
        let shouldAutoFollow = false;
        const envFill = frame.querySelector('#env-fill');
        const envPct  = frame.querySelector('#env-pct');

        const BAR_BLUE  = '#103a75';
        const BAR_RED   = '#d30000';
        const BAR_WHITE = '#ffffff';

        const hexToRgb = (hex) => {
          const h = hex.replace('#', '');
          const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
          return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
        };
        const mixRgb = (a, b, t) => ({
          r: Math.round(a.r + (b.r - a.r) * t),
          g: Math.round(a.g + (b.g - a.g) * t),
          b: Math.round(a.b + (b.b - a.b) * t)
        });
        const rgbToCss  = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
        const withAlpha = (rgbCss, alpha) => {
          const m = rgbCss.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (!m) return rgbCss;
          const [, r, g, b] = m;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        const speedUpAroundMid = (f, s = 4.0) => {
          const x = 2 * f - 1;
          const y = Math.tanh(s * x) / Math.tanh(s);
          return 0.5 * (y + 1);
        };
        const colorFor = (frac) => {
          const f = 1 - frac;
          const u = speedUpAroundMid(f, 2.0);
          if (u <= 0.5) {
            const t = u / 0.5;
            return rgbToCss(mixRgb(hexToRgb(BAR_BLUE), hexToRgb(BAR_WHITE), t));
          }
          const t = (u - 0.5) / 0.5;
          return rgbToCss(mixRgb(hexToRgb(BAR_WHITE), hexToRgb(BAR_RED), t));
        };

        const updatePct = (frac) => {
          if (!CONFIG.env_show_pct || !envPct) return;
          envPct.textContent = Math.round(frac * 100) + '%';
        };

        function renderIntegrity(msLeft) {
          const frac = Math.max(0, Math.min(1, msLeft / totalMs));
          const barColor = colorFor(frac);

          if (decisionBox) {
            decisionBox.style.setProperty('--glow-color',        withAlpha(barColor, 0.25));
            decisionBox.style.setProperty('--glow-strong-color', withAlpha(barColor, 0.45));
          }
          if (envFill) {
            envFill.style.transform = `scaleX(${frac})`;
            envFill.style.background = barColor;
          }
          updatePct(frac);

          const TH = (CONFIG.env_pulse_threshold ?? 0.30);
          const inRed = frac <= TH;

          const periodMs = Math.round(1100 - 400 * (1 - frac));
          if (decisionBox) decisionBox.style.setProperty('--hb-period', periodMs + 'ms');
          if (rootEl)      rootEl.style.setProperty('--hb-period', periodMs + 'ms');

          if (envFill) {
            envFill.classList.toggle('pulse', inRed);
          }
          if (decisionBox) {
            decisionBox.classList.toggle('heartbeat', inRed);
          }
          if (rootEl) {
            rootEl.classList.toggle('warmth-flicker', inRed);
          }
        }

        function stopIntegrity() {
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          if (envFill) envFill.classList.remove('pulse');
          if (decisionBox) {
            decisionBox.classList.remove('heartbeat');
            decisionBox.style.removeProperty('--hb-period');
          }
          if (rootEl) {
            rootEl.classList.remove('warmth-flicker');
            rootEl.style.removeProperty('--hb-period');
          }
        }

        // Phase durations
        const preMs  = (CONFIG.drone_prebuffer_ms ?? 1000);
        const scanMs = (typeof t.buffer_ms === 'number') ? t.buffer_ms : CONFIG.drone_buffer_ms;
        const hopMs  = (typeof CONFIG.drone_anim_ms === 'number') ? CONFIG.drone_anim_ms : 1100;
        const decide = isDemo ? 0 : (t.risk_overrides?.decision_timeout_ms ?? CONFIG.decision_timeout_ms ?? 0);

        // HUD placement on door baseline + risk-driven shake
        if (!isDemo && decisionBox && leftDoorOverlay && rightDoorOverlay) {
          decisionBox.classList.add('compact');
          decisionBox.classList.add('hud-show');
          decisionBox.style.opacity = '0';

          try {
            const sf = frame.querySelector('.scene-frame');
            if (sf && t.risk_overrides) {
              const amp = t.risk_overrides.shake_amp_px ?? 0;
              const period = t.risk_overrides.shake_period_ms ?? 900;
              if (amp > 0) {
                sf.classList.add('risk-shake');
                sf.style.setProperty('--shake-amp', amp + 'px');
                sf.style.setProperty('--shake-period', period + 'ms');
              } else {
                sf.classList.remove('risk-shake');
                sf.style.removeProperty('--shake-amp');
                sf.style.removeProperty('--shake-period');
              }
            }
          } catch (_) {}

          const frameRect = frame.querySelector('.scene-frame').getBoundingClientRect();
          const baseY = Math.round(Math.max(doorBottom(leftDoorOverlay), doorBottom(rightDoorOverlay)));
          requestAnimationFrame(() => {
            const bottomOffset = Math.max(0, frameRect.height - baseY);
            decisionBox.style.left = '50%';
            decisionBox.style.bottom = bottomOffset + 'px';
            decisionBox.style.top = '';
            requestAnimationFrame(() => { decisionBox.style.opacity = '1'; });
          });
        }

        function startIntegrityCountdown() {
          t0 = performance.now();
          const loop = (now) => {
            const elapsed = now - t0;
            const left = Math.max(0, totalMs - elapsed);
            renderIntegrity(left);
            if (left <= 0) {
              timedOut = true;
              if (decisionBox && decisionBox.classList.contains('expanded')) {
                btnFollow?.click();
              } else {
                shouldAutoFollow = true;
              }
              return;
            }
            rafId = requestAnimationFrame(loop);
          };
          rafId = requestAnimationFrame(loop);
        }

        // Door center helpers for scan/hop phases
        const doorCenterX = (ov) => {
          const L = parseFloat(ov.style.left)  || 0;
          const W = parseFloat(ov.style.width) || 0;
          return L + W / 2;
        };
        const doorTop = (ov) => parseFloat(ov.style.top) || 0;

        /**
         * Cone sweep: appear → left dwell → right dwell → down → fade.
         * Apex continuously follows the drone during the sweep.
         */
        function runConeScan({ frame, droneEl, leftDoorOverlay, rightDoorOverlay, bufferMs, preMs = CONFIG.drone_prebuffer_ms }) {
          return new Promise((resolve) => {
            if (!frame || !droneEl || !leftDoorOverlay || !rightDoorOverlay) { resolve(); return; }

            const scene = frame.querySelector('.scene-frame');

            const centerFor = (ov) => {
              const L = parseFloat(ov.style.left)  || 0;
              const T = parseFloat(ov.style.top)   || 0;
              const W = parseFloat(ov.style.width) || 0;
              const H = parseFloat(ov.style.height)|| 0;
              return { x: L + W / 2, y: T + H * 0.25 };
            };
            const cL = centerFor(leftDoorOverlay);
            const cR = centerFor(rightDoorOverlay);

            const toDeg = (rad) => rad * 180 / Math.PI;
            const angleFromApexTo = (apex, pt) => {
              const ddx = pt.x - apex.x;
              const ddy = pt.y - apex.y;
              return toDeg(Math.atan2(ddx, ddy));
            };
            const unwrapAround = (base, ang) => {
              let a = ang;
              while (a - base > 180)  a -= 360;
              while (a - base < -180) a += 360;
              return a;
            };
            const rot = (deg) => `translate(-50%, 0) rotate(${deg}deg)`;

            const old = scene.querySelector('.scan-cone');
            if (old) old.remove();

            const cone = document.createElement('div');
            cone.className = 'scan-cone';

            // Size to comfortably span the doors
            const spanX = Math.abs(cR.x - cL.x);
            const reach = Math.max(220, Math.min(spanX * 0.9, scene.getBoundingClientRect().width * 0.9));
            const baseW = Math.max(200, Math.min(spanX * 0.75, 520));
            cone.style.width  = baseW + 'px';
            cone.style.height = reach + 'px';
            cone.style.opacity = '0';

            const grid = document.createElement('div');
            grid.className = 'grid';
            cone.appendChild(grid);
            scene.appendChild(cone);

            // Compute the cone apex under the drone (follows while scanning)
            const apexRelY  = (CONFIG.cone_apex_rel_y ?? 0.12);
            const apexLift0 = (CONFIG.cone_apex_lift_px ?? 6);
            const apexLiftK = (CONFIG.cone_apex_lift_ratio ?? 0.08);
            const apexDx    = (CONFIG.cone_apex_dx ?? 0);

            const currentApex = () => {
              const sceneRect = scene.getBoundingClientRect();
              const drRect    = droneEl.getBoundingClientRect();
              const centerX   = (drRect.left + drRect.width / 2) - sceneRect.left;
              const droneH    = drRect.height || parseFloat(droneEl.style.height) || 80;
              const baseY     = (drRect.top - sceneRect.top) + droneH * apexRelY;
              const lift      = Math.max(apexLift0, Math.round(droneH * apexLiftK));
              return { x: Math.round(centerX) + apexDx, y: Math.max(0, Math.round(baseY - lift)) };
            };

            // Initial angles
            const ap0 = currentApex();
            cone.style.left = ap0.x + 'px';
            cone.style.top  = ap0.y + 'px';
            const a0 = 0;
            const aL0 = unwrapAround(a0, angleFromApexTo(ap0, cL));
            const aR0 = unwrapAround(a0, angleFromApexTo(ap0, cR));
            const leftA  = (aL0 <= aR0) ? aL0 : aR0;
            const rightA = (aL0 <= aR0) ? aR0 : aL0;

            const neutral = (ang) => `${rot(ang)} skewX(0deg) scale(1, 1)`;
            const oblique = (ang) => {
              const maxD  = Math.max(Math.abs(leftA - a0), Math.abs(rightA - a0), 1e-3);
              const t     = Math.min(1, Math.abs(ang - a0) / maxD);
              const squash= 1 - t * (CONFIG.cone_persp_max_squash ?? 0.35);
              const skew  = t * (CONFIG.cone_persp_max_skew_deg ?? 6) * (ang < a0 ? -1 : 1);
              const spread= 1 + t * (CONFIG.cone_persp_spread_x ?? 0.10);
              return `${rot(ang)} skewX(${skew}deg) scale(${spread}, ${squash})`;
            };

            const readonlyTransformNow = () => {
              const m = getComputedStyle(cone).transform;
              return (m && m !== 'none') ? m : 'matrix(1, 0, 0, 1, 0, 0)';
            };

            // Keep apex following the drone until we resolve
            let following = true;
            const syncApex = () => {
              if (!following) return;
              const ap = currentApex();
              if (cone.style.left !== (ap.x + 'px')) cone.style.left = ap.x + 'px';
              if (cone.style.top  !== (ap.y + 'px')) cone.style.top  = ap.y + 'px';
              requestAnimationFrame(syncApex);
            };
            requestAnimationFrame(syncApex);

            cone.style.transform = neutral(a0);
            cone.getBoundingClientRect();

            // Appear
            const appearDur = Math.max(120, preMs);
            const appear = cone.animate(
              [{ opacity: 0, transform: neutral(a0) + ' scaleY(0.6)' },
               { opacity: 1, transform: neutral(a0) }],
              { duration: appearDur, easing: 'cubic-bezier(.25,.9,.2,1)', fill: 'forwards' }
            );

            appear.finished.catch(() => {}).then(async () => {
              const d1 = Math.abs(leftA  - a0);
              const d2 = Math.abs(rightA - leftA);
              const d3 = Math.abs(a0     - rightA);
              const D  = Math.max(1e-3, d1 + d2 + d3);

              const HOLD       = Math.max(0, CONFIG.cone_dwell_ms ?? 180);
              const baseBudget = Math.max(300, bufferMs);
              const moveBudget = Math.max(150, baseBudget - 2 * HOLD);
              const t1 = moveBudget * (d1 / D);
              const t2 = moveBudget * (d2 / D);
              const t3 = moveBudget * (d3 / D);

              const K = Math.min(0.98, Math.max(0.50, CONFIG.cone_persp_kickin ?? 0.82));

              const dwell = async (ang, DUR) => {
                const gridPx = 10;
                const a1 = cone.animate(
                  [{ transform: oblique(ang) }, { transform: oblique(ang) }],
                  { duration: Math.max(80, DUR), easing: 'linear', fill: 'forwards' }
                );
                const a2 = grid?.animate?.(
                  [{ backgroundPosition: '0 0' }, { backgroundPosition: `0 -${gridPx}px` }],
                  { duration: Math.max(80, DUR), easing: 'linear', fill: 'forwards' }
                );
                await a1.finished.catch(() => {});
                await a2?.finished?.catch(() => {});
                cone.style.transform = oblique(ang);
              };

              // down → left
              await cone.animate(
                [
                  { transform: readonlyTransformNow(), offset: 0 },
                  { transform: neutral(a0 + (leftA - a0) * K), offset: K },
                  { transform: oblique(leftA), offset: 1 }
                ],
                { duration: Math.max(60, t1), easing: 'linear', fill: 'forwards' }
              ).finished.catch(() => {});
              await dwell(leftA, HOLD);

              // left → right
              await cone.animate(
                [
                  { transform: readonlyTransformNow(), offset: 0 },
                  { transform: neutral(leftA + (rightA - leftA) * K), offset: K },
                  { transform: oblique(rightA), offset: 1 }
                ],
                { duration: Math.max(60, t2), easing: 'linear', fill: 'forwards' }
              ).finished.catch(() => {});
              await dwell(rightA, HOLD);

              // right → down
              await cone.animate(
                [
                  { transform: readonlyTransformNow(), offset: 0 },
                  { transform: neutral(rightA + (a0 - rightA) * K), offset: K },
                  { transform: oblique(a0), offset: 1 }
                ],
                { duration: Math.max(60, t3), easing: 'linear', fill: 'forwards' }
              ).finished.catch(() => {});

              following = false;
              await cone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' })
                        .finished.catch(() => {});
              cone.remove();
              resolve();
            });
          });
        }

        // Choice handlers are bound only for the decision HUD.
        let manualKeyHandler = null;
        let onLeftClick = null;
        let onRightClick = null;

        const choose = (side) => {
          if (window.__DISCARD_DATA__ || responded) return;
          responded = true;

          try { if (cleanupResize) cleanupResize(); } catch (_) {}

          const chosenOverlay = frame.querySelector(`.${side}-door`);
          const chosenDoorImg = chosenOverlay?.querySelector('.door-image');
          const revealed      = frame.querySelector('.' + side + '-revealed');
          if (revealed) revealed.style.visibility = 'visible';

          const rt = (performance.now() - trialStart) / 1000;

          // Door open (CSS transition)
          chosenDoorImg?.getBoundingClientRect();
          chosenDoorImg?.classList.add('door-open');

          const msFromTimeList = (str) => {
            if (!str) return 0;
            return str.split(',').map(s => s.trim())
              .map(v => v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000)
              .reduce((a, b) => Math.max(a, b), 0);
          };
          const styles  = chosenDoorImg ? getComputedStyle(chosenDoorImg) : null;
          const durMs   = styles ? msFromTimeList(styles.transitionDuration) : 0;
          const delayMs = styles ? msFromTimeList(styles.transitionDelay) : 0;
          const doorOpenTotalMs = durMs + delayMs;

          // Outcome panel
          const ok      = (side === true_location);
          const mp      = frame.querySelector('#mission-panel');
          const mpBadge = frame.querySelector('#mp-badge');
          const mpTitle = frame.querySelector('#mp-title');
          if (mp) {
            mp.classList.remove('is-success', 'is-fail', 'show');
            mp.classList.add(ok ? 'is-success' : 'is-fail');
            mpBadge.textContent = ok ? 'SUCCESS' : 'FAILURE';
            mpTitle.textContent = ok ? 'Victim Found' : 'No Victim Found';
          }

          // Drone exits to the right while the outcome banner is shown.
          const exitDroneRight = () => {
            if (!droneEl) return Promise.resolve();
            return new Promise(async (resolve) => {
              const delay     = (CONFIG.drone_exit_delay_ms || 350);
              if (delay > 0) await wait(delay);

              const scene     = frame.querySelector('.scene-frame');
              const rect      = scene.getBoundingClientRect();
              const cur       = getLT(droneEl);

              const edgeOffset = (CONFIG.drone_exit_edge_offset_px ?? 10);
              const targetLeft = Math.round(rect.width + edgeOffset);

              const totalDx = targetLeft - cur.left;
              if (totalDx <= 0) { resolve(); return; }

              const accelFrac = (CONFIG.drone_exit_accel_frac ?? 0.18);
              const accelDx   = Math.max(24, Math.round(totalDx * accelFrac));
              const x1        = cur.left + accelDx;

              const vAccel = (CONFIG.drone_exit_accel_speed_px_per_s ?? 360);
              const vCruise= (CONFIG.drone_exit_cruise_px_per_s ?? 520);

              const tIn  = Math.max(220, Math.round(1000 * accelDx / vAccel));
              const tLin = Math.max(320, Math.round(1000 * (totalDx - accelDx) / vCruise));

              droneEl.classList.add('paused');                 // pause hover during exit
              await moveTo(droneEl, x1, undefined, tIn,  'cubic-bezier(.4,0,1,1)');
              await moveTo(droneEl, targetLeft, undefined, tLin, 'linear');

              resolve();
            });
          };

          // After door opens + panel shown + blackout → finish trial.
          const panelDelay = (window.CONFIG?.panel_delay_after_open_ms ?? 200);
          const panelHold  = (window.CONFIG?.panel_hold_ms ?? 1100);
          const blackoutHold = (window.CONFIG?.blackout_hold_ms ?? 300);
          const postHold = isLast ? 0 : blackoutHold;
          const blackoutText = (window.CONFIG?.blackout_text ?? '');

          const afterOpen = () => {
            if (!isLast) {
              blackoutShow(blackoutText);
            } else {
              try { blackoutHide(); } catch (_) {}
            }

            setTO(() => {
              const rt2 = (performance.now() - trialStart) / 1000;
              const correct = (side === true_location);
              window._lastOutcome = { correct, rt: rt2, choice: side, true_location };

              try { decisionBox.style.display = 'none'; } catch (_) {}

              if (manualKeyHandler) window.removeEventListener('keydown', manualKeyHandler);
              if (onLeftClick)  leftDoorOverlay?.removeEventListener('click', onLeftClick);
              if (onRightClick) rightDoorOverlay?.removeEventListener('click', onRightClick);

              jsPsych.finishTrial({
                choice: side,
                reaction_time_s: rt2,
                correct,
                suggestion,
                buffer_ms: (typeof t.buffer_ms === 'number') ? t.buffer_ms : CONFIG.drone_buffer_ms,
                drone_anim_ms: (typeof CONFIG.drone_anim_ms === 'number') ? CONFIG.drone_anim_ms : null,
                timed_out: timedOut === true,
                decision_timeout_ms: (typeof CONFIG.decision_timeout_ms === 'number') ? CONFIG.decision_timeout_ms : null,
                timer_action: CONFIG.timer_action,
                risk_key: t.risk_overrides?.risk_key ?? null,
                risk_warmth: t.risk_overrides?.warmth ?? null,
                risk_fire_inward_px: t.risk_overrides?.fire_inward_px ?? null,
                risk_smoke_inward_px: t.risk_overrides?.smoke_inward_px ?? null,
                risk_smoke_rise_px: t.risk_overrides?.smoke_rise_px ?? null,
                decision_timeout_ms_used: (t.risk_overrides?.decision_timeout_ms ?? CONFIG.decision_timeout_ms ?? null),
                shake_amp_px: t.risk_overrides?.shake_amp_px ?? 0,
                shake_period_ms: t.risk_overrides?.shake_period_ms ?? null,
                risk_value: t.risk_overrides?.risk_value ?? null
              });

              if (cleanupResize) cleanupResize();
              if (IS_MOBILE) document.getElementById('mobile-choices').style.display = 'none';
            }, postHold);
          };

          const totalWait = (doorOpenTotalMs > 0 ? doorOpenTotalMs + 40 : 650);
          const exitP = exitDroneRight();

          setTimeout(() => {
            // Hide HUD as outcome starts.
            if (decisionBox) {
              decisionBox.classList.add('hud-closing');
              decisionBox.style.pointerEvents = 'none';
              setTimeout(() => { decisionBox.style.display = 'none'; }, 250);
            }

            setTimeout(() => {
              if (frame.querySelector('#mission-panel')) {
                frame.querySelector('#mission-panel').classList.add('show');
              }
              Promise.all([exitP, wait(panelHold)]).then(afterOpen);
            }, panelDelay);
          }, totalWait);
        };

        // ---------- Drone entry: constant speed → soft stop ----------
        const scene      = frame.querySelector('.scene-frame');
        const sceneRect  = scene.getBoundingClientRect();
        const mid        = doorMidX(leftDoorOverlay, rightDoorOverlay);

        const droneRect0 = droneEl.getBoundingClientRect();
        const droneW     = droneRect0.width  || parseFloat(droneEl.style.width)  || 120;
        const droneH     = droneRect0.height || parseFloat(droneEl.style.height) || 100;

        const centerLeft = Math.round(mid - droneW / 2);
        const centerTop  = Math.round((sceneRect.height - droneH) / 2);

        const startLeft = (-droneW - 30);
        const endLeft   = centerLeft;
        const totalDx   = endLeft - startLeft;
        const vCruise   = (CONFIG.drone_entry_cruise_px_per_s ?? 460);
        const tMs       = Math.max(280, Math.round(1000 * totalDx / Math.max(1, vCruise)));

        // Integrity timer spans entry + pre + scan + hop + decision.
        totalMs = tMs + preMs + scanMs + hopMs + decide;

        // Allow foreground FX to overrun a little if needed.
        const fxMs = Math.max(totalMs, approxVisibleMs);
        window.CONFIG._fx_trial_duration_ms = fxMs;
        window.CONFIG._fx_trial_start_ts    = performance.now();
        window.CONFIG._active_risk_key      = t?.risk_overrides?.risk_key
          || window.CONFIG._active_risk_key
          || 'medium';

        blackoutHide();
        startIntegrityCountdown();

        // Prepare drone start; hover is attached but paused.
        droneEl.style.transition = 'none';
        droneEl.classList.add('hovering', 'paused');
        droneEl.style.top  = centerTop + 'px';
        droneEl.style.left = startLeft + 'px';

        const easeStop = 'cubic-bezier(.3,.3,.9,1)';

        const entryAnim = droneEl.animate(
          [
            { left: startLeft + 'px', top: centerTop + 'px' },
            { left: endLeft   + 'px', top: centerTop + 'px' }
          ],
          { duration: tMs, easing: easeStop, fill: 'forwards' }
        );

        entryAnim.finished.catch(() => {}).then(() => {
          droneEl.style.left = endLeft + 'px';
          droneEl.style.top  = centerTop + 'px';
          droneEl.style.setProperty('--tx', '0px');
          droneEl.style.setProperty('--ty', '0px');
          droneEl.classList.remove('paused');
          droneEl.classList.add('hovering');
          startScanAfterEntry();
        });

        function startScanAfterEntry() {
          const buffer = (typeof t.buffer_ms === 'number') ? t.buffer_ms : CONFIG.drone_buffer_ms;
          runConeScan({
            frame,
            droneEl,
            leftDoorOverlay,
            rightDoorOverlay,
            suggestion,
            bufferMs: buffer,
            preMs: CONFIG.drone_prebuffer_ms
          }).then(() => {
            moveDroneToSuggestedDoor();
          });
        }

        function moveDroneToSuggestedDoor() {
          const target = suggestion === 'left' ? leftDoorOverlay : rightDoorOverlay;
          if (!target || !droneEl) return;

          const doorCenter = Math.round(doorCenterX(target));
          const drRect     = droneEl.getBoundingClientRect();
          const dw         = drRect.width  || parseFloat(droneEl.style.width)  || 120;

          const leftPx     = Math.round(doorCenter - dw / 2);
          const doorH      = parseFloat(target.style.height) || 200;
          const gap        = Math.max(10, Math.round(doorH * 0.08));
          const ty         = Math.max(10, Math.round(doorTop(target) - (drRect.height || 100) - gap));

          const cur        = getLT(droneEl);
          const distPx     = Math.hypot(Math.abs(leftPx - cur.left), Math.abs(ty - cur.top));
          const vHop       = (CONFIG.drone_hop_speed_px_per_s ?? 260);
          const baseMs     = Math.round(1000 * distPx / Math.max(1, vHop));
          const hopMin     = (CONFIG.drone_hop_min_ms ?? 1000);
          const scale      = (CONFIG.drone_hop_duration_scale ?? 1.0);
          const durMs      = Math.max(hopMin, Math.round(baseMs * scale));

          // Keep subtle hover while moving; adjust amplitude to door scale.
          droneEl.style.setProperty('--hover-amp', Math.max(2, Math.min(6, Math.round(doorH * 0.03))) + 'px');

          const baseLeft = parseFloat(droneEl.style.left) || 0;
          const baseTop  = parseFloat(droneEl.style.top)  || 0;
          const toX      = leftPx - baseLeft;
          const toY      = ty     - baseTop;

          return moveTransformTo(droneEl, toX, toY, durMs, 'cubic-bezier(.3,.3,.9,1)')
            .then(() => {
              if (isDemo) {
                const dwell  = Math.max(300, (window.CONFIG?.training?.dwell_ms ?? 1200));
                setTimeout(() => {
                  const text   = window.CONFIG?.training?.blackout_text ?? 'The main task will now start';
                  const holdMs = Math.max(600,  window.CONFIG?.training?.blackout_hold_ms ?? window.CONFIG?.blackout_hold_ms ?? 2200);
                  const fadeMs = Math.max(150,  window.CONFIG?.training?.blackout_fade_ms ?? window.CONFIG?.blackout_fade_ms ?? 300);
                  try { blackoutShow(text, fadeMs); } catch (_) { blackoutShow(text); }
                  setTimeout(() => {
                    jsPsych.finishTrial({
                      trial_type:  'training_demo',
                      event_type:  'training_demo',
                      is_training: true,
                      is_demo:     true,
                      suggestion,
                      true_location
                    });
                  }, holdMs);
                }, dwell);
                return;
              }

              // Decision HUD
              try {
                decisionText.textContent = `The drone recommends the ${suggestion} door.`;
                decisionBox.classList.add('hud-show', 'compact');
                requestAnimationFrame(() => {
                  decisionBox.classList.add('reveal-stagger');
                  setTimeout(() => {
                    decisionBox.classList.remove('compact');
                    decisionBox.classList.add('expanded');
                  }, 50);
                });

                // Follow (F) / Ignore (N)
                function decisionKeys(e) {
                  if (responded) return;
                  if (e.key === 'f' || e.key === 'F') btnFollow?.click();
                  if (e.key === 'n' || e.key === 'N') btnIgnore?.click();
                }
                window.addEventListener('keydown', decisionKeys, { passive: true });
                const clearDecision = () => window.removeEventListener('keydown', decisionKeys);

                btnFollow.onclick = () => {
                  clearDecision();
                  decisionBox.classList.add('hud-closing');
                  decisionBox.classList.remove('expanded');
                  stopIntegrity();
                  choose(suggestion);
                };
                btnIgnore.onclick = () => {
                  clearDecision();
                  decisionBox.classList.add('hud-closing');
                  decisionBox.classList.remove('expanded');
                  stopIntegrity();
                  choose(suggestion === 'left' ? 'right' : 'left');
                };

                if (shouldAutoFollow) {
                  shouldAutoFollow = false;
                  setTimeout(() => btnFollow?.click(), 0);
                }

                requestAnimationFrame(() => decisionBox.classList.add('hud-show'));
                decisionBox.classList.remove('compact');
                decisionBox.classList.add('expanded');
              } catch (_) {}
            });
        }

        // Augment on_finish with restoration + cleanup.
        const prevFinish = trial.on_finish;
        trial.on_finish = function (data) {
          try {
            window.CONFIG.fire_inward_px  = _savedFx.fire_inward_px;
            window.CONFIG.smoke_inward_px = _savedFx.smoke_inward_px;
            window.CONFIG.smoke_rise_px   = _savedFx.smoke_rise_px;
          } catch (_) {}

          if (prevFinish) prevFinish.call(trial, data);

          try { stopIntegrity(); } catch (_) {}
          try { pendingTO.forEach(clearTimeout); } catch (_) {}

          try {
            data.is_fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
          } catch (_) { data.is_fullscreen = null; }

          if (!window.__DISCARD_DATA__) logTrialRow(data);
        };
      });

      const el = jsPsych.getDisplayElement();
      if (el?.focus) el.focus();
    }
  };

  return trial;
}
