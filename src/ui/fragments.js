/**
 * @file src/ui/fragments.js
 * @description
 * Loads static HTML fragments into the DOM to assemble the experiment shell.
 * Fragments are inserted sequentially to preserve z-index layering and
 * visibility order (e.g., overlays above jsPsych target).
 *
 * Each fragment defines:
 *  - url: path to the HTML partial
 *  - where: CSS selector for the insertion parent (default: 'body')
 *  - position: Insert position relative to the parent
 *
 * The default list includes overlays, end screens, modals, and the jsPsych container.
 */

/** Ordered fragment list to ensure consistent visual stacking. */
const FRAGMENTS = [
  { url: 'html/loading-overlay.html',      where: 'body', position: 'afterbegin' },
  { url: 'html/consent-screen.html',       where: 'body', position: 'beforeend' },
  { url: 'html/rotate-gate.html',          where: 'body', position: 'beforeend' },
  { url: 'html/jspsych-target.html',       where: 'body', position: 'beforeend' },
  { url: 'html/final-screen.html',         where: 'body', position: 'beforeend' },
  { url: 'html/final-keep-screen.html',    where: 'body', position: 'beforeend' },
  { url: 'html/final-discard-screen.html', where: 'body', position: 'beforeend' },
  { url: 'html/exit-button.html',          where: 'body', position: 'beforeend' },
  { url: 'html/mobile-choices.html',       where: 'body', position: 'beforeend' },
  { url: 'html/exit-modal.html',           where: 'body', position: 'beforeend' },
  { url: 'html/blackout.html',             where: 'body', position: 'beforeend' }
];

/**
 * Insert a single HTML fragment into the specified location.
 * @param {Object} options
 * @param {string} options.url - Path to the HTML file.
 * @param {string} [options.where='body'] - CSS selector for parent container.
 * @param {InsertPosition} [options.position='beforeend'] - Position relative to parent.
 */
async function insertFragment({ url, where = 'body', position = 'beforeend' }) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load fragment: ${url} (${res.status})`);
  const html = await res.text();

  const host = where === 'body' ? document.body : document.querySelector(where);
  if (!host) throw new Error(`Host '${where}' not found for fragment ${url}`);

  host.insertAdjacentHTML(position, html);
}

/**
 * Sequentially load and insert all UI fragments.
 * Ensures correct z-index stacking and DOM order.
 */
export async function loadUIFragments() {
  for (const f of FRAGMENTS) {
    await insertFragment(f);
  }
}
