"""
main.py
-------
Flask REST API — Wing Optimizer Backend

All endpoints mirror the FastAPI design (same URLs, same JSON contracts).
Swap fastapi → flask with zero change to frontend or ML layers.

Endpoints:
  GET  /health
  GET  /design/baseline
  POST /design/evaluate        body: WingParams JSON
  POST /design/geometry        body: WingParams JSON
  POST /design/sweep           body: {params, aoa_start, aoa_end, n_points}
  POST /predict                body: WingParams JSON
  GET  /models/metrics
  POST /optimize               body: {pop_size, n_gen, n_validate}
  GET  /optimize/results
  POST /validate               query: ?n_top=10
  GET  /validate/results
  GET  /sensitivity            query: ?param=aoa_deg&n_points=20
  GET  /sensitivity/all        query: ?n_points=15
  GET  /dataset/stats

Run:
    python main.py          # development
    gunicorn main:app       # production
"""

import json
import traceback
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))

from flask import Flask, request, jsonify

from config import (
    RESULTS_DIR, PARAM_NAMES, PARAM_BOUNDS, BASELINE_PARAMS
)
from analysis.aero_metrics import evaluate_design, compare_to_baseline
from geometry.naca_generator import generate_naca4, apply_flap
from models.predict import predict_all, get_model_metrics, get_shap_importance

app = Flask(__name__)


# ── CORS helper ───────────────────────────────────────────────────────────────
@app.after_request
def _cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    return response

@app.route("/", methods=["OPTIONS"])
@app.route("/<path:_>", methods=["OPTIONS"])
def _preflight(_=None):
    return jsonify({}), 200


# ── Validation helpers ────────────────────────────────────────────────────────

def _parse_params(data: dict) -> dict:
    """Parse and clip wing parameters from request JSON."""
    params = {}
    for name in PARAM_NAMES:
        lo, hi, _, _ = PARAM_BOUNDS[name]
        val = data.get(name, BASELINE_PARAMS[name])
        params[name] = float(np.clip(float(val), lo, hi))
    return params


def _err(msg, code=400):
    return jsonify({"error": msg}), code


# ── System ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def root():
    return jsonify({"name": "Wing Optimizer API", "version": "1.0.0",
                    "docs": "/health", "status": "running"})


@app.route("/health", methods=["GET"])
def health():
    models_ok = all(
        (Path(__file__).parent / f"models/saved/{m}.joblib").exists()
        for m in ["xgboost", "gp", "mlp"]
    )
    csv = Path(__file__).parent / "data/processed/wing_dataset.csv"
    n_rows = 0
    if csv.exists():
        import pandas as pd
        n_rows = len(pd.read_csv(csv))
    return jsonify({
        "status":        "ok",
        "models_loaded": models_ok,
        "dataset_rows":  n_rows,
        "version":       "1.0.0",
    })


# ── Design ────────────────────────────────────────────────────────────────────

@app.route("/design/baseline", methods=["GET"])
def get_baseline():
    rec = compare_to_baseline(evaluate_design(BASELINE_PARAMS))
    return jsonify({"params": BASELINE_PARAMS, "metrics": rec})


@app.route("/design/geometry", methods=["POST"])
def get_geometry():
    data = request.get_json() or {}
    p    = _parse_params(data)
    af   = generate_naca4(p["camber_pct"], p["camber_pos_pct"], p["thickness_pct"])
    af   = apply_flap(af, p["flap_angle_deg"], p["flap_chord_pct"])
    return jsonify({
        "x_upper":       af.x_upper.tolist(),
        "y_upper":       af.y_upper.tolist(),
        "x_lower":       af.x_lower.tolist(),
        "y_lower":       af.y_lower.tolist(),
        "x_camber":      af.x_camber.tolist(),
        "y_camber":      af.y_camber.tolist(),
        "name":          af.name,
        "thickness_pct": af.max_thickness_pct,
        "camber_pct":    af.max_camber_pct,
    })


@app.route("/design/evaluate", methods=["POST"])
def evaluate():
    data = request.get_json() or {}
    p    = _parse_params(data)
    rec  = compare_to_baseline(evaluate_design(p))
    metrics_keys = [
        "Cl","Cd","Cd_pressure","Cd_friction","Cm",
        "Cl_3d","Cd_induced","Cd_3d",
        "downforce_N","drag_N","efficiency",
        "converged","stall_flag","x_tr_upper","x_tr_lower",
    ]
    return jsonify({
        "params":       p,
        "metrics":      {k: rec[k] for k in metrics_keys if k in rec},
        "airfoil_name": rec.get("airfoil_name", ""),
        "vs_baseline": {
            "downforce_pct":  rec.get("downforce_N_vs_baseline_pct", 0),
            "drag_pct":       rec.get("drag_N_vs_baseline_pct", 0),
            "efficiency_pct": rec.get("efficiency_vs_baseline_pct", 0),
        },
    })


@app.route("/design/sweep", methods=["POST"])
def polar_sweep():
    data     = request.get_json() or {}
    p        = _parse_params(data.get("params", data))
    aoa_start = float(data.get("aoa_start", -18.0))
    aoa_end   = float(data.get("aoa_end",   -2.0))
    n_points  = int(data.get("n_points",    17))
    sweep = []
    for aoa in np.linspace(aoa_start, aoa_end, n_points):
        r = evaluate_design({**p, "aoa_deg": float(aoa)})
        sweep.append({
            "aoa_deg":     float(aoa),
            "Cl":          r["Cl"],   "Cd":    r["Cd"],
            "Cl_Cd":       r["Cl_Cd"], "downforce_N": r["downforce_N"],
            "drag_N":      r["drag_N"], "efficiency": r["efficiency"],
            "stall":       bool(r["stall_flag"]),
        })
    return jsonify({"sweep": sweep, "params": p})


