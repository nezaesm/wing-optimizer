"""
models/surrogate.py
-------------------
Uncertainty-aware surrogate model abstraction layer for WingOpt.

This module wraps the trained ML models (XGBoost, GP, MLP) behind a
consistent SurrogateModel interface that:

  1. Always reports confidence / uncertainty alongside predictions
  2. Tags results with trust labels ("high" / "moderate" / "low" / "extrapolation")
  3. Detects likely extrapolation via training-distribution proximity
  4. Exposes an active-learning candidate ranking method
  5. Clearly marks results as surrogate estimates — NOT validated CFD results

Hierarchy
---------
  SurrogateModel (abstract base)
      └── EnsembleSurrogate   ← primary class (XGBoost + GP + MLP)
           ├── XGBoostSurrogate
           ├── GaussianProcessSurrogate   ← primary uncertainty source
           └── MLPSurrogate
"""

from __future__ import annotations

import math
import os
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ── Config ────────────────────────────────────────────────────────────────────
_MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).parent / "saved"))

# Ensemble weights (kept consistent with predict.py)
_WEIGHTS = {"xgboost": 0.35, "gp": 0.25, "mlp": 0.40}

# Distribution proximity threshold (Mahalanobis distance percentile)
# Predictions with distance > this threshold are flagged as extrapolation.
_EXTRAPOLATION_THRESHOLD = 3.0   # std-deviations from training centre


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class SurrogateResult:
    """
    Prediction from the surrogate model with uncertainty quantification.

    All values are surrogate ESTIMATES based on a model trained on
    Level-0 (conceptual) physics data.  These are NOT validated CFD
    results.  Confidence values reflect interpolation vs extrapolation
    within the training distribution, not absolute physical accuracy.
    """

    # ── Point estimates ──────────────────────────────────────────────────────
    Cl:             Optional[float] = None
    Cd:             Optional[float] = None
    Cl_Cd:          Optional[float] = None
    downforce_N:    Optional[float] = None
    drag_N:         Optional[float] = None
    efficiency:     Optional[float] = None

    # ── Per-model predictions ─────────────────────────────────────────────────
    per_model:      Dict[str, Dict[str, Optional[float]]] = field(default_factory=dict)

    # ── Uncertainty (from GP posterior std, where available) ─────────────────
    Cl_std:         Optional[float] = None
    Cd_std:         Optional[float] = None

    # ── Confidence & trust ────────────────────────────────────────────────────
    confidence:     float = 0.0   # [0, 1]  interpolation quality
    trust_label:    str   = "unset"
    # Mahalanobis-style distance from training data centre
    distribution_distance: Optional[float] = None
    is_extrapolation:      bool = False

    # ── Active learning score ─────────────────────────────────────────────────
    # Higher = more informative for next training sample
    acquisition_score: float = 0.0

    # ── Provenance ────────────────────────────────────────────────────────────
    source_label:   str = "Surrogate Estimate (NOT validated CFD)"
    models_used:    List[str] = field(default_factory=list)
    notes:          List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_label":          self.source_label,
            "Cl":                    self.Cl,
            "Cd":                    self.Cd,
            "Cl_Cd":                 self.Cl_Cd,
            "downforce_N":           self.downforce_N,
            "drag_N":                self.drag_N,
            "efficiency":            self.efficiency,
            "Cl_std":                self.Cl_std,
            "Cd_std":                self.Cd_std,
            "confidence":            self.confidence,
            "trust_label":           self.trust_label,
            "distribution_distance": self.distribution_distance,
            "is_extrapolation":      self.is_extrapolation,
            "acquisition_score":     self.acquisition_score,
            "models_used":           self.models_used,
            "per_model":             self.per_model,
            "notes":                 self.notes,
        }


# ── Feature engineering ────────────────────────────────────────────────────────
# (mirrors predict.py to maintain consistency with trained models)

def _build_features(params: Dict[str, float]) -> np.ndarray:
    camber        = params.get("camber_pct", 4.0)
    camber_pos    = params.get("camber_pos_pct", 40.0)
    thickness     = params.get("thickness_pct", 12.0)
    aoa           = params.get("aoa_deg", -5.0)
    flap_angle    = params.get("flap_angle_deg", 10.0)
    flap_chord    = params.get("flap_chord_pct", 25.0)
    ar            = params.get("aspect_ratio", 3.5)
    ep            = params.get("endplate_h_pct", 15.0)

    camber_t_ratio     = camber / max(thickness, 0.1)
    loading_index      = abs(aoa) * camber / 100.0
    flap_effectiveness = flap_angle * flap_chord / 100.0
    ar_ep_factor       = ar * (1 + ep / 100.0)
    log_Re             = math.log(712_000)

    return np.array([[
        camber, camber_pos, thickness, aoa,
        flap_angle, flap_chord, ar, ep,
        camber_t_ratio, loading_index, flap_effectiveness, ar_ep_factor, log_Re,
    ]])


