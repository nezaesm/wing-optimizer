"""
conditions/condition_set.py
---------------------------
Multi-condition evaluation support for WingOpt.

A ConditionSet defines a collection of operating points over which a
design is evaluated.  This moves the project from single-point analysis
to robustness-aware design assessment.

Predefined condition sets
--------------------------
RACE_CONDITIONS      — slow corner / fast corner / straight  (3 points)
SENSITIVITY_SWEEP    — AoA sweep at fixed speed              (7 points)
RIDE_HEIGHT_SWEEP    — ride height variation                 (5 points)
YAW_SWEEP            — yaw sensitivity                      (5 points)
FULL_ENVELOPE        — combined speed / AoA grid             (12 points)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class OperatingPoint:
    """
    A single aerodynamic operating condition.

    All fields are optional; absent fields inherit from the design's
    nominal condition or the project-level default.
    """
    label:          str
    velocity_ms:    Optional[float] = None    # free-stream velocity
    aoa_deg:        Optional[float] = None    # mainplane angle of attack
    ride_height_pct: Optional[float] = None  # % chord above ground
    yaw_deg:        Optional[float] = None    # yaw angle (for asymmetric loads)
    Re:             Optional[float] = None    # chord Reynolds number
    flap_override_deg: Optional[float] = None # override flap setting

    @property
    def weight(self) -> float:
        """Weighting for aggregated metrics (set externally by ConditionSet)."""
        return self._weight

    @weight.setter
    def weight(self, v: float) -> None:
        self._weight = v

    def __post_init__(self) -> None:
        self._weight = 1.0

    def to_dict(self) -> Dict:
        return {
            "label":              self.label,
            "velocity_ms":        self.velocity_ms,
            "aoa_deg":            self.aoa_deg,
            "ride_height_pct":    self.ride_height_pct,
            "yaw_deg":            self.yaw_deg,
            "Re":                 self.Re,
            "flap_override_deg":  self.flap_override_deg,
            "weight":             self._weight,
        }

    def override_dict(self) -> Dict:
        """Return only the fields set in this operating point."""
        d = {}
        if self.velocity_ms is not None:
            d["velocity_ms"] = self.velocity_ms
        if self.aoa_deg is not None:
            d["aoa_deg"] = self.aoa_deg
        if self.ride_height_pct is not None:
            d["ride_height_pct"] = self.ride_height_pct
        if self.yaw_deg is not None:
            d["yaw_deg"] = self.yaw_deg
        if self.Re is not None:
            d["Re"] = self.Re
        if self.flap_override_deg is not None:
            d["flap_angle_deg"] = self.flap_override_deg
        return d


@dataclass
class ConditionSet:
    """
    Named collection of operating points with associated weights.

    Weights are normalised internally so they sum to 1.0.
    """
    name:         str
    description:  str
    points:       List[OperatingPoint] = field(default_factory=list)
    weights:      Optional[List[float]] = None   # if None, equal weighting

    def __post_init__(self) -> None:
        self._apply_weights()

    def _apply_weights(self) -> None:
        n = len(self.points)
        if n == 0:
            return
        if self.weights is None:
            w = [1.0 / n] * n
        else:
            total = sum(self.weights)
            w = [wi / total for wi in self.weights]
        for p, wi in zip(self.points, w):
            p.weight = wi

    def to_dict(self) -> Dict:
        return {
            "name":        self.name,
            "description": self.description,
            "n_points":    len(self.points),
            "points":      [p.to_dict() for p in self.points],
        }


# ── Pre-defined condition sets ─────────────────────────────────────────────────

RACE_CONDITIONS = ConditionSet(
    name="race_conditions",
    description="Three representative circuit conditions: slow corner, fast corner, straight.",
    points=[
        OperatingPoint(label="slow_corner",  velocity_ms=20.0,  aoa_deg=-12.0, ride_height_pct=25.0),
        OperatingPoint(label="fast_corner",  velocity_ms=40.0,  aoa_deg=-8.0,  ride_height_pct=35.0),
        OperatingPoint(label="straight",     velocity_ms=60.0,  aoa_deg=-4.0,  ride_height_pct=50.0),
    ],
    weights=[0.4, 0.4, 0.2],   # corners matter more than straights for grip
)

AOA_SWEEP = ConditionSet(
    name="aoa_sweep",
    description="AoA sweep at nominal speed to characterise polar.",
    points=[
        OperatingPoint(label=f"aoa_{a:.0f}", velocity_ms=41.67, aoa_deg=float(a))
        for a in range(-16, -1, 2)
    ],
)

RIDE_HEIGHT_SWEEP = ConditionSet(
    name="ride_height_sweep",
    description="Ride height sensitivity — varies ground clearance at nominal AoA and speed.",
    points=[
        OperatingPoint(label=f"rh_{rh:.0f}pct", velocity_ms=41.67, ride_height_pct=float(rh))
        for rh in [10, 20, 30, 50, 80]
    ],
)

YAW_SWEEP = ConditionSet(
    name="yaw_sweep",
    description="Yaw sensitivity sweep (asymmetric inflow — representative of cornering).",
    points=[
        OperatingPoint(label=f"yaw_{y:.0f}deg", velocity_ms=41.67, yaw_deg=float(y))
        for y in [-6, -3, 0, 3, 6]
    ],
)

FULL_ENVELOPE = ConditionSet(
    name="full_envelope",
    description="Combined velocity / AoA grid for full operating envelope assessment.",
    points=[
        OperatingPoint(
            label=f"v{v:.0f}_aoa{a:.0f}",
            velocity_ms=float(v),
            aoa_deg=float(a),
        )
        for v in [20, 40, 60]
        for a in [-14, -8, -4, -2]
    ],
)

PREDEFINED_SETS: Dict[str, ConditionSet] = {
    "race_conditions":   RACE_CONDITIONS,
    "aoa_sweep":         AOA_SWEEP,
    "ride_height_sweep": RIDE_HEIGHT_SWEEP,
    "yaw_sweep":         YAW_SWEEP,
    "full_envelope":     FULL_ENVELOPE,
}


def get_condition_set(name: str) -> ConditionSet:
    cs = PREDEFINED_SETS.get(name)
    if cs is None:
        raise ValueError(
            f"Unknown condition set '{name}'. "
            f"Available: {list(PREDEFINED_SETS.keys())}"
        )
    return cs