# ── ML prediction ─────────────────────────────────────────────────────────────

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json() or {}
    p    = _parse_params(data)
    try:
        result = predict_all(p)
        return jsonify(result)
    except FileNotFoundError as e:
        return _err(f"Models not trained yet: {e}", 503)


@app.route("/models/metrics", methods=["GET"])
def model_metrics():
    metrics = get_model_metrics()
    if not metrics:
        return _err("No model metrics found. Run training first.", 503)
    shap = get_shap_importance()
    return jsonify({**metrics, "shap_importance": shap})


# ── Optimization ──────────────────────────────────────────────────────────────

@app.route("/optimize", methods=["POST"])
def optimize():
    data     = request.get_json() or {}
    pop_size = int(data.get("pop_size", 60))
    n_gen    = int(data.get("n_gen",    50))
    try:
        from optimization.nsga2_runner import run_nsga2
        result = run_nsga2(pop_size=pop_size, n_gen=n_gen, verbose=False)
        pareto = [
            {"rank": i+1, "params": params, "prediction": pred, "f1": f[0], "f2": f[1]}
            for i, (params, pred, f) in enumerate(zip(
                result["pareto_params"],
                result["pareto_predictions"],
                result["pareto_F"],
            ))
        ]
        return jsonify({
            "pareto_front":  pareto,
            "convergence":   result["convergence"],
            "n_evaluations": result["n_evaluations"],
            "elapsed_s":     result["elapsed_s"],
        })
    except Exception as e:
        traceback.print_exc()
        return _err(str(e), 500)


@app.route("/optimize/results", methods=["GET"])
def get_optimize_results():
    path = RESULTS_DIR / "optimized_designs.json"
    if not path.exists():
        return _err("No optimization results yet.", 404)
    with open(path) as f:
        return jsonify(json.load(f))


# ── Validation ────────────────────────────────────────────────────────────────

@app.route("/validate", methods=["POST"])
def validate():
    n_top = int(request.args.get("n_top", 10))
    try:
        from validation.validator import run_validation
        result = run_validation(n_top=n_top, verbose=False)
        return jsonify(result)
    except FileNotFoundError as e:
        return _err(str(e), 404)


@app.route("/validate/results", methods=["GET"])
def get_validation_results():
    path = RESULTS_DIR / "validated_designs.json"
    if not path.exists():
        return _err("No validation results yet.", 404)
    with open(path) as f:
        return jsonify(json.load(f))


# ── Sensitivity ───────────────────────────────────────────────────────────────

@app.route("/sensitivity", methods=["GET"])
def sensitivity():
    param    = request.args.get("param", "aoa_deg")
    n_points = int(request.args.get("n_points", 20))
    if param not in PARAM_NAMES:
        return _err(f"Unknown param '{param}'. Valid: {PARAM_NAMES}")

    # Base params from query string (fallback to baseline)
    base = {}
    for name in PARAM_NAMES:
        key = f"base_{name}"
        base[name] = float(request.args.get(key, BASELINE_PARAMS[name]))

    lo, hi, desc, unit = PARAM_BOUNDS[param]
    values = np.linspace(lo, hi, n_points).tolist()
    dfs, drs, effs = [], [], []
    for v in values:
        r = evaluate_design({**base, param: v})
        dfs.append(r["downforce_N"]); drs.append(r["drag_N"]); effs.append(r["efficiency"])

    return jsonify({
        "parameter": param, "description": desc, "unit": unit,
        "values": values, "downforce": dfs, "drag": drs, "efficiency": effs,
    })


@app.route("/sensitivity/all", methods=["GET"])
def sensitivity_all():
    n_points = int(request.args.get("n_points", 15))
    results  = {}
    for param in PARAM_NAMES:
        lo, hi, desc, unit = PARAM_BOUNDS[param]
        values = np.linspace(lo, hi, n_points).tolist()
        dfs, drs, effs = [], [], []
        for v in values:
            r = evaluate_design({**BASELINE_PARAMS, param: v})
            dfs.append(r["downforce_N"]); drs.append(r["drag_N"]); effs.append(r["efficiency"])
        results[param] = {
            "description": desc, "unit": unit,
            "values": values, "downforce": dfs, "drag": drs, "efficiency": effs,
        }
    return jsonify(results)


# ── Dataset ───────────────────────────────────────────────────────────────────

@app.route("/dataset/stats", methods=["GET"])
def dataset_stats():
    csv = Path(__file__).parent / "data/processed/wing_dataset.csv"
    if not csv.exists():
        return _err("Dataset not found. Run batch_evaluator.py first.", 404)
    import pandas as pd
    df = pd.read_csv(csv)
    desc = df[["downforce_N", "drag_N", "efficiency", "Cl", "Cd"]].describe().to_dict()
    return jsonify({
        "n_rows":      len(df),
        "stats":       desc,
        "param_ranges": {
            name: {"min": float(df[name].min()), "max": float(df[name].max()),
                   "mean": float(df[name].mean())}
            for name in PARAM_NAMES if name in df.columns
        },
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8000)
