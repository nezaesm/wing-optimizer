"""
main.py
-------
Flask REST API — Wing Optimizer Backend

Endpoints:
  GET  /health
  GET  /design/baseline
  POST /design/evaluate            body: WingParams JSON
  POST /design/geometry            body: WingParams JSON
  POST /design/sweep               body: {params, aoa_start, aoa_end, n_points}
  POST /predict                    body: WingParams JSON
  GET  /models/metrics
  POST /optimize                   body: {pop_size, n_gen, n_validate}
  POST /optimize/hybrid            body: {n_init, n_pareto, enable_l2}
  GET  /optimize/results
  POST /validate                   query: ?n_top=10
  GET  /validate/results
  GET  /sensitivity                query: ?param=aoa_deg&n_points=20
  GET  /sensitivity/all            query: ?n_points=15
  GET  /dataset/stats

  Multi-fidelity (new):
  POST /fidelity/evaluate          body: {params, level, condition}
  POST /fidelity/multi-condition   body: {params, condition_set}
  POST /fidelity/validate-geometry body: WingParams JSON
  POST /predict/uncertain          body: WingParams JSON

  CFD management (new):
  GET  /cfd/status/<run_id>
  GET  /cfd/artifacts

  Constraints (new):
  POST /constraints/check          body: {params, metrics}

Run:
    python main.py          # development
    gunicorn main:app       # production
"""

import json
import logging
import os
import traceback
import uuid
import time as _time
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))

# Load .env file in development (no-op if python-dotenv is not installed)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

from flask import Flask, request, jsonify

from config import (
    RESULTS_DIR, PARAM_NAMES, PARAM_BOUNDS, BASELINE_PARAMS
)
from analysis.aero_metrics import evaluate_design, compare_to_baseline
from geometry.naca_generator import generate_naca4, apply_flap
from models.predict import predict_all, get_model_metrics, get_shap_importance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


# ── CORS ──────────────────────────────────────────────────────────────────────
# Set ALLOWED_ORIGINS env var (comma-separated) to override defaults.
_ALLOWED_ORIGINS: set = set(filter(None, os.environ.get(
    "ALLOWED_ORIGINS",
    "https://wing-optimizer-idzil0zw2-zenithprakash67-3615s-projects.vercel.app,"
    "https://frontend-five-beige-e9u7r18z93.vercel.app,"
    "http://localhost:5173,"
    "http://localhost:5174,"
    "http://localhost:5175,"
    "http://127.0.0.1:5173,"
    "http://127.0.0.1:5174"
).split(",")))


@app.after_request
def _cors(response):
    origin = request.headers.get("Origin", "")
    if origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
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


def _int_bounded(source, key, default: int, lo: int, hi: int) -> int:
    """Parse an integer from source dict/args, clamp to [lo, hi], return default on error."""
    try:
        return int(np.clip(int(source.get(key, default)), lo, hi))
    except (ValueError, TypeError):
        return default


def _float_bounded(source, key, default: float, lo: float, hi: float) -> float:
    """Parse a float from source dict/args, clamp to [lo, hi], return default on error."""
    try:
        return float(np.clip(float(source.get(key, default)), lo, hi))
    except (ValueError, TypeError):
        return default


def _safe_upload_id(upload_id: str) -> str | None:
    """
    Validate upload_id: alphanumeric + hyphens only, max 64 chars.
    Returns sanitized id or None if invalid (prevents path traversal).
    """
    if not upload_id or len(upload_id) > 64:
        return None
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
    if not all(c in allowed for c in upload_id):
        return None
    # Ensure resolved path stays within UPLOAD_DIR
    candidate = (UPLOAD_DIR / f"{upload_id}.json").resolve()
    if not str(candidate).startswith(str(UPLOAD_DIR.resolve())):
        return None
    return upload_id


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
    data      = request.get_json() or {}
    p         = _parse_params(data.get("params", data))
    aoa_start = _float_bounded(data, "aoa_start", -18.0, -90.0, 90.0)
    aoa_end   = _float_bounded(data, "aoa_end",    -2.0, -90.0, 90.0)
    n_points  = _int_bounded(data, "n_points", 17, 2, 200)
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
    except FileNotFoundError:
        return _err("Models not trained yet. Run training first.", 503)


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
    pop_size = _int_bounded(data, "pop_size", 60, 10, 300)
    n_gen    = _int_bounded(data, "n_gen",    50,  5, 200)
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
        logger.exception("Optimization error")
        return _err("Optimization failed. Check server logs.", 500)


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
    n_top = _int_bounded(request.args, "n_top", 10, 1, 50)
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
    n_points = _int_bounded(request.args, "n_points", 20, 2, 100)
    if param not in PARAM_NAMES:
        return _err("Unknown parameter name", 400)

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
    n_points = _int_bounded(request.args, "n_points", 15, 2, 50)
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


