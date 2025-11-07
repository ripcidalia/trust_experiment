/**
 * @file src/main.js
 * @description
 * Application bootstrap and experiment orchestration.
 * - Wires up consent/start flow, fullscreen, and mobile landscape gate.
 * - Preloads assets, builds the jsPsych timeline (intro → questionnaires → training → blocks → post).
 * - Sets up durable logging and exit/withdraw UI, including data retention/deletion.
 */

import { CONFIG, readConfigFromURL, pid } from './config.js';
import { blackoutHide, showLoadingOverlay, hideLoadingOverlay } from './ui/overlays.js';
import { makeFadeTransition } from './ui/theme.js';
import { showExitModal, hideExitModal, showEndScreenKeep, showEndScreenDiscard } from './ui/exit-modal.js';
import { initExperiment } from './trials/blocks.js';
import { generateTrainingTrials } from './data/sets.js';
import { VICTIMS, EMPTY, BACKGROUNDS, DOOR_SKINS, ALL_SMOKE, ALL_FIRE, randSeeded } from './data/assets.js';
import { ensureReviewConditionAssigned, loadReviewsJSON, pickReviewSet, assignAvatarsToReviewSet, listAllAvatarImages } from './trials/reputation.js';

import { logEnqueue, scheduleFlush, flushSyncBeacon, clearLocalQueue, requestDeleteByParticipant } from './logging/index.js';
import { buildRowsForLogging } from './logging/build.js';
import { waitForMobileGate, IS_MOBILE  } from './utils/misc.js';

// Trial modules
import { demographicsTrial } from './trials/demographics.js';
import { overviewTrial } from './trials/overview.js';
import { robotDescriptionTrial } from './trials/robotDescription.js';
import { trust40Trial } from './trials/trustQuestionnaires.js';
import { makeTrustProbeTrial } from './trials/trustProbe.js';
import { selfConfidenceTrial } from './trials/selfConfidence.js';
import { readyTrial } from './trials/ready.js';
import { makeReviewsTrial, reputationProbeTrial } from './trials/reputation.js';
import { createDoorTrial } from './trials/doorTrial.js';

/**
 * Bootstraps the experience after the initial HTML fragments are in place and
 * the user clicks the consent button. This sets up durability for logging,
 * mobile orientation gating, fullscreen, and then launches jsPsych.
 */
