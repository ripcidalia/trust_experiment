# Trust Doors — Human–Robot Interaction Experiment

This repository contains the source code for **Trust in Human–Robot Interaction in Search-and-Rescue Scenarios**,  
a browser-based behavioral experiment developed at **Delft University of Technology (TU Delft)** by  
**Pedro Rodrigues Correia da Silva** as part of the MSc Aerospace Engineering — *Control & Simulation* track.

The project implements a full online experimental platform: interactive task logic, condition assignment,  
durable client-side logging, and structured data export for behavioral analysis.

---

## 🧠 Overview

The experiment investigates **trust formation, reliance, and calibration** in human–robot collaboration during simulated  
urban search-and-rescue (USAR) scenarios.

Participants interact with an interactive visual task (“door trials”) in which a **drone agent** scans an environment  
and recommends which door to open. The system measures:

- reliance on the drone’s recommendations
- behavioral adaptation to successes and failures
- changes in trust over time via probes and questionnaires
- effects of environmental risk and reputation cues

The study runs entirely in a browser using **jsPsych 7** and modular JavaScript.

---

## 🧪 Experiment structure

The core behavioral task is implemented as a jsPsych timeline composed of:

1. Reputation exposure (review cards)
2. Pre-task trust questionnaires
3. Demonstration (non-interactive)
4. Three blocks of “door trials”
5. Interleaved trust probes
6. Two mid-task Trust-14 questionnaires
7. Post-task questionnaires and demographics

Each **door trial** includes:

- drone entry and scan animation
- recommendation presentation
- participant decision (follow vs ignore)
- door reveal and outcome feedback
- transition to the next scene

See:
- [`docs/experiment-flow.md`](docs/experiment-flow.md) — full participant timeline  
- [`docs/trials.md`](docs/trials.md) — trial module documentation  

---

## 🏗️ Architecture

The experiment is structured around four main subsystems:

### 1) Configuration
- Central configuration object (`src/config.js`)
- Runtime overrides via URL parameters
- Participant/session identifier management

### 2) Condition sets
- Block/trial definitions stored in `conditions/sets_v1.json`
- Participant-specific set selection via `src/data/sets.js`

### 3) Trial engine
- jsPsych-based task implementation in `src/trials/`
- `doorTrial.js` implements the interactive task
- `blocks.js` assembles blocks and probes into a timeline

### 4) Logging pipeline
- Trial data normalized to event rows
- Durable local queue (IndexedDB → localStorage fallback)
- Batch upload to Google Apps Script receiver
- Deletion support for participant withdrawal

See:
- [`docs/architecture.md`](docs/architecture.md) — system design  
- [`docs/data.md`](docs/data.md) — logging pipeline and schema  
- [`docs/configuration.md`](docs/configuration.md) — experiment parameters  

---

## 📁 Repository structure

| Path | Description |
|------|--------------|
| `/src/` | JavaScript source code for experiment logic |
| `/src/trials/` | Behavioral task trials, probes, and questionnaires |
| `/src/data/` | Condition loading, asset assignment, set selection |
| `/src/logging/` | Durable logging pipeline and row normalization |
| `/src/ui/` | UI fragments, overlays, theming |
| `/src/scene/` | Scene rendering and positioning logic |
| `/styles/` | Component-scoped CSS |
| `/assets/` | Static visual assets |
| `/conditions/` | Predefined block/trial sets |
| `/jspsych/` | Vendored jsPsych library |
| `/docs/` | Full documentation |
| `index.html` | Experiment entry point |

---

## 🚀 Running locally

The experiment runs entirely as a static web application.

### Option 1 — Python (recommended)
```bash
git clone https://github.com/your-username/trust-doors.git
cd trust-doors
python -m http.server 8080
````

Open: [http://localhost:8080](http://localhost:8080)

### Option 2 — Node.js

```bash
npm install -g serve
serve .
```

---

## ⚙️ Configuration

Experiment parameters are controlled through `src/config.js`, including:

* number of trials
* drone reliability
* timing and animation parameters
* environmental risk profiles
* reputation conditions
* training/demo settings

Many values can be overridden at runtime using URL parameters:

Examples:

```
?N=30&p=0.65
?seed=123
?seq=LR,RL,LR
?warmth=hot
?timeout=3500
```

Full reference:
→ [`docs/configuration.md`](docs/configuration.md)

---

## 📊 Data collection and handling

The experiment uses a resilient logging system designed for web-based behavioral studies.

### Client-side

* Rows buffered locally (IndexedDB or localStorage fallback)
* Automatic batching and retry with exponential backoff
* Final best-effort send on page close (sendBeacon)

### Server-side

* Google Apps Script receiver
* Writes to Google Sheets in a structured schema
* Supports participant-level deletion requests

### Withdrawal

Participants may exit at any time and choose to:

* keep their data
* discard their data (local + server deletion request)

Full details:
→ [`docs/data.md`](docs/data.md)

---

## 🎨 UI and theming

The interface uses modular HTML fragments and component-scoped CSS:

* fragments injected dynamically
* consistent layered UI system
* configurable themes and risk-based visual states
* responsive positioning for desktop/laptop use

See:
→ [`docs/ui-structure.md`](docs/ui-structure.md)

---

## 🧩 Development guide

### Common modifications

| Task                    | Where to edit             |
| ----------------------- | ------------------------- |
| Change trial flow       | `src/trials/blocks.js`    |
| Modify door task        | `src/trials/doorTrial.js` |
| Adjust visuals          | `styles/` or `src/ui/`    |
| Change risk/environment | `src/config.js`           |
| Modify condition sets   | `conditions/sets_v1.json` |
| Change logged variables | `src/logging/build.js`    |

### Code conventions

* ES module architecture
* modular CSS (component-scoped)
* descriptive header comments per file
* separation of:

  * UI
  * task logic
  * configuration
  * logging

---

## 🔁 Reuse and extension

The system was designed to be reusable for future HRI experiments:

* swap condition sets
* modify task logic
* replace assets
* extend questionnaires
* adapt logging schema

The modular architecture allows the platform to serve as a foundation for new browser-based behavioral studies.

---

## 🧑‍💻 Author

**Pedro Rodrigues Correia da Silva**
MSc Aerospace Engineering — Control & Simulation Track
Delft University of Technology (TU Delft)
📧 [P.RodriguesCorreiaDaSilva@student.tudelft.nl](mailto:P.RodriguesCorreiaDaSilva@student.tudelft.nl)

**Research supervisor**
Dr. Anahita Jamshidnejad
📧 [A.Jamshidnejad@tudelft.nl](mailto:A.Jamshidnejad@tudelft.nl)

