# CLAUDE.md — WingOpt Project

> Auto-maintained by Claude. Updated whenever project changes are made.
> Last updated: 2026-03-26

---

## Project Overview

**WingOpt** is a full-stack AI-assisted aerodynamic design tool for Formula-style front wings. It implements a complete ML-physics pipeline from scratch: physics simulation → Latin Hypercube dataset → ML surrogate training → NSGA-II multi-objective optimization → physics validation → Flask REST API → React interactive dashboard.

**Repository root:** `C:\Users\ual-laptop\wing-optimizer\wing-optimizer\`

## Deployment

| Service | URL |
|---------|-----|
| **Frontend (Vercel)** | https://frontend-five-beige-e9u7r18z93.vercel.app |
| **Backend (Railway)** | https://wing-optimizer-production.up.railway.app |
| **GitHub** | https://github.com/nezaesm/wing-optimizer |

- Frontend deployed from `frontend/` — Vite build, SPA rewrites via `frontend/vercel.json`
- Backend deployed from `backend/` on Railway — gunicorn binds to `$PORT` (Railway sets `PORT=8080`)
- `VITE_API_URL` set in Vercel env vars → points to Railway backend
- To redeploy frontend: `npx vercel deploy --prod` from `frontend/`
- To update backend: push to `master` branch — Railway auto-deploys from GitHub

---

## Architecture

```
wing-optimizer/
├── backend/                  # Python Flask API
│   ├── main.py               # Flask app — 22 REST endpoints (14 original + 8 new)
│   ├── config.py             # All constants: flow conditions, param bounds, paths
│   ├── analysis/
│   │   ├── aero_solver.py    # Core aerodynamic physics (Glauert + Thwaites BL)
│   │   ├── aero_metrics.py   # evaluate_design(), compare_to_baseline()
│   │   └── batch_evaluator.py# LHS dataset generation
│   ├── fidelity/             # Multi-fidelity evaluation stack
│   │   ├── base.py           # FidelityLevel enum, FidelityResult dataclass, abstract base
│   │   ├── level0.py         # L0 conceptual screening (wraps aero_metrics, ±18-28% uncertainty)
│   │   ├── level1_cfd.py     # L1 2D section RANS via SU2 (stub if SU2 not installed)
│   │   └── level2_cfd.py     # L2 3D full-wing RANS via OpenFOAM (stub + HPC hooks)
│   ├── geometry/
│   │   ├── naca_generator.py # NACA 4-series profile + flap geometry
│   │   ├── wing_definition.py# WingDefinition multi-element parametrization (mainplane+flap+gurney+endplate)
│   │   └── geometry_validator.py # ValidationReport with error/warning classification
│   ├── conditions/
│   │   ├── condition_set.py  # OperatingPoint, ConditionSet, 5 named sets (race/sweep/envelope)
│   │   └── evaluator.py      # MultiConditionEvaluator — weighted aggregation + sensitivity flags
│   ├── constraints/
│   │   └── engine.py         # ConstraintEngine — geometric/aero/packaging/robustness checks
│   ├── models/
│   │   ├── train.py          # Trains XGBoost, GP, MLP
│   │   ├── predict.py        # predict_all(), get_model_metrics(), get_shap_importance()
│   │   ├── surrogate.py      # EnsembleSurrogate with GP uncertainty, UCB acquisition score
│   │   └── saved/            # xgboost.joblib, gp.joblib, mlp.joblib
│   ├── cfd/
│   │   ├── case_builder.py   # CaseBuilder dispatcher (L1/L2)
│   │   ├── runner.py         # CFDRunner — local/async/HPC execution hooks
│   │   ├── parser.py         # ResultParser — SU2 history.csv + OpenFOAM postProcessing
│   │   └── artifact_store.py # ArtifactStore — indexed run metadata + result storage
│   ├── optimization/
│   │   ├── nsga2_runner.py   # NSGA-II from scratch
│   │   └── hybrid_pipeline.py# 7-stage hybrid: LHS→L0→surrogate NSGA-II→constraints→L1→L2→rank
│   ├── data/
│   │   ├── sampler.py        # Latin Hypercube Sampling
│   │   ├── pipeline.py       # train/val/test split + feature engineering
│   │   └── processed/        # CSV splits
│   ├── results/              # JSON results + artifact store
│   ├── requirements.txt      # flask, numpy, scipy, pandas, scikit-learn, joblib, gunicorn
│   └── Procfile              # gunicorn main:app (production)
│
└── frontend/                 # React + Vite + TailwindCSS
    ├── index.html            # Entry HTML — loads Google Fonts (Syne, Outfit, JetBrains Mono)
    ├── vite.config.js        # Vite config
    ├── tailwind.config.js    # Fonts: Syne (display), Outfit (sans), JetBrains Mono. Colors: carbon (950→400), neon (blue/cyan/green/amber/red) — updated to electric palette
    ├── src/
    │   ├── main.jsx          # React entry — BrowserRouter wrapping
    │   ├── App.jsx           # Nav shell — desktop top nav + mobile bottom tab bar + slide-in drawer
    │   ├── index.css         # Design system: glassmorphism cards, neon accents, tooltips, animations
    │   ├── api/client.js     # All API calls — BASE = VITE_API_URL || '/api'
    │   ├── components/ui.jsx # Shared primitives (see component list below)
    │   └── pages/
    │       ├── Design.jsx    # Step 1 — 8-param sliders in 3 groups, wing preview, physics/ML results
    │       ├── Train.jsx     # Step 2 — R² metrics, per-target bar chart, SHAP importance
    │       ├── Optimize.jsx  # Step 3 — NSGA-II config/run, Pareto scatter, convergence history
    │       ├── Validate.jsx  # Step 4 — physics re-evaluation of top Pareto designs
    │       ├── Sensitivity.jsx # Step 5 — tornado chart + one-at-a-time curves
    │       ├── Dataset.jsx   # Step 6 — LHS dataset stats, parameter coverage
    │       └── About.jsx     # Portfolio page — pipeline diagram, skills, tech stack
    ├── .env.example          # VITE_API_URL=http://localhost:8000
    └── .env.local            # Local dev config (not committed)
