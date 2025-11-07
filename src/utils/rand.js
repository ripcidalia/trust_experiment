/**
 * @file src/utils/rand.js
 * @description
 * Randomization utilities.
 * Currently provides an in-place-safe array shuffle using the Fisher–Yates algorithm.
 */

/**
 * Return a shuffled copy of an array without mutating the original.
 * Uses the Fisher–Yates shuffle with Math.random().
 *
 * @template T
 * @param {T[]} a - Source array.
 * @returns {T[]} New shuffled array.
 */
export function shuffleArray(a) {
  const b = a.slice(); // copy to avoid mutating original
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
