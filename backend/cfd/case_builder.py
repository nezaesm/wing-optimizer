"""
cfd/case_builder.py
-------------------
Unified case builder that dispatches to the appropriate fidelity-level
evaluator's case-building method.

CaseBuilder is a convenience wrapper so application code does not need
to instantiate Level1Evaluator / Level2Evaluator directly just to build
a case directory.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional


class CaseBuilder:
    """
    Build a CFD case directory for Level-1 or Level-2 simulation.

    Parameters
    ----------
    fidelity : int  — 1 for 2-D section CFD, 2 for 3-D full-wing CFD
    solver   : str  — "su2" | "openfoam"
    """

    def __init__(self, fidelity: int = 1, solver: str = "su2") -> None:
        if fidelity not in (1, 2):
            raise ValueError("fidelity must be 1 or 2")
        self.fidelity = fidelity
        self.solver   = solver

    def build(
        self,
        design_params: Dict[str, float],
        condition: Optional[Dict[str, float]] = None,
    ) -> Path:
        """
        Generate the complete case directory.
        Returns the path so the user can inspect or submit it.
        """
        if self.fidelity == 1:
            from fidelity.level1_cfd import Level1Evaluator
            ev = Level1Evaluator(solver=self.solver, stub_mode=False)
            return ev.build_case_only(design_params, condition)
        else:
            from fidelity.level2_cfd import Level2Evaluator
            ev = Level2Evaluator(solver=self.solver, stub_mode=False)
            return ev.build_case_only(design_params, condition)

    def build_and_submit_hpc(
        self,
        design_params:   Dict[str, float],
        condition:       Optional[Dict[str, float]] = None,
        hpc_submit_cmd:  str = "sbatch",
    ) -> Dict[str, str]:
        """Build and submit to HPC. Returns job metadata dict."""
        if self.fidelity != 2:
            raise NotImplementedError("HPC submission only supported for Level-2 (3-D) cases.")
        from fidelity.level2_cfd import Level2Evaluator
        ev = Level2Evaluator(solver=self.solver, hpc_submit_cmd=hpc_submit_cmd, stub_mode=False)
        return ev.submit_hpc(design_params, condition)