```

---

## Running the Project

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py              # dev server on http://localhost:8000
# or: gunicorn main:app     # production
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # set VITE_API_URL=http://localhost:8000
npm run dev                 # Vite dev server — usually http://localhost:5173
```

### Full pipeline (first time)
```bash
# 1. Generate dataset (takes ~2 min)
python backend/analysis/batch_evaluator.py

# 2. Train ML models
python backend/models/train.py

# 3. Start API + frontend
python backend/main.py &
cd frontend && npm run dev
```

---

## API Endpoints (backend/main.py)

### Original endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{status, models_loaded}` |
| GET | `/design/baseline` | Baseline NACA 4412 inverted metrics |
| POST | `/design/evaluate` | Run L0 physics solver on wing params |
| POST | `/design/geometry` | Generate SVG geometry coordinates |
| POST | `/design/sweep` | AoA polar sweep |
| POST | `/predict` | ML ensemble prediction |
| GET | `/models/metrics` | R², RMSE per model + SHAP |
| POST | `/optimize` | Run NSGA-II (surrogate-only) |
| GET | `/optimize/results` | Load saved Pareto front |
| POST | `/validate` | L0-validate top N Pareto designs |
| GET | `/validate/results` | Load saved validation results |
| GET | `/sensitivity` | Single-param OAT sweep |
| GET | `/sensitivity/all` | All-params OAT sweep |
| GET | `/dataset/stats` | Training dataset statistics |

### New multi-fidelity endpoints (v4)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/fidelity/evaluate` | body: `{params, level, condition}` — run L0/L1/L2 evaluator |
| POST | `/fidelity/multi-condition` | body: `{params, condition_set}` — evaluate over named condition set |
| POST | `/fidelity/validate-geometry` | body: WingParams — run geometry validator, return report |
| POST | `/predict/uncertain` | body: WingParams — surrogate + GP uncertainty + trust label |
| POST | `/optimize/hybrid` | body: `{n_init, n_pareto, enable_l2}` — 7-stage hybrid pipeline |
| POST | `/constraints/check` | body: `{params, metrics}` — run constraint engine |
| GET | `/cfd/status/<run_id>` | Get CFD run record from artifact store |
| GET | `/cfd/artifacts` | List recent CFD run records |

