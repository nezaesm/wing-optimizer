"""
cfd/parser.py
-------------
Post-processing helpers for CFD run artifacts.

Supports:
  - SU2  : history.csv (force coefficients + residuals)
  - OpenFOAM : postProcessing/forceCoeffs/0/coefficient.dat
                        + logs/simpleFoam.log (residuals)
  - Generic : plain-text residual files
  - Failed-run detection heuristics
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ── Data containers ────────────────────────────────────────────────────────────

@dataclass
class ForceHistory:
    """Time-series of integrated aerodynamic coefficients."""
    iterations: List[int]   = field(default_factory=list)
    Cl:         List[float] = field(default_factory=list)
    Cd:         List[float] = field(default_factory=list)
    Cm:         List[float] = field(default_factory=list)

    @property
    def converged_Cl(self) -> Optional[float]:
        """Mean of last 20% of iterations (converged estimate)."""
        return _tail_mean(self.Cl)

    @property
    def converged_Cd(self) -> Optional[float]:
        return _tail_mean(self.Cd)

    @property
    def converged_Cm(self) -> Optional[float]:
        return _tail_mean(self.Cm)

    def to_dict(self) -> Dict:
        return {
            "iterations":    self.iterations,
            "Cl":            self.Cl,
            "Cd":            self.Cd,
            "Cm":            self.Cm,
            "converged_Cl":  self.converged_Cl,
            "converged_Cd":  self.converged_Cd,
        }


@dataclass
class ResidualHistory:
    """Solver residual convergence history."""
    iterations:  List[int]   = field(default_factory=list)
    # Key: residual name (e.g. "Rho", "RhoU", "RhoE", "p", "Ux")
    residuals:   Dict[str, List[float]] = field(default_factory=dict)

    @property
    def final_residuals(self) -> Dict[str, float]:
        return {k: v[-1] for k, v in self.residuals.items() if v}

    @property
    def min_residual(self) -> Optional[float]:
        finals = [v for v in self.final_residuals.values() if v is not None]
        return min(finals) if finals else None

    def to_dict(self) -> Dict:
        return {
            "iterations":      self.iterations,
            "final_residuals": self.final_residuals,
            "min_residual":    self.min_residual,
        }


@dataclass
class ParseResult:
    """Combined parsing output for one CFD run."""
    forces:         Optional[ForceHistory]   = None
    residuals:      Optional[ResidualHistory] = None
    converged:      bool    = False
    failed:         bool    = False
    failure_reason: str     = ""
    solver_type:    str     = "unknown"  # "su2" | "openfoam" | "unknown"
    warnings:       List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "converged":      self.converged,
            "failed":         self.failed,
            "failure_reason": self.failure_reason,
            "solver_type":    self.solver_type,
            "forces":         self.forces.to_dict()    if self.forces    else None,
            "residuals":      self.residuals.to_dict() if self.residuals else None,
            "warnings":       self.warnings,
        }


# ── Main entry point ───────────────────────────────────────────────────────────

class ResultParser:
    """
    Unified parser for SU2 and OpenFOAM case directories.

    Usage
    -----
        parser = ResultParser()
        result = parser.parse(case_dir)
        print(result.forces.converged_Cl)
    """

    def parse(self, case_dir: Path) -> ParseResult:
        """Auto-detect solver type and parse all available artifacts."""
        case_dir = Path(case_dir)

        if not case_dir.exists():
            return ParseResult(failed=True, failure_reason="Case directory not found")

        # ── Detect solver ──────────────────────────────────────────────────────
        if (case_dir / "history.csv").exists():
            return self._parse_su2(case_dir)

        of_forces = case_dir / "postProcessing" / "forceCoeffs" / "0" / "coefficient.dat"
        if of_forces.exists():
            return self._parse_openfoam(case_dir)

        # Generic fallback: scan log files
        return self._parse_generic(case_dir)

    # ── SU2 ────────────────────────────────────────────────────────────────────

    def _parse_su2(self, case_dir: Path) -> ParseResult:
        result = ParseResult(solver_type="su2")
        history_path = case_dir / "history.csv"

        forces, parse_ok = _parse_su2_history(history_path)
        if not parse_ok:
            result.failed         = True
            result.failure_reason = "history.csv missing or unparseable"
            return result

        result.forces = forces

        # Check convergence via residuals column in history
        resid = _parse_su2_residuals(history_path)
        result.residuals = resid

        # Convergence: residual dropped ≥ 3 orders of magnitude
        result.converged = _check_su2_convergence(resid)
        if not result.converged:
            result.warnings.append("Residuals may not be fully converged.")

        # Failed-run detection
        failed, reason = _detect_failure_su2(case_dir, forces)
        result.failed         = failed
        result.failure_reason = reason
        return result

    # ── OpenFOAM ───────────────────────────────────────────────────────────────

    def _parse_openfoam(self, case_dir: Path) -> ParseResult:
        result = ParseResult(solver_type="openfoam")

        coeff_path = case_dir / "postProcessing" / "forceCoeffs" / "0" / "coefficient.dat"
        forces, ok = _parse_of_forces(coeff_path)
        if not ok:
            result.failed         = True
            result.failure_reason = "coefficient.dat missing or unparseable"
            return result

        result.forces = forces

        # Parse simpleFoam log for residuals
        log_path = case_dir / "logs" / "simpleFoam.log"
        if not log_path.exists():
            # Try root-level log
            for f in case_dir.glob("*.log"):
                log_path = f
                break

        if log_path.exists():
            result.residuals = _parse_of_residuals(log_path)
            result.converged = _check_of_convergence(result.residuals)
        else:
            result.warnings.append("No solver log found; convergence not assessed.")

        failed, reason = _detect_failure_of(case_dir, forces)
        result.failed         = failed
        result.failure_reason = reason
        return result

    # ── Generic fallback ───────────────────────────────────────────────────────

    def _parse_generic(self, case_dir: Path) -> ParseResult:
        result = ParseResult(solver_type="unknown")

        # Look for any .log with residual lines
        for log_file in sorted(case_dir.glob("*.log")):
            resid = _parse_generic_residuals(log_file)
            if resid.iterations:
                result.residuals = resid
                break

        run_status = case_dir / "run_status.json"
        if run_status.exists():
            import json
            try:
                status = json.loads(run_status.read_text())
                if status.get("exit_code") not in (0, None):
                    result.failed         = True
                    result.failure_reason = f"exit_code={status.get('exit_code')}"
                    return result
            except Exception:
                pass

        result.warnings.append("Solver type not identified; only partial parsing available.")
        return result


# ── SU2 helpers ───────────────────────────────────────────────────────────────

def _parse_su2_history(path: Path) -> Tuple[ForceHistory, bool]:
    """Parse SU2 history.csv. Returns (ForceHistory, success)."""
    forces = ForceHistory()
    try:
        with open(path, newline="") as fh:
            reader = csv.DictReader(fh)
            # SU2 headers vary; try common names
            for row in reader:
                try:
                    # Strip whitespace from keys
                    row = {k.strip(): v.strip() for k, v in row.items()}
                    it = int(row.get("Iteration", row.get("Iter", 0)))
                    cl = float(row.get("CL", row.get("Cl", row.get("Lift", 0))))
                    cd = float(row.get("CD", row.get("Cd", row.get("Drag", 0))))
                    cm = float(row.get("CMz", row.get("Cm", row.get("Moment", 0))))
                    forces.iterations.append(it)
                    forces.Cl.append(cl)
                    forces.Cd.append(cd)
                    forces.Cm.append(cm)
                except (ValueError, KeyError):
                    continue
        return forces, bool(forces.iterations)
    except Exception:
        return forces, False


def _parse_su2_residuals(path: Path) -> ResidualHistory:
    """Parse residual columns from SU2 history.csv."""
    resid = ResidualHistory()
    try:
        with open(path, newline="") as fh:
            reader = csv.DictReader(fh)
            resid_keys = None
            for row in reader:
                row = {k.strip(): v.strip() for k, v in row.items()}
                if resid_keys is None:
                    resid_keys = [k for k in row if "Res" in k or "rms" in k.lower()]
                    for k in resid_keys:
                        resid.residuals[k] = []
                try:
                    it = int(row.get("Iteration", row.get("Iter", 0)))
                    resid.iterations.append(it)
                    for k in (resid_keys or []):
                        try:
                            resid.residuals[k].append(float(row[k]))
                        except (ValueError, KeyError):
                            resid.residuals[k].append(float("nan"))
                except ValueError:
                    continue
    except Exception:
        pass
    return resid


def _check_su2_convergence(resid: ResidualHistory, drop_orders: float = 3.0) -> bool:
    """True if any residual dropped ≥ drop_orders orders of magnitude."""
    for vals in resid.residuals.values():
        clean = [v for v in vals if not (v != v)]  # remove NaN
        if len(clean) >= 10:
            try:
                import math
                drop = math.log10(abs(clean[0])) - math.log10(abs(clean[-1]))
                if drop >= drop_orders:
                    return True
            except (ValueError, ZeroDivisionError):
                pass
    return False


def _detect_failure_su2(case_dir: Path, forces: ForceHistory) -> Tuple[bool, str]:
    """Heuristic failure detection for SU2 runs."""
    if not forces.Cl:
        return True, "No force data parsed"

    if forces.converged_Cd is not None and forces.converged_Cd < 0:
        return True, f"Unphysical negative Cd = {forces.converged_Cd:.4f}"

    if forces.converged_Cl is not None and abs(forces.converged_Cl) > 10:
        return True, f"Cl magnitude unrealistic: {forces.converged_Cl:.2f}"

    # Check for divergence: last 10% vs prior 10% should not be exploding
    if len(forces.Cl) > 20:
        n = max(1, len(forces.Cl) // 10)
        recent  = [abs(v) for v in forces.Cl[-n:]]
        earlier = [abs(v) for v in forces.Cl[-2*n:-n]]
        if earlier and max(recent) > 5 * max(earlier):
            return True, "Cl diverging in final iterations"

    return False, ""


# ── OpenFOAM helpers ──────────────────────────────────────────────────────────

def _parse_of_forces(path: Path) -> Tuple[ForceHistory, bool]:
    """Parse OpenFOAM forceCoeffs coefficient.dat."""
    forces = ForceHistory()
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                if len(parts) < 3:
                    continue
                try:
                    t  = float(parts[0])  # time or iteration
                    cl = float(parts[1])  # Cl
                    cd = float(parts[2])  # Cd
                    cm = float(parts[3]) if len(parts) > 3 else 0.0
                    forces.iterations.append(int(t))
                    forces.Cl.append(cl)
                    forces.Cd.append(cd)
                    forces.Cm.append(cm)
                except (ValueError, IndexError):
                    continue
        return forces, bool(forces.iterations)
    except Exception:
        return forces, False


def _parse_of_residuals(log_path: Path) -> ResidualHistory:
    """Parse simpleFoam log for p and U residuals."""
    resid     = ResidualHistory()
    iteration = 0
    # Patterns: "Time = N" and "Solving for p, ... residual = X"
    time_re   = re.compile(r"^Time\s*=\s*(\d+)")
    resid_re  = re.compile(r"Solving for (\w+),.*?residual = ([\d.eE+\-]+)")
    try:
        current_step: Dict[str, float] = {}
        with open(log_path) as fh:
            for line in fh:
                m = time_re.match(line.strip())
                if m:
                    if current_step:
                        iteration += 1
                        resid.iterations.append(iteration)
                        for k, v in current_step.items():
                            resid.residuals.setdefault(k, []).append(v)
                        current_step = {}
                    continue
                m = resid_re.search(line)
                if m:
                    var, val = m.group(1), float(m.group(2))
                    current_step[var] = val
        if current_step:
            iteration += 1
            resid.iterations.append(iteration)
            for k, v in current_step.items():
                resid.residuals.setdefault(k, []).append(v)
    except Exception:
        pass
    return resid


def _check_of_convergence(resid: ResidualHistory, threshold: float = 1e-4) -> bool:
    """OpenFOAM converged if p residual < threshold."""
    p_vals = resid.residuals.get("p", [])
    if p_vals:
        return p_vals[-1] < threshold
    # Try any residual below threshold
    return any(v[-1] < threshold for v in resid.residuals.values() if v)


def _detect_failure_of(case_dir: Path, forces: ForceHistory) -> Tuple[bool, str]:
    """Heuristic failure detection for OpenFOAM runs."""
    if not forces.Cl:
        return True, "No coefficient data parsed from postProcessing"

    if forces.converged_Cd is not None and forces.converged_Cd < 0:
        return True, f"Unphysical negative Cd = {forces.converged_Cd:.4f}"

    return False, ""


# ── Generic helpers ────────────────────────────────────────────────────────────

def _parse_generic_residuals(log_path: Path) -> ResidualHistory:
    """Best-effort residual extraction from an arbitrary log file."""
    resid   = ResidualHistory()
    pat     = re.compile(r"(?:iter|step|it)[^\d]*(\d+)[^\d].*?([\d]+\.[\d]+[eE][+\-]\d+)", re.IGNORECASE)
    try:
        with open(log_path) as fh:
            for line in fh:
                m = pat.search(line)
                if m:
                    try:
                        it  = int(m.group(1))
                        val = float(m.group(2))
                        resid.iterations.append(it)
                        resid.residuals.setdefault("generic", []).append(val)
                    except ValueError:
                        pass
    except Exception:
        pass
    return resid


# ── Utility ────────────────────────────────────────────────────────────────────

def _tail_mean(values: List[float], fraction: float = 0.20) -> Optional[float]:
    """Mean of the last `fraction` of a list."""
    if not values:
        return None
    n = max(1, int(len(values) * fraction))
    tail = values[-n:]
    finite = [v for v in tail if v == v]  # drop NaN
    return sum(finite) / len(finite) if finite else None
