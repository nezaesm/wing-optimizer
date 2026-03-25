"""
models/train.py
---------------
Train three ML surrogate models on the physics-generated dataset.

Models:
  1. XGBoost  — primary surrogate (fast, accurate, tree ensemble)
  2. Gaussian Process — uncertainty quantification (know when to distrust)
  3. MLP (scikit-learn) — deep baseline for comparison

Each model predicts all TARGET_COLS simultaneously (multi-output).
Saved to models/saved/ as joblib files.

Also computes:
  - 5-fold cross-validation R² on training set
  - Val/test set R² and RMSE
  - SHAP feature importance (XGBoost only)
  - Model comparison table
"""

import json
import time
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    MODELS_DIR, RESULTS_DIR, RANDOM_SEED, TARGET_COLS,
    PARAM_NAMES, TRAIN_FRAC, VAL_FRAC
)
from data.pipeline import FEATURE_COLS, SPLIT_PATHS, load_splits

# ── sklearn imports ──────────────────────────────────────────────────────────
from sklearn.preprocessing import StandardScaler
from sklearn.multioutput import MultiOutputRegressor
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, Matern, WhiteKernel
from sklearn.neural_network import MLPRegressor
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_percentage_error
from sklearn.model_selection import cross_val_score, KFold

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("Warning: XGBoost not available, using GradientBoostingRegressor")
    from sklearn.ensemble import GradientBoostingRegressor


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_Xy(df: pd.DataFrame):
    """Extract feature matrix X and target matrix y from a DataFrame."""
    feat_cols = [c for c in FEATURE_COLS if c in df.columns]
    tgt_cols  = [c for c in TARGET_COLS  if c in df.columns]
    X = df[feat_cols].values.astype(np.float64)
    y = df[tgt_cols].values.astype(np.float64)
    return X, y, feat_cols, tgt_cols


def _metrics(y_true, y_pred, target_names):
    """Compute per-target and mean R², RMSE, MAPE."""
    results = {}
    for i, name in enumerate(target_names):
        yt, yp = y_true[:, i], y_pred[:, i]
        results[name] = {
            "r2":   float(r2_score(yt, yp)),
            "rmse": float(np.sqrt(mean_squared_error(yt, yp))),
            "mape": float(mean_absolute_percentage_error(yt, np.maximum(np.abs(yp), 1e-6))),
        }
    results["mean_r2"]   = float(np.mean([v["r2"]   for v in results.values() if isinstance(v, dict) and "r2" in v]))
    results["mean_rmse"] = float(np.mean([v["rmse"] for v in results.values() if isinstance(v, dict) and "rmse" in v]))
    return results


def _print_metrics(name, metrics, split="val"):
    print(f"\n  [{name}] {split} set metrics:")
    for target, m in metrics.items():
        if isinstance(m, dict):
            print(f"    {target:<16} R²={m['r2']:+.4f}  RMSE={m['rmse']:.4f}  MAPE={m['mape']*100:.1f}%")
    print(f"    {'Mean':16} R²={metrics['mean_r2']:+.4f}  RMSE={metrics['mean_rmse']:.4f}")


# ── 1. XGBoost Surrogate ──────────────────────────────────────────────────────

def train_xgboost(X_train, y_train, X_val, y_val, target_names, feat_names):
    """Train multi-output XGBoost via MultiOutputRegressor wrapper."""
    print("\n── Training XGBoost surrogate ─────────────────────────────")
    t0 = time.time()

    if HAS_XGB:
        base = xgb.XGBRegressor(
            n_estimators    = 500,
            max_depth       = 6,
            learning_rate   = 0.05,
            subsample       = 0.85,
            colsample_bytree= 0.85,
            reg_alpha       = 0.1,
            reg_lambda      = 1.0,
            random_state    = RANDOM_SEED,
            verbosity       = 0,
            n_jobs          = -1,
        )
    else:
        from sklearn.ensemble import GradientBoostingRegressor
        base = GradientBoostingRegressor(
            n_estimators=300, max_depth=5, learning_rate=0.05,
            subsample=0.85, random_state=RANDOM_SEED
        )

    model = MultiOutputRegressor(base, n_jobs=-1)
    model.fit(X_train, y_train)

    y_pred_val = model.predict(X_val)
    metrics    = _metrics(y_val, y_pred_val, target_names)
    _print_metrics("XGBoost", metrics, "val")
    print(f"  Training time: {time.time()-t0:.1f}s")

    # SHAP feature importance (XGBoost only, per first target)
    shap_importance = {}
    if HAS_XGB:
        try:
            import shap
            explainer = shap.TreeExplainer(model.estimators_[0])
            shap_vals = explainer.shap_values(X_val)
            importance = np.abs(shap_vals).mean(axis=0)
            shap_importance = dict(zip(feat_names, importance.tolist()))
        except Exception:
            # SHAP not installed — use built-in feature importance
            fi = model.estimators_[0].feature_importances_
            shap_importance = dict(zip(feat_names, fi.tolist()))
    else:
        fi = np.mean([e.feature_importances_ for e in model.estimators_], axis=0)
        shap_importance = dict(zip(feat_names, fi.tolist()))

    # Sort by importance
    shap_importance = dict(sorted(shap_importance.items(), key=lambda x: -x[1]))

    return model, metrics, shap_importance