# ── Multi-fidelity evaluation ─────────────────────────────────────────────────

@app.route("/fidelity/evaluate", methods=["POST"])
def fidelity_evaluate():
    """Run evaluation at a specified fidelity level (0, 1, or 2)."""
    data      = request.get_json() or {}
    params    = _parse_params(data.get("params", data))
    level     = _int_bounded(data, "level", 0, 0, 2)
    condition = data.get("condition") or {}
    try:
        from fidelity import get_evaluator
        ev     = get_evaluator(level)
        result = ev.evaluate(params, condition or None)
        try:
            from dataclasses import asdict
            result_dict = asdict(result)
        except Exception:
            result_dict = result if isinstance(result, dict) else {}
        return jsonify(result_dict)
    except Exception:
        logger.exception("Fidelity evaluation error")
        return _err("Evaluation failed. Check server logs.", 500)


@app.route("/fidelity/multi-condition", methods=["POST"])
def multi_condition_evaluate():
    """Evaluate a design across a named condition set."""
    data           = request.get_json() or {}
    params         = _parse_params(data.get("params", data))
    condition_set  = data.get("condition_set", "race_conditions")
    level          = _int_bounded(data, "level", 0, 0, 2)
    try:
        from fidelity import get_evaluator
        from conditions.condition_set import get_condition_set
        from conditions.evaluator import MultiConditionEvaluator
        ev      = get_evaluator(level)
        cset    = get_condition_set(condition_set)
        mc_eval = MultiConditionEvaluator(ev)
        result  = mc_eval.evaluate(params, cset)
        try:
            from dataclasses import asdict
            result_dict = asdict(result)
        except Exception:
            result_dict = result if isinstance(result, dict) else {}
        return jsonify(result_dict)
    except Exception:
        logger.exception("Multi-condition evaluation error")
        return _err("Multi-condition evaluation failed. Check server logs.", 500)


@app.route("/fidelity/validate-geometry", methods=["POST"])
def validate_geometry():
    """Validate wing geometry parameters and return report."""
    data   = request.get_json() or {}
    params = _parse_params(data)
    try:
        from geometry.wing_definition import WingDefinition
        from geometry.geometry_validator import validate
        wd     = WingDefinition.from_flat_dict(params)
        report = validate(wd)
        return jsonify({
            "valid":       report.valid,
            "has_warnings": report.has_warnings,
            "errors":      report.errors,
            "warnings":    report.warnings,
        })
    except Exception:
        logger.exception("Geometry validation error")
        return _err("Geometry validation failed. Check server logs.", 500)


# ── Uncertainty-aware prediction ──────────────────────────────────────────────

@app.route("/predict/uncertain", methods=["POST"])
def predict_uncertain():
    """Return surrogate prediction with full uncertainty quantification."""
    data   = request.get_json() or {}
    params = _parse_params(data)
    try:
        from models.surrogate import predict_uncertain as _pu
        sr = _pu(params)
        return jsonify(sr.to_dict())
    except Exception:
        logger.exception("Uncertainty prediction error")
        return _err("Prediction failed. Check server logs.", 500)


# ── Hybrid optimization ───────────────────────────────────────────────────────

@app.route("/optimize/hybrid", methods=["POST"])
def optimize_hybrid():
    """Run the 7-stage hybrid multi-fidelity optimization pipeline."""
    data      = request.get_json() or {}
    n_init    = _int_bounded(data, "n_init",   100, 10, 500)
    n_pareto  = _int_bounded(data, "n_pareto",  20,  5, 100)
    enable_l2 = bool(data.get("enable_l2", False))
    try:
        from optimization.hybrid_pipeline import HybridPipeline
        pipeline = HybridPipeline(
            l0_top_k        = _int_bounded(data, "l0_top_k",        30,  5, 100),
            surrogate_top_k = _int_bounded(data, "surrogate_top_k", 10,  2,  50),
            l1_top_k        = _int_bounded(data, "l1_top_k",         5,  1,  20),
            enable_l2       = enable_l2,
        )
        result = pipeline.run(n_init=n_init, n_pareto=n_pareto)
        out    = result.to_dict()
        out_path = RESULTS_DIR / "hybrid_results.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        import json as _json
        out_path.write_text(_json.dumps(out, indent=2, default=str))
        return jsonify(out)
    except Exception:
        logger.exception("Hybrid optimization error")
        return _err("Hybrid optimization failed. Check server logs.", 500)


