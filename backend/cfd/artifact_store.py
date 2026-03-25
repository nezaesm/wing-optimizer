"""
cfd/artifact_store.py
---------------------
Artifact storage and metadata capture for CFD runs.

Stores run artifacts (case directories, results, logs) with structured
metadata so runs can be reproduced, queried, and compared.

Storage layout
--------------
  artifacts/
    {run_id}/
      meta.json        — run metadata (params, conditions, fidelity level)
      result.json      — parsed aerodynamic results
      parse_result.json — raw parse output (forces, residuals)
      case/            — symlink or copy of case directory (optional)
"""

from __future__ import annotations

import json
import shutil
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

# Default store root (can be overridden via env var or constructor)
import os
_DEFAULT_STORE = Path(os.environ.get(
    "ARTIFACT_STORE",
    Path(__file__).parent.parent / "results" / "artifacts"
))


# ── Record types ───────────────────────────────────────────────────────────────

@dataclass
class RunRecord:
    """
    Complete metadata record for one CFD run.

    This is what gets written to meta.json in the artifact store.
    """
    run_id:          str
    fidelity_level:  int            # 0 / 1 / 2
    solver:          str            # "level0" | "su2" | "openfoam"
    status:          str            # "pending" | "running" | "done" | "failed"
    created_at:      float          = field(default_factory=time.time)
    finished_at:     Optional[float] = None
    wall_time_s:     float          = 0.0

    # Input context
    design_params:   Dict[str, float] = field(default_factory=dict)
    condition:       Dict[str, float] = field(default_factory=dict)
    case_dir:        str              = ""

    # Output summary (filled after completion)
    Cl:              Optional[float] = None
    Cd:              Optional[float] = None
    efficiency:      Optional[float] = None
    converged:       bool            = False
    failed:          bool            = False
    failure_reason:  str             = ""
    trust_label:     str             = "unset"
    confidence:      float           = 0.0

    notes:           List[str]       = field(default_factory=list)
    tags:            List[str]       = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items()}

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "RunRecord":
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)


# ── Store ─────────────────────────────────────────────────────────────────────

