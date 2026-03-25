"""
fidelity/base.py
----------------
Core abstractions for the multi-fidelity evaluation stack.

Fidelity levels in WingOpt
---------------------------
Level 0  – Conceptual screening
           Fast in-house panel / boundary-layer solver (Glauert + Thwaites).
           Suitable for design-space mapping, surrogate training, NSGA-II screening.
           NOT a substitute for validated CFD.  Uncertainty: ±15–30% on absolute forces.

Level 1  – 2-D CFD section analysis
           RANS/Euler CFD on the 2-D airfoil cross-section (e.g. SU2, OpenFOAM).
           Captures separation, multi-element interaction at section level.
           Uncertainty: ±5–10% on integrated coefficients.

Level 2  – 3-D RANS CFD
           Full 3-D Reynolds-averaged Navier-Stokes simulation of the assembled wing.
           Truth layer for validation and design sign-off.
           Uncertainty: ±2–5% (mesh/turbulence-model dependent).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, List, Optional


class FidelityLevel(Enum):
    LEVEL_0_CONCEPTUAL  = 0   # fast in-house solver
    LEVEL_1_CFD_2D      = 1   # 2-D RANS section analysis
    LEVEL_2_CFD_3D      = 2   # 3-D full-wing RANS


# Human-readable labels used in UI and API responses
FIDELITY_LABELS: Dict[FidelityLevel, Dict[str, str]] = {
    FidelityLevel.LEVEL_0_CONCEPTUAL: {
        "short":       "L0 Conceptual",
        "full":        "Level 0 — Conceptual Screening (panel/BL solver)",
        "badge_color": "amber",
        "description": (
            "Fast in-house solver based on Glauert thin-airfoil theory and "
            "Thwaites boundary-layer method. Suitable for screening and "
            "surrogate training. NOT validated CFD. Absolute force values "
            "carry ±15–30% uncertainty."
        ),
        "suitable_for": [
            "Design-space exploration",
            "Surrogate training dataset generation",
            "NSGA-II population evaluation",
            "Rapid parametric sweeps",
        ],
        "not_suitable_for": [
            "Sign-off or final design validation",
            "Predicting separation or reattachment",
            "Multi-element interaction fidelity",
            "Accurate drag breakdown",
        ],
    },
    FidelityLevel.LEVEL_1_CFD_2D: {
        "short":       "L1 2-D CFD",
        "full":        "Level 1 — 2-D RANS Section CFD",
        "badge_color": "blue",
        "description": (
            "2-D RANS CFD on the wing cross-section. Captures boundary-layer "
            "separation, multi-element slot flow, and nonlinear lift behaviour. "
            "Uncertainty: ±5–10% on integrated section coefficients."
        ),
        "suitable_for": [
            "Section-level aerodynamic evaluation",
            "Multi-element geometry verification",
            "Surrogate model calibration",
            "High-fidelity Pareto candidate screening",
        ],
        "not_suitable_for": [
            "3-D tip effects and endplate interaction",
            "Spanwise twist / taper effects",
            "Final 3-D force sign-off",
        ],
    },
    FidelityLevel.LEVEL_2_CFD_3D: {
        "short":       "L2 3-D RANS",
        "full":        "Level 2 — 3-D Full-Wing RANS CFD",
        "badge_color": "green",
        "description": (
            "Full 3-D RANS simulation of the assembled wing including endplates, "
            "tip vortices, and spanwise flow. Truth layer for design validation. "
            "Uncertainty: ±2–5% (mesh/turbulence-model dependent)."
        ),
        "suitable_for": [
            "Final design validation",
            "3-D force and moment sign-off",
            "Tip vortex and downwash analysis",
            "Endplate effectiveness confirmation",
        ],
        "not_suitable_for": [
            "Rapid parametric sweeps (hours per run)",
        ],
    },
}


@dataclass
class FidelityResult:
    """Standardised result container for any fidelity level."""

    # ── Identification ──────────────────────────────────────────────────────
    fidelity:        FidelityLevel
    design_params:   Dict[str, float]
    condition:       Optional[Dict[str, float]] = None   # operating point

    # ── Primary aerodynamic outputs ─────────────────────────────────────────
    Cl:              Optional[float] = None
    Cd:              Optional[float] = None
    Cm:              Optional[float] = None
    downforce_N:     Optional[float] = None
    drag_N:          Optional[float] = None
    efficiency:      Optional[float] = None
    Cl_Cd:           Optional[float] = None

    # ── Uncertainty / confidence ─────────────────────────────────────────────
    Cl_uncertainty:  Optional[float] = None   # ±1σ or interval half-width
    Cd_uncertainty:  Optional[float] = None
    confidence:      float = 0.0              # [0, 1]  global confidence score
    trust_label:     str   = "unset"          # "high" | "moderate" | "low" | "extrapolation"

    # ── Run metadata ──────────────────────────────────────────────────────────
    converged:       bool  = False
    stall_flag:      bool  = False
    solver_time_s:   float = 0.0
    run_id:          Optional[str] = None
    artifact_dir:    Optional[str] = None
    notes:           List[str] = field(default_factory=list)

    # ── Extras (pressure, BL, mesh info …) ──────────────────────────────────
    extras:          Dict[str, Any] = field(default_factory=dict)

    @property
    def fidelity_label(self) -> str:
        return FIDELITY_LABELS[self.fidelity]["short"]

    @property
    def badge_color(self) -> str:
        return FIDELITY_LABELS[self.fidelity]["badge_color"]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fidelity":        self.fidelity.value,
            "fidelity_label":  self.fidelity_label,
            "badge_color":     self.badge_color,
            "design_params":   self.design_params,
            "condition":       self.condition,
            "Cl":              self.Cl,
            "Cd":              self.Cd,
            "Cm":              self.Cm,
            "downforce_N":     self.downforce_N,
            "drag_N":          self.drag_N,
            "efficiency":      self.efficiency,
            "Cl_Cd":           self.Cl_Cd,
            "Cl_uncertainty":  self.Cl_uncertainty,
            "Cd_uncertainty":  self.Cd_uncertainty,
            "confidence":      self.confidence,
            "trust_label":     self.trust_label,
            "converged":       self.converged,
            "stall_flag":      self.stall_flag,
            "solver_time_s":   self.solver_time_s,
            "run_id":          self.run_id,
            "artifact_dir":    self.artifact_dir,
            "notes":           self.notes,
        }


class FidelityEvaluator:
    """
    Abstract base class for fidelity-level evaluators.
    Concrete subclasses implement `evaluate()`.
    """

    level: FidelityLevel = NotImplemented

    def evaluate(
        self,
        design_params: Dict[str, float],
        condition: Optional[Dict[str, float]] = None,
    ) -> FidelityResult:
        raise NotImplementedError

    def _base_result(
        self,
        design_params: Dict[str, float],
        condition: Optional[Dict[str, float]],
    ) -> FidelityResult:
        return FidelityResult(
            fidelity=self.level,
            design_params=design_params,
            condition=condition,
        )
