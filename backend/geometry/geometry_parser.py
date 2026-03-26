"""
geometry_parser.py
------------------
Parse uploaded wing/airfoil geometry files and extract aerodynamic parameters.

Supported formats
-----------------
  .dat / .txt  — Selig or Lednicer airfoil coordinate format
  .csv         — Two-column x, y coordinate table
  .json        — WingOpt flat parameter dict  (or dict with 'params' key)
  .stl         — Binary or ASCII surface mesh (extracts cross-sections)
  .obj         — Wavefront OBJ surface mesh

Workflow
--------
  parser = GeometryParser()
  result = parser.parse("my_wing.dat", file_bytes)
  # result.params  → dict compatible with /design/evaluate
  # result.x_upper, result.y_upper, ... → raw coordinates for preview
"""

from __future__ import annotations
import json
import struct
import numpy as np
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Result container
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ParsedGeometry:
    """Parsed geometry with raw coordinates, fitted parameters, and diagnostics."""

    filename: str = ""
    fmt: str = ""               # "dat", "json", "stl", "obj"

    # ── 2D airfoil coordinates (normalised chord = 1, LE→TE) ──────────────
    x_upper: Optional[np.ndarray] = None
    y_upper: Optional[np.ndarray] = None
    x_lower: Optional[np.ndarray] = None
    y_lower: Optional[np.ndarray] = None
    x_camber: Optional[np.ndarray] = None
    y_camber: Optional[np.ndarray] = None

    # ── Fitted WingOpt parameters ─────────────────────────────────────────
    params: Optional[Dict] = None

    # ── 3D mesh (if STL / OBJ) ────────────────────────────────────────────
    vertices: Optional[np.ndarray] = None   # (N, 3) float32
    has_3d: bool = False
    n_triangles: int = 0

    # ── Cross-sections extracted from 3D mesh ─────────────────────────────
    sections: List[Dict] = field(default_factory=list)
    # Each entry: {"eta": float, "x_upper", "y_upper", "x_lower", "y_lower"}

    # ── Quality ───────────────────────────────────────────────────────────
    n_points: int = 0
    warnings: List[str] = field(default_factory=list)
    success: bool = True

    def to_dict(self) -> dict:
        out: dict = {
            "filename": self.filename,
            "format":   self.fmt,
            "success":  self.success,
            "has_3d":   self.has_3d,
            "n_points": self.n_points,
            "warnings": self.warnings,
            "params":   self.params or _DEFAULT_PARAMS.copy(),
        }
        if self.x_upper is not None:
            out["airfoil"] = {
                "x_upper": self.x_upper.tolist(),
                "y_upper": self.y_upper.tolist(),
                "x_lower": (self.x_lower.tolist() if self.x_lower is not None else []),
                "y_lower": (self.y_lower.tolist() if self.y_lower is not None else []),
                "x_camber":(self.x_camber.tolist() if self.x_camber is not None else []),
                "y_camber":(self.y_camber.tolist() if self.y_camber is not None else []),
            }
        if self.sections:
            out["sections"] = [
                {
                    "eta":     s["eta"],
                    "x_upper": s["x_upper"].tolist(),
                    "y_upper": s["y_upper"].tolist(),
                    "x_lower": s["x_lower"].tolist() if s.get("x_lower") is not None else [],
                    "y_lower": s["y_lower"].tolist() if s.get("y_lower") is not None else [],
                }
                for s in self.sections
            ]
        return out


# ─────────────────────────────────────────────────────────────────────────────
# Default parameter set
# ─────────────────────────────────────────────────────────────────────────────

_DEFAULT_PARAMS: Dict = {
    "camber_pct":      4.0,
    "camber_pos_pct": 40.0,
    "thickness_pct":  12.0,
    "aoa_deg":        -8.0,
    "flap_angle_deg": 15.0,
    "flap_chord_pct": 25.0,
    "aspect_ratio":    4.0,
    "endplate_h_pct": 15.0,
}

_WINGOPT_KEYS = list(_DEFAULT_PARAMS.keys())


