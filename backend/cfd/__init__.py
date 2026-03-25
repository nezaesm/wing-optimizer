"""
cfd — CFD automation pipeline for WingOpt
==========================================

Provides the full pipeline for Level-1 (2-D) and Level-2 (3-D) CFD cases:
  - Case building (geometry export, mesh script, solver config)
  - Execution hooks (local subprocess, HPC sbatch)
  - Results parsing (force history, residuals)
  - Artifact storage and metadata capture
  - Failed-run detection

Usage
-----
    from cfd import CaseBuilder, ArtifactStore

    builder = CaseBuilder(fidelity=1)
    case_dir = builder.build(design_params, condition)

    store = ArtifactStore()
    store.save_result(run_id, case_dir, result_dict)
"""

from cfd.case_builder   import CaseBuilder
from cfd.runner         import CFDRunner, RunStatus
from cfd.parser         import ResultParser, ParseResult, ForceHistory, ResidualHistory
from cfd.artifact_store import ArtifactStore, RunRecord

__all__ = [
    "CaseBuilder",
    "CFDRunner", "RunStatus",
    "ResultParser", "ParseResult", "ForceHistory", "ResidualHistory",
    "ArtifactStore", "RunRecord",
]
