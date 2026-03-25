"""
geometry/geometry_validator.py
------------------------------
Geometry validity checks for WingDefinition.

Checks cover:
  - Parameter range bounds (physical + manufacturing)
  - Multi-element consistency (gap, overlap, flap hinge placement)
  - Stall-margin warnings
  - Packaging constraints (ride height, endplate clearance)
  - Geometric singularity avoidance (zero-gap, over-deflection)

Returns a ValidationReport with errors (fatal) and warnings (non-fatal).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from geometry.wing_definition import WingDefinition


@dataclass
class ValidationReport:
    errors:   List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return len(self.errors) == 0

    @property
    def has_warnings(self) -> bool:
        return len(self.warnings) > 0

    def to_dict(self):
        return {
            "valid":    self.valid,
            "errors":   self.errors,
            "warnings": self.warnings,
        }


def validate(wd: WingDefinition) -> ValidationReport:
    """Run all geometry checks. Returns a ValidationReport."""
    report = ValidationReport()

    _check_mainplane(wd, report)
    _check_flap(wd, report)
    _check_gurney(wd, report)
    _check_endplate(wd, report)
    _check_planform(wd, report)
    _check_multi_element_consistency(wd, report)
    _check_operating_point(wd, report)
    _check_stall_margin(wd, report)

    return report


# ── Individual check functions ─────────────────────────────────────────────────

def _check_mainplane(wd: WingDefinition, r: ValidationReport) -> None:
    if not (0.0 <= wd.camber_pct <= 9.0):
        r.errors.append(f"camber_pct={wd.camber_pct:.1f} out of range [0, 9]%")
    if not (20.0 <= wd.camber_pos_pct <= 60.0):
        r.errors.append(f"camber_pos_pct={wd.camber_pos_pct:.0f} out of range [20, 60]%c")
    if not (6.0 <= wd.thickness_pct <= 20.0):
        r.errors.append(f"thickness_pct={wd.thickness_pct:.1f} out of range [6, 20]%")
    if not (-18.0 <= wd.aoa_deg <= 2.0):
        r.errors.append(f"aoa_deg={wd.aoa_deg:.1f} out of range [-18, 2]°")

    # Warn about likely stall region
    if wd.aoa_deg < -14:
        r.warnings.append(
            f"aoa_deg={wd.aoa_deg:.1f}° is near or past empirical stall for this configuration. "
            "Level-0 solver reliability degrades significantly below -14°."
        )
    if wd.camber_pct > 7.5:
        r.warnings.append(
            "High camber (>7.5%) combined with flap deflection may produce "
            "leading-edge separation not captured by Level-0 thin-airfoil theory."
        )
    if wd.thickness_pct < 8.0:
        r.warnings.append(
            "Thin sections (<8%) have sharp leading edges; Level-0 BL method "
            "may over-predict attached-flow drag."
        )


def _check_flap(wd: WingDefinition, r: ValidationReport) -> None:
    flap = wd.flap
    errors = flap.validate()
    r.errors.extend(errors)

    if flap.deflection_deg > 30:
        r.warnings.append(
            "Flap deflection >30° is likely to produce massive separation. "
            "Level-0 prediction accuracy is low at these settings; use L1 CFD."
        )
    if flap.gap_pct < 0.008:
        r.warnings.append(
            f"Flap gap ({flap.gap_pct*100:.1f}%c) is very small. "
            "Risk of slot choke at high deflection. Verify with L1 CFD."
        )
    if flap.gap_pct > 0.025:
        r.warnings.append(
            f"Flap gap ({flap.gap_pct*100:.1f}%c) is large; expect reduced "
            "slot jet energisation and lower peak Cl."
        )

    # Hinge placement must leave room for flap chord
    if flap.chord_fraction + flap.flap_chord_pct > 1.05:
        r.errors.append(
            "Flap hinge + flap chord exceeds mainplane chord length. "
            "Reduce chord_fraction or flap_chord_pct."
        )


def _check_gurney(wd: WingDefinition, r: ValidationReport) -> None:
    errors = wd.gurney.validate()
    r.errors.extend(errors)
    if wd.gurney.enabled and wd.gurney.height_pct > 2.0:
        r.warnings.append(
            f"Gurney flap height ({wd.gurney.height_pct:.1f}%c) is large; "
            "expect significant base drag increase. Validate with L1 CFD."
        )


def _check_endplate(wd: WingDefinition, r: ValidationReport) -> None:
    errors = wd.endplate.validate()
    r.errors.extend(errors)

    clearance = wd.ride_height_pct / 100.0   # as fraction of chord
    ep_height = wd.endplate.height_pct / 100.0 * wd.span / 2.0   # physical height fraction

    if wd.endplate.height_pct < 5.0:
        r.warnings.append(
            "Very small endplate (< 5% span). Tip vortex suppression will be minimal."
        )
    if wd.endplate.height_pct > 35.0:
        r.warnings.append(
            "Endplate height > 35% span may exceed regulatory limits in Formula SAE."
        )


def _check_planform(wd: WingDefinition, r: ValidationReport) -> None:
    if not (2.0 <= wd.aspect_ratio <= 5.5):
        r.errors.append(f"aspect_ratio={wd.aspect_ratio:.1f} out of range [2, 5.5]")
    if not (0.4 <= wd.taper_ratio <= 1.0):
        r.warnings.append(
            f"taper_ratio={wd.taper_ratio:.2f} outside typical range [0.4, 1.0]. "
            "Highly tapered wings shift induced drag distribution."
        )
    if not (-5.0 <= wd.sweep_deg <= 30.0):
        r.warnings.append(
            f"sweep_deg={wd.sweep_deg:.1f}° outside typical range [-5, 30]°."
        )


def _check_multi_element_consistency(wd: WingDefinition, r: ValidationReport) -> None:
    """Cross-parameter checks between elements."""
    # High camber + large flap deflection + no gap = strong separation risk
    loading_index = wd.camber_pct * wd.flap.deflection_deg / 100.0
    if loading_index > 2.5:
        r.warnings.append(
            f"Combined loading index (camber × flap / 100 = {loading_index:.2f}) is high. "
            "Risk of leading-edge bubble or full separation on mainplane. Validate with L1 CFD."
        )

    # Gurney on flap + high flap deflection = very high base drag
    if wd.gurney.enabled and wd.gurney.location == "flap" and wd.flap.deflection_deg > 25:
        r.warnings.append(
            "Gurney on flap with high deflection: base drag penalty may outweigh "
            "Cl gain. Check efficiency metric with L1 CFD."
        )


def _check_operating_point(wd: WingDefinition, r: ValidationReport) -> None:
    if not (5.0 <= wd.ride_height_pct <= 100.0):
        r.errors.append(
            f"ride_height_pct={wd.ride_height_pct:.1f} out of range [5, 100]%c"
        )
    if wd.ride_height_pct < 10.0:
        r.warnings.append(
            f"Very low ride height ({wd.ride_height_pct:.1f}%c). "
            "Ground effect is strong; Level-0 ignores ground plane. "
            "Use L1 or L2 CFD with ground boundary condition."
        )
    if not (20.0 <= wd.velocity_ms <= 90.0):
        r.warnings.append(
            f"velocity_ms={wd.velocity_ms:.1f} outside typical range [20, 90] m/s."
        )


def _check_stall_margin(wd: WingDefinition, r: ValidationReport) -> None:
    """
    Heuristic stall margin check based on combined loading.
    Real stall angle depends on geometry, Re, and flow history —
    this is only a first-order warning trigger.
    """
    # Empirical stall Cl ~ 1.3 + 0.02*thickness_pct for inverted NACA 4-series
    cl_max_estimate = 1.3 + 0.02 * wd.thickness_pct
    # Approximate design Cl from thin-airfoil + flap
    cl_estimate = (
        2 * 3.14159 * abs(wd.aoa_deg) / 57.3
        + wd.camber_pct / 100.0 * 2 * 3.14159
        + wd.flap.deflection_deg / 57.3
    )

    margin = cl_max_estimate - cl_estimate
    if margin < 0.15:
        r.warnings.append(
            f"Estimated stall margin is low (~{margin:.2f} Cl units). "
            "Operating close to stall — validate with L1 CFD before trusting Level-0 predictions."
        )
    elif margin < 0.30:
        r.warnings.append(
            f"Moderate stall margin (~{margin:.2f} Cl units). "
            "Consider checking across AoA sweep."
        )