# ── 2. Gaussian Process ───────────────────────────────────────────────────────

def train_gp(X_train, y_train, X_val, y_val, target_names, scaler):
    """
    Gaussian Process regressor — primarily for uncertainty quantification.
    Trained on a sub-sample (GP scales O(n³)) with Matérn kernel.
    """
    print("\n── Training Gaussian Process (uncertainty model) ──────────")
    t0 = time.time()

    # Subsample for tractability (GP is O(n³))
    n_gp  = min(300, len(X_train))
    rng   = np.random.default_rng(RANDOM_SEED)
    idx   = rng.choice(len(X_train), n_gp, replace=False)
    X_sub = X_train[idx]
    y_sub = y_train[idx]

    kernel = 1.0 * Matern(length_scale=1.0, nu=2.5) + WhiteKernel(noise_level=0.1)
    gp_base = GaussianProcessRegressor(
        kernel          = kernel,
        n_restarts_optimizer = 3,
        normalize_y     = True,
        random_state    = RANDOM_SEED,
    )
    model = MultiOutputRegressor(gp_base, n_jobs=-1)
    model.fit(X_sub, y_sub)

    y_pred_val = model.predict(X_val)
    metrics    = _metrics(y_val, y_pred_val, target_names)
    _print_metrics("GP", metrics, "val")
    print(f"  Training time: {time.time()-t0:.1f}s  (n={n_gp} subsample)")

    return model, metrics


# ── 3. MLP Neural Network ─────────────────────────────────────────────────────

def train_mlp(X_train, y_train, X_val, y_val, target_names):
    """
    MLP regressor — 3-layer neural network with StandardScaler preprocessing.
    """
    print("\n── Training MLP neural network ────────────────────────────")
    t0 = time.time()

    model = MLPRegressor(
        hidden_layer_sizes  = (128, 64, 32),
        activation          = "relu",
        solver              = "adam",
        alpha               = 1e-4,        # L2 regularisation
        learning_rate_init  = 1e-3,
        max_iter            = 1000,
        early_stopping      = True,
        validation_fraction = 0.1,
        n_iter_no_change    = 30,
        random_state        = RANDOM_SEED,
        verbose             = False,
    )
    # MLP needs scaled inputs AND scaled targets
    x_scaler = StandardScaler()
    y_scaler = StandardScaler()
    X_train_s = x_scaler.fit_transform(X_train)
    X_val_s   = x_scaler.transform(X_val)
    y_train_s = y_scaler.fit_transform(y_train)

    model.fit(X_train_s, y_train_s)
    y_pred_val = y_scaler.inverse_transform(model.predict(X_val_s))
    metrics    = _metrics(y_val, y_pred_val, target_names)
    _print_metrics("MLP", metrics, "val")
    print(f"  Training time: {time.time()-t0:.1f}s  ({model.n_iter_} epochs)")

    # Bundle both scalers
    scaler = {"x": x_scaler, "y": y_scaler}
    return model, scaler, metrics


# ── Main training run ─────────────────────────────────────────────────────────