# ── Surrogate model classes ────────────────────────────────────────────────────

class SurrogateModel:
    """Abstract base."""
    name: str = "base"

    def predict(self, params: Dict[str, float]) -> Dict[str, Optional[float]]:
        raise NotImplementedError

    def predict_with_std(
        self, params: Dict[str, float]
    ) -> Tuple[Dict[str, Optional[float]], Dict[str, Optional[float]]]:
        """Returns (means, stds). Base returns zeros for stds."""
        means = self.predict(params)
        stds  = {k: None for k in means}
        return means, stds


class EnsembleSurrogate(SurrogateModel):
    """
    Uncertainty-aware ensemble surrogate.

    Loads all three trained models and returns:
    - weighted-average point estimates
    - GP posterior standard deviation as uncertainty estimate
    - inter-model spread as an additional confidence signal
    - distribution-proximity score via GP posterior
    """

    name = "ensemble"

    def __init__(self) -> None:
        self._xgb  = None
        self._gp   = None
        self._mlp  = None
        self._scX  = None
        self._scY  = None
        self._targets:    List[str] = []
        self._features:   List[str] = []
        self._train_X:    Optional[np.ndarray] = None  # for proximity estimation
        self._loaded      = False

    def _load(self) -> None:
        if self._loaded:
            return
        try:
            import joblib
            self._xgb = joblib.load(_MODEL_DIR / "xgboost.joblib")
            self._gp  = joblib.load(_MODEL_DIR / "gp.joblib")
            self._mlp = joblib.load(_MODEL_DIR / "mlp.joblib")

            meta_path = _MODEL_DIR / "meta.joblib"
            if meta_path.exists():
                meta = joblib.load(meta_path)
                self._targets  = meta.get("targets",  [])
                self._features = meta.get("features", [])
                self._scX      = meta.get("scaler_X")
                self._scY      = meta.get("scaler_Y")
                self._train_X  = meta.get("train_X_sample")

            self._loaded = True
        except Exception as exc:
            warnings.warn(f"EnsembleSurrogate: failed to load models — {exc}")

    def predict(self, params: Dict[str, float]) -> Dict[str, Optional[float]]:
        means, _ = self.predict_with_std(params)
        return means

    def predict_with_std(
        self, params: Dict[str, float]
    ) -> Tuple[Dict[str, Optional[float]], Dict[str, Optional[float]]]:
        self._load()
        X = _build_features(params)

        means: Dict[str, Optional[float]] = {}
        stds:  Dict[str, Optional[float]] = {}

        if not self._loaded or self._xgb is None:
            return means, stds

        try:
            # ── Scale input ────────────────────────────────────────────────────
            X_s = self._scX.transform(X) if self._scX else X

            # ── Predict with each model ────────────────────────────────────────
            raw: Dict[str, np.ndarray] = {}
            raw["xgboost"] = self._xgb.predict(X_s)[0] if self._xgb else None
            raw["mlp"]     = self._mlp.predict(X_s)[0] if self._mlp else None

            # GP predict_with_std
            if self._gp is not None:
                try:
                    gp_mean, gp_std = self._gp.predict(X_s, return_std=True)
                    raw["gp"] = gp_mean[0]
                    gp_stds   = gp_std[0]
                except Exception:
                    raw["gp"] = self._gp.predict(X_s)[0] if self._gp else None
                    gp_stds   = None
            else:
                raw["gp"]  = None
                gp_stds    = None

            # ── Ensemble mean ──────────────────────────────────────────────────
            targets = self._targets or ["Cl", "Cd", "Cl_Cd", "downforce_N", "drag_N", "efficiency"]
            w       = _WEIGHTS
            for i, t in enumerate(targets):
                vals = []
                wts  = []
                for m, wt in w.items():
                    if raw.get(m) is not None:
                        v = raw[m][i]
                        if self._scY:
                            # inverse scale if needed
                            pass
                        vals.append(v)
                        wts.append(wt)
                if vals:
                    total_w = sum(wts)
                    means[t] = sum(v * wt for v, wt in zip(vals, wts)) / total_w
                else:
                    means[t] = None

            # ── GP posterior std as uncertainty ────────────────────────────────
            if gp_stds is not None:
                for i, t in enumerate(targets):
                    stds[t] = float(gp_stds[i]) if i < len(gp_stds) else None
            else:
                # Fallback: use inter-model spread as proxy for uncertainty
                for i, t in enumerate(targets):
                    model_vals = [raw[m][i] for m in ["xgboost", "gp", "mlp"]
                                  if raw.get(m) is not None]
                    if len(model_vals) >= 2:
                        import statistics
                        stds[t] = statistics.stdev(model_vals)
                    else:
                        stds[t] = None

        except Exception as exc:
            warnings.warn(f"EnsembleSurrogate.predict_with_std error: {exc}")

        return means, stds

    def distribution_distance(self, params: Dict[str, float]) -> Optional[float]:
        """
        Estimate distance from training distribution using Euclidean
        distance to nearest training sample (normalised by feature std).
        Returns None if training data not available.
        """
        self._load()
        if self._train_X is None:
            return None
        try:
            X = _build_features(params)
            X_s = self._scX.transform(X) if self._scX else X
            dists = np.linalg.norm(self._train_X - X_s, axis=1)
            return float(np.min(dists))
        except Exception:
            return None

    def get_per_model(self, params: Dict[str, float]) -> Dict[str, Dict[str, Optional[float]]]:
        """Return predictions from each individual model."""
        self._load()
        if not self._loaded:
            return {}

        X   = _build_features(params)
        X_s = self._scX.transform(X) if self._scX else X
        targets = self._targets or ["Cl", "Cd", "Cl_Cd", "downforce_N", "drag_N", "efficiency"]

        per: Dict[str, Dict[str, Optional[float]]] = {}
        for m_name, m_obj in [("xgboost", self._xgb), ("gp", self._gp), ("mlp", self._mlp)]:
            if m_obj is None:
                continue
            try:
                if m_name == "gp":
                    pred = m_obj.predict(X_s)[0]
                else:
                    pred = m_obj.predict(X_s)[0]
                per[m_name] = {t: float(pred[i]) for i, t in enumerate(targets)}
            except Exception:
                per[m_name] = {t: None for t in targets}

        return per


