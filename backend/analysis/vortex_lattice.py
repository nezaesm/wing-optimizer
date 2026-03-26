"""
vortex_lattice.py
-----------------
Vortex Lattice Method (VLM) for full 3D wing aerodynamic analysis.

Physics implemented:
  - Horseshoe vortex panels with cosine-spaced chordwise & spanwise stations
  - Swept, tapered, twisted wings (any combination)
  - Multi-element wings: mainplane + trailing flap with gap/overlap
  - Ground effect via method of images (mirror vortex system)
  - Spanwise lift & induced-drag distributions
  - Per-panel pressure coefficient Cp
  - Wieselberger/Pistolesi ground-effect amplification
  - Endplate effective-AR correction (Hoerner)
  - Oswald efficiency estimate

Reference: Katz & Plotkin, "Low-Speed Aerodynamics" (2nd ed., 2001), Chap 12.
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class VLMPanel:
    """A single horseshoe-vortex lattice panel (quadrilateral)."""
    p1: np.ndarray   # Leading-left  corner
    p2: np.ndarray   # Leading-right corner
    p3: np.ndarray   # Trailing-right corner
    p4: np.ndarray   # Trailing-left  corner

    @property
    def _qc_left(self) -> np.ndarray:
        """Quarter-chord point on left edge."""
        return 0.75 * self.p1 + 0.25 * self.p4

    @property
    def _qc_right(self) -> np.ndarray:
        """Quarter-chord point on right edge."""
        return 0.75 * self.p2 + 0.25 * self.p3

    @property
    def collocation(self) -> np.ndarray:
        """3/4-chord collocation point (panel centre, chordwise)."""
        mid_le = 0.5 * (self.p1 + self.p2)
        mid_te = 0.5 * (self.p4 + self.p3)
        return 0.25 * mid_le + 0.75 * mid_te

    @property
    def normal(self) -> np.ndarray:
        """Outward unit normal (positive upward for a lifting surface)."""
        d1 = self.p3 - self.p1
        d2 = self.p2 - self.p4
        n = np.cross(d1, d2)
        mag = np.linalg.norm(n)
        return n / mag if mag > 1e-14 else np.array([0.0, 0.0, 1.0])

    @property
    def span_ds(self) -> float:
        """Panel half-span width at the bound-vortex line."""
        return np.linalg.norm(self._qc_right - self._qc_left)

    @property
    def chord_dc(self) -> float:
        """Approximate panel chord length."""
        return np.linalg.norm(self.p4 - self.p1)


@dataclass
class VLMResult:
    """Full 3D aerodynamic result from VLM analysis."""
    # ── Global force coefficients ──────────────────────────────────────────
    CL: float = 0.0
    CD_induced: float = 0.0
    CM_quarter: float = 0.0        # Pitching moment about c/4

    # ── Dimensional forces (N) at design speed ─────────────────────────────
    downforce_N: float = 0.0       # Positive = downward (F1 convention)
    drag_N: float = 0.0
    efficiency: float = 0.0        # |downforce| / drag

    # ── Ground effect ──────────────────────────────────────────────────────
    ground_effect_factor: float = 1.0   # CL_with_ground / CL_freestream

    # ── Spanwise distributions (length = n_spanwise strips) ────────────────
    eta: np.ndarray = field(default_factory=lambda: np.zeros(0))
    cl_strip: np.ndarray = field(default_factory=lambda: np.zeros(0))
    cdi_strip: np.ndarray = field(default_factory=lambda: np.zeros(0))
    chord_strip: np.ndarray = field(default_factory=lambda: np.zeros(0))
    gamma_strip: np.ndarray = field(default_factory=lambda: np.zeros(0))

    # ── Per-panel Cp (length = total panels) ──────────────────────────────
    cp_panels: np.ndarray = field(default_factory=lambda: np.zeros(0))
    panel_x: np.ndarray = field(default_factory=lambda: np.zeros(0))   # x-coord of panel centre
    panel_y: np.ndarray = field(default_factory=lambda: np.zeros(0))   # y-coord of panel centre

    # ── Solver diagnostics ─────────────────────────────────────────────────
    converged: bool = True
    condition_number: float = 1.0
    n_panels: int = 0

    def to_dict(self) -> dict:
        return {
            "CL": self.CL,
            "CD_induced": self.CD_induced,
            "CM_quarter": self.CM_quarter,
            "downforce_N": self.downforce_N,
            "drag_N": self.drag_N,
            "efficiency": self.efficiency,
            "ground_effect_factor": self.ground_effect_factor,
            "converged": self.converged,
            "condition_number": self.condition_number,
            "n_panels": self.n_panels,
            "spanwise": {
                "eta":       self.eta.tolist(),
                "cl_strip":  self.cl_strip.tolist(),
                "cdi_strip": self.cdi_strip.tolist(),
                "chord":     self.chord_strip.tolist(),
                "gamma":     self.gamma_strip.tolist(),
            },
            "pressure": {
                "cp":     self.cp_panels.tolist(),
                "panel_x": self.panel_x.tolist(),
                "panel_y": self.panel_y.tolist(),
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# VLM Solver
# ─────────────────────────────────────────────────────────────────────────────

class VortexLattice:
    """
    Vortex Lattice Method solver for 3D wing aerodynamics.

    Usage
    -----
    vlm = VortexLattice(n_chordwise=8, n_spanwise=24)
    result = vlm.analyze(**params)
    print(result.CL, result.spanwise)
    """

    # Reference values (F1 front wing defaults)
    V_REF    = 40.0    # m/s
    RHO_REF  = 1.225   # kg/m³
    CHORD_REF = 0.25   # m  (≈ 250 mm mean chord)

    def __init__(
        self,
        n_chordwise: int = 8,
        n_spanwise: int  = 24,
        n_chordwise_flap: int = 4,
    ):
        self.Nc      = n_chordwise
        self.Ns      = n_spanwise
        self.Nc_flap = n_chordwise_flap

    # ── Public entry point ────────────────────────────────────────────────

    def analyze(
        self,
        # ── Airfoil / section params ──────────────────────────────────────
        camber_pct:      float = 4.0,
        camber_pos_pct:  float = 40.0,
        thickness_pct:   float = 12.0,
        aoa_deg:         float = -8.0,
        # ── Planform params ───────────────────────────────────────────────
        aspect_ratio:    float = 4.0,
        taper_ratio:     float = 1.0,    # c_tip / c_root   (1 = rectangular)
        sweep_deg:       float = 0.0,    # Quarter-chord sweep (°)
        twist_deg:       float = 0.0,    # Tip washout relative to root (°)
        dihedral_deg:    float = 0.0,    # Wing dihedral (°)
        # ── Multi-element flap ────────────────────────────────────────────
        flap_angle_deg:  float = 15.0,
        flap_chord_pct:  float = 25.0,
        flap_gap_pct:    float = 1.5,    # Slot gap  (% total chord)
        flap_overlap_pct: float = 0.5,   # Overlap   (% total chord)
        # ── Endplate ──────────────────────────────────────────────────────
        endplate_h_pct:  float = 15.0,   # % semi-span
        # ── Ground effect ─────────────────────────────────────────────────
        ride_height_pct: float = 8.0,    # h / chord_ref (% chord)
        # ── Operating conditions ──────────────────────────────────────────
        velocity_ms:     Optional[float] = None,
        rho:             Optional[float] = None,
        chord_m:         Optional[float] = None,
    ) -> VLMResult:
        """
        Run full 3D VLM analysis and return VLMResult.
        All angles in degrees; lengths in metres.
        """
        V  = velocity_ms or self.V_REF
        ρ  = rho         or self.RHO_REF
        c  = chord_m     or self.CHORD_REF

        b = aspect_ratio * c           # Full span
        S = b * c                      # Reference area (rectangular reference)

        # Build panel mesh for mainplane + flap
        panels_main = self._mainplane_panels(
            camber_pct, camber_pos_pct, aoa_deg,
            aspect_ratio, taper_ratio, sweep_deg, twist_deg, dihedral_deg, c
        )
        panels_flap = self._flap_panels(
            camber_pct, camber_pos_pct, aoa_deg,
            flap_angle_deg, flap_chord_pct, flap_gap_pct, flap_overlap_pct,
            aspect_ratio, taper_ratio, sweep_deg, c
        )
        panels = panels_main + panels_flap
        N = len(panels)

        if N == 0:
            return VLMResult(converged=False)

        # Build and solve AIC system
        h_m = (ride_height_pct / 100.0) * c
        AIC = self._build_aic(panels, h_m, apply_ground=ride_height_pct < 50.0)
        RHS = self._build_rhs(panels, aoa_deg, V)

        try:
            cond = float(np.linalg.cond(AIC))
            Γ    = np.linalg.solve(AIC, RHS)
        except np.linalg.LinAlgError:
            return VLMResult(converged=False)

        # Compute forces
        result = self._compute_forces(
            panels, Γ, aoa_deg, V, ρ, c, b, S,
            aspect_ratio, endplate_h_pct, ride_height_pct,
        )
        result.condition_number = cond
        result.n_panels = N
        return result

    # ── Panel mesh builders ────────────────────────────────────────────────

    def _mainplane_panels(
        self,
        camber_pct, camber_pos_pct, aoa_deg,
        AR, taper, sweep_deg, twist_deg, dihedral_deg, c
    ) -> List[VLMPanel]:
        """Mainplane panels with taper, sweep, twist, dihedral."""
        panels: List[VLMPanel] = []
        b = AR * c

        aoa_r   = np.radians(aoa_deg)
        sweep_r = np.radians(sweep_deg)
        dih_r   = np.radians(dihedral_deg)
        m       = camber_pct / 100.0
        p       = camber_pos_pct / 100.0

        # Cosine spacing for both directions
        eta_edges = self._cosine_spacing(self.Ns)    # spanwise [−1, +1]
        xi_edges  = self._cosine_spacing_uni(self.Nc) # chordwise [0, 1]

        for j in range(self.Ns):
            η_l = eta_edges[j]
            η_r = eta_edges[j + 1]
            η_m = 0.5 * (η_l + η_r)

            y_l = η_l * b / 2
            y_r = η_r * b / 2

            # Local chord (linear taper)
            c_l = c * (1.0 - (1.0 - taper) * abs(η_l))
            c_r = c * (1.0 - (1.0 - taper) * abs(η_r))

            # Quarter-chord sweep shift in x
            x_qc_l = abs(y_l) * np.tan(sweep_r)
            x_qc_r = abs(y_r) * np.tan(sweep_r)

            # Dihedral: z rises with span
            z_dih_l = abs(y_l) * np.tan(dih_r)
            z_dih_r = abs(y_r) * np.tan(dih_r)

            # Local AoA with linear washout
            aoa_l = aoa_r + np.radians(twist_deg * abs(η_l))
            aoa_r_ = aoa_r + np.radians(twist_deg * abs(η_r))

            for i in range(self.Nc):
                xi_le = xi_edges[i]
                xi_te = xi_edges[i + 1]

                def pt(xi, y, c_local, x_sweep, z_dih, aoa_local):
                    # Camber z at this chordwise station (inverted wing → negate)
                    zc = -self._camber(xi, m, p) * c_local
                    # Chordwise position
                    xc  = xi * c_local
                    # Apply AoA rotation
                    xw  = xc * np.cos(aoa_local) - zc * np.sin(aoa_local) + x_sweep
                    zw  = xc * np.sin(aoa_local) + zc * np.cos(aoa_local) + z_dih
                    return np.array([xw, y, zw])

                p1 = pt(xi_le, y_l, c_l, x_qc_l, z_dih_l, aoa_l)
                p2 = pt(xi_le, y_r, c_r, x_qc_r, z_dih_r, aoa_r_)
                p3 = pt(xi_te, y_r, c_r, x_qc_r, z_dih_r, aoa_r_)
                p4 = pt(xi_te, y_l, c_l, x_qc_l, z_dih_l, aoa_l)

                panels.append(VLMPanel(p1, p2, p3, p4))

        return panels

    def _flap_panels(
        self,
        camber_pct, camber_pos_pct, aoa_main,
        flap_angle_deg, flap_chord_pct, flap_gap_pct, flap_overlap_pct,
        AR, taper, sweep_deg, c
    ) -> List[VLMPanel]:
        """
        Trailing-edge flap panels.
        Flap is hinged at (1 − flap_chord_pct/100) of main chord,
        deflected downward by flap_angle_deg, with configurable gap and overlap.
        """
        if flap_chord_pct <= 0 or abs(flap_angle_deg) < 0.5:
            return []

        panels: List[VLMPanel] = []
        b = AR * c

        aoa_r       = np.radians(aoa_main)
        sweep_r     = np.radians(sweep_deg)
        flap_def_r  = np.radians(flap_angle_deg)
        frac        = flap_chord_pct / 100.0
        gap_frac    = flap_gap_pct   / 100.0
        over_frac   = flap_overlap_pct / 100.0
        m  = camber_pct / 100.0
        p  = camber_pos_pct / 100.0

        # Hinge on mainplane camber line
        x_hinge_norm = 1.0 - frac
        zc_hinge     = -self._camber(x_hinge_norm, m, p)  # inverted

        eta_edges = self._cosine_spacing(self.Ns)
        xi_edges  = self._cosine_spacing_uni(self.Nc_flap)

        for j in range(self.Ns):
            η_l = eta_edges[j]
            η_r = eta_edges[j + 1]

            y_l = η_l * b / 2
            y_r = η_r * b / 2

            c_l = c * (1.0 - (1.0 - taper) * abs(η_l))
            c_r = c * (1.0 - (1.0 - taper) * abs(η_r))

            x_qc_l = abs(y_l) * np.tan(sweep_r)
            x_qc_r = abs(y_r) * np.tan(sweep_r)

            for i in range(self.Nc_flap):
                xi_le = xi_edges[i]
                xi_te = xi_edges[i + 1]

                def flap_pt(xi_f, y, c_local, x_sweep):
                    # Position on flap in its own coordinate system
                    xf_local = xi_f * frac * c_local
                    zf_local = -self._camber(xi_f, m, p) * frac * c_local

                    # Rotate by flap deflection (downward = +z for inverted wing)
                    xf_rot = xf_local * np.cos(flap_def_r) + zf_local * np.sin(flap_def_r)
                    zf_rot = -xf_local * np.sin(flap_def_r) + zf_local * np.cos(flap_def_r)

                    # Translate to hinge position on mainplane (with gap & overlap)
                    x_hinge_abs = (x_hinge_norm + gap_frac - over_frac) * c_local
                    z_hinge_abs = zc_hinge * c_local

                    xabs = x_hinge_abs + xf_rot
                    zabs = z_hinge_abs + zf_rot

                    # Apply wing AoA rotation
                    xw = xabs * np.cos(aoa_r) - zabs * np.sin(aoa_r) + x_sweep
                    zw = xabs * np.sin(aoa_r) + zabs * np.cos(aoa_r)
                    return np.array([xw, y, zw])

                p1 = flap_pt(xi_le, y_l, c_l, x_qc_l)
                p2 = flap_pt(xi_le, y_r, c_r, x_qc_r)
                p3 = flap_pt(xi_te, y_r, c_r, x_qc_r)
                p4 = flap_pt(xi_te, y_l, c_l, x_qc_l)

                panels.append(VLMPanel(p1, p2, p3, p4))

        return panels

    # ── AIC matrix ────────────────────────────────────────────────────────

    def _build_aic(
        self,
        panels: List[VLMPanel],
        h_m: float,
        apply_ground: bool = True,
    ) -> np.ndarray:
        """
        AIC[i, j] = normal-velocity influence at collocation point i
                    due to unit-strength horseshoe vortex on panel j.
        Ground effect: reflected mirror vortex system with opposite sign.
        """
        N = len(panels)
        AIC = np.zeros((N, N))
        wake = np.array([1.0, 0.0, 0.0])  # Wake trails downstream (+x)

        for i in range(N):
            P = panels[i].collocation
            n = panels[i].normal
            for j in range(N):
                v = self._horseshoe_vel(panels[j], P, wake)
                AIC[i, j] = np.dot(v, n)

                if apply_ground:
                    mirror = self._mirror_panel(panels[j], h_m)
                    vm = self._horseshoe_vel(mirror, P, wake)
                    AIC[i, j] -= np.dot(vm, n)  # image has opposite sign

        return AIC

    def _build_rhs(
        self, panels: List[VLMPanel], aoa_deg: float, V: float
    ) -> np.ndarray:
        """RHS[i] = −V_∞ · n_i  (freestream normal velocity, flow-tangency BC)."""
        aoa_r = np.radians(aoa_deg)
        V_inf = V * np.array([np.cos(aoa_r), 0.0, np.sin(aoa_r)])
        return np.array([-np.dot(V_inf, p.normal) for p in panels])

    # ── Force calculation ─────────────────────────────────────────────────

    def _compute_forces(
        self,
        panels: List[VLMPanel],
        Γ: np.ndarray,
        aoa_deg: float,
        V: float,
        ρ: float,
        c: float,
        b: float,
        S: float,
        AR: float,
        endplate_h_pct: float,
        ride_height_pct: float,
    ) -> VLMResult:
        """
        Kutta-Joukowski theorem: dF = ρ Γ (V × dl)
        where dl is the bound-vortex filament vector (spanwise at 1/4 chord).
        """
        aoa_r  = np.radians(aoa_deg)
        V_inf  = V * np.array([np.cos(aoa_r), 0.0, np.sin(aoa_r)])
        q      = 0.5 * ρ * V**2

        # Lift and drag directions
        lift_dir = np.array([-np.sin(aoa_r), 0.0,  np.cos(aoa_r)])
        drag_dir = np.array([ np.cos(aoa_r), 0.0,  np.sin(aoa_r)])

        dL = np.zeros(len(panels))
        dD = np.zeros(len(panels))
        x_col = np.zeros(len(panels))
        y_col = np.zeros(len(panels))

        for i, pan in enumerate(panels):
            dl  = pan._qc_right - pan._qc_left   # Bound vortex direction (spanwise)
            dF  = ρ * Γ[i] * np.cross(V_inf, dl)
            dL[i] = np.dot(dF, lift_dir)
            dD[i] = np.dot(dF, drag_dir)
            col = pan.collocation
            x_col[i] = col[0]
            y_col[i] = col[1]

        L_total = float(np.sum(dL))
        D_raw   = float(np.sum(dD))

        CL_raw = L_total / (q * S) if S > 0 else 0.0

        # ── Endplate correction (Hoerner effective AR) ─────────────────────
        h_ep_ratio = endplate_h_pct / 100.0
        AR_eff     = AR * (1.0 + 1.9 * h_ep_ratio)
        e_oswald   = min(0.98, 0.85 * (1.0 + 0.15 * h_ep_ratio))

        # Blend VLM raw induced drag with theoretical estimate for stability
        CD_i_theory = CL_raw**2 / max(np.pi * e_oswald * AR_eff, 0.01)
        CD_i_raw    = abs(D_raw) / (q * S) if S > 0 else CD_i_theory
        CD_induced  = 0.4 * CD_i_raw + 0.6 * CD_i_theory

        # ── Ground effect (Wieselberger-Pistolesi) ─────────────────────────
        h_norm = ride_height_pct / 100.0   # h/c
        if 0 < h_norm < 2.0:
            gef = 1.0 + 0.35 / (AR_eff * h_norm + 0.5)
        else:
            gef = 1.0
        CL = CL_raw * gef

        # ── Dimensional forces ─────────────────────────────────────────────
        downforce = CL * q * S        # positive = downward (inverted wing)
        drag      = CD_induced * q * S
        eff       = abs(downforce) / max(drag, 1e-6)

        # ── Pitching moment (approximate, about c/4) ───────────────────────
        CM = -CL * 0.20   # typical for cambered inverted section

        # ── Cp per panel ───────────────────────────────────────────────────
        cp_panels = np.zeros(len(panels))
        for i, pan in enumerate(panels):
            c_local = max(pan.chord_dc, 1e-8)
            ds      = max(pan.span_ds, 1e-8)
            cp_panels[i] = -2.0 * Γ[i] / (V * c_local)

        # ── Spanwise distributions ─────────────────────────────────────────
        Ns       = self.Ns
        Nc_main  = self.Nc
        eta_arr  = np.zeros(Ns)
        cl_strip = np.zeros(Ns)
        cdi_strip= np.zeros(Ns)
        g_strip  = np.zeros(Ns)
        c_strip  = np.zeros(Ns)

        for j in range(Ns):
            eta_arr[j] = -1.0 + (2.0 * j + 1.0) / Ns
            idx0 = j * Nc_main
            idx1 = min(idx0 + Nc_main, len(panels))
            if idx0 >= len(panels):
                break

            pan_mid = panels[min((idx0 + idx1 - 1) // 2, len(panels) - 1)]
            c_local = max(pan_mid.chord_dc, 1e-8)
            ds      = max(pan_mid.span_ds,  1e-8)
            c_strip[j] = c_local

            L_s = float(np.sum(dL[idx0:idx1]))
            D_s = float(np.sum(dD[idx0:idx1]))
            g_strip[j]   = float(np.sum(Γ[idx0:idx1]))
            cl_strip[j]  = L_s / max(q * c_local * ds, 1e-10)
            cdi_strip[j] = abs(D_s) / max(q * c_local * ds, 1e-10)

        return VLMResult(
            CL=float(CL),
            CD_induced=float(CD_induced),
            CM_quarter=float(CM),
            downforce_N=float(downforce),
            drag_N=float(drag),
            efficiency=float(eff),
            ground_effect_factor=float(gef),
            converged=True,
            eta=eta_arr,
            cl_strip=cl_strip,
            cdi_strip=cdi_strip,
            chord_strip=c_strip,
            gamma_strip=g_strip,
            cp_panels=cp_panels,
            panel_x=x_col,
            panel_y=y_col,
        )

    # ── Biot-Savart helpers ────────────────────────────────────────────────

    def _biot_savart(
        self, A: np.ndarray, B: np.ndarray, P: np.ndarray
    ) -> np.ndarray:
        """
        Velocity induced at P by a finite vortex filament from A to B,
        unit strength.  Katz & Plotkin eq. (2.69).
        """
        r1 = P - A
        r2 = P - B
        r0 = B - A

        r1_mag = np.linalg.norm(r1)
        r2_mag = np.linalg.norm(r2)

        cross     = np.cross(r1, r2)
        cross_mag2 = np.dot(cross, cross)

        if cross_mag2 < 1e-12 or r1_mag < 1e-8 or r2_mag < 1e-8:
            return np.zeros(3)

        coeff = np.dot(r0, r1) / r1_mag - np.dot(r0, r2) / r2_mag
        return cross / (4.0 * np.pi * cross_mag2) * coeff

    def _horseshoe_vel(
        self,
        panel: VLMPanel,
        P: np.ndarray,
        wake: np.ndarray,
        far: float = 1e5,
    ) -> np.ndarray:
        """
        Total velocity at P induced by a unit-strength horseshoe vortex:
          bound filament (1/4-chord left → right)
          + left semi-infinite trailing vortex (upstream to 1/4-chord left)
          + right semi-infinite trailing vortex (1/4-chord right → downstream)
        """
        A = panel._qc_left
        B = panel._qc_right

        v_bound = self._biot_savart(A, B, P)

        # Left trailing vortex: from far upstream (−wake) to A
        far_l = A - wake * far
        v_left = self._biot_savart(far_l, A, P)

        # Right trailing vortex: from B to far downstream (+wake)
        far_r = B + wake * far
        v_right = self._biot_savart(B, far_r, P)

        return v_bound + v_left + v_right

    def _mirror_panel(self, panel: VLMPanel, h_m: float) -> VLMPanel:
        """
        Reflect panel through the ground plane z = 0
        (the wing is at z ≈ h_m above ground; the ground plane is at z=0).
        Mirror panel is at z_mirror = -z_original.
        The image vortex has the SAME geometry but the AIC subtraction gives
        the correct sign for the ground-effect no-penetration boundary condition.
        """
        def reflect(pt: np.ndarray) -> np.ndarray:
            return np.array([pt[0], pt[1], -pt[2]])

        return VLMPanel(
            reflect(panel.p1), reflect(panel.p2),
            reflect(panel.p3), reflect(panel.p4),
        )

    # ── Utility ────────────────────────────────────────────────────────────

    @staticmethod
    def _cosine_spacing(n: int) -> np.ndarray:
        """n+1 cosine-spaced edges from −1 to +1 (denser near tips)."""
        theta = np.linspace(0, np.pi, n + 1)
        return -np.cos(theta)          # [−1, …, +1]

    @staticmethod
    def _cosine_spacing_uni(n: int) -> np.ndarray:
        """n+1 cosine-spaced edges from 0 to 1 (denser near LE and TE)."""
        theta = np.linspace(0, np.pi, n + 1)
        return 0.5 * (1.0 - np.cos(theta))

    @staticmethod
    def _camber(x: float, m: float, p: float) -> float:
        """NACA 4-digit mean camber line height at normalised chord position x."""
        if m < 1e-7:
            return 0.0
        if x <= p:
            return (m / p**2) * (2.0 * p * x - x * x)
        return (m / (1.0 - p)**2) * (1.0 - 2.0 * p + 2.0 * p * x - x * x)


# ─────────────────────────────────────────────────────────────────────────────
# Convenience function (mirrors aero_metrics.evaluate_design interface)
# ─────────────────────────────────────────────────────────────────────────────

def analyze_3d(params: dict) -> dict:
    """
    Run full 3D VLM analysis from a flat parameter dictionary.

    Accepts all standard WingOpt params plus optional 3D extensions:
      taper_ratio, sweep_deg, twist_deg, dihedral_deg,
      flap_gap_pct, flap_overlap_pct, ride_height_pct,
      velocity_ms, rho, chord_m

    Returns a plain dict compatible with Flask jsonify.
    """
    vlm = VortexLattice(n_chordwise=8, n_spanwise=24, n_chordwise_flap=4)
    result = vlm.analyze(
        camber_pct       = float(params.get("camber_pct",       4.0)),
        camber_pos_pct   = float(params.get("camber_pos_pct",  40.0)),
        thickness_pct    = float(params.get("thickness_pct",   12.0)),
        aoa_deg          = float(params.get("aoa_deg",         -8.0)),
        aspect_ratio     = float(params.get("aspect_ratio",     4.0)),
        taper_ratio      = float(params.get("taper_ratio",      1.0)),
        sweep_deg        = float(params.get("sweep_deg",        0.0)),
        twist_deg        = float(params.get("twist_deg",        0.0)),
        dihedral_deg     = float(params.get("dihedral_deg",     0.0)),
        flap_angle_deg   = float(params.get("flap_angle_deg",  15.0)),
        flap_chord_pct   = float(params.get("flap_chord_pct",  25.0)),
        flap_gap_pct     = float(params.get("flap_gap_pct",     1.5)),
        flap_overlap_pct = float(params.get("flap_overlap_pct", 0.5)),
        endplate_h_pct   = float(params.get("endplate_h_pct",  15.0)),
        ride_height_pct  = float(params.get("ride_height_pct",  8.0)),
        velocity_ms      = params.get("velocity_ms"),
        rho              = params.get("rho"),
        chord_m          = params.get("chord_m"),
    )
    return result.to_dict()