class ArtifactStore:
    """
    Persistent store for CFD run artifacts and metadata.

    Usage
    -----
        store = ArtifactStore()

        # Save a completed run
        run_id = store.save_result(
            run_id   = "abc12345",
            case_dir = Path("runs/abc12345"),
            result   = fidelity_result.to_dict(),
            params   = design_params,
        )

        # Retrieve by run_id
        record = store.get_record(run_id)

        # List recent runs
        records = store.list_records(limit=20)
    """

    def __init__(self, store_root: Optional[Path] = None) -> None:
        self._root = Path(store_root or _DEFAULT_STORE)
        self._root.mkdir(parents=True, exist_ok=True)
        self._index_path = self._root / "index.json"
        self._index: Dict[str, Dict] = self._load_index()

    # ── Write ──────────────────────────────────────────────────────────────────

    def save_result(
        self,
        run_id:       str,
        case_dir:     Optional[Path],
        result:       Dict[str, Any],
        params:       Optional[Dict[str, float]] = None,
        condition:    Optional[Dict[str, float]] = None,
        fidelity:     int = 0,
        solver:       str = "unknown",
        parse_result: Optional[Dict] = None,
        tags:         Optional[List[str]] = None,
        copy_case:    bool = False,
    ) -> str:
        """
        Persist result artifacts for `run_id`.

        Parameters
        ----------
        run_id       : identifier for this run
        case_dir     : path to the CFD case directory (may be None for L0)
        result       : dict from FidelityResult.to_dict() or similar
        params       : design parameter dict
        condition    : operating condition dict
        fidelity     : 0 / 1 / 2
        solver       : solver name string
        parse_result : dict from ParseResult.to_dict() (CFD only)
        tags         : optional string tags for filtering
        copy_case    : if True, copy entire case directory into artifact store

        Returns
        -------
        run_id (unchanged)
        """
        run_dir = self._run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        # ── Build RunRecord ────────────────────────────────────────────────────
        record = RunRecord(
            run_id         = run_id,
            fidelity_level = fidelity,
            solver         = solver,
            status         = "done" if not result.get("failed") else "failed",
            finished_at    = time.time(),
            wall_time_s    = result.get("solver_time_s", 0.0),
            design_params  = params or {},
            condition      = condition or {},
            case_dir       = str(case_dir) if case_dir else "",
            Cl             = result.get("Cl"),
            Cd             = result.get("Cd"),
            efficiency     = result.get("efficiency"),
            converged      = result.get("converged", False),
            failed         = result.get("failed", False),
            failure_reason = result.get("failure_reason", ""),
            trust_label    = result.get("trust_label", "unset"),
            confidence     = result.get("confidence", 0.0),
            notes          = result.get("notes", []),
            tags           = tags or [],
        )

        # ── Write artifacts ────────────────────────────────────────────────────
        _write_json(run_dir / "meta.json",   record.to_dict())
        _write_json(run_dir / "result.json", result)

        if parse_result is not None:
            _write_json(run_dir / "parse_result.json", parse_result)

        if copy_case and case_dir and Path(case_dir).exists():
            dest = run_dir / "case"
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(str(case_dir), str(dest))

        # ── Update index ───────────────────────────────────────────────────────
        self._index[run_id] = {
            "run_id":         run_id,
            "fidelity_level": fidelity,
            "solver":         solver,
            "status":         record.status,
            "created_at":     record.created_at,
            "finished_at":    record.finished_at,
            "Cl":             record.Cl,
            "Cd":             record.Cd,
            "efficiency":     record.efficiency,
            "converged":      record.converged,
            "trust_label":    record.trust_label,
            "tags":           record.tags,
        }
        self._save_index()

        return run_id

    def new_run_id(self) -> str:
        """Generate a fresh run ID."""
        return str(uuid.uuid4())[:12]

    # ── Read ───────────────────────────────────────────────────────────────────

    def get_record(self, run_id: str) -> Optional[RunRecord]:
        """Load full RunRecord from meta.json."""
        meta_path = self._run_dir(run_id) / "meta.json"
        if not meta_path.exists():
            return None
        try:
            data = json.loads(meta_path.read_text())
            return RunRecord.from_dict(data)
        except Exception:
            return None

    def get_result(self, run_id: str) -> Optional[Dict]:
        """Load raw result dict from result.json."""
        path = self._run_dir(run_id) / "result.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())
        except Exception:
            return None

    def get_parse_result(self, run_id: str) -> Optional[Dict]:
        """Load ParseResult dict (forces, residuals)."""
        path = self._run_dir(run_id) / "parse_result.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())
        except Exception:
            return None

    def list_records(
        self,
        limit:    int = 50,
        fidelity: Optional[int] = None,
        tags:     Optional[List[str]] = None,
        converged_only: bool = False,
    ) -> List[Dict]:
        """
        List runs from the index, newest first.

        Returns summary dicts (not full RunRecord — use get_record() for that).
        """
        entries = sorted(
            self._index.values(),
            key=lambda x: x.get("finished_at") or x.get("created_at", 0),
            reverse=True,
        )

        filtered = []
        for e in entries:
            if fidelity is not None and e.get("fidelity_level") != fidelity:
                continue
            if converged_only and not e.get("converged"):
                continue
            if tags:
                run_tags = e.get("tags", [])
                if not all(t in run_tags for t in tags):
                    continue
            filtered.append(e)
            if len(filtered) >= limit:
                break

        return filtered

    def delete_run(self, run_id: str) -> bool:
        """Remove all artifacts for a run. Returns True if anything was deleted."""
        run_dir = self._run_dir(run_id)
        deleted = False
        if run_dir.exists():
            shutil.rmtree(run_dir)
            deleted = True
        if run_id in self._index:
            del self._index[run_id]
            self._save_index()
            deleted = True
        return deleted

    # ── Stats ──────────────────────────────────────────────────────────────────

    def summary(self) -> Dict[str, Any]:
        """Return aggregate statistics across all stored runs."""
        entries = list(self._index.values())
        n_total     = len(entries)
        n_converged = sum(1 for e in entries if e.get("converged"))
        n_failed    = sum(1 for e in entries if e.get("status") == "failed")
        by_fidelity = {}
        for e in entries:
            fl = e.get("fidelity_level", 0)
            by_fidelity[fl] = by_fidelity.get(fl, 0) + 1

        return {
            "n_total":     n_total,
            "n_converged": n_converged,
            "n_failed":    n_failed,
            "by_fidelity": by_fidelity,
        }

    # ── Internal ───────────────────────────────────────────────────────────────

    def _run_dir(self, run_id: str) -> Path:
        return self._root / run_id

    def _load_index(self) -> Dict[str, Dict]:
        if self._index_path.exists():
            try:
                return json.loads(self._index_path.read_text())
            except Exception:
                pass
        return {}

    def _save_index(self) -> None:
        try:
            self._index_path.write_text(json.dumps(self._index, indent=2))
        except Exception:
            pass


# ── Utility ────────────────────────────────────────────────────────────────────

def _write_json(path: Path, data: Any) -> None:
    try:
        path.write_text(json.dumps(data, indent=2, default=str))
    except Exception:
        pass
