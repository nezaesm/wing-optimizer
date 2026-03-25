#!/usr/bin/env python3
"""
validate_physics.py
-------------------
Phase 1 deliverable: end-to-end physics pipeline validation.

Runs a single wing design through the complete evaluation pipeline and
prints a full aerodynamic report. Demonstrates the physics engine works
before any ML or optimisation is introduced.

Usage:
    python validate_physics.py                          # uses baseline params
    python validate_physics.py --camber 6 --aoa -10    # custom design
    python validate_physics.py --sweep                  # sweep AoA range
    python validate_physics.py --sample 20             # evaluate 20 random designs
"""

import sys
import argparse
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import BASELINE_PARAMS, PARAM_BOUNDS, REYNOLDS_NUMBER
from geometry.naca_generator import generate_naca4, apply_flap
from analysis.aero_solver import AeroSolver
from analysis.aero_metrics import evaluate_design, compare_to_baseline


# ── Pretty-print helpers ──────────────────────────────────────────────────────

def _bar(val, val_min, val_max, width=20, fill="█", empty="░"):
    frac = (val - val_min) / max(val_max - val_min, 1e-8)
    frac = max(0.0, min(1.0, frac))
    n    = int(frac * width)
    return fill * n + empty * (width - n)


def print_design_report(params: dict, title: str = "Wing Design Report") -> None:
    """Print a formatted aerodynamic report to stdout."""
    rec = compare_to_baseline(evaluate_design(params))

    w = 62
    print()
    print("╔" + "═" * w + "╗")
    print(f"║  {title:<{w-2}}║")
    print("╠" + "═" * w + "╣")

    # Parameters
    print(f"║  {'DESIGN PARAMETERS':<{w-2}}║")
    print("╠" + "─" * w + "╣")
    param_lines = [
        ("Airfoil section",    f"{rec['airfoil_name']}"),
        ("Max camber",         f"{params['camber_pct']:.1f}%  (at {params['camber_pos_pct']:.0f}% chord)"),
        ("Max thickness",      f"{params['thickness_pct']:.1f}%"),
        ("Angle of attack",    f"{params['aoa_deg']:.1f}°"),
        ("Flap deflection",    f"{params['flap_angle_deg']:.1f}°  ({params['flap_chord_pct']:.0f}% chord)"),
        ("Aspect ratio",       f"{params['aspect_ratio']:.2f}"),
        ("Endplate height",    f"{params['endplate_h_pct']:.1f}% span"),
        ("Reynolds number",    f"{REYNOLDS_NUMBER/1e6:.3f} × 10⁶"),
    ]
    for label, val in param_lines:
        print(f"║  {label:<26}  {val:<{w-30}}║")

    # Aerodynamic results
    print("╠" + "─" * w + "╣")
    print(f"║  {'AERODYNAMIC RESULTS (2D SECTION)':<{w-2}}║")
    print("╠" + "─" * w + "╣")

    results_2d = [
        ("Lift coefficient Cl",     f"{rec['Cl']:+.4f}"),
        ("Drag coefficient Cd",     f"{rec['Cd']:.5f}"),
        ("  → Pressure drag",       f"{rec['Cd_pressure']:.5f}"),
        ("  → Friction drag",       f"{rec['Cd_friction']:.5f}"),
        ("Pitching moment Cm",      f"{rec['Cm']:+.4f}"),
        ("Lift-to-drag ratio",      f"{rec['Cl_Cd']:.2f}"),
        ("Transition (upper)",      f"{rec['x_tr_upper']:.2f}c"),
        ("Transition (lower)",      f"{rec['x_tr_lower']:.2f}c"),
    ]
    for label, val in results_2d:
        print(f"║  {label:<26}  {val:<{w-30}}║")

    print("╠" + "─" * w + "╣")
    print(f"║  {'3D FINITE WING + DIMENSIONAL FORCES':<{w-2}}║")
    print("╠" + "─" * w + "╣")

    df_n  = rec["downforce_N"]
    dr_n  = rec["drag_N"]
    eff   = rec["efficiency"]
    Cl3d  = rec["Cl_3d"]
    Cdi   = rec["Cd_induced"]
    Cd3d  = rec["Cd_3d"]

    results_3d = [
        ("Cl (3D, finite wing)",   f"{Cl3d:+.4f}"),
        ("Induced drag Cd_i",      f"{Cdi:.5f}"),
        ("Total drag Cd (3D)",     f"{Cd3d:.5f}"),
        ("Downforce",              f"{df_n:+.1f} N  {'↑ good' if df_n < 0 else '↓ bad'}"),
        ("Drag",                   f"{dr_n:.1f} N"),
        ("Efficiency |DF|/Drag",   f"{eff:.2f}  {_bar(min(eff,30), 0, 30)}"),
    ]
    for label, val in results_3d:
        print(f"║  {label:<26}  {val:<{w-30}}║")

    # vs baseline
    print("╠" + "─" * w + "╣")
    print(f"║  {'VS BASELINE (NACA 4412 INV, α=-5°, NO FLAP)':<{w-2}}║")
    print("╠" + "─" * w + "╣")
    comparisons = [
        ("Downforce change",  f"{rec.get('downforce_N_vs_baseline_pct', 0):+.1f}%"),
        ("Drag change",       f"{rec.get('drag_N_vs_baseline_pct', 0):+.1f}%"),
        ("Efficiency change", f"{rec.get('efficiency_vs_baseline_pct', 0):+.1f}%"),
    ]
    for label, val in comparisons:
        print(f"║  {label:<26}  {val:<{w-30}}║")

    # Status
    status = "✓ CONVERGED" if rec["converged"] else "⚠ STALLED"
    print("╠" + "═" * w + "╣")
    print(f"║  Status: {status:<{w-10}}║")
    print("╚" + "═" * w + "╝")


