"""
geometry/wing_definition.py
---------------------------
Multi-element wing definition dataclasses for WingOpt.

WingDefinition captures the complete parametric description of a
Formula-style front wing: mainplane, flap, endplates, and operating
position.  This replaces the previous single-section toy model with a
geometry that is credible enough to feed a Level-1 or Level-2 CFD
pipeline.

Key concepts
------------
- All chord dimensions are normalised by mainplane chord c=1.0.
- Spanwise positions are normalised by semi-span b/2.
- AoA (aoa_deg) is the mainplane incidence.  Flap deflection is
  additive on top of that.
- ride_height_pct is % of chord above the ground plane.
- Gurney flap height is % of chord.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class FlapElement:
    """Trailing-edge flap definition."""

    # Flap pivot location along mainplane chord (fraction)
    chord_fraction:   float = 0.75      # flap hinge at 75% chord
    # Flap chord as fraction of mainplane chord
    flap_chord_pct:   float = 0.25      # 25% chord
    # Deflection angle (positive = downward for downforce)
    deflection_deg:   float = 10.0      # degrees
    # Gap between mainplane TE and flap LE (fraction of chord)
    gap_pct:          float = 0.012     # 1.2% chord gap (aerodynamic slot)
    # Flap overlap (positive = flap LE behind mainplane TE)
    overlap_pct:      float = 0.005     # 0.5% overlap
    # Flap profile (NACA 4-digit string)
    profile:          str   = "0009"
    # Flap spanwise extent (fraction of full span)
    span_fraction:    float = 1.0       # full span

    def validate(self) -> List[str]:
        errors = []
        if not (0.0 < self.chord_fraction < 1.0):
            errors.append("flap chord_fraction must be in (0, 1)")
        if not (0.0 < self.flap_chord_pct <= 0.4):
            errors.append("flap_chord_pct must be in (0, 0.4]")
        if not (0.0 <= self.deflection_deg <= 40.0):
            errors.append("flap deflection_deg must be in [0, 40]")
        if not (-0.005 <= self.gap_pct <= 0.03):
            errors.append("gap_pct must be in [-0.005, 0.03]")
        return errors


@dataclass
class GurneyFlap:
    """Trailing-edge Gurney flap (small vertical tab)."""

    height_pct:  float = 0.0     # % of chord (0 = disabled)
    location:    str   = "main"  # "main" | "flap"

    @property
    def enabled(self) -> bool:
        return self.height_pct > 0.0

    def validate(self) -> List[str]:
        errors = []
        if not (0.0 <= self.height_pct <= 3.0):
            errors.append("gurney height_pct must be in [0, 3]%")
        if self.location not in ("main", "flap"):
            errors.append("gurney location must be 'main' or 'flap'")
        return errors


@dataclass
class EndplateGeometry:
    """Simplified endplate definition."""

    # Height as % of wing semi-span
    height_pct:      float = 15.0   # %
    # Chord-wise extent as fraction of mainplane chord
    chord_fraction:  float = 1.0    # full chord coverage
    # Offset from wing tip (inward, fraction of semi-span)
    inset_pct:       float = 0.0
    # Profile angle (cant angle, degrees from vertical)
    cant_deg:        float = 0.0

    def validate(self) -> List[str]:
        errors = []
        if not (2.0 <= self.height_pct <= 40.0):
            errors.append("endplate height_pct must be in [2, 40]%")
        if not (0.0 <= self.cant_deg <= 15.0):
            errors.append("endplate cant_deg must be in [0, 15]°")
        return errors


@dataclass
class SpanwiseSection:
    """
    Defines one spanwise station for washout / taper variation.

    eta  : normalised spanwise position (0 = root, 1 = tip)
    twist: local incidence modification relative to root (degrees)
    camber_scale: scale factor applied to mainplane camber at this section
    chord_scale:  chord taper ratio (1.0 = same as root)
    """
    eta:           float = 0.0
    twist_deg:     float = 0.0
    camber_scale:  float = 1.0
    chord_scale:   float = 1.0


@dataclass
class WingDefinition:
    """
    Complete parametric definition of a multi-element front wing.

    This is the single source of truth passed to the geometry generator,
    CFD case builder, constraint engine, and optimisation pipeline.
    """

    # ── Mainplane (NACA 4-series) ─────────────────────────────────────────────
    camber_pct:         float = 4.0      # max camber, % chord
    camber_pos_pct:     float = 40.0     # position of max camber, % chord
    thickness_pct:      float = 12.0     # max thickness, % chord
    aoa_deg:            float = -5.0     # mainplane angle of attack (negative = downforce)

    # ── Planform ──────────────────────────────────────────────────────────────
    aspect_ratio:       float = 3.5      # span² / area
    taper_ratio:        float = 1.0      # tip chord / root chord (1.0 = untapered)
    sweep_deg:          float = 0.0      # quarter-chord sweep

    # ── Flap ─────────────────────────────────────────────────────────────────
    flap:               FlapElement = field(default_factory=FlapElement)

    # ── Gurney flap ───────────────────────────────────────────────────────────
    gurney:             GurneyFlap  = field(default_factory=GurneyFlap)

    # ── Endplates ─────────────────────────────────────────────────────────────
    endplate:           EndplateGeometry = field(default_factory=EndplateGeometry)

    # ── Spanwise variation ────────────────────────────────────────────────────
    spanwise_sections:  List[SpanwiseSection] = field(default_factory=list)

    # ── Operating conditions (design point) ──────────────────────────────────
    ride_height_pct:    float = 30.0     # % chord above ground
    velocity_ms:        float = 41.67    # ~150 km/h
    rho:                float = 1.225    # kg/m³
    Re:                 float = 712_000  # chord Reynolds number

    # ── Legacy flat-dict compatibility ────────────────────────────────────────
    # These mirror the original 8-param dict used by the Level-0 solver
    # and LHS sampler; populated automatically from the fields above.
    flap_angle_deg:     float = field(init=False)
    flap_chord_pct:     float = field(init=False)
    endplate_h_pct:     float = field(init=False)

    def __post_init__(self) -> None:
        # Sync legacy fields from sub-objects so Level-0 solver still works
        self.flap_angle_deg = self.flap.deflection_deg
        self.flap_chord_pct = self.flap.flap_chord_pct * 100.0
        self.endplate_h_pct = self.endplate.height_pct

    # ── Derived properties ────────────────────────────────────────────────────

    @property
    def chord(self) -> float:
        """Reference chord = 1.0 (normalised)."""
        return 1.0

    @property
    def span(self) -> float:
        """Wing semi-span from aspect ratio and reference chord."""
        return self.aspect_ratio * self.chord

    @property
    def reference_area(self) -> float:
        """Reference planform area (span × mean chord)."""
        return self.span * self.chord

    @property
    def q_inf(self) -> float:
        """Dynamic pressure (Pa)."""
        return 0.5 * self.rho * self.velocity_ms ** 2

    @property
    def effective_aoa(self) -> float:
        """
        Effective angle of attack accounting for ride-height induced
        upwash (simplified linear estimate; ±1° correction for ride
        heights below 20% chord).
        """
        correction = 0.0
        if self.ride_height_pct < 20.0:
            correction = 0.8 * (20.0 - self.ride_height_pct) / 20.0
        return self.aoa_deg - correction

    @property
    def n_elements(self) -> int:
        """Number of aerodynamic elements (mainplane + enabled extras)."""
        n = 1
        if self.flap.deflection_deg > 0:
            n += 1
        if self.gurney.enabled:
            n += 1
        return n

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_flat_dict(self) -> Dict[str, float]:
        """
        Export the original 8-parameter flat dict required by the
        Level-0 solver and ML surrogate pipeline.
        """
        return {
            "camber_pct":        self.camber_pct,
            "camber_pos_pct":    self.camber_pos_pct,
            "thickness_pct":     self.thickness_pct,
            "aoa_deg":           self.aoa_deg,
            "flap_angle_deg":    self.flap.deflection_deg,
            "flap_chord_pct":    self.flap.flap_chord_pct * 100.0,
            "aspect_ratio":      self.aspect_ratio,
            "endplate_h_pct":    self.endplate.height_pct,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mainplane": {
                "camber_pct":     self.camber_pct,
                "camber_pos_pct": self.camber_pos_pct,
                "thickness_pct":  self.thickness_pct,
                "aoa_deg":        self.aoa_deg,
                "taper_ratio":    self.taper_ratio,
                "sweep_deg":      self.sweep_deg,
            },
            "planform": {
                "aspect_ratio":   self.aspect_ratio,
                "span":           self.span,
                "reference_area": self.reference_area,
                "n_elements":     self.n_elements,
            },
            "flap": {
                "chord_fraction":  self.flap.chord_fraction,
                "flap_chord_pct":  self.flap.flap_chord_pct,
                "deflection_deg":  self.flap.deflection_deg,
                "gap_pct":         self.flap.gap_pct,
                "overlap_pct":     self.flap.overlap_pct,
                "profile":         self.flap.profile,
            },
            "gurney": {
                "enabled":     self.gurney.enabled,
                "height_pct":  self.gurney.height_pct,
                "location":    self.gurney.location,
            },
            "endplate": {
                "height_pct":     self.endplate.height_pct,
                "chord_fraction": self.endplate.chord_fraction,
                "cant_deg":       self.endplate.cant_deg,
            },
            "operating_point": {
                "ride_height_pct": self.ride_height_pct,
                "velocity_ms":     self.velocity_ms,
                "Re":              self.Re,
                "q_inf":           self.q_inf,
                "effective_aoa":   self.effective_aoa,
            },
            "flat_params": self.to_flat_dict(),
        }

    @classmethod
    def from_flat_dict(cls, params: Dict[str, float]) -> "WingDefinition":
        """
        Reconstruct a WingDefinition from the legacy 8-param flat dict.
        """
        flap_chord_pct = params.get("flap_chord_pct", 25.0) / 100.0
        flap = FlapElement(
            deflection_deg = params.get("flap_angle_deg", 10.0),
            flap_chord_pct = flap_chord_pct,
        )
        endplate = EndplateGeometry(
            height_pct = params.get("endplate_h_pct", 15.0),
        )
        wd = cls(
            camber_pct     = params.get("camber_pct", 4.0),
            camber_pos_pct = params.get("camber_pos_pct", 40.0),
            thickness_pct  = params.get("thickness_pct", 12.0),
            aoa_deg        = params.get("aoa_deg", -5.0),
            aspect_ratio   = params.get("aspect_ratio", 3.5),
            flap           = flap,
            endplate       = endplate,
        )
        return wd
