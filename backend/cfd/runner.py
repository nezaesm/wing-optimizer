"""
cfd/runner.py
-------------
Execution hooks for CFD runs.

Supports:
  - Local blocking execution (subprocess)
  - Local async (background thread)
  - HPC submission (sbatch / qsub)
  - Status polling for running jobs
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional


@dataclass
class RunStatus:
    run_id:      str
    status:      str       # "pending" | "running" | "done" | "failed"
    started_at:  float     = field(default_factory=time.time)
    finished_at: Optional[float] = None
    wall_time_s: float     = 0.0
    exit_code:   Optional[int]   = None
    log_tail:    str       = ""
    case_dir:    str       = ""

    def to_dict(self) -> Dict:
        return {
            "run_id":      self.run_id,
            "status":      self.status,
            "wall_time_s": self.wall_time_s,
            "exit_code":   self.exit_code,
            "log_tail":    self.log_tail,
            "case_dir":    self.case_dir,
        }


class CFDRunner:
    """
    Manages execution of CFD cases.

    Usage
    -----
        runner = CFDRunner()

        # Blocking local run
        status = runner.run_local(case_dir, solver_cmd="SU2_CFD config.cfg")

        # Async run with callback
        run_id = runner.run_async(case_dir, solver_cmd="simpleFoam",
                                  on_complete=lambda s: print(s.status))

        # HPC submission
        status = runner.submit_hpc(case_dir, submit_cmd="sbatch submit.sh")
    """

    def __init__(self) -> None:
        self._active: Dict[str, RunStatus] = {}

    # ── Local blocking ─────────────────────────────────────────────────────────

    def run_local(
        self,
        case_dir:   Path,
        solver_cmd: str,
        timeout_s:  int = 7200,
    ) -> RunStatus:
        run_id = str(uuid.uuid4())[:8]
        status = RunStatus(run_id=run_id, status="running", case_dir=str(case_dir))
        self._active[run_id] = status

        log_path = case_dir / "runner.log"
        try:
            ret = subprocess.run(
                solver_cmd.split(),
                cwd=str(case_dir),
                capture_output=True,
                text=True,
                timeout=timeout_s,
            )
            log_path.write_text(ret.stdout + "\n" + ret.stderr)
            status.exit_code    = ret.returncode
            status.status       = "done" if ret.returncode == 0 else "failed"
            status.log_tail     = (ret.stdout + ret.stderr)[-2000:]
        except subprocess.TimeoutExpired:
            status.status   = "failed"
            status.log_tail = f"Timeout after {timeout_s}s"
        except Exception as exc:
            status.status   = "failed"
            status.log_tail = str(exc)

        status.finished_at  = time.time()
        status.wall_time_s  = status.finished_at - status.started_at
        _write_status(case_dir, status)
        return status

    # ── Async (background thread) ──────────────────────────────────────────────

    def run_async(
        self,
        case_dir:    Path,
        solver_cmd:  str,
        timeout_s:   int = 7200,
        on_complete: Optional[Callable[[RunStatus], None]] = None,
    ) -> str:
        run_id = str(uuid.uuid4())[:8]
        status = RunStatus(run_id=run_id, status="running", case_dir=str(case_dir))
        self._active[run_id] = status

        def _worker():
            result = self.run_local(case_dir, solver_cmd, timeout_s)
            status.status      = result.status
            status.wall_time_s = result.wall_time_s
            status.exit_code   = result.exit_code
            status.log_tail    = result.log_tail
            if on_complete:
                on_complete(status)

        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        return run_id

    # ── HPC submission ─────────────────────────────────────────────────────────

    def submit_hpc(
        self,
        case_dir:   Path,
        submit_cmd: str = "sbatch submit.sh",
    ) -> RunStatus:
        """
        Submit via scheduler (sbatch / qsub / etc.).
        Returns a RunStatus with job_id stored in log_tail.
        """
        run_id = str(uuid.uuid4())[:8]
        status = RunStatus(run_id=run_id, status="pending", case_dir=str(case_dir))
        try:
            ret = subprocess.run(
                submit_cmd.split(),
                cwd=str(case_dir),
                capture_output=True,
                text=True,
                timeout=30,
            )
            job_id = ret.stdout.strip().split()[-1] if ret.returncode == 0 else "unknown"
            status.status   = "running" if ret.returncode == 0 else "failed"
            status.log_tail = f"job_id={job_id}\n{ret.stdout}\n{ret.stderr}"
        except Exception as exc:
            status.status   = "failed"
            status.log_tail = str(exc)
        _write_status(case_dir, status)
        return status

    # ── Status polling ─────────────────────────────────────────────────────────

    def get_status(self, run_id: str) -> Optional[RunStatus]:
        return self._active.get(run_id)

    def poll_hpc_job(
        self,
        job_id:      str,
        poll_cmd:    str = "squeue -j {job_id} -h -o %T",
        done_states: List[str] = ("COMPLETED",),
        fail_states: List[str] = ("FAILED", "CANCELLED", "TIMEOUT"),
    ) -> str:
        """Poll scheduler for job state. Returns 'running' | 'done' | 'failed'."""
        try:
            ret = subprocess.run(
                poll_cmd.format(job_id=job_id).split(),
                capture_output=True, text=True, timeout=10,
            )
            state = ret.stdout.strip().upper()
            if state in done_states:
                return "done"
            if state in fail_states:
                return "failed"
            return "running"
        except Exception:
            return "unknown"


def _write_status(case_dir: Path, status: RunStatus) -> None:
    try:
        (case_dir / "run_status.json").write_text(
            json.dumps(status.to_dict(), indent=2)
        )
    except Exception:
        pass