def sweep_aoa(params: dict, aoa_range=(-18, -2, 17)) -> None:
    """Print a table of Cl/Cd vs AoA to show the polar curve."""
    print(f"\n{'AoA (°)':>8} {'Cl':>8} {'Cd':>8} {'L/D':>8} {'DF(N)':>10} {'Stall':>6}")
    print("─" * 56)
    for aoa in np.linspace(*aoa_range):
        p = {**params, "aoa_deg": aoa}
        r = evaluate_design(p)
        stall = "STALL" if r["stall_flag"] else ""
        print(f"{aoa:>8.1f} {r['Cl']:>8.4f} {r['Cd']:>8.5f} "
              f"{r['Cl_Cd']:>8.2f} {r['downforce_N']:>10.1f} {stall:>6}")


def evaluate_n_random(n: int, seed: int = 42) -> None:
    """Evaluate N random designs and show statistics."""
    from data.sampler import latin_hypercube_sample
    samples = latin_hypercube_sample(n_samples=n, seed=seed)

    import time
    t0 = time.time()
    results = [evaluate_design(p) for p in samples]
    elapsed = time.time() - t0

    import pandas as pd
    df = pd.DataFrame(results)
    conv = df[df["converged"] == 1]

    print(f"\nEvaluated {n} designs in {elapsed:.2f}s ({elapsed/n*1000:.1f} ms/design)")
    print(f"  Converged: {len(conv)}/{n}  ({len(conv)/n*100:.0f}%)")
    if len(conv):
        print(f"\n  Downforce: {conv['downforce_N'].min():.1f} → {conv['downforce_N'].max():.1f} N  "
              f"(mean {conv['downforce_N'].mean():.1f})")
        print(f"  Drag:      {conv['drag_N'].min():.1f} → {conv['drag_N'].max():.1f} N")
        print(f"  Efficiency:{conv['efficiency'].min():.1f} → {conv['efficiency'].max():.1f}  "
              f"(mean {conv['efficiency'].mean():.1f})")
        best = conv.loc[conv["efficiency"].idxmax()]
        print(f"\n  Best design (max efficiency = {best['efficiency']:.2f}):")
        for p in ["camber_pct","thickness_pct","aoa_deg","flap_angle_deg","aspect_ratio"]:
            print(f"    {p:<22} = {best[p]:.2f}")


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 1: Wing physics validation")
    parser.add_argument("--camber",      type=float, default=None)
    parser.add_argument("--camber-pos",  type=float, default=None)
    parser.add_argument("--thickness",   type=float, default=None)
    parser.add_argument("--aoa",         type=float, default=None)
    parser.add_argument("--flap",        type=float, default=None)
    parser.add_argument("--flap-chord",  type=float, default=None)
    parser.add_argument("--ar",          type=float, default=None)
    parser.add_argument("--endplate",    type=float, default=None)
    parser.add_argument("--sweep",       action="store_true")
    parser.add_argument("--sample",      type=int,   default=None)
    args = parser.parse_args()

    # Build params from baseline + any overrides
    params = BASELINE_PARAMS.copy()
    if args.camber      is not None: params["camber_pct"]      = args.camber
    if args.camber_pos  is not None: params["camber_pos_pct"]  = args.camber_pos
    if args.thickness   is not None: params["thickness_pct"]   = args.thickness
    if args.aoa         is not None: params["aoa_deg"]          = args.aoa
    if args.flap        is not None: params["flap_angle_deg"]  = args.flap
    if args.flap_chord  is not None: params["flap_chord_pct"]  = args.flap_chord
    if args.ar          is not None: params["aspect_ratio"]    = args.ar
    if args.endplate    is not None: params["endplate_h_pct"]  = args.endplate

    if args.sample:
        evaluate_n_random(args.sample)
    elif args.sweep:
        print_design_report(params, "Baseline Design")
        print("\nAoA Sweep (polar curve):")
        sweep_aoa(params)
    else:
        print_design_report(params, "Wing Aerodynamic Report")
