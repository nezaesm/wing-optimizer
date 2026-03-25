# CLAUDE.md — WingOpt Project

> Auto-maintained by Claude. Updated whenever project changes are made.
> Last updated: 2026-03-25

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
│   ├── main.py               # Flask app entry point — 14 REST endpoints
│   ├── config.py             # All constants: flow conditions, param bounds, paths
│   ├── analysis/
│   │   ├── aero_solver.py    # Core aerodynamic physics (Glauert + Thwaites BL)
│   │   ├── aero_metrics.py   # evaluate_design(), compare_to_baseline()
│   │   └── batch_evaluator.py# LHS dataset generation — runs physics on N_SAMPLES designs
│   ├── geometry/
│   │   └── naca_generator.py # NACA 4-series profile + flap geometry generator
│   ├── data/
│   │   ├── sampler.py        # Latin Hypercube Sampling implementation
│   │   ├── pipeline.py       # train/val/test split + feature engineering
│   │   ├── db.sqlite         # SQLite database for results
│   │   └── processed/        # CSV/Parquet splits (train.csv, test.csv, val.csv, full_clean.csv)
│   ├── models/
│   │   ├── train.py          # Trains XGBoost, GP, MLP — saves to models/saved/
│   │   ├── predict.py        # predict_all(), get_model_metrics(), get_shap_importance()
│   │   └── saved/            # Serialized models: xgboost.joblib, gp.joblib, mlp.joblib
│   ├── optimization/
│   │   └── nsga2_runner.py   # NSGA-II from scratch: SBX crossover, poly mutation, crowding
│   ├── results/              # JSON results: model_metrics.json, optimize_results.json, etc.
│   ├── requirements.txt      # flask, numpy, scipy, pandas, scikit-learn, joblib, gunicorn
│   └── Procfile              # gunicorn main:app (production)
│
└── frontend/                 # React + Vite + TailwindCSS
    ├── index.html            # Entry HTML — loads Google Fonts (Syne, Outfit, JetBrains Mono)
    ├── vite.config.js        # Vite config
    ├── tailwind.config.js    # Fonts: Syne (display), Outfit (sans), JetBrains Mono. Colors: carbon (950→400), neon (blue/cyan/green/amber/red) — updated to electric palette
    ├── src/
    │   ├── main.jsx          # React entry — BrowserRouter wrapping
    │   ├── App.jsx           # Nav shell with step-numbered pills, API status, offline banner
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

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{status, models_loaded}` |
| GET | `/design/baseline` | Baseline NACA 4412 inverted metrics |
| POST | `/design/evaluate` | Run physics solver on wing params |
| POST | `/design/geometry` | Generate SVG geometry coordinates |
| POST | `/design/sweep` | AoA polar sweep (array of physics results) |
| POST | `/predict` | ML ensemble prediction for wing params |
| GET | `/models/metrics` | R², RMSE per model per target + SHAP |
| POST | `/optimize` | Run NSGA-II with `{pop_size, n_gen}` |
| GET | `/optimize/results` | Load saved Pareto front results |
| POST | `/validate` | Physics-validate top N Pareto designs |
| GET | `/validate/results` | Load saved validation results |
| GET | `/sensitivity` | Single-param OAT sweep |
| GET | `/sensitivity/all` | All-params OAT sweep |
| GET | `/dataset/stats` | Training dataset statistics |

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
