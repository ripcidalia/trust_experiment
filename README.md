# Trust Doors — Human–Robot Interaction Experiment

This repository contains the source code for **Trust in Human–Robot Interaction in Search-and-Rescue Scenarios**,  
a browser-based behavioral experiment developed at **Delft University of Technology (TU Delft)** by  
**Pedro Rodrigues Correia da Silva** as part of the MSc Aerospace Engineering — *Control & Simulation* track.

---

## 🧠 Overview

The experiment investigates **trust formation and calibration** in human–robot collaboration during simulated  
urban search-and-rescue (USAR) scenarios. Participants interact with a visual task (“door trials”) in which  
a **drone agent** provides advice about which door to choose. The system measures how participants use, rely on,  
and recalibrate trust based on the drone’s behavior and outcome feedback.

The study runs entirely in a browser, built using **[jsPsych 7](https://www.jspsych.org/)** and custom JavaScript modules.

---

## 📁 Repository Structure

| Path | Description |
|------|--------------|
| `/src/` | JavaScript source code for experiment logic, UI, and data handling |
| `/src/ui/` | User interface fragments, overlays, and theming |
| `/src/trials/` | Definitions of each experimental trial (e.g., trust probes, door tasks) |
| `/src/utils/` | Helper utilities (randomization, device gating, etc.) |
| `/styles/` | Modular CSS for all visual components |
| `/assets/` | Static resources such as images, icons, and textures |
| `/jspsych/` | Local jsPsych library and plugins |
| `index.html` | Main HTML entry point for the web experiment |
| `/docs/` | Extended documentation (setup, experiment flow, data handling, etc.) |

---

## 🚀 Running Locally

You can run the experiment locally using any static web server.

### Option 1 — Python (recommended)
```bash
git clone https://github.com/your-username/trust-doors.git
cd trust-doors
python -m http.server 8080
```
Then open [http://localhost:8080](http://localhost:8080) in your browser.

### Option 2 — Node.js
```bash
npm install -g serve
serve .
```

---

## 🧱 Dependencies

- [jsPsych 7.x](https://www.jspsych.org/)
- A modern browser supporting ES Modules (Chrome, Edge, Firefox, Safari 16+)
- Optional: local HTTP server (for development/testing)

---

## 📊 Data Collection and Ethics

- **Anonymity:** No names, IP addresses, or personal identifiers are recorded.  
- **Collected Data:** Task responses, reaction times, and trial-level metadata.  
- **Storage:** Data are buffered locally and periodically uploaded via asynchronous logging.  
- **Withdrawal:** Participants may exit anytime and choose to keep or discard their data.

Full details are in [`docs/data-handling.md`](docs/data-handling.md).

---

## 🧩 UI and Theming

The interface uses modular HTML fragments injected dynamically to keep a consistent, layered UI.  
Each UI fragment (e.g., consent form, exit modal, loading overlay) lives in `/html/` and is inserted  
via the function `loadUIFragments()` in `/src/ui/fragments.js`.

Visual style is controlled through `/styles/` — one CSS file per component (e.g., `drone.css`, `decision-box.css`).

See [`docs/ui-structure.md`](docs/ui-structure.md) for a diagram and explanation.

---

## 🧪 Development Workflow

### Common tasks
- **Edit trial flow:** Modify `/src/trials/blocks.js` or individual trial files.
- **Adjust theme:** Update `/styles/theme.css` or `/src/ui/theme.js`.
- **Add new conditions:** Configure `/src/config.js`.

### Code style
- All JavaScript uses ES modules.
- CSS files are component-scoped with consistent variable naming (`--bg`, `--accent`, etc.).
- Inline comments follow professional standards for clarity and maintainability.

---

## 🧑‍💻 Author

**Pedro Rodrigues Correia da Silva**  
MSc Aerospace Engineering — Control & Simulation Track  
Delft University of Technology (TU Delft)  
📧 [P.RodriguesCorreiaDaSilva@student.tudelft.nl](mailto:P.RodriguesCorreiaDaSilva@student.tudelft.nl)

Research Supervisor: **Dr. Anahita Jamshidnejad**  
📧 [A.Jamshidnejad@tudelft.nl](mailto:A.Jamshidnejad@tudelft.nl)