---

## Design Parameters

| Parameter | Range | Unit | Description |
|-----------|-------|------|-------------|
| `camber_pct` | 0–9 | % | Max camber (chord curvature) |
| `camber_pos_pct` | 20–60 | %c | Position of max camber |
| `thickness_pct` | 6–20 | % | Max section thickness |
| `aoa_deg` | −18–0 | ° | Angle of attack (negative = downforce) |
| `flap_angle_deg` | 0–35 | ° | Trailing-edge flap deflection |
| `flap_chord_pct` | 20–35 | %c | Flap size as fraction of chord |
| `aspect_ratio` | 2–5.5 | — | Span² / area |
| `endplate_h_pct` | 5–30 | %b | Endplate height as % span |

---

## ML Models

| Model | R² (mean) | Inference | Purpose |
|-------|-----------|-----------|---------|
| XGBoost | ~0.97 | <1 ms | Primary surrogate + SHAP analysis |
| Gaussian Process | ~0.95 | ~5 ms | Uncertainty quantification |
| MLP (128-64-32) | ~0.99 | <1 ms | Deep learning baseline |
| Ensemble | best | <1 ms | Average of all 3 |

Targets: `Cl`, `Cd`, `Cl_Cd`, `downforce_N`, `drag_N`, `efficiency`

---

## Multi-fidelity Stack

| Level | Name | Solver | Uncertainty | Notes |
|-------|------|--------|-------------|-------|
| L0 | Conceptual Screening | Panel method + Thwaites BL | ±18–28% | Always available, ~50ms |
| L1 | 2D Section CFD | SU2 RANS (SA turbulence) | ±4–8% | Requires SU2 install; stub mode otherwise |
| L2 | 3D Full-wing RANS | OpenFOAM simpleFoam | ±2–5% | Requires HPC; stub mode for local dev |

Trust labels: `high` (dist < 1.2σ), `moderate` (< 2σ), `low` (< 3σ), `extrapolation` (> 3σ)

## Frontend Component Library (src/components/ui.jsx)

| Component | Props | Purpose |
|-----------|-------|---------|
| `Spinner` | `size, className` | Loading indicator |
| `InfoTooltip` | `text, wide` | Hover `?` with plain-English explanation |
| `BeginnerTip` | `children, icon` | Blue callout box for newcomers |
| `MetricCard` | `label, value, unit, delta, color, tooltip, icon` | KPI card with glow + delta indicator |
| `ParamSlider` | `label, name, min, max, step, value, unit, onChange, description, tooltip` | Styled range input |
| `AccordionGroup` | `title, icon, children, tooltip, defaultOpen, summary` | Collapsible parameter section — shows summary when closed |
| `ParamGroup` | `title, icon, children, tooltip` | Non-collapsible labeled section for sliders |
| `WingCanvas` | `geometry, height` | SVG 2D wing cross-section renderer |
| `StatusBadge` | `ok, label, tooltip` | Green/red status pill |
| `ErrorBox` | `message` | Red error callout |
| `SectionTitle` | `children, sub, step` | Page heading with step number |
| `DataRow` | `label, value, unit, highlight, tooltip` | Key-value row |
| `ChartTooltip` | Recharts payload | Styled Recharts tooltip |
| `LoadingPage` | `label` | Full-page spinner |
| `EmptyState` | `icon, title, body, action` | Empty/zero-state card |
| `ProgressBar` | `value, max, color, showLabel` | Horizontal progress bar |
| `FidelityBadge` | `level, label, trust, converged` | Shows L0/L1/L2 fidelity level + converged status |
| `TrustLabel` | `trust` | Pill badge: high/moderate/low/extrapolation/stub |
| `ConfidenceBar` | `confidence, label, stdPct` | GP confidence bar with ± std display |
| `ConstraintPanel` | `summary` | Collapsible constraint check results (pass/warn/fail) |
| `ConditionSelector` | `value, onChange` | Named condition set picker (race/sweep/envelope) |

