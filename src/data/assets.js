/**
 * @file src/data/assets.js
 * @brief Loads and serves experiment assets (victims, backgrounds, doors, smoke/fire FX) and
 *        exposes deterministic, no-repeat pickers for each category.
 *
 * Responsibilities
 *  - Fetch typed manifests (JSON) for each asset family with cache-busting for development.
 *  - Provide safe fallbacks if manifests are missing or invalid.
 *  - Expose preloading lists (ALL_SMOKE / ALL_FIRE) and per-trial pickers (no immediate repeats).
 *  - Keep selections deterministic via a seeded RNG when CONFIG.seed is provided.
 *
 * Contracts / Notes
 *  - This module reads CONFIG.seed and may use a global `mulberry32(seed)` RNG if present.
 *    (Do not change behavior here—if `mulberry32` is provided elsewhere, this module will use it.)
 *  - Paths returned to callers are relative to the app root (e.g., "assets/...").
 *  - No UI/behavior changes—only asset discovery and selection utilities.
 */

import { CONFIG } from '../config.js';

/* Manifest locations (JSON arrays of filenames or paths) */
const VICTIM_MANIFEST_URL = '../../assets/victims/manifest.json';
const EMPTY_MANIFEST_URL = '../../assets/empty/manifest.json';
const BG_MANIFEST_URL     = '../../assets/backgrounds/manifest.json';
const DOOR_MANIFEST_URL   = '../../assets/doors/manifest.json';

const SMOKE_MANIFEST = {
  left:  '../../assets/smoke/left/manifest.json',
  right: '../../assets/smoke/right/manifest.json'
};
const FIRE_MANIFEST = {
  left:  '../../assets/fire/left/manifest.json',
  right: '../../assets/fire/right/manifest.json'
};

/* Fallbacks when manifests are absent or invalid */
const DEFAULT_VICTIM_SKINS = [
  '../../assets/victims/victim1.png',
  '../../assets/victims/victim1_copy.png',
  '../../assets/victims/victim2.png',
  '../../assets/victims/victim2_copy.png',
  '../../assets/victims/victim3.png',
  '../../assets/victims/victim3_copy.png',
  '../../assets/victims/victim4.png',
  '../../assets/victims/victim4_copy.png',
  '../../assets/victims/victim5.png',
  '../../assets/victims/victim5_copy.png',
  '../../assets/victims/victim6.png',
  '../../assets/victims/victim6_copy.png'
];
const DEFAULT_EMPTY_SKINS = [
  '../../assets/empty/empty1.png',
  '../../assets/empty/empty2.png',
  '../../assets/empty/empty3.png',
  '../../assets/empty/empty4.png'
];
const DEFAULT_BACKGROUNDS = [
  '../../assets/backgrounds/bg1.png',
  '../../assets/backgrounds/bg2.png',
  '../../assets/backgrounds/bg3.png'
];
const DEFAULT_DOORS = [
  '../../assets/doors/door1.png',
  '../../assets/doors/door2.png',
  '../../assets/doors/door3.png'
];

/**
 * Load smoke and fire FX lists and provide:
 *  - Preload arrays: ALL_SMOKE / ALL_FIRE
 *  - Pair pickers that avoid mirrored duplicates (left/right share the same basename)
 * @param {() => number} randFn - RNG returning [0,1)
 * @returns {Promise<{ALL_SMOKE:string[], ALL_FIRE:string[], nextSmokePair:Function, nextFirePair:Function}>}
 */
