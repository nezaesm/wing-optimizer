# WingOpt — AI Aerodynamic Design Optimizer

> AI-assisted aerodynamic design optimization of a Formula-style front wing.
> Complete ML-physics pipeline: geometry → simulation → surrogates → NSGA-II → validation → dashboard.

---

## Live Demo

| Service  | URL                                       |
|----------|-------------------------------------------|
| Frontend | `https://wing-optimizer.vercel.app`       |
| Backend  | `https://wing-optimizer.railway.app`      |
| API docs | `https://wing-optimizer.railway.app/docs` |

---

## Architecture

```
Parameterized geometry   →   Physics analysis   →   LHS dataset (1,217 pts)
       ↓                           ↓                        ↓
  NACA 4-series              Glauert thin-airfoil       SQLite + CSV
  + flap deflection          + Thwaites BL
                                                              ↓
                                                    ML surrogate training
                                                    XGBoost R²=0.97
                                                    GP     R²=0.95
                                                    MLP    R²=0.99
                                                              ↓
                                                    NSGA-II Pareto front
                                                    (max downforce, min drag)
                                                              ↓
                                                    Physics validation
                                                    Mean error: 2.6%
                                                              ↓
                                              Flask API  →  React Dashboard
```

---

## Quick Start — Local Development

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Generate dataset (takes ~2s)
python analysis/batch_evaluator.py --samples 1200

# Train models (~30s)
python models/train.py

# Run optimizer (~2 min)
python optimization/nsga2_runner.py --pop 60 --gen 50

# Validate top designs
python validation/validator.py

# Start API server
python main.py
# → http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # edit VITE_API_URL if needed
npm run dev
# → http://localhost:5173
```

---

## Deployment

### Frontend → Vercel (free)

```bash
# From the frontend/ directory:
npx vercel

# Or connect GitHub repo in vercel.com dashboard:
#   Root directory:   frontend
#   Build command:    npm run build
#   Output dir:       dist
#   Framework:        Vite

# Add environment variable in Vercel dashboard:
#   VITE_API_URL = https://your-backend.railway.app
```

### Backend → Railway (free tier)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# From the backend/ directory:
railway init
railway up

# Set environment variable in Railway dashboard:
#   PORT = 8000  (Railway sets this automatically)
```

### Backend → Render (free tier, alternative)

1. Push `backend/` to GitHub
2. Create a new "Web Service" at render.com
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn main:app --workers 2 --bind 0.0.0.0:$PORT`

---

## Project Structure

```
wing-optimizer/
├── backend/
│   ├── main.py                    # Flask API (14 endpoints)
│   ├── config.py                  # All constants and parameter bounds
│   ├── requirements.txt
│   ├── Procfile                   # Railway/Render deployment
│   ├── geometry/
│   │   └── naca_generator.py      # NACA 4-series + flap deflection
│   ├── analysis/
│   │   ├── aero_solver.py         # Glauert + Thwaites physics engine
│   │   ├── aero_metrics.py        # Design record builder
│   │   └── batch_evaluator.py     # Parallel LHS dataset generation
│   ├── data/
│   │   ├── sampler.py             # Latin Hypercube Sampling
│   │   └── pipeline.py            # Feature engineering + train/val/test split
│   ├── models/
│   │   ├── train.py               # XGBoost + GP + MLP training
│   │   └── predict.py             # Ensemble inference + uncertainty
│   ├── optimization/
│   │   └── nsga2_runner.py        # NSGA-II from scratch
│   ├── validation/
│   │   └── validator.py           # Physics re-evaluation of Pareto candidates
│   └── validate_physics.py        # CLI: single-design physics report
│
└── frontend/
    ├── vercel.json                 # SPA routing for Vercel
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx                 # Router + nav + API status
        ├── api/client.js           # Typed API wrapper
        ├── components/ui.jsx       # Shared components (MetricCard, WingCanvas…)
        └── pages/
            ├── Design.jsx          # Parameter sliders + geometry + evaluation
            ├── Train.jsx           # Model metrics + SHAP importance
            ├── Optimize.jsx        # Pareto front + convergence
            ├── Validate.jsx        # Physics validation table + scatter
            ├── Sensitivity.jsx     # Tornado chart + parameter sweeps
            ├── Dataset.jsx         # Dataset statistics
            └── About.jsx           # Recruiter-facing project summary
```

---

## API Reference

| Method | Endpoint            | Description                              |
|--------|---------------------|------------------------------------------|
| GET    | `/health`           | System status + model availability       |
| GET    | `/design/baseline`  | Evaluate baseline design (physics)       |
| POST   | `/design/evaluate`  | Physics evaluation of any design         |
| POST   | `/design/geometry`  | Airfoil coordinates for visualisation    |
| POST   | `/design/sweep`     | AoA polar curve sweep                    |
| POST   | `/predict`          | ML surrogate (3 models + ensemble)       |
| GET    | `/models/metrics`   | Training R², RMSE, SHAP importance       |
| POST   | `/optimize`         | Run NSGA-II optimization                 |
| GET    | `/optimize/results` | Last optimization results                |
| POST   | `/validate`         | Physics-validate top Pareto candidates   |
| GET    | `/validate/results` | Last validation results                  |
| GET    | `/sensitivity`      | One-at-a-time parameter sensitivity      |
| GET    | `/sensitivity/all`  | All 8 parameters at once                 |
| GET    | `/dataset/stats`    | Dataset summary statistics               |

---

## Physics Validation

| Metric             | Value  |
|--------------------|--------|
| Mean DF error      | 2.6%   |
| Mean drag error    | 3.7%   |
| Best improvement   | +41.8% efficiency vs baseline |
| All designs        | Converged, no stall |

---

## Key Results

- **1,217 designs** evaluated via Latin Hypercube Sampling
- **NSGA-II** found designs with 3–5× more downforce than baseline
- **Best validated design**: -342 N downforce @ 18.8 N drag (eff = 18.25)
- **ML ensemble** predicts downforce within 2.6% of physics truth
- **Inference**: < 1 ms per design (vs 1 ms physics)

---

## Skills Demonstrated

- Aerodynamic theory (Glauert, Thwaites, Oswald efficiency, Prandtl lifting-line)
- Physics-based simulation without commercial solvers
- Latin Hypercube Sampling for design of experiments
- ML surrogate modeling with uncertainty quantification (GP posterior)
- Multi-objective evolutionary optimization (NSGA-II) from scratch
- Full validation loop closing ML ↔ physics
- Modular Python backend architecture
- React dashboard with real-time API integration
- Cloud deployment (Vercel + Railway)
