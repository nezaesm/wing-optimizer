"""
conditions/evaluator.py
-----------------------
Multi-condition batch evaluator for WingOpt.

Evaluates a single design across an entire ConditionSet and computes:
  - Per-condition FidelityResult
  - Weighted aggregate metrics
  - Robustness metrics (standard deviation, worst-case)
  - Condition sensitivity summary
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from conditions.condition_set import ConditionSet, OperatingPoint
from fidelity.base import FidelityEvaluator, FidelityResult


@dataclass
class MultiConditionResult:
    """
    Aggregated result of evaluating one design across a ConditionSet.
    """
    design_params:        Dict[str, float]
    condition_set_name:   str
    per_condition:        List[Dict[str, Any]]          = field(default_factory=list)

    # ── Weighted aggregate metrics ─────────────────────────────────────────────
    weighted_downforce_N: Optional[float] = None
    weighted_drag_N:      Optional[float] = None
    weighted_efficiency:  Optional[float] = None

    # ── Robustness metrics ─────────────────────────────────────────────────────
    downforce_std:        Optional[float] = None    # std across conditions
    efficiency_std:       Optional[float] = None
    worst_efficiency:     Optional[float] = None    # minimum efficiency across points
    best_efficiency:      Optional[float] = None

    # ── Sensitivity flags ─────────────────────────────────────────────────────
    aoa_sensitive:        bool = False   # efficiency CoV > 0.15 across AoA
    rh_sensitive:         bool = False   # efficiency CoV > 0.15 across ride heights
    yaw_sensitive:        bool = False

    # ── Meta ──────────────────────────────────────────────────────────────────
    n_converged:          int  = 0
    n_failed:             int  = 0
    min_confidence:       float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "design_params":         self.design_params,
            "condition_set_name":    self.condition_set_name,
            "n_conditions":          len(self.per_condition),
            "n_converged":           self.n_converged,
            "n_failed":              self.n_failed,
            "min_confidence":        self.min_confidence,
            "weighted_downforce_N":  self.weighted_downforce_N,
            "weighted_drag_N":       self.weighted_drag_N,
            "weighted_efficiency":   self.weighted_efficiency,
            "downforce_std":         self.downforce_std,
            "efficiency_std":        self.efficiency_std,
            "worst_efficiency":      self.worst_efficiency,
            "best_efficiency":       self.best_efficiency,
            "aoa_sensitive":         self.aoa_sensitive,
            "rh_sensitive":          self.rh_sensitive,
            "yaw_sensitive":         self.yaw_sensitive,
            "per_condition":         self.per_condition,
        }


class MultiConditionEvaluator:
    """
    Evaluates a design at all operating points in a ConditionSet.

    Parameters
    ----------
    evaluator : FidelityEvaluator
        A configured fidelity-level evaluator (L0, L1, or L2).
    """

    def __init__(self, evaluator: FidelityEvaluator) -> None:
        self.evaluator = evaluator

    def evaluate(
        self,
        design_params: Dict[str, float],
        condition_set: ConditionSet,
    ) -> MultiConditionResult:

        mcr = MultiConditionResult(
            design_params      = design_params,
            condition_set_name = condition_set.name,
        )

        downforces:   List[float] = []
        drags:        List[float] = []
        efficiencies: List[float] = []
        weights:      List[float] = []

        for point in condition_set.points:
            override = point.override_dict()
            merged   = {**design_params, **override}

            result: FidelityResult = self.evaluator.evaluate(merged, override)

            per = {
                "label":          point.label,
                "weight":         point.weight,
                "fidelity_label": result.fidelity_label,
                "badge_color":    result.badge_color,
                "converged":      result.converged,
                "stall_flag":     result.stall_flag,
                "confidence":     result.confidence,
                "trust_label":    result.trust_label,
                "Cl":             result.Cl,
                "Cd":             result.Cd,
                "downforce_N":    result.downforce_N,
                "drag_N":         result.drag_N,
                "efficiency":     result.efficiency,
                "notes":          result.notes,
                "condition":      override,
            }
            mcr.per_condition.append(per)

            if result.converged:
                mcr.n_converged += 1
                if result.downforce_N is not None:
                    downforces.append(result.downforce_N)
                    weights.append(point.weight)
                if result.drag_N is not None:
                    drags.append(result.drag_N)
                if result.efficiency is not None:
                    efficiencies.append(result.efficiency)
            else:
                mcr.n_failed += 1

            mcr.min_confidence = min(mcr.min_confidence, result.confidence)

        # ── Aggregate ──────────────────────────────────────────────────────────
        if downforces and weights:
            total_w = sum(weights[:len(downforces)])
            mcr.weighted_downforce_N = (
                sum(d * w for d, w in zip(downforces, weights[:len(downforces)])) / total_w
            )
        if drags:
            w_drag = weights[:len(drags)]
            total_w = sum(w_drag)
            mcr.weighted_drag_N = (
                sum(d * w for d, w in zip(drags, w_drag)) / total_w
            )
        if efficiencies:
            total_w = sum(weights[:len(efficiencies)])
            mcr.weighted_efficiency = (
                sum(e * w for e, w in zip(efficiencies, weights[:len(efficiencies)])) / total_w
            )
            mcr.worst_efficiency = min(efficiencies)
            mcr.best_efficiency  = max(efficiencies)
            mcr.efficiency_std   = _std(efficiencies)
        if downforces:
            mcr.downforce_std = _std(downforces)

        # ── Sensitivity flags ──────────────────────────────────────────────────
        if efficiencies and mcr.weighted_efficiency and mcr.weighted_efficiency != 0:
            coV = (mcr.efficiency_std or 0.0) / abs(mcr.weighted_efficiency)
            mcr.aoa_sensitive = coV > 0.15
            mcr.rh_sensitive  = (
                "ride_height" in condition_set.name and coV > 0.10
            )
            mcr.yaw_sensitive = (
                "yaw" in condition_set.name and coV > 0.10
            )

        return mcr


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))