# ─────────────────────────────────────────────────────────────────────────────
# Main parser
# ─────────────────────────────────────────────────────────────────────────────

class GeometryParser:
    """
    Parses geometry files and extracts WingOpt-compatible parameters.

    >>> parser = GeometryParser()
    >>> result = parser.parse("naca2412.dat", open("naca2412.dat","rb").read())
    >>> result.params["camber_pct"]
    2.0
    """

    def parse(self, filename: str, content: bytes) -> ParsedGeometry:
        ext = Path(filename).suffix.lower()
        if ext in (".dat", ".txt", ".csv"):
            return self._parse_dat(filename, content)
        elif ext == ".json":
            return self._parse_json(filename, content)
        elif ext == ".stl":
            return self._parse_stl(filename, content)
        elif ext == ".obj":
            return self._parse_obj(filename, content)
        else:
            geom = ParsedGeometry(filename=filename, fmt=ext, success=False)
            geom.warnings.append(
                f"Unsupported format '{ext}'. "
                "Supported: .dat, .csv, .txt, .json, .stl, .obj"
            )
            geom.params = _DEFAULT_PARAMS.copy()
            return geom

    # ── .dat / .csv ───────────────────────────────────────────────────────

    def _parse_dat(self, filename: str, content: bytes) -> ParsedGeometry:
        """
        Parse Selig or Lednicer airfoil .dat file.

        Selig:    continuous x y pairs, starts at TE (x≈1), goes LE (x≈0), back to TE.
        Lednicer: first row = "n_upper  n_lower", then upper points, then lower points.
        """
        geom = ParsedGeometry(filename=filename, fmt="dat")
        try:
            text = content.decode("utf-8", errors="replace")
        except Exception:
            geom.warnings.append("Cannot decode file as UTF-8")
            geom.params = _DEFAULT_PARAMS.copy()
            geom.success = False
            return geom

        # Split lines, skip comment/header lines
        rows: List[Tuple[float, float]] = []
        header_lines: List[str] = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith(("#", "!", "%")):
                header_lines.append(stripped)
                continue
            parts = stripped.split()
            try:
                x = float(parts[0])
                y = float(parts[1]) if len(parts) >= 2 else 0.0
                rows.append((x, y))
            except (ValueError, IndexError):
                header_lines.append(stripped)

        if not rows:
            geom.warnings.append("No numeric coordinate rows found")
            geom.params = _DEFAULT_PARAMS.copy()
            geom.success = False
            return geom

        coords = np.array(rows)

        # ── Detect Lednicer format: first value > 1 (it's a count) ────────
        if coords[0, 0] > 1.5 and coords[0, 0] < 500:
            n_u = int(round(coords[0, 0]))
            n_l = int(round(coords[0, 1]))
            if 1 + n_u + n_l <= len(coords):
                upper = coords[1: 1 + n_u].copy()
                lower = coords[1 + n_u: 1 + n_u + n_l].copy()
            else:
                upper, lower = self._split_selig(coords)
        else:
            upper, lower = self._split_selig(coords)

        if upper is None or len(upper) < 4:
            geom.warnings.append("Could not identify airfoil surfaces")
            geom.params = _DEFAULT_PARAMS.copy()
            return geom

        # Ensure LE→TE ordering (ascending x)
        if len(upper) > 1 and upper[0, 0] > upper[-1, 0]:
            upper = upper[::-1]
        if lower is not None and len(lower) > 1 and lower[0, 0] > lower[-1, 0]:
            lower = lower[::-1]

        # Normalise chord to [0, 1]
        x_all = np.concatenate([upper[:, 0], lower[:, 0] if lower is not None else []])
        x_max = float(x_all.max())
        if x_max < 1e-6:
            geom.warnings.append("Chord length is near-zero; check coordinate scale")
            x_max = 1.0

        upper = upper / x_max
        if lower is not None:
            lower = lower / x_max

        geom.x_upper = upper[:, 0]
        geom.y_upper = upper[:, 1]
        if lower is not None and len(lower) >= 4:
            geom.x_lower = lower[:, 0]
            geom.y_lower = lower[:, 1]
        geom.n_points = len(upper)

        # Camber line
        geom.x_camber, geom.y_camber = self._camber_line(
            geom.x_upper, geom.y_upper,
            geom.x_lower if geom.x_lower is not None else geom.x_upper,
            geom.y_lower if geom.y_lower is not None else np.zeros_like(geom.y_upper),
        )

        geom.params = self._fit_params(geom)
        return geom

    def _split_selig(
        self, coords: np.ndarray
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Split a Selig-format coordinate array into upper / lower surfaces.
        Selig wraps:  TE → upper → LE → lower → TE
        """
        # Leading edge: minimum x
        le_idx = int(np.argmin(coords[:, 0]))

        upper = coords[:le_idx + 1][::-1]   # LE→ start (ascending x)
        lower = coords[le_idx:]              # LE→ end   (ascending x)

        # Handle case where data starts at LE
        if le_idx == 0:
            te_idx = int(np.argmax(coords[:, 0]))
            upper = coords[:te_idx + 1]
            lower = coords[te_idx:][::-1]

        if len(upper) < 3:
            # Last-resort: split by y sign
            signs = np.sign(coords[:, 1])
            changes = np.where(np.diff(signs) != 0)[0]
            if len(changes):
                split = changes[0] + 1
                return coords[:split], coords[split:]
            return coords, None

        return upper, lower

    # ── .json ─────────────────────────────────────────────────────────────

    def _parse_json(self, filename: str, content: bytes) -> ParsedGeometry:
        geom = ParsedGeometry(filename=filename, fmt="json")
        try:
            data = json.loads(content.decode("utf-8", errors="replace"))
        except json.JSONDecodeError as e:
            geom.warnings.append(f"JSON parse error: {e}")
            geom.params = _DEFAULT_PARAMS.copy()
            geom.success = False
            return geom

        # Unwrap {"params": {...}} wrapper if present
        if "params" in data and isinstance(data["params"], dict):
            data = data["params"]

        params: Dict = {}
        for k in _WINGOPT_KEYS:
            if k in data:
                try:
                    params[k] = float(data[k])
                except (TypeError, ValueError):
                    pass

        if not params:
            geom.warnings.append(
                "No recognised WingOpt parameter keys found in JSON. "
                f"Expected any of: {_WINGOPT_KEYS}"
            )

        # Fill missing keys with defaults
        for k, v in _DEFAULT_PARAMS.items():
            params.setdefault(k, v)

        geom.params = params
        return geom

    # ── .stl ─────────────────────────────────────────────────────────────

    def _parse_stl(self, filename: str, content: bytes) -> ParsedGeometry:
        geom = ParsedGeometry(filename=filename, fmt="stl", has_3d=True)
        try:
            # Heuristic: ASCII starts with "solid" and contains "facet"
            header = content[:256].decode("ascii", errors="replace")
            if header.lstrip().startswith("solid") and b"facet" in content[:4096]:
                verts = self._read_ascii_stl(content.decode("utf-8", errors="replace"))
            else:
                verts = self._read_binary_stl(content)
        except Exception as e:
            geom.warnings.append(f"STL read error: {e}")
            geom.params = _DEFAULT_PARAMS.copy()
            geom.success = False
            return geom

        if verts is None or len(verts) < 9:
            geom.warnings.append("No triangles found in STL file")
            geom.params = _DEFAULT_PARAMS.copy()
            return geom

        geom.vertices   = verts
        geom.n_triangles = len(verts) // 3
        geom.n_points    = len(verts)

        geom.sections = self._extract_sections(verts)

        if geom.sections:
            mid = geom.sections[len(geom.sections) // 2]
            geom.x_upper = mid["x_upper"]
            geom.y_upper = mid["y_upper"]
            geom.x_lower = mid.get("x_lower")
            geom.y_lower = mid.get("y_lower")
            if geom.x_upper is not None and geom.x_lower is not None:
                geom.x_camber, geom.y_camber = self._camber_line(
                    geom.x_upper, geom.y_upper, geom.x_lower, geom.y_lower
                )
        else:
            geom.warnings.append(
                "Could not extract cross-sections from STL — using default params"
            )

        geom.params = self._fit_params(geom)
        return geom

    def _read_binary_stl(self, content: bytes) -> Optional[np.ndarray]:
        """Parse binary STL; return (N×3, float32) vertex array."""
        if len(content) < 84:
            return None
        n_tri = struct.unpack_from("<I", content, 80)[0]
        max_tri = (len(content) - 84) // 50
        n_tri = min(n_tri, max_tri, 300_000)
        verts = []
        offset = 84
        for _ in range(n_tri):
            if offset + 50 > len(content):
                break
            v1 = struct.unpack_from("<3f", content, offset + 12)
            v2 = struct.unpack_from("<3f", content, offset + 24)
            v3 = struct.unpack_from("<3f", content, offset + 36)
            verts.extend([v1, v2, v3])
            offset += 50
        return np.array(verts, dtype=np.float32) if verts else None

    def _read_ascii_stl(self, text: str) -> Optional[np.ndarray]:
        """Parse ASCII STL; return vertex array."""
        verts = []
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("vertex"):
                parts = s.split()
                try:
                    verts.append([float(parts[1]), float(parts[2]), float(parts[3])])
                except (ValueError, IndexError):
                    pass
        return np.array(verts, dtype=np.float32) if verts else None

    # ── .obj ─────────────────────────────────────────────────────────────

    def _parse_obj(self, filename: str, content: bytes) -> ParsedGeometry:
        geom = ParsedGeometry(filename=filename, fmt="obj", has_3d=True)
        try:
            text = content.decode("utf-8", errors="replace")
        except Exception as e:
            geom.warnings.append(f"OBJ decode error: {e}")
            geom.params = _DEFAULT_PARAMS.copy()
            geom.success = False
            return geom

        verts_all: List[List[float]] = []
        faces_all: List[List[int]] = []

        for line in text.splitlines():
            s = line.strip()
            if s.startswith("v ") and not s.startswith(("vt", "vn", "vp")):
                parts = s.split()
                try:
                    verts_all.append([float(parts[1]), float(parts[2]), float(parts[3])])
                except (ValueError, IndexError):
                    pass
            elif s.startswith("f "):
                idx_list = []
                for token in s.split()[1:]:
                    try:
                        idx_list.append(int(token.split("/")[0]) - 1)
                    except ValueError:
                        pass
                if len(idx_list) >= 3:
                    # Triangulate fan
                    for k in range(1, len(idx_list) - 1):
                        faces_all.append([idx_list[0], idx_list[k], idx_list[k + 1]])

        if not verts_all:
            geom.warnings.append("No vertices found in OBJ file")
            geom.params = _DEFAULT_PARAMS.copy()
            return geom

        va = np.array(verts_all, dtype=np.float32)
        geom.n_points = len(va)

        # Build flattened triangle array (same layout as STL) for section extraction
        if faces_all:
            fa = np.array(faces_all)
            tri_verts = va[fa].reshape(-1, 3)
            geom.vertices = tri_verts
            geom.n_triangles = len(faces_all)
        else:
            geom.vertices = va
            geom.n_triangles = len(va) // 3

        geom.sections = self._extract_sections(geom.vertices)

        if geom.sections:
            mid = geom.sections[len(geom.sections) // 2]
            geom.x_upper = mid["x_upper"]
            geom.y_upper = mid["y_upper"]
            geom.x_lower = mid.get("x_lower")
            geom.y_lower = mid.get("y_lower")
            if geom.x_upper is not None and geom.x_lower is not None:
                geom.x_camber, geom.y_camber = self._camber_line(
                    geom.x_upper, geom.y_upper, geom.x_lower, geom.y_lower
                )
        else:
            geom.warnings.append(
                "Could not extract cross-sections from OBJ — using default params"
            )

        geom.params = self._fit_params(geom)
        return geom

    # ── Cross-section extraction from 3D mesh ─────────────────────────────

    def _extract_sections(
        self, verts: np.ndarray, n_sections: int = 7
    ) -> List[Dict]:
        """
        Slice a 3D mesh at n_sections spanwise stations.

        Assumptions:
          - Largest extent axis = spanwise (y if standard; auto-detected)
          - Chord axis = second-largest extent
          - Thickness axis = smallest extent
        """
        sections: List[Dict] = []
        if verts is None or len(verts) < 6:
            return sections

        v_min = verts.min(axis=0)
        v_max = verts.max(axis=0)
        extents = v_max - v_min

        if any(e < 1e-8 for e in extents):
            return sections

        # Identify axes
        order = np.argsort(-extents)   # descending by extent
        span_ax  = int(order[0])       # longest  = span
        chord_ax = int(order[1])       # middle   = chord
        thick_ax = int(order[2])       # shortest = thickness

        # Normalise
        v_norm = (verts - v_min) / extents

        eta_vals = np.linspace(0.05, 0.95, n_sections)
        tol      = 0.5 / n_sections

        N_CHORD = 40

        for eta in eta_vals:
            mask = np.abs(v_norm[:, span_ax] - eta) < tol
            sl   = v_norm[mask]
            if len(sl) < 6:
                continue

            xc = sl[:, chord_ax]
            zc = sl[:, thick_ax]

            x_st = np.linspace(0.0, 1.0, N_CHORD)
            z_up = np.full(N_CHORD, np.nan)
            z_lo = np.full(N_CHORD, np.nan)

            dx = 1.5 / N_CHORD
            for k, xs in enumerate(x_st):
                local = zc[np.abs(xc - xs) < dx]
                if len(local) > 0:
                    z_up[k] = local.max()
                    z_lo[k] = local.min()

            valid = ~np.isnan(z_up) & ~np.isnan(z_lo)
            if valid.sum() < 5:
                continue

            # Set LE (x=0) as z=0 reference
            le_z_up = z_up[valid][0]
            le_z_lo = z_lo[valid][0]
            le_z    = 0.5 * (le_z_up + le_z_lo)

            sections.append({
                "eta":    float(eta),
                "x_upper": x_st[valid],
                "y_upper": z_up[valid] - le_z,
                "x_lower": x_st[valid],
                "y_lower": z_lo[valid] - le_z,
            })

        return sections

    # ── Parameter fitting ─────────────────────────────────────────────────

    def _fit_params(self, geom: ParsedGeometry) -> Dict:
        """Fit NACA-equivalent WingOpt parameters from parsed coordinates."""
        params = _DEFAULT_PARAMS.copy()

        # ── Max camber and its chordwise position ──────────────────────────
        if geom.x_camber is not None and len(geom.x_camber) >= 4:
            yc_abs = np.abs(geom.y_camber)
            max_idx = int(np.argmax(yc_abs))
            camber_pct    = float(yc_abs[max_idx]) * 100.0
            camber_pos_pct = float(geom.x_camber[max_idx]) * 100.0
            params["camber_pct"]     = float(np.clip(camber_pct,     0, 9))
            params["camber_pos_pct"] = float(np.clip(camber_pos_pct, 20, 60))

        # ── Max thickness ──────────────────────────────────────────────────
        if (
            geom.x_upper is not None and geom.x_lower is not None
            and len(geom.x_upper) >= 4 and len(geom.x_lower) >= 4
        ):
            y_lo = np.interp(geom.x_upper, geom.x_lower, geom.y_lower)
            thickness = geom.y_upper - y_lo
            t_max = float(np.max(thickness)) * 100.0
            params["thickness_pct"] = float(np.clip(t_max, 6, 20))

        return params

    # ── Geometric utilities ───────────────────────────────────────────────

    @staticmethod
    def _camber_line(
        x_u: np.ndarray, y_u: np.ndarray,
        x_l: np.ndarray, y_l: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Interpolate lower surface to upper x-stations and average."""
        y_l_interp = np.interp(x_u, x_l, y_l)
        return x_u.copy(), 0.5 * (y_u + y_l_interp)
