"""
validation/validator.py
-----------------------
Phase 3 validation: re-evaluate ML-optimised candidates with the
full physics solver and compare surrogate predictions against truth.

Workflow:
  1. Load Pareto front from results/optimized_designs.json
  2. Select top-N candidates (by efficiency)
  3. Run each through the physics solver (AeroSolver)
  4. Compare ML prediction vs physics truth on every metric
  5. Save validated results + residual report

This is the final credibility check that closes the ML→physics loop:
  "The ML model found this design. The physics confirms it."
"""

import json
import time
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import RESULTS_DIR, OPT_TOP_N_VALIDATE, BASELINE_PARAMS
from analysis.aero_metrics import evaluate_design, compare_to_baseline
from models.predict import predict_all


def run_validation(
    n_top: int   = OPT_TOP_N_VALIDATE,
    verbose: bool = True,
) -> dict:
    """
    Load Pareto candidates, re-evaluate with physics, compare to ML.

    Args:
        n_top:   how many Pareto candidates to validate
        verbose: print progress

    Returns:
        dict with validated_designs, comparison_table, summary_stats
    """
    opt_path = RESULTS_DIR / "optimized_designs.json"
    if not opt_path.exists():
        raise FileNotFoundError(
            "Run optimization/nsga2_runner.py first to generate optimized_designs.json"
        )

    with open(opt_path) as f:
        opt_results = json.load(f)

    pareto_params = opt_results["pareto_params"]
    pareto_preds  = opt_results["pareto_predictions"]

    if verbose:
        print("=" * 65)
        print("Validation Layer: Physics Re-evaluation of Optimised Candidates")
        print("=" * 65)
        print(f"Pareto front: {len(pareto_params)} solutions")

    # ── Select top-N by surrogate efficiency ─────────────────────────────────
    efficiencies = [
        abs(p.get("downforce_N", 0)) / max(p.get("drag_N", 1), 0.1)
        for p in pareto_preds
    ]
    top_idx = sorted(range(len(efficiencies)), key=lambda i: -efficiencies[i])[:n_top]

    if verbose:
        print(f"Validating top {len(top_idx)} candidates with physics solver...\n")

    # ── Baseline reference ────────────────────────────────────────────────────
    baseline_physics = evaluate_design(BASELINE_PARAMS)

    # ── Validate each candidate ───────────────────────────────────────────────
    validated = []
    t0 = time.time()

    for rank, idx in enumerate(top_idx):
        params = pareto_params[idx]
        ml_pred = pareto_preds[idx]

        # Physics truth
        physics = compare_to_baseline(evaluate_design(params))

        # ML ensemble prediction on same params
        ml_full = predict_all(params)
        ml_ens  = ml_full["ensemble"]

        # Residuals (physics - ML, as % of physics)
        def _err(key):
            phys_val = physics.get(key, 0.0)
            ml_val   = ml_ens.get(key, 0.0)
            if abs(phys_val) < 1e-8:
                return 0.0
            return (ml_val - phys_val) / abs(phys_val) * 100.0

        record = {
            "rank":      rank + 1,
            "params":    params,
            # Physics ground truth
            "physics": {
                "Cl":          physics["Cl"],
                "Cd":          physics["Cd"],
                "downforce_N": physics["downforce_N"],
                "drag_N":      physics["drag_N"],
                "efficiency":  physics["efficiency"],
                "Cl_3d":       physics["Cl_3d"],
                "Cd_3d":       physics["Cd_3d"],
                "converged":   bool(physics["converged"]),
                "stall":       bool(physics["stall_flag"]),
            },
            # ML surrogate prediction
            "ml_prediction": {
                "Cl":          ml_ens.get("Cl", 0),
                "Cd":          ml_ens.get("Cd", 0),
                "downforce_N": ml_ens.get("downforce_N", 0),
                "drag_N":      ml_ens.get("drag_N", 0),
                "efficiency":  ml_ens.get("efficiency", 0),
                "reliability": ml_full.get("reliability", 1.0),
            },
            # Residuals (ML vs physics)
            "residuals_pct": {
                "Cl":          _err("Cl"),
                "Cd":          _err("Cd"),
                "downforce_N": _err("downforce_N"),
                "drag_N":      _err("drag_N"),
                "efficiency":  _err("efficiency"),
            },
            # vs baseline
            "vs_baseline": {
                "downforce_pct": physics.get("downforce_N_vs_baseline_pct", 0),
                "drag_pct":      physics.get("drag_N_vs_baseline_pct", 0),
                "efficiency_pct": physics.get("efficiency_vs_baseline_pct", 0),
            },
        }
        validated.append(record)

        if verbose:
            ph = record["physics"]
            res = record["residuals_pct"]
            vb  = record["vs_baseline"]
            stall_str = " ⚠ STALL" if ph["stall"] else ""
            print(f"  Rank #{rank+1:2d}{stall_str}")
            print(f"    Physics: DF={ph['downforce_N']:+.1f}N  D={ph['drag_N']:.1f}N  eff={ph['efficiency']:.2f}")
            print(f"    ML pred: DF={record['ml_prediction']['downforce_N']:+.1f}N  "
                  f"D={record['ml_prediction']['drag_N']:.1f}N  "
                  f"reliability={record['ml_prediction']['reliability']:.3f}")
            print(f"    Error:   DF={res['downforce_N']:+.1f}%  D={res['drag_N']:+.1f}%  eff={res['efficiency']:+.1f}%")
            print(f"    vs base: DF={vb['downforce_pct']:+.1f}%  D={vb['drag_pct']:+.1f}%")
            print()

    elapsed = time.time() - t0

    # ── Summary statistics ────────────────────────────────────────────────────
    converged = [v for v in validated if v["physics"]["converged"] and not v["physics"]["stall"]]

    def _mean_abs_err(key):
        if not converged:
            return 0.0
        return float(np.mean([abs(v["residuals_pct"][key]) for v in converged]))

    summary = {
        "n_validated":        len(validated),
        "n_converged":        len(converged),
        "mape_downforce":     _mean_abs_err("downforce_N"),
        "mape_drag":          _mean_abs_err("drag_N"),
        "mape_efficiency":    _mean_abs_err("efficiency"),
        "validation_time_s":  elapsed,
        "baseline_efficiency": baseline_physics["efficiency"],
    }

    if converged:
        best = max(converged, key=lambda v: abs(v["physics"]["downforce_N"]))
        best_eff = max(converged, key=lambda v: v["physics"]["efficiency"])
        summary["best_downforce_N"]     = best["physics"]["downforce_N"]
        summary["best_efficiency"]      = best_eff["physics"]["efficiency"]
        summary["best_improvement_pct"] = best_eff["vs_baseline"]["efficiency_pct"]

    if verbose:
        print("─" * 65)
        print("Validation Summary")
        print("─" * 65)
        print(f"  Converged designs:    {len(converged)}/{len(validated)}")
        print(f"  Mean |error| DF:      {summary['mape_downforce']:.1f}%")
        print(f"  Mean |error| Drag:    {summary['mape_drag']:.1f}%")
        print(f"  Mean |error| Eff:     {summary['mape_efficiency']:.1f}%")
        if converged:
            print(f"  Best downforce:       {summary['best_downforce_N']:+.1f} N")
            print(f"  Best efficiency:      {summary['best_efficiency']:.2f}")
            print(f"  vs baseline eff:      {summary['best_improvement_pct']:+.1f}%")
        print(f"  Time:                 {elapsed:.1f}s")

    result = {
        "validated_designs": validated,
        "summary":           summary,
        "baseline":          baseline_physics,
    }

    # Save
    out_path = RESULTS_DIR / "validated_designs.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, default=float)
    if verbose:
        print(f"\nSaved: {out_path}")

    return result


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    run_validation(n_top=OPT_TOP_N_VALIDATE)
