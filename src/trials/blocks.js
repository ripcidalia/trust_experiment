/**
 * @file src/trials/blocks.js
 * @summary
 *  Orchestrates experiment flow for the three door-trial blocks and interleaved
 *  trust probes / questionnaires. This module:
 *   - Loads the assigned condition set (blocks/trials)
 *   - Augments each trial with assets and risk overrides
 *   - Pushes door trials onto the jsPsych timeline
 *   - Inserts trust probes either by cadence (min/max gap) or by explicit indices
 *   - Places 14-item questionnaires at two midpoints
 */

import { makeFadeTransition } from '../ui/theme.js';
import { makeTrustProbeTrial } from './trustProbe.js';
import { loadTrialsBlocks, augmentTrialsWithRiskAndAssets } from '../data/sets.js';
import { randSeeded } from '../data/assets.js';
import { createDoorTrial } from './doorTrial.js';
import { trust14Trial } from './trust14.js';

/**
 * Initialize and populate the jsPsych timeline with:
 *  Block 1 → 14-item (mid1) → Block 2 → 14-item (mid2) → Block 3.
 * Trust probes are added within each block either by cadence or explicit indices.
 *
 * @param {Array<object>} timeline - The mutable jsPsych timeline array.
 * @returns {Promise<void>}
 */
export async function initExperiment(timeline) {
  try {
    // Load chosen set & materialize blocks
    const { mode, blocks, set_id } = await loadTrialsBlocks();
    blocks.forEach(b => { b.trials = augmentTrialsWithRiskAndAssets(b.trials); });

    // Persist assigned set for downstream logging/metadata
    window.EXP_METADATA = window.EXP_METADATA || {};
    window.EXP_METADATA.assigned_set = set_id;
    console.info('[HRI] Assigned set:', set_id, 'Blocks:', blocks.length);

    // ---------- Block 1 ----------
    const b1 = blocks[0] || { trials: [], probes: null };
    if (b1.probes && b1.probes.length) {
      insertDoorBlockWithExplicitProbes(timeline, b1.trials, 1, b1.probes);
    } else {
      insertDoorBlockWithCadenceProbes(timeline, b1.trials, 1, randSeeded);
    }

    // Midpoint 1: Trust-14 + single probe
    timeline.push(makeFadeTransition('light', 300));
    timeline.push({
      ...trust14Trial,
      data: { ...(trust14Trial.data || {}), event_type: 'questionnaire14mid1' }
    });
    timeline.push(makeTrustProbeTrial('after_trust14_mid1'));

    // ---------- Block 2 ----------
    timeline.push(makeFadeTransition({ to: 'dark', fadeIn: false, holdMs: 0 }));
    const b2 = blocks[1] || { trials: [], probes: null };
    if (b2.probes && b2.probes.length) {
      insertDoorBlockWithExplicitProbes(timeline, b2.trials, 2, b2.probes);
    } else {
      insertDoorBlockWithCadenceProbes(timeline, b2.trials, 2, randSeeded);
    }

    // Midpoint 2: Trust-14 + single probe
    timeline.push(makeFadeTransition('light', 300));
    timeline.push({
      ...trust14Trial,
      data: { ...(trust14Trial.data || {}), event_type: 'questionnaire14mid2' }
    });
    timeline.push(makeTrustProbeTrial('after_trust14_mid2'));

    // ---------- Block 3 ----------
    timeline.push(makeFadeTransition({ to: 'dark', fadeIn: false, holdMs: 0 }));
    const b3 = blocks[2] || { trials: [], probes: null };
    if (b3.probes && b3.probes.length) {
      insertDoorBlockWithExplicitProbes(timeline, b3.trials, 3, b3.probes);
    } else {
      insertDoorBlockWithCadenceProbes(timeline, b3.trials, 3, randSeeded);
    }
  } catch (err) {
    console.error('Init failed:', err);
    alert('Failed to load condition sets. See console for details.');
  }
}

/**
 * Insert a door block and place trust probes based on a cadence window.
 * The gap between probes is drawn uniformly from [min, max] configured in CONFIG.
 *
 * Flow (per block):
 *  - For each trial: push door trial
 *  - If the running count hits the next gap (and not the last trial), insert:
 *      fade → probe → fade
 *  - Advance "next gap" by another uniform draw
 *
 * @param {Array<object>} timeline           - jsPsych timeline to append to.
 * @param {Array<object>} trialsForBlock     - Trials for this block (already asset-augmented).
 * @param {number}        blockIndex         - 1-based block index.
 * @param {() => number}  randFn             - RNG returning [0,1).
 */
function insertDoorBlockWithCadenceProbes(timeline, trialsForBlock, blockIndex, randFn) {
  const minEvery = window.CONFIG?.trust_probe_every_min ?? 5;
  const maxEvery = window.CONFIG?.trust_probe_every_max ?? minEvery;

  const nextGap = () => {
    if (minEvery === maxEvery) return minEvery;
    const r = randFn ? randFn() : Math.random();
    return minEvery + Math.floor(r * (maxEvery - minEvery + 1));
  };

  let nextAt = nextGap();
  let count = 0;

  trialsForBlock.forEach((t, idx) => {
    // Door trial
    timeline.push(createDoorTrial({ ...t, block_index: (blockIndex - 1) }, idx, trialsForBlock.length));
    count++;

    // Insert probe on cadence (excluding the very last trial unless desired)
    const isLast = (idx === trialsForBlock.length - 1);
    if (count === nextAt && !isLast) {
      timeline.push(makeFadeTransition('light', 200));
      timeline.push(makeTrustProbeTrial(`mid_block${blockIndex}_t${count}`));
      timeline.push(makeFadeTransition({ to: 'dark', fadeIn: false, holdMs: 0 }));
      nextAt += nextGap();
    }
  });
}

/**
 * Insert a door block and place trust probes at explicit 1-based trial indices.
 *
 * @param {Array<object>} timeline               - jsPsych timeline to append to.
 * @param {Array<object>} trialsForBlock         - Trials for this block (already asset-augmented).
 * @param {number}        blockIndex             - 1-based block index.
 * @param {Array<number>} explicitProbeIndices   - e.g., [5, 10, 15].
 */
function insertDoorBlockWithExplicitProbes(timeline, trialsForBlock, blockIndex, explicitProbeIndices) {
  const N = trialsForBlock.length;
  const probeSet = new Set((explicitProbeIndices || []).map(x => Number(x)));

  trialsForBlock.forEach((t, idx) => {
    const trialNum = idx + 1;

    // Door trial
    timeline.push(createDoorTrial({ ...t, block_index: (blockIndex - 1) }, idx, N));

    // Insert probe at explicit index, skipping the final trial unless explicitly required
    const isLast = trialNum === N;
    if (probeSet.has(trialNum) && !isLast) {
      timeline.push(makeFadeTransition('light', 200));
      timeline.push(makeTrustProbeTrial(`mid_block${blockIndex}_t${trialNum}`));
      timeline.push(makeFadeTransition({ to: 'dark', fadeIn: false, holdMs: 0 }));
    }
  });
}