# ── Constraints ───────────────────────────────────────────────────────────────

@app.route("/constraints/check", methods=["POST"])
def check_constraints():
    """Check engineering constraints for a given design + metrics."""
    data    = request.get_json() or {}
    params  = _parse_params(data.get("params", data))
    metrics = data.get("metrics", {})
    try:
        from constraints.engine import ConstraintEngine
        engine  = ConstraintEngine()
        summary = engine.evaluate(params, metrics)
        return jsonify(summary.to_dict())
    except Exception:
        logger.exception("Constraint check error")
        return _err("Constraint check failed. Check server logs.", 500)


# ── CFD status / artifacts ────────────────────────────────────────────────────

@app.route("/cfd/status/<run_id>", methods=["GET"])
def cfd_status(run_id: str):
    """Get status of a running or completed CFD job."""
    # Validate run_id to prevent path traversal
    if not run_id or not all(c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in run_id) or len(run_id) > 64:
        return _err("Invalid run_id", 400)
    try:
        from cfd.artifact_store import ArtifactStore
        store  = ArtifactStore()
        record = store.get_record(run_id)
        if record is None:
            return _err("run_id not found", 404)
        return jsonify(record.to_dict())
    except Exception:
        logger.exception("CFD status error")
        return _err("Failed to retrieve CFD status.", 500)


@app.route("/cfd/artifacts", methods=["GET"])
def cfd_artifacts():
    """List recent CFD run records."""
    fidelity = request.args.get("fidelity")
    limit    = _int_bounded(request.args, "limit", 20, 1, 100)
    try:
        from cfd.artifact_store import ArtifactStore
        store   = ArtifactStore()
        records = store.list_records(
            limit    = limit,
            fidelity = int(fidelity) if fidelity is not None and fidelity.isdigit() else None,
        )
        return jsonify({"records": records, "summary": store.summary()})
    except Exception:
        logger.exception("CFD artifacts error")
        return _err("Failed to retrieve CFD artifacts.", 500)


# ── 3D VLM Analysis ───────────────────────────────────────────────────────────

@app.route("/design/analyze-3d", methods=["POST"])
def analyze_3d():
    """
    Full 3D Vortex Lattice Method analysis.

    Accepts all standard WingOpt params plus optional 3D extensions:
      taper_ratio (0.3–1.0), sweep_deg (0–30), twist_deg (0–8),
      dihedral_deg (0–10), flap_gap_pct (0–3), flap_overlap_pct (0–2),
      ride_height_pct (2–50), velocity_ms, rho, chord_m

    Returns: CL, CD_induced, downforce_N, drag_N, efficiency,
             ground_effect_factor, spanwise distributions, per-panel Cp.
    """
    data = request.get_json() or {}
    params = _parse_params(data)

    # 3D-only params (with safe defaults and bounds)
    ext_params = {
        "taper_ratio":      float(np.clip(data.get("taper_ratio",      1.0),  0.2, 1.0)),
        "sweep_deg":        float(np.clip(data.get("sweep_deg",         0.0),  0.0, 35.0)),
        "twist_deg":        float(np.clip(data.get("twist_deg",         0.0),  0.0, 10.0)),
        "dihedral_deg":     float(np.clip(data.get("dihedral_deg",      0.0),  0.0, 15.0)),
        "flap_gap_pct":     float(np.clip(data.get("flap_gap_pct",      1.5),  0.0,  4.0)),
        "flap_overlap_pct": float(np.clip(data.get("flap_overlap_pct",  0.5),  0.0,  2.0)),
        "ride_height_pct":  float(np.clip(data.get("ride_height_pct",   8.0),  1.0, 80.0)),
        "velocity_ms":      data.get("velocity_ms"),
        "rho":              data.get("rho"),
        "chord_m":          data.get("chord_m"),
    }

    try:
        from analysis.vortex_lattice import analyze_3d as _vlm
        result = _vlm({**params, **ext_params})
        return jsonify({
            "params":    {**params, **{k: v for k, v in ext_params.items() if v is not None}},
            "analysis":  result,
        })
    except Exception:
        logger.exception("3D VLM analysis error")
        return _err("3D analysis failed. Check server logs.", 500)


