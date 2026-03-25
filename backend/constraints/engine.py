"""
constraints/engine.py
---------------------
Engineering constraint evaluation engine for WingOpt.

Constraints are grouped into four categories:
  - Geometric / manufacturing (hard limits on physical geometry)
  - Aerodynamic (performance floor/ceiling requirements)
  - Packaging (ride height, endplate clearance, sizing rules)
  - Robustness (sensitivity thresholds)

Each constraint returns a ConstraintResult indicating:
  - satisfied  : True/False
  - severity   : "ok" | "warning" | "violation" | "hard_violation"
  - margin     : signed distance to the constraint boundary (positive = feasible)
  - message    : human-readable explanation

The ConstraintEngine evaluates all constraints and returns a summary
suitable for the optimisation pipeline and frontend dashboard.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


# ── Result type ────────────────────────────────────────────────────────────────

@dataclass
class ConstraintResult:
    name:        str
    category:    str    # "geometric" | "aerodynamic" | "packaging" | "robustness"
    satisfied:   bool
    severity:    str    # "ok" | "warning" | "violation" | "hard_violation"
    margin:      float  # positive = feasible, negative = violated
    value:       float  # actual value of the constrained quantity
    limit:       float  # constraint threshold
    message:     str    = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name":      self.name,
            "category":  self.category,
            "satisfied": self.satisfied,
            "severity":  self.severity,
            "margin":    round(self.margin, 4),
            "value":     round(self.value, 4),
            "limit":     round(self.limit, 4),
            "message":   self.message,
        }


@dataclass
class ConstraintSummary:
    results:           List[ConstraintResult] = field(default_factory=list)
    all_satisfied:     bool   = True
    n_violations:      int    = 0
    n_hard_violations: int    = 0
    n_warnings:        int    = 0
    feasible:          bool   = True    # True only if no hard violations
    violation_score:   float  = 0.0    # sum of |margins| for violated constraints

    def to_dict(self) -> Dict[str, Any]:
        return {
            "all_satisfied":     self.all_satisfied,
            "feasible":          self.feasible,
            "n_violations":      self.n_violations,
            "n_hard_violations": self.n_hard_violations,
            "n_warnings":        self.n_warnings,
            "violation_score":   round(self.violation_score, 4),
            "results":           [r.to_dict() for r in self.results],
        }


# ── Individual constraint check functions ──────────────────────────────────────

def _make_result(
    name:      str,
    category:  str,
    value:     float,
    limit:     float,
    mode:      str = "upper",   # "upper" → value < limit; "lower" → value > limit
    hard:      bool = False,
    warn_margin: float = 0.0,
    fmt_msg:   str = "",
) -> ConstraintResult:
    if mode == "upper":
        margin = limit - value
    else:
        margin = value - limit

    satisfied = margin >= 0

    if not satisfied:
        severity = "hard_violation" if hard else "violation"
    elif margin < warn_margin:
        severity = "warning"
    else:
        severity = "ok"

    msg = fmt_msg or (
        f"{name}: {value:.4g} {'<' if mode=='upper' else '>'} {limit:.4g} "
        f"(margin {margin:+.4g})"
    )

    return ConstraintResult(
        name=name, category=category,
        satisfied=satisfied, severity=severity,
        margin=margin, value=value, limit=limit,
        message=msg,
    )


# ── Geometry constraints ───────────────────────────────────────────────────────

def check_geometry_constraints(params: Dict[str, float]) -> List[ConstraintResult]:
    results = []

    # Positive/physical thickness
    t = params.get("thickness_pct", 12.0)
    results.append(_make_result(
        "min_thickness", "geometric", t, 6.0, mode="lower", hard=True,
        warn_margin=2.0,
        fmt_msg=f"Section thickness {t:.1f}%: must be ≥ 6% for structural integrity.",
    ))
    results.append(_make_result(
        "max_thickness", "geometric", t, 20.0, mode="upper", hard=False,
        warn_margin=2.0,
        fmt_msg=f"Section thickness {t:.1f}%: above 20% has negligible structural benefit.",
    ))

    # Camber
    c = params.get("camber_pct", 4.0)
    results.append(_make_result(
        "max_camber", "geometric", c, 9.0, mode="upper", hard=False,
        warn_margin=1.0,
        fmt_msg=f"Camber {c:.1f}%: above 9% is outside NACA 4-series database validation range.",
    ))

    # Aspect ratio
    ar = params.get("aspect_ratio", 3.5)
    results.append(_make_result(
        "min_aspect_ratio", "geometric", ar, 2.0, mode="lower", hard=True,
        warn_margin=0.3,
        fmt_msg=f"Aspect ratio {ar:.1f}: below 2 produces excessive induced drag.",
    ))
    results.append(_make_result(
        "max_aspect_ratio", "geometric", ar, 5.5, mode="upper", hard=False,
        warn_margin=0.5,
        fmt_msg=f"Aspect ratio {ar:.1f}: above 5.5 may exceed packaging limits.",
    ))

    # Flap
    fa = params.get("flap_angle_deg", 10.0)
    results.append(_make_result(
        "max_flap_deflection", "geometric", fa, 35.0, mode="upper", hard=True,
        warn_margin=5.0,
        fmt_msg=f"Flap deflection {fa:.0f}°: above 35° produces strong separation.",
    ))

    # Endplate
    ep = params.get("endplate_h_pct", 15.0)
    results.append(_make_result(
        "min_endplate_height", "geometric", ep, 5.0, mode="lower", hard=False,
        warn_margin=3.0,
        fmt_msg=f"Endplate height {ep:.0f}%: below 5% has negligible tip vortex effect.",
    ))
    results.append(_make_result(
        "max_endplate_height", "geometric", ep, 30.0, mode="upper", hard=False,
        warn_margin=5.0,
        fmt_msg=f"Endplate height {ep:.0f}%: above 30% may conflict with Formula SAE rules.",
    ))

    return results


# ── Aerodynamic performance constraints ────────────────────────────────────────

def check_aero_constraints(
    params:  Dict[str, float],
    metrics: Dict[str, float],
) -> List[ConstraintResult]:
    results = []

    Cl  = metrics.get("Cl", 0.0)
    Cd  = metrics.get("Cd", 1.0)
    eff = metrics.get("efficiency", 0.0)
    df  = metrics.get("downforce_N", 0.0)

    # Wing must generate downforce (Cl < 0 for inverted)
    results.append(_make_result(
        "downforce_direction", "aerodynamic", Cl, 0.0, mode="upper", hard=True,
        warn_margin=0.05,
        fmt_msg=f"Cl={Cl:.4f}: must be negative to generate downforce (Cl < 0).",
    ))

    # Minimum downforce
    results.append(_make_result(
        "min_downforce", "aerodynamic", abs(df), 200.0, mode="lower", hard=False,
        warn_margin=50.0,
        fmt_msg=f"Downforce {abs(df):.0f} N: target ≥ 200 N for useful grip contribution.",
    ))

    # Maximum drag
    results.append(_make_result(
        "max_drag_coefficient", "aerodynamic", Cd, 0.25, mode="upper", hard=False,
        warn_margin=0.03,
        fmt_msg=f"Cd={Cd:.4f}: above 0.25 indicates severe pressure drag (separation likely).",
    ))

    # Minimum aerodynamic efficiency
    results.append(_make_result(
        "min_efficiency", "aerodynamic", eff, 2.0, mode="lower", hard=False,
        warn_margin=0.5,
        fmt_msg=f"Efficiency={eff:.2f}: |Cl|/Cd should be ≥ 2.0 for a useful wing.",
    ))

    # Convergence flag
    converged = metrics.get("converged", False)
    results.append(ConstraintResult(
        name="solver_convergence", category="aerodynamic",
        satisfied=bool(converged), severity="hard_violation" if not converged else "ok",
        margin=1.0 if converged else -1.0,
        value=1.0 if converged else 0.0, limit=1.0,
        message="Solver converged." if converged else
                "Solver did not converge — aero results unreliable.",
    ))

    return results


# ── Packaging constraints ──────────────────────────────────────────────────────

def check_packaging_constraints(params: Dict[str, float]) -> List[ConstraintResult]:
    results = []

    rh = params.get("ride_height_pct", 30.0)
    results.append(_make_result(
        "min_ride_height", "packaging", rh, 8.0, mode="lower", hard=True,
        warn_margin=5.0,
        fmt_msg=f"Ride height {rh:.0f}%c: below 8% risks ground contact at full bump.",
    ))

    aoa = params.get("aoa_deg", -5.0)
    results.append(_make_result(
        "max_aoa_magnitude", "packaging", abs(aoa), 18.0, mode="upper", hard=True,
        warn_margin=2.0,
        fmt_msg=f"|AoA|={abs(aoa):.0f}°: exceeds maximum physical incidence range.",
    ))

    return results


# ── Robustness constraints ─────────────────────────────────────────────────────

def check_robustness_constraints(
    mc_result: Optional[Dict[str, Any]] = None,
) -> List[ConstraintResult]:
    """
    Check robustness-related constraints from a MultiConditionResult dict.
    mc_result may be None if multi-condition evaluation has not been run.
    """
    results = []

    if mc_result is None:
        results.append(ConstraintResult(
            name="multi_condition_evaluation", category="robustness",
            satisfied=False, severity="warning",
            margin=-1.0, value=0.0, limit=1.0,
            message="Multi-condition evaluation not run. Robustness unknown.",
        ))
        return results

    eff_std = mc_result.get("efficiency_std")
    w_eff   = mc_result.get("weighted_efficiency")
    if eff_std is not None and w_eff and w_eff != 0:
        coV = eff_std / abs(w_eff)
        results.append(_make_result(
            "efficiency_robustness", "robustness",
            coV, 0.20, mode="upper", hard=False, warn_margin=0.05,
            fmt_msg=(
                f"Efficiency CoV={coV:.2f} across conditions. "
                f"{'Acceptable' if coV < 0.20 else 'High variability — design may be condition-sensitive'}."
            ),
        ))

    worst_eff = mc_result.get("worst_efficiency")
    if worst_eff is not None:
        results.append(_make_result(
            "worst_case_efficiency", "robustness",
            worst_eff, 1.5, mode="lower", hard=False, warn_margin=0.3,
            fmt_msg=f"Worst-case efficiency={worst_eff:.2f}: must be ≥ 1.5 across all conditions.",
        ))

    return results


# ── ConstraintEngine ───────────────────────────────────────────────────────────

class ConstraintEngine:
    """
    Evaluates all engineering constraints and returns a ConstraintSummary.

    Usage
    -----
        engine = ConstraintEngine()
        summary = engine.evaluate(params, metrics, mc_result)
        if not summary.feasible:
            ...
    """

    def evaluate(
        self,
        params:    Dict[str, float],
        metrics:   Optional[Dict[str, float]] = None,
        mc_result: Optional[Dict[str, Any]]   = None,
    ) -> ConstraintSummary:

        all_results: List[ConstraintResult] = []

        all_results.extend(check_geometry_constraints(params))
        all_results.extend(check_packaging_constraints(params))

        if metrics:
            all_results.extend(check_aero_constraints(params, metrics))

        all_results.extend(check_robustness_constraints(mc_result))

        # ── Build summary ───────────────────────────────────────────────────────
        summary = ConstraintSummary(results=all_results)
        summary.all_satisfied     = all(r.satisfied for r in all_results)
        summary.n_violations      = sum(
            1 for r in all_results if not r.satisfied and r.severity != "hard_violation"
        )
        summary.n_hard_violations = sum(
            1 for r in all_results if r.severity == "hard_violation"
        )
        summary.n_warnings = sum(
            1 for r in all_results if r.severity == "warning"
        )
        summary.feasible = summary.n_hard_violations == 0
        summary.violation_score = sum(
            abs(r.margin) for r in all_results if not r.satisfied
        )

        return summary