export async function bootstrap() {

    // In-memory log mirror used for pagehide/sendBeacon as a last-chance flush.
    window.__LOG_BUFFER__ = [];  // array of row objects

    // Retry flush when network returns.
    window.addEventListener('online', () => scheduleFlush(0));

    // Use idle/background time to flush pending logs.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') scheduleFlush(0);
    });

    // Final safeguard: on navigation away, try to beacon whatever is buffered.
    window.addEventListener('pagehide', () => {
        flushSyncBeacon();
    }, { capture: true });

    // Consent → fullscreen (when available) → mobile gate → start experiment.
    (function(){
        const consentButton = document.getElementById('consent-button');
        consentButton.addEventListener('click', async () => {
            // Hide consent and reveal primary jsPsych display container.
            document.getElementById('consent-screen').style.display = 'none';
            const jsTarget = document.getElementById('jspsych-target');
            jsTarget.style.display = 'block';
            setTimeout(() => { try { window.scrollTo(0, 1); } catch (_) {} }, 0);

            // Request fullscreen on compatible browsers (desktop, iOS 16+ Safari).
            if (document.documentElement.requestFullscreen) {
                try {
                    const el = document.documentElement;
                    if (!document.fullscreenElement) {
                        if (el.requestFullscreen) {
                            await el.requestFullscreen({ navigationUI: 'hide' });
                        } else if (el.webkitRequestFullscreen) {
                            el.webkitRequestFullscreen();
                        } else if (el.msRequestFullscreen) {
                            el.msRequestFullscreen();
                        }
                    }
                } catch (e) {
                    console.warn('Fullscreen request was blocked or failed:', e);
                }
            }

            // Phones/tablets: block until landscape and width threshold are met.
            if (IS_MOBILE) await waitForMobileGate();

            // Launch jsPsych runtime.
            await startJsPsych();
        });
    })();

    /**
     * Initializes and runs jsPsych:
     * - Sets global data properties.
     * - Preloads assets.
     * - Builds the timeline: intro → trust40 (pre) → probe → self-confidence → reviews (+probe)
     *   → ready → training demo → blocks 1–3 → trust40 (post) → probe.
     * - Registers exit/withdraw flows (keep/discard).
     */
    async function startJsPsych(){
        if (typeof initJsPsych !== 'function') throw new Error('initJsPsych not found');

        const jsPsych = initJsPsych({
            display_element: document.getElementById('jspsych-target'),
            on_finish: function(){
                // If stopped via exit modal, skip normal end-of-experiment UI.
                if (window.__MANUAL_END__) return;

                // Leave fullscreen and restore page scroll.
                try { if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(()=>{}); } } catch(_){}
                document.documentElement.style.overflow = '';
                document.body.style.overflow = '';

                // Swap jsPsych container for the appropriate end screen.
                const target = document.getElementById('jspsych-target');
                const final  = document.getElementById('final-screen');
                const keep   = document.getElementById('final-keep-screen');
                const disc   = document.getElementById('final-discard-screen');

                if (target) target.style.display = 'none';
                document.getElementById('exit-btn')?.style.setProperty('display','none');
                document.body.classList.remove('task-dark');

                if (window.__END_REASON__ === 'discard') {
                    disc?.style.setProperty('display','block');
                } else if (window.__END_REASON__ === 'keep') {
                    keep?.style.setProperty('display','block');
                } else {
                    final?.style.setProperty('display','block');
                }

                // Log final dataset unless user chose to discard.
                if (!window.__DISCARD_DATA__) {
                    const rows = buildRowsForLogging(jsPsych.data.get().values());
                    logEnqueue(rows);
                }
            }
        });

        // Expose the instance globally for modules that do not import it directly.
        window.jsPsych = jsPsych;

        // Timeline is built in-flight (we interleave async steps like review assignment).
        const timeline = [];

        // Participant and configuration mirrors available to all modules.
        window.PID = pid;
        window.CONFIG = CONFIG;

        // Statically stamp properties onto every jsPsych row for traceability.
        jsPsych.data.addProperties({
            condition_id: CONFIG.condition_id
        });

        // Show the floating exit button once we’re ready.
        document.getElementById('exit-btn').style.display = 'block';

        // Allow URL params (N, p, timers, etc.) to adjust CONFIG at runtime.
        readConfigFromURL();

        // Optional: set/override named set via ?set=SetX
        (function readSetFromURL(){
            const sp = new URLSearchParams(location.search);
            const setId = sp.get('set');   // "SetA" | "SetB" | ... | null
            if (setId) window.CONFIG.set_id = setId;
        })();

        // Single-link rollout; still allow ?set=... for debugging.
        window.CONFIG = window.CONFIG || {};
        CONFIG.single_link_mode = true;
        CONFIG.allow_url_override = true;
        CONFIG.local_key = 'hri_set_id_v1';
        CONFIG.participant_id = pid;

        // Additional global row stamps for analysis convenience.
        jsPsych.data.addProperties({
            participant_id: pid,
            seed: CONFIG.seed,
            config_N: CONFIG.N,
            config_drone_success_rate: CONFIG.drone_success_rate,
            config_sequence_len: CONFIG.sequence ? CONFIG.sequence.length : 0
        });

        // Preload all heavyweight imagery (backgrounds, FX, victims, avatars).
        jsPsych.pluginAPI.preloadImages([
            ...BACKGROUNDS,
            'assets/drone.png',
            ...DOOR_SKINS,
            ...EMPTY,
            'assets/drone_description.png',
            ...ALL_SMOKE,
            ...ALL_FIRE,
            ...VICTIMS,
            ...listAllAvatarImages()
        ]);

        // If we’re not already fullscreen, include jsPsych’s fullscreen helper (desktop only).
        const needFullscreenTrial =
            !IS_MOBILE &&
            !document.fullscreenElement &&
            !(document.webkitFullscreenElement) &&
            !(document.msFullscreenElement);

        if (needFullscreenTrial) {
            const enter_fullscreen = {
                type: jsPsychFullscreen,
                fullscreen_mode: true,
                message: '<p>For the best experience, we will switch to full screen.</p>',
                button_label: 'Enter full screen'
            };
            timeline.push(enter_fullscreen);
        }

        // Intro flow: demographics → overview → robot description → Trust-40 (pre) → probe → self-confidence.
        timeline.push(
            demographicsTrial,
            overviewTrial,
            robotDescriptionTrial,
            {
                ...trust40Trial,
                data: { ...(trust40Trial.data || {}), event_type: 'questionnaire40pre' }
            },
            makeTrustProbeTrial('after_trust40_pre'),
            selfConfidenceTrial,
        );

        // Background loading UI while we lock-in review assignment / assets.
        showLoadingOverlay('Loading experiment… Please wait');

        // Ensure the participant receives a canonical (server-assigned) review condition.
        await ensureReviewConditionAssigned();

        // Globally stamp assigned review condition so every row carries it.
        jsPsych.data.addProperties({
            review_condition: window.ASSIGNED_REVIEW_CONDITION
        });

        // Build the reviews trial (cards + avatar assignment) + reputation probe.
        const REVIEWS = await loadReviewsJSON();
        let reviewsTrial = null;
        if (REVIEWS) {
            // Normally already set; we defensively ensure it nonetheless.
            const cond = window.ASSIGNED_REVIEW_CONDITION || await ensureReviewConditionAssigned();

            const label = window.ASSIGNED_REVIEW_CONDITION; // canonical
            const expected = Number(
                (CONFIG.review_expected_map && Object.prototype.hasOwnProperty.call(CONFIG.review_expected_map, label))
                    ? CONFIG.review_expected_map[label]
                    : 0
            );

            const set  = pickReviewSet(REVIEWS, label, randSeeded);
            const reviewSetWithAvatars = assignAvatarsToReviewSet(set, randSeeded);

            reviewsTrial = makeReviewsTrial({
                reviewSet: reviewSetWithAvatars,
                condition: label,
                expectedReputation: expected
            });

            timeline.push(reviewsTrial, reputationProbeTrial);
        }

        // Short “what you’ll see next” screen before the one-trial demo + main task start.
        timeline.push(readyTrial);

        // --- Training (non-interactive demos) ---
        // Generate N demo trials (HUD/off, no outcomes), then fade to dark to flow into Block 1.
        const __TRAIN = generateTrainingTrials(CONFIG.training.n, randSeeded);
        timeline.push(makeFadeTransition({ to: 'dark', fadeIn: false, holdMs: 0 }));
        __TRAIN.forEach((t, i) => {
            timeline.push(createDoorTrial(t, i, __TRAIN.length, { training: true, demo: true }));
        });

        // --- Blocks (door trials with mid-block probes inserted per cadence/explicit indices) ---
        // initExperiment() mutates timeline by appending Block 1 → mid probe → Block 2 → … → Block 3.
        try {
            await initExperiment(timeline);
        } catch (err) {
            // If block preparation fails, keep the loader visible with a human-readable prompt.
            const el = document.getElementById('loadingOverlay');
            if (el) {
                const t = el.querySelector('.loading-text');
                if (t) t.textContent = 'Something went wrong loading the study. Please refresh.';
                el.classList.add('visible');
            }
            console.error('Init failed:', err);
        }

        // Post flow: Trust-40 (post) + final probe.
        timeline.push(makeFadeTransition('light', 300));
        timeline.push({
            ...trust40Trial,
            data: { ...(trust40Trial.data || {}), event_type: 'questionnaire40post' }
        });
        timeline.push(makeTrustProbeTrial('after_trust40_post'));

        // ===== Exit / Withdraw UI bindings =====
        const exitBtn   = document.getElementById('exit-btn');
        const exitModal = document.getElementById('exit-modal');
        const btnResume = document.getElementById('exit-resume');
        const btnKeep   = document.getElementById('exit-keep');
        const btnDiscard= document.getElementById('exit-discard');

        // Open exit modal (button or Ctrl+Shift+X).
        exitBtn.onclick = () => showExitModal(jsPsych);
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
                if (exitModal.style.display !== 'flex') showExitModal(jsPsych);
            }
        });

        // Resume the study (close modal).
        btnResume.onclick = () => hideExitModal(jsPsych);

        // Early exit, KEEP data (flush queue; end with “keep” screen).
        btnKeep.onclick = () => {
            window.__END_REASON__ = 'keep';
            window.__MANUAL_END__ = true;
            exitModal.style.display = 'none';

            // Restore shell UI, remove overlays, and end politely.
            try { if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(()=>{}); } } catch(_){}
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.body.classList.remove('task-dark');
            window.__MANUAL_END__ = true;                 // used by hasExperimentEnded()
            try { blackoutHide(); } catch(_) {}           // ensure blackout layer is hidden
            try { document.querySelectorAll('.scan-cone').forEach(n => n.remove()); } catch(_) {}
            try { jsPsych.pluginAPI.clearAllTimeouts?.(); } catch(_) {}

            showEndScreenKeep();

            try { jsPsych.pluginAPI.cancelAllKeyboardResponses?.(); } catch(_){}
            try { jsPsych.pluginAPI.clearAllTimeouts?.(); } catch(_){}

            // Proactively flush any queued logs.
            try { scheduleFlush(0); } catch(_){}

            try { jsPsych.endExperiment('Ended early (keep data).'); } catch(_) {}
        };

        // Early exit, DISCARD data (wipe local queue; request server deletion; end with “discard” screen).
        btnDiscard.onclick = async () => {
            window.__DISCARD_DATA__ = true;
            window.__END_REASON__ = 'discard';
            window.__MANUAL_END__ = true;
            exitModal.style.display = 'none';

            // 1) Remove any local log queue (IDB/LS).
            try { await clearLocalQueue(); } catch(_) {}

            // 2) Reset jsPsych in-memory data and ask backend to delete by participant ID.
            try { jsPsych.data.reset(); } catch(_){}
            try { await requestDeleteByParticipant(window.PID); } catch(_){}

            // 3) Restore UI, remove overlays, and end politely.
            try { if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(()=>{}); } } catch(_){}
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.body.classList.remove('task-dark');
            window.__MANUAL_END__ = true;                 // used by hasExperimentEnded()
            try { blackoutHide(); } catch(_) {}
            try { document.querySelectorAll('.scan-cone').forEach(n => n.remove()); } catch(_) {}
            try { jsPsych.pluginAPI.clearAllTimeouts?.(); } catch(_){}

            showEndScreenDiscard();

            try { jsPsych.pluginAPI.cancelAllKeyboardResponses?.(); } catch(_){}
            try { jsPsych.pluginAPI.clearAllTimeouts?.(); } catch(_){}

            try { jsPsych.endExperiment('Withdrawn (discard data).'); } catch(_) {}
        };

        // Remove the loading veil and run the assembled timeline.
        hideLoadingOverlay();
        jsPsych.run(timeline);
    }
}