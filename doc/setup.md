# 🧰 Experiment Setup Guide

This guide explains how to set up, configure, and run the **Trust Doors** experiment locally or on a server.  
It is intended for developers, researchers, or collaborators working on the TU Delft Human–Robot Interaction study.

---

## 1. 🧱 Prerequisites

### Software Requirements
| Tool | Minimum Version | Purpose |
|------|------------------|----------|
| **Python** | 3.7+ | Simple local HTTP server for testing |
| **Node.js (optional)** | 16+ | Alternative server environment |
| **Modern Browser** | Chrome 105+, Firefox 100+, Safari 16+, Edge 105+ | Supports ES Modules and CSS variables |
| **Git** | Latest | Version control and collaboration |

### Folder Structure
Ensure your local clone looks like this:

```
trust-doors/
│
├── index.html
├── styles/
├── jspsych/
├── assets/
├── src/
│   ├── ui/
│   ├── utils/
│   ├── trials/
│   └── data/
└── docs/
```

---

## 2. ⚙️ Installation

### Option A — Python (Recommended for Quick Testing)
```bash
cd trust-doors
python -m http.server 8080
```
Then open:
👉 [http://localhost:8080](http://localhost:8080)

### Option B — Node.js
If you prefer Node’s static server:
```bash
npm install -g serve
serve .
```

---

## 3. 🧠 Understanding the Startup Flow

When `index.html` loads:

1. **UI fragments** are injected dynamically using `/src/ui/fragments.js` (loading consent form, overlays, etc.).  
2. The `bootstrap()` function (in `/src/main.js`) initializes:
   - Participant ID management (`config.js`)
   - Consent handling and fullscreen request  
   - jsPsych experiment setup and timeline construction  
   - Logging and safe-exit handlers  

3. The experiment preloads all visual assets (drone, fire/smoke, doors, etc.) before starting.  

---

## 4. 🔧 Configuration Options

Edit `/src/config.js` to change experiment behavior.  
Below are common parameters to customize:

| Variable | Description | Default |
|-----------|--------------|----------|
| `CONFIG.N` | Number of trials | `20` |
| `CONFIG.drone_success_rate` | Probability of correct drone advice | `0.75` |
| `CONFIG.decision_timeout_ms` | Time allowed for participant decision | `4000` |
| `CONFIG.training.enabled` | Enable or disable the demo block | `true` |
| `CONFIG.review_condition` | Fixed review condition, or `null` for random | `null` |
| `CONFIG.env_warmth` | Scene color theme (`cool`, `warm`, `hot`) | `'warm'` |

You can override configuration via **URL parameters**. Examples:

```
?N=10&seed=42
?p=0.6&review_condition=slightly_negative
?train=0&timeout=5000
```

---

## 5. 🧩 Adding or Editing Trials

Trials are modular and live under `/src/trials/`.

| File | Purpose |
|------|----------|
| `doorTrial.js` | Main decision-making task with drone animation |
| `trust40.js` | 40-item trust questionnaire |
| `trustProbe.js` | Single trust calibration questions |
| `overview.js` | Introductory instructions |
| `ready.js` | Transition from questionnaire to main task |

Each trial follows the jsPsych 7 plugin format.  
For a new trial, duplicate one and edit its structure or stimuli.

---

## 6. 💾 Data Logging

Data are stored in an in-memory buffer and periodically flushed to a remote endpoint via asynchronous upload.  
If the user exits early, the system asks whether to **keep** or **discard** data.  
Discarding triggers a cleanup using `requestDeleteByParticipant()`.

See [`docs/data-handling.md`](data-handling.md) for more detail.

---

## 7. 🔍 Debugging and Testing

- Press **Ctrl + Shift + X** → Opens the exit modal manually.
- Use `?train=1` to test training scenes only.
- Open Developer Tools → Console → Watch for logs tagged `[TrustDoors]`.

To reset your local session and PID:
```js
localStorage.clear()
location.reload()
```

---

## 8. 🌍 Deployment Notes

For remote hosting (e.g., TU Delft server or GitHub Pages):

1. Upload all files preserving folder structure.  
2. Ensure all `.js` files are served with `Content-Type: text/javascript`.  
3. The experiment must be accessed over **HTTPS** for correct fullscreen behavior and data uploads.  
4. You can append parameters in URLs sent to participants (e.g., `?set=SetA&seed=123`).

---

## 9. 🧑‍💻 Maintenance Tips

- Use **semantic versioning** for changes: `v1.0.0`, `v1.1.0`, etc.  
- Keep CSS modular: one file per visual component.  
- Comment all nontrivial JS logic following the project’s standard (concise + functional context).  
- Test both desktop and mobile layouts after UI updates.

---

**Next steps:**  
See [`docs/ui-structure.md`](ui-structure.md) and [`docs/data-handling.md`](data-handling.md) for deeper explanations.
