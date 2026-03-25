"""
analysis/aero_metrics.py
------------------------
Converts an AeroResult + design parameters into a flat dictionary
suitable for storage in SQLite / Parquet.

Also provides the top-level evaluate_design() function that takes
raw parameter values and returns the complete record.
"""

import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import PARAM_NAMES, BASELINE_PARAMS
from geometry.naca_generator import generate_naca4, apply_flap
from analysis.aero_solver import AeroSolver, AeroResult

_solver = AeroSolver()   # singleton — re-used across calls


def evaluate_design(params: dict) -> dict:
    """
    Full design evaluation pipeline: params → geometry → aero → metrics dict.

    Args:
        params: dict with keys matching PARAM_NAMES

    Returns:
        Flat dict ready for DB / DataFrame insertion.
    """
    # ── Geometry ─────────────────────────────────────────────────────────────
    af = generate_naca4(
        camber_pct     = params["camber_pct"],
        camber_pos_pct = params["camber_pos_pct"],
        thickness_pct  = params["thickness_pct"],
        invert         = True,    # always inverted for front wing
    )
    af = apply_flap(
        af,
        flap_angle_deg = params["flap_angle_deg"],
        flap_chord_pct = params["flap_chord_pct"],
    )

    # ── Aerodynamic evaluation ────────────────────────────────────────────────
    result: AeroResult = _solver.evaluate(
        x_upper        = af.x_upper,
        y_upper        = af.y_upper,
        x_lower        = af.x_lower,
        y_lower        = af.y_lower,
        aoa_deg        = params["aoa_deg"],
        aspect_ratio   = params["aspect_ratio"],
        endplate_h_pct = params["endplate_h_pct"],
    )

    # ── Assemble record ───────────────────────────────────────────────────────
    record = {p: float(params[p]) for p in PARAM_NAMES}

    record.update({
        # 2D section
        "Cl":           result.Cl,
        "Cd":           result.Cd,
        "Cd_pressure":  result.Cd_pressure,
        "Cd_friction":  result.Cd_friction,
        "Cm":           result.Cm,
        # 3D wing
        "Cl_3d":        result.Cl_3d,
        "Cd_induced":   result.Cd_induced,
        "Cd_3d":        result.Cd_3d,
        # Derived performance
        "Cl_Cd":        result.Cl / max(abs(result.Cd), 1e-6),
        "downforce_N":  result.downforce_N,
        "drag_N":       result.drag_N,
        "efficiency":   result.efficiency,
        # Flow state
        "converged":    int(result.converged),
        "stall_flag":   int(result.stall_flag),
        "x_tr_upper":   result.x_transition_upper,
        "x_tr_lower":   result.x_transition_lower,
        "Re":           result.Re,
        # Geometry descriptors
        "airfoil_name": af.name,
        "t_max_pct":    af.max_thickness_pct,
        "camber_actual": af.max_camber_pct,
    })
    return record


def compare_to_baseline(result_record: dict) -> dict:
    """
    Compute percentage improvements relative to the baseline design.

    Returns the same dict with additional '*_improvement_pct' keys.
    """
    baseline = evaluate_design(BASELINE_PARAMS)

    improvements = {}
    for key in ["downforce_N", "drag_N", "efficiency", "Cl_Cd", "Cd_3d"]:
        if key in result_record and key in baseline:
            base_val = baseline[key]
            curr_val = result_record[key]
            if abs(base_val) > 1e-8:
                pct = (curr_val - base_val) / abs(base_val) * 100.0
            else:
                pct = 0.0
            improvements[f"{key}_vs_baseline_pct"] = float(pct)

    return {**result_record, **improvements}


# ── Pre-compute baseline record for quick reference ───────────────────────────
def get_baseline() -> dict:
    return evaluate_design(BASELINE_PARAMS)


if __name__ == "__main__":
    print("Evaluating baseline design...")
    rec = compare_to_baseline(evaluate_design(BASELINE_PARAMS))
    print(f"\nBaseline design: {rec['airfoil_name']}")
    print(f"  Downforce: {rec['downforce_N']:.1f} N")
    print(f"  Drag:      {rec['drag_N']:.1f} N")
    print(f"  Efficiency:{rec['efficiency']:.2f}")
    print(f"  Cl/Cd:     {rec['Cl_Cd']:.2f}")
    print(f"  vs baseline: {rec['downforce_N_vs_baseline_pct']:+.1f}% downforce")
