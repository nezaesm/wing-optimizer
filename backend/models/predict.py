"""
models/predict.py
-----------------
Instant ML-based prediction for any wing design parameter set.

Loads the trained models from disk and provides:
  - predict_xgboost(params) → predictions dict
  - predict_all(params)     → predictions from all three models + uncertainty
  - predict_with_uncertainty(params) → GP posterior mean + std
"""

import numpy as np
import joblib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import MODELS_DIR, RESULTS_DIR, PARAM_NAMES, PARAM_BOUNDS
from data.pipeline import FEATURE_COLS

# ── Lazy-loaded model cache ───────────────────────────────────────────────────
_cache: dict = {}

def _load(model_name: str) -> dict:
    if model_name not in _cache:
        path = MODELS_DIR / f"{model_name}.joblib"
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {path}. Run models/train.py first.")
        _cache[model_name] = joblib.load(path)
    return _cache[model_name]


def _params_to_features(params: dict) -> np.ndarray:
    """
    Convert a raw parameter dict to the engineered feature vector
    expected by the ML models.
    """
    from config import REYNOLDS_NUMBER

    p = params
    features = {
        "camber_pct":            p["camber_pct"],
        "camber_pos_pct":        p["camber_pos_pct"],
        "thickness_pct":         p["thickness_pct"],
        "aoa_deg":               p["aoa_deg"],
        "flap_angle_deg":        p["flap_angle_deg"],
        "flap_chord_pct":        p["flap_chord_pct"],
        "aspect_ratio":          p["aspect_ratio"],
        "endplate_h_pct":        p["endplate_h_pct"],
        # Engineered features
        "camber_thickness_ratio": p["camber_pct"] / max(p["thickness_pct"], 1.0),
        "loading_index":          abs(p["aoa_deg"]) * p["camber_pct"],
        "flap_effectiveness":     p["flap_angle_deg"] * p["flap_chord_pct"] / 100.0,
        "ar_endplate_factor":     p["aspect_ratio"] * (1.0 + 1.9 * p["endplate_h_pct"] / 100.0),
        "chord_re_log":           np.log10(REYNOLDS_NUMBER),
    }
    # Return as array in the order FEATURE_COLS expects
    feat_cols = [c for c in FEATURE_COLS if c in features]
    return np.array([[features[c] for c in feat_cols]])


def _validate_params(params: dict) -> dict:
    """Clip parameters to valid bounds and return a clean dict."""
    clean = {}
    for name in PARAM_NAMES:
        lo, hi, _, _ = PARAM_BOUNDS[name]
        val = params.get(name, (lo + hi) / 2.0)
        clean[name] = float(np.clip(val, lo, hi))
    return clean


def predict_xgboost(params: dict) -> dict:
    """
    Fast XGBoost prediction.
    Returns dict with predicted Cl, Cd, Cl_Cd, downforce_N, drag_N, efficiency.
    """
    p       = _validate_params(params)
    bundle  = _load("xgboost")
    model   = bundle["model"]
    X       = _params_to_features(p)
    y_pred  = model.predict(X)[0]
    return dict(zip(bundle["tgt_names"], y_pred.tolist()))


def predict_with_uncertainty(params: dict) -> dict:
    """
    Gaussian Process prediction with uncertainty estimate.
    Returns mean predictions + per-target standard deviations.
    """
    p      = _validate_params(params)
    bundle = _load("gp")
    model  = bundle["model"]
    scaler = bundle["scaler"]
    X      = _params_to_features(p)
    X_s    = scaler.transform(X) if scaler else X

    means, stds = [], []
    for estimator in model.estimators_:
        m, s = estimator.predict(X_s, return_std=True)
        means.append(float(m[0]))
        stds.append(float(s[0]))

    result = dict(zip(bundle["tgt_names"], means))
    result["uncertainty"] = dict(zip(bundle["tgt_names"], stds))
    return result


def predict_mlp(params: dict) -> dict:
    """MLP neural network prediction."""
    p      = _validate_params(params)
    bundle = _load("mlp")
    model  = bundle["model"]
    scaler = bundle["scaler"]
    X      = _params_to_features(p)
    X_s    = scaler["x"].transform(X)
    y_s    = model.predict(X_s)
    y_pred = scaler["y"].inverse_transform(y_s)[0]
    return dict(zip(bundle["tgt_names"], y_pred.tolist()))


def predict_all(params: dict) -> dict:
    """
    Run all three models and return an ensemble summary.
    Also flags if predictions are unreliable (high GP uncertainty or
    models disagree strongly).
    """
    p = _validate_params(params)

    xgb_pred  = predict_xgboost(p)
    gp_pred   = predict_with_uncertainty(p)
    mlp_pred  = predict_mlp(p)

    uncertainty = gp_pred.pop("uncertainty", {})

    # Ensemble mean (weighted: MLP highest R², XGBoost second, GP third)
    weights = {"xgboost": 0.35, "gp": 0.25, "mlp": 0.40}
    ensemble = {}
    for key in xgb_pred:
        vals = [xgb_pred[key], gp_pred.get(key, 0), mlp_pred.get(key, 0)]
        ensemble[key] = float(np.average(vals, weights=list(weights.values())))

    # Reliability score: 1 - normalised GP uncertainty
    rel_scores = {}
    for key, std in uncertainty.items():
        mean_abs = abs(gp_pred.get(key, 1.0)) or 1.0
        rel_scores[key] = float(np.clip(1.0 - std / (mean_abs + 1e-6), 0.0, 1.0))
    mean_reliability = float(np.mean(list(rel_scores.values()))) if rel_scores else 1.0

    return {
        "params":       p,
        "xgboost":      xgb_pred,
        "gp":           gp_pred,
        "mlp":          mlp_pred,
        "ensemble":     ensemble,
        "uncertainty":  uncertainty,
        "reliability":  mean_reliability,
        "rel_by_target": rel_scores,
    }


def get_model_metrics() -> dict:
    """Load saved training metrics from results/model_metrics.json."""
    path = RESULTS_DIR / "model_metrics.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def get_shap_importance() -> dict:
    """Return SHAP feature importance from XGBoost model."""
    metrics = get_model_metrics()
    return metrics.get("xgboost", {}).get("shap", {})


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    from config import BASELINE_PARAMS
    print("Testing ML prediction on baseline design...")
    result = predict_all(BASELINE_PARAMS)

    print(f"\nBaseline: {BASELINE_PARAMS}")
    print(f"\n{'Target':<16} {'XGBoost':>10} {'GP':>10} {'MLP':>10} {'Ensemble':>10} {'Uncert':>8}")
    print("─" * 68)
    for key in result["xgboost"]:
        xv = result["xgboost"].get(key, 0)
        gv = result["gp"].get(key, 0)
        mv = result["mlp"].get(key, 0)
        ev = result["ensemble"].get(key, 0)
        uv = result["uncertainty"].get(key, 0)
        print(f"  {key:<14} {xv:>10.3f} {gv:>10.3f} {mv:>10.3f} {ev:>10.3f} {uv:>8.3f}")
    print(f"\nMean reliability: {result['reliability']:.3f}")

    print("\nSHAP feature importance:")
    for feat, imp in list(get_shap_importance().items())[:6]:
        print(f"  {feat:<26} {imp:.4f}")