export async function loadSmokeAndFirePickers(randFn) {
  const [smLeft, smRight] = await Promise.all([
    loadSideList(SMOKE_MANIFEST.left,  'assets/smoke/left'),
    loadSideList(SMOKE_MANIFEST.right, 'assets/smoke/right'),
  ]);
  const [fiLeft, fiRight] = await Promise.all([
    loadSideList(FIRE_MANIFEST.left,   'assets/fire/left'),
    loadSideList(FIRE_MANIFEST.right,  'assets/fire/right'),
  ]);

  const ALL_SMOKE = [...smLeft, ...smRight];
  const ALL_FIRE  = [...fiLeft, ...fiRight];

  return {
    ALL_SMOKE, ALL_FIRE,
    nextSmokePair: makeMirroredPairPicker(smLeft, smRight, randFn),
    nextFirePair:  makeMirroredPairPicker(fiLeft, fiRight, randFn),
  };
}

/**
 * Load background list from manifest or fallback.
 * @returns {Promise<string[]>}
 */
export async function loadBackgrounds() {
  const list = await loadListFromManifest(BG_MANIFEST_URL, x =>
    typeof x === 'string' && x.startsWith('assets/') ? x : `assets/backgrounds/${x}`
  );
  return list || DEFAULT_BACKGROUNDS.slice();
}

/**
 * Load door skin list from manifest or fallback.
 * @returns {Promise<string[]>}
 */
export async function loadDoors() {
  const list = await loadListFromManifest(DOOR_MANIFEST_URL, x =>
    typeof x === 'string' && x.startsWith('assets/') ? x : `assets/doors/${x}`
  );
  return list || DEFAULT_DOORS.slice();
}

/**
 * Load victim skins from manifest or fallback.
 * @returns {Promise<string[]>}
 */
export async function loadVictimSkins() {
  try {
    const res = await fetch(VICTIM_MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest fetch failed');
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty/invalid manifest');

    return arr
      .map(x => (typeof x === 'string'
        ? (x.startsWith('assets/') ? x : `assets/victims/${x}`)
        : null))
      .filter(Boolean);
  } catch (e) {
    console.warn('Victim manifest not found or invalid, using fallback list.', e);
    return DEFAULT_VICTIM_SKINS.slice();
  }
}

/**
 * Load empty skins list from manifest or fallback.
 * @returns {Promise<string[]>}
 */
export async function loadEmptySkins() {
  const list = await loadListFromManifest(EMPTY_MANIFEST_URL, x =>
    typeof x === 'string' && x.startsWith('assets/') ? x : `assets/empty/${x}`
  );
  return list || DEFAULT_EMPTY_SKINS.slice();
}

/* Deterministic RNG selection. Expects a global mulberry32(seed) if provided elsewhere. */
let randSeed = Math.random;
if (CONFIG.seed !== null) randSeed = mulberry32(CONFIG.seed);

/** RNG to use throughout the module (deterministic when CONFIG.seed is set). */
export const randSeeded = randSeed;

/** Victim skins (manifest or fallback). */
export const VICTIMS = await loadVictimSkins();
/** Pick a victim skin with no immediate repeats. */
export const pickVictimSkin = makeSkinPicker(VICTIMS, randSeeded);

/** Empty skins (manifest or fallback). */
export const EMPTY = await loadEmptySkins();
/** Pick a victim skin with no immediate repeats. */
export const pickEmptySkin = makeSkinPicker(EMPTY, randSeeded);

/** Backgrounds and doors (manifest or fallback). */
export const BACKGROUNDS = await loadBackgrounds();
export const DOOR_SKINS  = await loadDoors();
/** No-repeat pickers for background and door skins. */
export const pickBackground = makeSkinPicker(BACKGROUNDS, randSeeded);
export const pickDoorSkin   = makeSkinPicker(DOOR_SKINS, randSeeded);

/** Smoke/Fire preload arrays and mirrored-pair pickers. */
export const { ALL_SMOKE, ALL_FIRE, nextSmokePair, nextFirePair } =
  await loadSmokeAndFirePickers(randSeeded);

/**
 * Load a left/right side list from a manifest. Coerces bare filenames into the provided baseDir.
 * Accepts already pathed strings (starting with "assets/") or nested subpaths.
 * @param {string} url - Manifest URL
 * @param {string} baseDir - Base directory to join for bare filenames
 * @returns {Promise<string[]>}
 */
async function loadSideList(url, baseDir) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest fetch failed: ' + url);
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty/invalid manifest: ' + url);

    return arr.map(x => {
      if (typeof x !== 'string') return null;
      if (x.startsWith('assets/')) return x;   // already rooted under assets
      if (x.includes('/')) return x;           // subpath provided
      return `${baseDir}/${x}`;                // bare filename -> baseDir + filename
    }).filter(Boolean);
  } catch (e) {
    console.warn('Manifest missing/invalid:', url, e);
    return [];
  }
}