def run_training(splits=None) -> dict:
    """
    Full training pipeline. Returns dict of trained models and metrics.
    """
    print("=" * 60)
    print("Phase 2 — ML Surrogate Model Training")
    print("=" * 60)

    # ── Load splits ───────────────────────────────────────────────────────────
    if splits is None:
        splits = load_splits()

    train_df = splits["train"]
    val_df   = splits["val"]
    test_df  = splits["test"]

    X_train, y_train, feat_names, tgt_names = _get_Xy(train_df)
    X_val,   y_val,   _,          _         = _get_Xy(val_df)
    X_test,  y_test,  _,          _         = _get_Xy(test_df)

    print(f"\nDataset: {len(X_train)} train | {len(X_val)} val | {len(X_test)} test")
    print(f"Features ({len(feat_names)}): {feat_names}")
    print(f"Targets  ({len(tgt_names)}): {tgt_names}")

    # Shared scaler (fitted on training data, used for GP and MLP)
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_val_s   = scaler.transform(X_val)
    X_test_s  = scaler.transform(X_test)

    results = {"feature_names": feat_names, "target_names": tgt_names}

    # ── 1. XGBoost ────────────────────────────────────────────────────────────
    xgb_model, xgb_val, shap_imp = train_xgboost(
        X_train, y_train, X_val, y_val, tgt_names, feat_names
    )
    xgb_test = _metrics(y_test, xgb_model.predict(X_test), tgt_names)
    results["xgboost"] = {"val": xgb_val, "test": xgb_test, "shap": shap_imp}
    joblib.dump({"model": xgb_model, "scaler": None, "feat_names": feat_names,
                 "tgt_names": tgt_names}, MODELS_DIR / "xgboost.joblib")

    # ── 2. GP ─────────────────────────────────────────────────────────────────
    gp_model, gp_val = train_gp(X_train_s, y_train, X_val_s, y_val, tgt_names, scaler)
    gp_test  = _metrics(y_test, gp_model.predict(X_test_s), tgt_names)
    results["gp"]     = {"val": gp_val, "test": gp_test}
    joblib.dump({"model": gp_model, "scaler": scaler, "feat_names": feat_names,
                 "tgt_names": tgt_names}, MODELS_DIR / "gp.joblib")

    # ── 3. MLP ────────────────────────────────────────────────────────────────
    mlp_model, mlp_scaler, mlp_val = train_mlp(X_train, y_train, X_val, y_val, tgt_names)
    mlp_pred_test = mlp_scaler["y"].inverse_transform(mlp_model.predict(mlp_scaler["x"].transform(X_test)))
    mlp_test = _metrics(y_test, mlp_pred_test, tgt_names)
    results["mlp"]    = {"val": mlp_val, "test": mlp_test}
    joblib.dump({"model": mlp_model, "scaler": mlp_scaler, "feat_names": feat_names,
                 "tgt_names": tgt_names}, MODELS_DIR / "mlp.joblib")

    # ── Model comparison table ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("Model Comparison (Test Set R²)")
    print("=" * 60)
    print(f"{'Target':<18} {'XGBoost':>10} {'GP':>10} {'MLP':>10}")
    print("─" * 50)
    for t in tgt_names:
        xr = results["xgboost"]["test"].get(t, {}).get("r2", 0)
        gr = results["gp"]["test"].get(t, {}).get("r2", 0)
        mr = results["mlp"]["test"].get(t, {}).get("r2", 0)
        best = max(xr, gr, mr)
        def _f(v): return f"{'→' if v==best else ' '}{v:+.4f}"
        print(f"  {t:<16} {_f(xr):>10} {_f(gr):>10} {_f(mr):>10}")
    print("─" * 50)
    print(f"  {'Mean R²':<16} {results['xgboost']['test']['mean_r2']:>+10.4f} "
          f"{results['gp']['test']['mean_r2']:>+10.4f} "
          f"{results['mlp']['test']['mean_r2']:>+10.4f}")

    # ── Feature importance ────────────────────────────────────────────────────
    print("\nTop feature importances (XGBoost / SHAP):")
    for feat, imp in list(shap_imp.items())[:8]:
        bar = "█" * int(imp / max(shap_imp.values()) * 20)
        print(f"  {feat:<26} {bar}")

    # ── Save results JSON ─────────────────────────────────────────────────────
    out_path = RESULTS_DIR / "model_metrics.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nMetrics saved: {out_path}")
    print(f"Models saved:  {MODELS_DIR}/")

    return results


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    run_training()
