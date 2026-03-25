"""
geometry/naca_generator.py
--------------------------
Generates NACA 4-series airfoil coordinates from first principles.

The NACA 4-series designation is MPXX where:
  M = max camber as fraction of chord  (first digit / 100)
  P = position of max camber           (second digit / 10)
  XX= max thickness as fraction of chord (last two digits / 100)

For a front wing, the section is inverted (suction surface faces DOWN
to generate downforce), which we handle by negating the y-coordinates
before applying angle of attack rotation.

All coordinates are normalised: chord = 1.0, LE at (0,0), TE at (1,0).
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Tuple
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import N_PANELS, COSINE_SPACING


@dataclass
class AirfoilGeometry:
    """Container for a fully-described airfoil section."""
    name:       str
    x_upper:    np.ndarray      # upper surface x coords (LE→TE)
    y_upper:    np.ndarray      # upper surface y coords
    x_lower:    np.ndarray      # lower surface x coords (LE→TE)
    y_lower:    np.ndarray      # lower surface y coords
    x_camber:   np.ndarray      # mean camber line x
    y_camber:   np.ndarray      # mean camber line y
    params:     dict = field(default_factory=dict)

    @property
    def x_coords(self) -> np.ndarray:
        """Full contour: upper TE→LE→lower TE (XFoil convention)."""
        return np.concatenate([self.x_upper[::-1], self.x_lower[1:]])

    @property
    def y_coords(self) -> np.ndarray:
        return np.concatenate([self.y_upper[::-1], self.y_lower[1:]])

    @property
    def thickness_at(self) -> callable:
        """Return local thickness at chord fraction x ∈ [0,1]."""
        def _t(x):
            return np.interp(x, self.x_upper, self.y_upper - self.y_lower)
        return _t

    @property
    def max_thickness_pct(self) -> float:
        # Works for both normal and inverted: always take absolute separation
        t = np.abs(self.y_upper - np.interp(self.x_upper, self.x_lower, self.y_lower))
        return float(t.max() * 100.0)

    @property
    def max_camber_pct(self) -> float:
        return float(np.abs(self.y_camber).max() * 100.0)


def _chordwise_stations(n: int, cosine: bool = True) -> np.ndarray:
    """
    Generate n+1 chordwise stations from 0 to 1.
    Cosine spacing clusters points near LE and TE for accuracy.
    """
    if cosine:
        beta = np.linspace(0.0, np.pi, n + 1)
        return 0.5 * (1.0 - np.cos(beta))
    return np.linspace(0.0, 1.0, n + 1)


def naca4_thickness(x: np.ndarray, t: float) -> np.ndarray:
    """
    NACA 4-series thickness distribution (modified closed-TE form).

    y_t = 5t [ 0.2969√x − 0.1260x − 0.3516x² + 0.2843x³ − 0.1015x⁴ ]

    Args:
        x:  chordwise stations ∈ [0, 1]
        t:  max thickness as fraction of chord (e.g. 0.12 for NACA xx12)
    """
    return 5.0 * t * (
        0.2969 * np.sqrt(np.maximum(x, 0.0))
        - 0.1260 * x
        - 0.3516 * x**2
        + 0.2843 * x**3
        - 0.1015 * x**4        # 0.1036 for open TE; 0.1015 for closed TE
    )


def naca4_camber(x: np.ndarray, m: float, p: float) -> Tuple[np.ndarray, np.ndarray]:
    """
    NACA 4-series mean camber line and its gradient dy/dx.

    Returns (y_c, dy_c_dx) both shape (n,).
    """
    y_c    = np.zeros_like(x)
    dy_c   = np.zeros_like(x)

    if m == 0.0 or p == 0.0:
        return y_c, dy_c

    # Forward of max camber
    mask_f = x <= p
    xf = x[mask_f]
    y_c[mask_f]  = (m / p**2)    * (2.0 * p * xf - xf**2)
    dy_c[mask_f] = (2.0 * m / p**2) * (p - xf)

    # Aft of max camber
    mask_a = ~mask_f
    xa = x[mask_a]
    y_c[mask_a]  = (m / (1.0 - p)**2) * (1.0 - 2.0 * p + 2.0 * p * xa - xa**2)
    dy_c[mask_a] = (2.0 * m / (1.0 - p)**2) * (p - xa)

    return y_c, dy_c


def generate_naca4(
    camber_pct:     float,
    camber_pos_pct: float,
    thickness_pct:  float,
    n_panels:       int  = N_PANELS,
    cosine:         bool = COSINE_SPACING,
    invert:         bool = True,
) -> AirfoilGeometry:
    """
    Generate a NACA 4-series airfoil section.

    Args:
        camber_pct:     max camber as % chord   (e.g. 4 → NACA 4xxx)
        camber_pos_pct: camber position as % chord (e.g. 40 → NACA x4xx)
        thickness_pct:  max thickness as % chord (e.g. 12 → NACA xx12)
        n_panels:       number of chordwise panels per surface
        cosine:         use cosine spacing (recommended)
        invert:         flip y-axis (TRUE for downforce front wing)

    Returns:
        AirfoilGeometry dataclass
    """
    m = camber_pct     / 100.0
    p = camber_pos_pct / 100.0
    t = thickness_pct  / 100.0

    x = _chordwise_stations(n_panels, cosine)

    # Thickness distribution
    y_t = naca4_thickness(x, t)

    # Camber line + gradient
    y_c, dy_c = naca4_camber(x, m, p)

    # Surface offsets perpendicular to camber line
    theta = np.arctan(dy_c)

    x_upper = x  - y_t * np.sin(theta)
    y_upper = y_c + y_t * np.cos(theta)

    x_lower = x  + y_t * np.sin(theta)
    y_lower = y_c - y_t * np.cos(theta)

    if invert:
        # Invert wing: suction side faces down → generates downforce
        y_upper = -y_upper
        y_lower = -y_lower
        y_c     = -y_c

    # Build name string (closest NACA designation)
    m_d = int(round(camber_pct))
    p_d = int(round(camber_pos_pct / 10.0))
    t_d = int(round(thickness_pct))
    name = f"NACA {m_d}{p_d}{t_d:02d}"
    if invert:
        name += " (inv)"

    return AirfoilGeometry(
        name     = name,
        x_upper  = x_upper,
        y_upper  = y_upper,
        x_lower  = x_lower,
        y_lower  = y_lower,
        x_camber = x,
        y_camber = y_c,
        params   = {
            "camber_pct":     camber_pct,
            "camber_pos_pct": camber_pos_pct,
            "thickness_pct":  thickness_pct,
            "inverted":       invert,
        },
    )


def apply_flap(
    airfoil:        AirfoilGeometry,
    flap_angle_deg: float,
    flap_chord_pct: float,
) -> AirfoilGeometry:
    """
    Deflect a simple hinged trailing-edge flap.

    The hinge is at x_hinge = 1 - flap_chord_pct/100.
    All points aft of the hinge are rigidly rotated about it.

    Args:
        airfoil:        base AirfoilGeometry (already inverted if needed)
        flap_angle_deg: deflection angle in degrees (positive = down for inverted)
        flap_chord_pct: flap chord as % of total chord

    Returns:
        New AirfoilGeometry with deflected flap
    """
    if flap_angle_deg == 0.0:
        return airfoil

    x_hinge = 1.0 - flap_chord_pct / 100.0
    angle   = np.radians(flap_angle_deg)

    # For inverted wing: positive flap angle deflects trailing edge downward
    # (increases camber, increases downforce)
    sign = -1.0 if airfoil.params.get("inverted", True) else 1.0

    def _deflect(x, y):
        mask = x >= x_hinge
        dx   = x[mask] - x_hinge
        dy   = y[mask]
        # Rotation matrix about hinge point
        x[mask] = x_hinge + dx * np.cos(sign * angle) - dy * np.sin(sign * angle)
        y[mask] = dy * np.cos(sign * angle) + dx * np.sin(sign * angle)
        return x, y

    xu = airfoil.x_upper.copy(); yu = airfoil.y_upper.copy()
    xl = airfoil.x_lower.copy(); yl = airfoil.y_lower.copy()
    xc = airfoil.x_camber.copy(); yc = airfoil.y_camber.copy()

    xu, yu = _deflect(xu, yu)
    xl, yl = _deflect(xl, yl)
    xc, yc = _deflect(xc, yc)

    params = {**airfoil.params, "flap_angle_deg": flap_angle_deg,
              "flap_chord_pct": flap_chord_pct}

    return AirfoilGeometry(
        name     = airfoil.name + f"+flap{flap_angle_deg:.0f}°",
        x_upper  = xu, y_upper = yu,
        x_lower  = xl, y_lower = yl,
        x_camber = xc, y_camber = yc,
        params   = params,
    )


def export_to_csv(airfoil: AirfoilGeometry, path: str) -> None:
    """Export airfoil contour as a two-column x,y CSV (XFoil-compatible)."""
    import csv
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([airfoil.name])
        for x, y in zip(airfoil.x_coords, airfoil.y_coords):
            writer.writerow([f"{x:.6f}", f"{y:.6f}"])


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Reproduce NACA 4412 inverted (classical F1 front wing section)
    af = generate_naca4(
        camber_pct     = 4.0,
        camber_pos_pct = 40.0,
        thickness_pct  = 12.0,
    )
    af_flapped = apply_flap(af, flap_angle_deg=15.0, flap_chord_pct=25.0)

    print(f"Airfoil:         {af.name}")
    print(f"  Max thickness: {af.max_thickness_pct:.2f}%  (target 12.00%)")
    print(f"  Max camber:    {abs(af.max_camber_pct):.2f}%  (target 4.00%)")
    print(f"  N points:      {len(af.x_coords)}")
    print(f"With flap:       {af_flapped.name}")
    print(f"  TE y (upper):  {af_flapped.y_upper[-1]:.4f}")
    print(f"  TE y (lower):  {af_flapped.y_lower[-1]:.4f}")
