"""
fidelity/level0.py
------------------
Level 0 — Conceptual Screening Evaluator

Wraps the existing Glauert + Thwaites aerodynamic solver and labels its
output explicitly as LEVEL_0_CONCEPTUAL.  All callers must use this wrapper
rather than calling aero_metrics.evaluate_design() directly, so that
fidelity provenance is always tracked.

IMPORTANT: Level 0 results carry ±15–30% uncertainty on absolute forces.
They are suitable for design-space exploration and surrogate training ONLY.
Do not present Level 0 results as validated aerodynamic truth.
"""

from __future__ import annotations

import time
from typing import Dict, Optional

from fidelity.base import FidelityEvaluator, FidelityLevel, FidelityResult


# Nominal uncertainty bounds for Level 0 (based on validation against
# published wind-tunnel data for NACA 4-series in ground effect).
_L0_CL_UNCERTAINTY_FRACTION = 0.18   # ±18% of |Cl| as 1-sigma estimate
_L0_CD_UNCERTAINTY_FRACTION = 0.28   # ±28% of |Cd|  (BL methods less accurate)


def _confidence_from_params(params: Dict[str, float]) -> float:
    """
    Heuristic confidence score for Level 0 in [0, 1].

    Confidence degrades:
      – Near stall (aoa_deg < −14° or flap > 30°)
      – At extreme thickness or very thin sections
      – At high camber + high flap combinations (strong nonlinearity)
    """
    aoa        = params.get("aoa_deg", -5.0)
    flap       = params.get("flap_angle_deg", 10.0)
    camber     = params.get("camber_pct", 4.0)
    thickness  = params.get("thickness_pct", 12.0)

    score = 0.80   # base confidence for L0

    if aoa < -13:
        score -= 0.15          # approaching stall
    elif aoa < -10:
        score -= 0.08

    if flap > 28:
        score -= 0.12          # thick jet, nonlinear slot effects
    elif flap > 22:
        score -= 0.06

    if camber > 7 and flap > 20:
        score -= 0.08          # combined high-loading not well-modelled by thin-airfoil

    if thickness < 8:
        score -= 0.05          # sharp LE, Thwaites BL less reliable
    if thickness > 18:
        score -= 0.04

    return float(max(0.30, min(0.85, score)))


def _trust_label(confidence: float) -> str:
    if confidence >= 0.70:
        return "moderate"
    if confidence >= 0.50:
        return "low"
    return "extrapolation"


class Level0Evaluator(FidelityEvaluator):
    """
    Conceptual screening evaluator (Level 0).

    Uses the in-house Glauert + Thwaites solver.
    Always marks results as LEVEL_0_CONCEPTUAL with appropriate uncertainty.
    """

    level = FidelityLevel.LEVEL_0_CONCEPTUAL

    def evaluate(
        self,
        design_params: Dict[str, float],
        condition: Optional[Dict[str, float]] = None,
    ) -> FidelityResult:
        # Defer import to avoid circular deps at module load time
        from analysis.aero_metrics import evaluate_design

        result = self._base_result(design_params, condition)
        t0 = time.perf_counter()

        # Override operating condition if explicitly provided
        eval_params = dict(design_params)
        if condition:
            eval_params.update({
                k: v for k, v in condition.items()
                if k in ("aoa_deg", "velocity_ms", "Re")
            })

        try:
            raw = evaluate_design(eval_params)
            elapsed = time.perf_counter() - t0

            result.Cl           = raw.get("Cl")
            result.Cd           = raw.get("Cd")
            result.Cm           = raw.get("Cm")
            result.downforce_N  = raw.get("downforce_N")
            result.drag_N       = raw.get("drag_N")
            result.efficiency   = raw.get("efficiency")
            result.Cl_Cd        = raw.get("Cl_Cd")
            result.converged    = bool(raw.get("converged", False))
            result.stall_flag   = bool(raw.get("stall_flag", False))
            result.solver_time_s = elapsed

            # Attach uncertainty
            if result.Cl is not None:
                result.Cl_uncertainty = abs(result.Cl) * _L0_CL_UNCERTAINTY_FRACTION
            if result.Cd is not None:
                result.Cd_uncertainty = abs(result.Cd) * _L0_CD_UNCERTAINTY_FRACTION

            confidence = _confidence_from_params(design_params)
            if result.stall_flag:
                confidence = min(confidence, 0.40)
            if not result.converged:
                confidence = min(confidence, 0.25)

            result.confidence  = confidence
            result.trust_label = _trust_label(confidence)
            result.notes.append(
                "Level 0 — conceptual screening only. "
                f"Cl uncertainty: ±{100*_L0_CL_UNCERTAINTY_FRACTION:.0f}%, "
                f"Cd uncertainty: ±{100*_L0_CD_UNCERTAINTY_FRACTION:.0f}%."
            )

        except Exception as exc:
            result.converged   = False
            result.confidence  = 0.0
            result.trust_label = "failed"
            result.notes.append(f"Level 0 solver error: {exc}")

        return result