/** Strip directory and extension from a path. */
function stripExtBase(p) {
  const fname = p.replace(/^.*[\\/]/, '');
  return fname.replace(/\.[^.]+$/, '');
}

/** Fisher–Yates shuffle in place using supplied RNG. */
function shuffleInPlace(arr, randFn) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Make a no-immediate-repeat picker over a static list.
 * @param {string[]} list
 * @param {() => number} randFn
 * @returns {() => string}
 */
function makeNoRepeatPicker(list, randFn) {
  let last = null;
  let pool = [];
  const refill = () => { pool = shuffleInPlace(list.slice(), randFn); };
  refill();

  return function next() {
    if (!pool.length) refill();

    // Avoid immediate repeats when possible.
    if (pool.length > 1 && pool[pool.length - 1] === last) {
      const k = Math.floor(randFn() * (pool.length - 1));
      [pool[k], pool[pool.length - 1]] = [pool[pool.length - 1], pool[k]];
    }
    last = pool.pop();
    return last;
  };
}

/**
 * Pair picker for mirrored FX (left/right) that:
 *  - Picks left with no immediate repeats,
 *  - Picks right avoiding the same basename as the chosen left (prevents mirrored duplicates),
 *  - Avoids immediate repeats on the right when possible.
 * @param {string[]} leftList
 * @param {string[]} rightList
 * @param {() => number} randFn
 * @returns {() => {left:string, right:string}}
 */
function makeMirroredPairPicker(leftList, rightList, randFn) {
  const nextLeftNoRepeat = makeNoRepeatPicker(leftList, randFn);
  let lastLeft = null;
  let lastRight = null;

  return function nextPair() {
    const left = nextLeftNoRepeat();
    const leftBase = stripExtBase(left);

    const candidates = rightList.filter(p => stripExtBase(p) !== leftBase);
    const rightPool  = candidates.length ? candidates : rightList;

    // Bias away from repeating the most recent right selection.
    let right = null;
    for (let tries = 0; tries < 3; tries++) {
      const idx = Math.floor(randFn() * rightPool.length);
      right = rightPool[idx];
      if (right !== lastRight) break;
    }
    if (right === lastRight && rightPool.length > 1) {
      const alt = rightPool.find(p => p !== lastRight);
      if (alt) right = alt;
    }

    lastLeft = left;
    lastRight = right;
    return { left, right };
  };
}

/**
 * Load a list from a single manifest. The optional coercePath transforms each entry.
 * Returns null on error so callers can fall back to defaults.
 * @param {string} url
 * @param {(x:any) => string} [coercePath]
 * @returns {Promise<string[]|null>}
 */
async function loadListFromManifest(url, coercePath) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest fetch failed');
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty/invalid manifest');
    return arr.map(x => (typeof coercePath === 'function' ? coercePath(x) : x)).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Make a simple no-repeat picker over a list (used for victims/backgrounds/doors).
 * @param {string[]} victimList
 * @param {() => number} randFn
 * @returns {() => string}
 */
function makeSkinPicker(victimList, randFn) {
  let pool = [];
  const refill = () => { pool = shuffleInPlace(victimList.slice(), randFn); };
  refill();

  return function nextSkin() {
    if (pool.length === 0) refill();
    return pool.pop();
  };
}