# ── High-level helper ─────────────────────────────────────────────────────────

_ENSEMBLE = EnsembleSurrogate()


def predict_uncertain(params: Dict[str, float]) -> SurrogateResult:
    """
    Single-call interface: predict with full uncertainty quantification.

    Returns a SurrogateResult with confidence labels and trust tags.
    This is the recommended replacement for the old predict_all() when
    uncertainty context is needed.
    """
    sr = SurrogateResult(models_used=["xgboost", "gp", "mlp"])
    sr.notes.append(
        "Surrogate estimate based on a model trained on Level-0 conceptual data. "
        "This is NOT a validated CFD result."
    )

    try:
        means, stds = _ENSEMBLE.predict_with_std(params)
        per_model   = _ENSEMBLE.get_per_model(params)
        dist        = _ENSEMBLE.distribution_distance(params)
    except Exception as exc:
        sr.notes.append(f"Surrogate prediction failed: {exc}")
        sr.trust_label = "failed"
        return sr

    sr.Cl          = means.get("Cl")
    sr.Cd          = means.get("Cd")
    sr.Cl_Cd       = means.get("Cl_Cd")
    sr.downforce_N = means.get("downforce_N")
    sr.drag_N      = means.get("drag_N")
    sr.efficiency  = means.get("efficiency")

    sr.Cl_std = stds.get("Cl")
    sr.Cd_std = stds.get("Cd")

    sr.per_model             = per_model
    sr.distribution_distance = dist

    # ── Confidence & trust label ───────────────────────────────────────────────
    sr.is_extrapolation = dist is not None and dist > _EXTRAPOLATION_THRESHOLD

    if sr.is_extrapolation:
        sr.confidence  = max(0.15, 0.50 - (dist - _EXTRAPOLATION_THRESHOLD) * 0.10)
        sr.trust_label = "extrapolation"
        sr.notes.append(
            f"Point is {dist:.2f} std-deviations from training distribution. "
            "Prediction quality is reduced — consider running L0 or L1 evaluation."
        )
    elif dist is not None and dist > 2.0:
        sr.confidence  = 0.65
        sr.trust_label = "low"
    elif dist is not None and dist > 1.2:
        sr.confidence  = 0.80
        sr.trust_label = "moderate"
    else:
        sr.confidence  = 0.90
        sr.trust_label = "high"

    # Penalise if GP std is very large relative to mean
    if sr.Cl_std is not None and sr.Cl is not None and sr.Cl != 0:
        rel_std = abs(sr.Cl_std / sr.Cl)
        if rel_std > 0.25:
            sr.confidence  = min(sr.confidence, 0.55)
            sr.trust_label = "low"
            sr.notes.append(
                f"GP posterior std / mean = {rel_std:.0%} for Cl — high model uncertainty."
            )

    # ── Active-learning acquisition score ─────────────────────────────────────
    # Upper confidence bound: high uncertainty + promising mean efficiency
    eff = sr.efficiency or 0.0
    unc = (sr.Cl_std or 0.0) * 3.0
    sr.acquisition_score = float(eff + unc)   # UCB-style

    return sr


def rank_candidates_by_acquisition(
    candidates: List[Dict[str, float]]
) -> List[Tuple[int, float, SurrogateResult]]:
    """
    Rank a list of candidate designs by acquisition score (UCB).
    Returns list of (original_index, acquisition_score, SurrogateResult).
    """
    scored = []
    for i, params in enumerate(candidates):
        sr = predict_uncertain(params)
        scored.append((i, sr.acquisition_score, sr))
    return sorted(scored, key=lambda x: -x[1])