---

## CSS Design System (src/index.css + tailwind.config.js)

### Colors
- `carbon-{950,900,800,700,600,500,400}` — dark background scale
- `neon-{blue,cyan,green,amber,red}` — accent colors

### Key CSS Classes
- `.card` / `.card-sm` — glassmorphism cards with `backdrop-blur`
- `.card-glow-blue/green/amber` — colored box-shadow glow
- `.card-highlight` — selected/active state border + glow
- `.btn-primary` — gradient blue button
- `.btn-secondary` — ghost blue button
- `.btn-ghost` — neutral ghost button
- `.label` — mono uppercase tracking label
- `.badge` + `.badge-{blue,green,amber,red,gray}` — pill badges
- `.tip-box` — beginner callout box
- `.progress-track` / `.progress-fill` — progress bar
- `.gradient-text-blue` — gradient clip text effect
- `.neon-text-{blue,cyan,green,amber,red}` — neon colored text
- `.input-field` — styled form input
- `.animate-fade-in/slide-up/slide-in` — entrance animations
- `.stagger` — auto-delays animation on children 1–6
- `.tooltip-trigger` + `.tooltip-bubble` — CSS hover tooltip system
- `.wing-glow` — pulsing SVG drop-shadow animation
- `.status-pulse` — pulsing dot animation

---

## Key Design Decisions

- **No XFoil dependency** — custom Python physics solver for portability and speed
- **LHS over random sampling** — ensures even 8D design space coverage
- **Ensemble ML prediction** — averages XGBoost + GP + MLP for robustness
- **Physics validation loop** — closes the trust gap between ML predictions and reality
- **InfoTooltip on every technical term** — hover `?` icon explains jargon in plain English
- **Step-numbered nav** — navigation pills 1–6 show where each page fits in the pipeline
- **BeginnerTip callouts** — each page starts with a plain-English "what is this?" box
- **Grouped sliders** — Design page splits 8 params into Airfoil Shape / Aerodynamic Settings / Wing Geometry
- `VITE_API_URL` env var — switches between local (`localhost:8000`) and deployed backend

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | Backend base URL. Set to `http://localhost:8000` for local dev. |

---

## Known Issues / Notes

- `postcss.config.js` triggers a Node.js `MODULE_TYPELESS_PACKAGE_JSON` warning — add `"type": "module"` to `package.json` to silence it (cosmetic only)
- Railway backend listens on port **8080** (auto-assigned via `$PORT`). Domain networking in Railway must be set to port 8080, not 8000
- Vite port auto-increments if 5173/5174 are in use — check terminal output for actual port
- GP model inference is ~5ms vs <1ms for XGBoost/MLP — acceptable but noticeable on slow hardware
- `hover:card-glow-blue` Tailwind variant on custom component classes doesn't apply (Tailwind limitation) — hover effects work via `.metric-card:hover` in CSS instead

---

## Changelog

### 2026-03-26 (v5 — Mobile responsiveness)
- **App.jsx**: Fixed bottom tab bar on mobile with step badges + active indicator; slide-in hamburger drawer with full nav + API status; desktop nav unchanged; `env(safe-area-inset-*)` for notched phones
- **index.css**: Mobile media query block — 48px min tap targets, 16px inputs (prevents iOS zoom), 24px slider thumbs, disabled hover lifts on touch, hidden scrollbars, touch-friendly accordion headers
- **Design.jsx**: Single-column stack on mobile → 3-column grid on desktop; metrics grid 2-col mobile / 3-col desktop; all `col-span-N` → `md:col-span-N`