# ── Upload management ─────────────────────────────────────────────────────────

UPLOAD_DIR = Path(__file__).parent / "results" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_EXTENSIONS = {".dat", ".txt", ".csv", ".json", ".stl", ".obj"}
_MAX_FILE_SIZE_MB   = 50


@app.route("/upload/geometry", methods=["POST"])
def upload_geometry():
    """
    Upload a wing/airfoil geometry file.

    Accepts multipart/form-data with field name "file".
    Supported: .dat, .csv, .txt (Selig/Lednicer), .json (WingOpt params),
               .stl (binary or ASCII mesh), .obj (Wavefront mesh).

    Returns:
      upload_id   — use as reference in subsequent API calls
      params      — extracted WingOpt-compatible parameters (ready for /design/evaluate)
      airfoil     — normalised 2D coordinates for geometry preview
      sections    — cross-sections extracted from 3D mesh (if applicable)
      warnings    — any parse warnings
    """
    if "file" not in request.files:
        return _err("No file field in request (expected multipart field name 'file')")

    f = request.files["file"]
    filename = f.filename or "upload"

    # Strip path components from filename (prevent directory traversal via filename)
    filename = Path(filename).name

    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        return _err(
            f"File extension '{ext}' not supported. "
            f"Allowed: {sorted(_ALLOWED_EXTENSIONS)}"
        )

    content = f.read()
    if len(content) > _MAX_FILE_SIZE_MB * 1024 * 1024:
        return _err(f"File too large (max {_MAX_FILE_SIZE_MB} MB)")

    try:
        from geometry.geometry_parser import GeometryParser
        parser = GeometryParser()
        parsed = parser.parse(filename, content)
    except Exception:
        logger.exception("Geometry parse error for file: %s", filename)
        return _err("Failed to parse geometry file. Ensure it is a valid supported format.", 422)

    # Persist upload record with full UUID (no truncation)
    upload_id  = str(uuid.uuid4())
    record = {
        "upload_id":  upload_id,
        "filename":   filename,
        "format":     parsed.fmt,
        "uploaded_at": _time.time(),
        "n_points":   parsed.n_points,
        "has_3d":     parsed.has_3d,
        "warnings":   parsed.warnings,
        "params":     parsed.params,
    }
    record_path = UPLOAD_DIR / f"{upload_id}.json"
    import json as _json
    record_path.write_text(_json.dumps(record, indent=2))

    out = parsed.to_dict()
    out["upload_id"] = upload_id
    return jsonify(out)


@app.route("/upload/list", methods=["GET"])
def upload_list():
    """List all uploaded designs (most recent first)."""
    records = []
    for p in sorted(UPLOAD_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True):
        try:
            import json as _json
            records.append(_json.loads(p.read_text()))
        except Exception:
            pass
    return jsonify({"uploads": records, "count": len(records)})


@app.route("/upload/<upload_id>", methods=["GET"])
def upload_get(upload_id: str):
    """Retrieve a specific upload record by its ID."""
    safe_id = _safe_upload_id(upload_id)
    if safe_id is None:
        return _err("Invalid upload ID", 400)
    path = UPLOAD_DIR / f"{safe_id}.json"
    if not path.exists():
        return _err("Upload not found", 404)
    import json as _json
    return jsonify(_json.loads(path.read_text()))


@app.route("/upload/<upload_id>", methods=["DELETE"])
def upload_delete(upload_id: str):
    """Delete an upload record."""
    safe_id = _safe_upload_id(upload_id)
    if safe_id is None:
        return _err("Invalid upload ID", 400)
    path = UPLOAD_DIR / f"{safe_id}.json"
    if not path.exists():
        return _err("Upload not found", 404)
    path.unlink()
    return jsonify({"deleted": safe_id})


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    port  = int(os.environ.get("PORT", 8000))
    app.run(debug=debug, host="0.0.0.0", port=port)
