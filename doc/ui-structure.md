# 🧩 User Interface Structure and Flow

This document describes how the **Trust Doors** experiment’s user interface (UI) is structured, both from a **technical** and **participant-facing** perspective.

The UI is modular, dynamically loaded, and organized around **HTML fragments**, **CSS components**, and **JavaScript orchestration**.  
This ensures that the experiment runs consistently across devices, preserves layering order, and allows fine-grained control over visuals.

---

## 1. 🧱 Technical Overview

The UI is not built directly into `index.html` — instead, it is composed of **HTML fragments** that are dynamically injected into the DOM by `loadUIFragments()` from `/src/ui/fragments.js`.

This modular approach improves maintainability and ensures that z-index layering (e.g., overlays above scenes) remains predictable.

### Fragment loading order

```js
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
```

Each fragment is fetched **without caching** (`cache: 'no-store'`) to ensure live updates during development.

---

## 2. 🧭 UI Layer Hierarchy (Z-Index Map)

| Layer | Component | z-index | Description |
|--------|------------|----------|--------------|
| 0–1 | Scene background and doors | 0–2 | Base trial environment |
| 3 | Drone scan cone (`.scan-cone`) | 3 | Animated perception field |
| 4 | Drone sprite (`.overlay-drone`) | 4 | 3D hover animation with rotors |
| 46–47 | Fire and smoke FX (`.fx-layer`) | 46–47 | Dynamic environmental effects |
| 50 | Decision box | 50 | Participant decision HUD |
| 60 | Mission result panel | 60 | Success/failure summary overlay |
| 100 | Scene warmth overlay | 100 | Color tone adjustment |
| 10,011–10,020 | Trial counter, blackout layer | 10011–10020 | HUD and transitions |
| 20,050–20,060 | Exit modal and button | 20050–20060 | Highest layer; emergency controls |

This structured stack avoids conflicts and keeps overlays visible in intended order during transitions or animations.

---

## 3. 🧩 HTML Fragments and Their Roles

| Fragment | ID | Description |
|-----------|----|-------------|
| `consent-screen.html` | `#consent-screen` | Participant information and consent UI (first screen shown). |
| `rotate-gate.html` | `#rotate-gate` | Mobile-only landscape orientation gate. |
| `jspsych-target.html` | `#jspsych-target` | Container where jsPsych renders tasks. |
| `loading-overlay.html` | `#loadingOverlay` | Spinner shown while assets and trials preload. |
| `exit-button.html` | `#exit-btn` | Persistent “Exit” button shown during tasks. |
| `exit-modal.html` | `#exit-modal` | Modal confirming exit choice (resume, keep, discard). |
| `final-screen.html` | `#final-screen` | Shown at end of experiment. |
| `final-keep-screen.html` | `#final-keep-screen` | Early exit (data kept). |
| `final-discard-screen.html` | `#final-discard-screen` | Early exit (data discarded). |
| `blackout.html` | `#blackout` | Smooth black fade between trials. |
| `mobile-choices.html` | `#mobile-choices` | Touch-optimized decision interface (left/right) for mobile users. |

---

## 4. 🎨 CSS Architecture

Each CSS file corresponds to one **functional component** or **visual subsystem**.

| File | Purpose |
|------|----------|
| `base.css` | Global font, background, and viewport adjustments. |
| `variables.css` | Defines global CSS custom properties (colors, safe areas). |
| `layout.css` | Manages jsPsych container layout, consent card layout, and buttons. |
| `decision-box.css` | Styles for the in-trial decision HUD and environmental integrity bar. |
| `drone.css` | Drone visuals, hover animation, and rotor spin. |
| `cone.css` | Drone “thinking cone” with gradient and grid effects. |
| `fx.css` | Fire and smoke particle animation layers. |
| `warmth.css` | Scene color tone overlays (cool/warm/hot). |
| `mission-panel.css` | End-of-trial success/failure message box. |
| `blackout.css` | Fade-to-black transition layer. |
| `exit-modal.css` | Exit confirmation modal and button. |
| `mobile.css` | Layout tweaks for mobile devices. |
| `shake.css` | Camera shake effect under risk. |
| `jspsych-overrides.css` | Fixes background flicker between trials. |

---

## 5. 👩‍🔬 Participant Flow

### Phase 1 — Consent
Participants read the consent form (`consent-screen.html`) and start the experiment by pressing **“I consent — Start experiment.”**

### Phase 2 — Device Orientation Check (Mobile only)
`rotate-gate.html` ensures the device is rotated to landscape and meets width requirements.

### Phase 3 — Loading Overlay
`loadingOverlay` appears briefly while the experiment and assets initialize.

### Phase 4 — Main Task
jsPsych renders the task sequence into `#jspsych-target`, including:
- Drone guidance animations  
- Door decisions  
- Environmental changes (fire, smoke, warmth)  
- Confidence or trust rating sliders

Participants may exit anytime via the **Exit** button.

### Phase 5 — Exit Flow
Upon pressing **Exit**, the `exit-modal` gives three options:
1. **Resume**
2. **Exit & keep data**
3. **Exit & discard data**

Depending on choice, one of three end screens appears.

### Phase 6 — Final Screen
Shows a closing message after all trials complete or early exit.

---

## 6. 🧠 Accessibility and UX Considerations

- All dynamic overlays use `aria-live` and `aria-hidden` attributes where applicable.  
- High-contrast backgrounds ensure legibility in dim settings.  
- Mobile UI minimizes motion and applies `prefers-reduced-motion` rules.  
- Buttons use large hit targets (`>44px`) for accessibility compliance.  
- All interactive elements are keyboard-accessible on desktop.

---

## 7. ⚙️ Dynamic Behaviors (Driven by JS)

| Function | Source | Role |
|-----------|---------|------|
| `waitForMobileGate()` | `/src/utils/misc.js` | Waits until device is in correct orientation. |
| `mulberry32(seed)` | `/src/utils/misc.js` | Deterministic RNG for reproducible trials. |
| `loadUIFragments()` | `/src/ui/fragments.js` | Loads all HTML UI fragments dynamically. |
| `blackout.show()` | `/src/ui/blackout.js` | Fades in/out between trials. |
| `setDecisionBoxMode()` | `/src/ui/decisionBox.js` | Switches between compact and expanded decision modes. |
| `triggerShake()` | `/src/ui/sceneFX.js` | Adds temporary camera shake under high risk. |

---

## 8. 🧾 Summary

The UI of **Trust Doors** follows a **layered, modular, and accessible design philosophy**:

- **Layered** → Each element is visually stacked for clarity and motion.  
- **Modular** → All screens are reusable HTML fragments.  
- **Accessible** → Consistent keyboard/mouse/touch UX across devices.  
- **Dynamic** → Controlled entirely via JavaScript, with clean transitions.

---

For visual layout diagrams and motion timing charts, see `docs/ui-animations.md` (optional supplementary file).