### 2026-03-25 (v4 — Multi-fidelity engineering upgrade)
- **Multi-fidelity stack**: L0 (conceptual panel/BL), L1 (2D RANS SU2), L2 (3D RANS OpenFOAM) evaluators with `FidelityResult` dataclass, stub-mode auto-detection, provenance tracking + trust labels
- **Multi-element geometry**: `WingDefinition` with mainplane, flap, gurney flap, endplates; `GeometryValidator` with error/warning classification
- **Multi-condition evaluation**: `ConditionSet` with 5 named sets (race/AoA/ride-height/yaw/full-envelope), `MultiConditionEvaluator` with weighted aggregation + sensitivity flags
- **Constraint engine**: geometric/aero/packaging/robustness checks with `ConstraintResult` severity levels
- **Uncertainty-aware surrogate**: `EnsembleSurrogate` with GP posterior std, Mahalanobis extrapolation detection, UCB acquisition score for active learning
- **CFD automation**: `CFDRunner` (local/async/HPC), `ResultParser` (SU2 + OpenFOAM), `ArtifactStore` with indexed run metadata
- **Hybrid pipeline**: 7-stage optimization: LHS → L0 screening → surrogate NSGA-II → constraint filtering → L1 CFD → optional L2 → final ranking
- **8 new API endpoints**: `/fidelity/evaluate`, `/fidelity/multi-condition`, `/fidelity/validate-geometry`, `/predict/uncertain`, `/optimize/hybrid`, `/constraints/check`, `/cfd/status/<id>`, `/cfd/artifacts`
- **Engineering cockpit UI**: `FidelityBadge`, `TrustLabel`, `ConfidenceBar`, `ConstraintPanel`, `ConditionSelector` components
- **Design page**: L0 badge + constraint panel + uncertainty prediction panel with GP std display
- **Optimize page**: mode switcher (NSGA-II vs Hybrid Pipeline), hybrid config + per-candidate fidelity results
- **Validate page**: honest L0 labeling with pointer to hybrid pipeline for higher-fidelity validation
- All result labels updated for technical honesty (no "ground truth" claim for L0 results)

### 2026-03-25 (v3 — Aerospace Grade redesign)
- Complete high-end UI/UX redesign — "Aerospace Grade Precision" aesthetic:
  - **Fonts**: Syne (display/headings) + Outfit (body) + JetBrains Mono (data) — replaces Space Grotesk + DM Sans
  - **Colors**: Updated neon palette to electric arc-blue (#00c8ff), teal (#00e5cc), phosphor-green (#39ff88), ember-amber (#ffb020), signal-red (#ff3d5a)
  - **Cards**: Multi-layer depth shadows (contact + ambient + depth), top-edge specular highlight, hover lift + glow
  - **Background**: Grain noise overlay (SVG feTurbulence, 3% opacity) + tri-color radial gradient bloom
  - **Logo**: Redesigned — delta wing SVG mark with arc→teal gradient stroke glow + "WINGOPT" Syne 800 wordmark
  - **Navigation**: Cleaner pill nav with step numbers, metallic active state, no text clutter
  - **`AccordionGroup`** component added — collapsible parameter sections with chevron animation + summary on close
  - `Design.jsx`: Parameters now in 3 accordion sections (Wing Geometry collapsed by default), cleaner layout
  - All inline Tailwind classes updated to use CSS variables for color consistency
  - Scanline, wing-glow, status-pulse, stagger animations refined
  - Button styles: metallic gradient primary, arc-border secondary, ghost ghost

### 2026-03-25 (v2)
- Fixed `HistogramData` invalid recharts import in `Dataset.jsx` (removed — not a real export)
- Full frontend UI/UX overhaul (v1→v2):
  - New CSS design system: glassmorphism cards, gradient buttons, tooltip system, stagger animations
  - Added `InfoTooltip`, `BeginnerTip`, `ParamGroup`, `LoadingPage`, `EmptyState`, `ProgressBar` components
  - `App.jsx`: step-numbered nav, gradient accent line, offline banner
  - `Design.jsx`: sliders grouped into 3 categories, ML panel with per-model descriptions, button explainer card
  - `Train.jsx`: R² explainer card, model grade badges, speedup comparison
  - `Optimize.jsx`: Pareto front explanation, efficiency-colored dots, estimated run time display
  - `Validate.jsx`: physics vs ML side-by-side comparison, error % highlighting
  - `Sensitivity.jsx`: ranked tornado with position numbers, descriptive text, gradient sparklines
  - `Dataset.jsx`: LHS explanation, improved stats table, parameter coverage bars
  - `About.jsx`: hero with key results, color-coded pipeline diagram, hover effects
