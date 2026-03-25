"""
analysis/batch_evaluator.py
----------------------------
Parallel batch evaluation of wing designs across the sampled design space.

Runs N_SAMPLES designs through the full physics pipeline, storing results
in SQLite (queryable) and Parquet (fast ML loading).

Architecture:
  - multiprocessing.Pool for CPU parallelism
  - Progressive writes to SQLite (checkpoint every 50 evaluations)
  - Summary statistics printed at end
  - Graceful failure handling (failed evaluations logged, not skipped)
"""

import sqlite3
import json
import time
import sys
import traceback
from pathlib import Path
from multiprocessing import Pool, cpu_count

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    N_SAMPLES, N_WORKERS, RANDOM_SEED,
    DB_PATH, DATASET_PATH, PARAM_NAMES, RAW_DIR
)
from data.sampler import latin_hypercube_sample, add_baseline_and_extremes
from analysis.aero_metrics import evaluate_design


# ── Database helpers ──────────────────────────────────────────────────────────

def _init_db(conn: sqlite3.Connection) -> None:
    """Create the wing_designs table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wing_designs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            -- Design parameters
            camber_pct          REAL,
            camber_pos_pct      REAL,
            thickness_pct       REAL,
            aoa_deg             REAL,
            flap_angle_deg      REAL,
            flap_chord_pct      REAL,
            aspect_ratio        REAL,
            endplate_h_pct      REAL,
            -- 2D aerodynamic coefficients
            Cl                  REAL,
            Cd                  REAL,
            Cd_pressure         REAL,
            Cd_friction         REAL,
            Cm                  REAL,
            -- 3D wing results
            Cl_3d               REAL,
            Cd_induced          REAL,
            Cd_3d               REAL,
            Cl_Cd               REAL,
            -- Dimensional forces
            downforce_N         REAL,
            drag_N              REAL,
            efficiency          REAL,
            -- Flow state
            converged           INTEGER,
            stall_flag          INTEGER,
            x_tr_upper          REAL,
            x_tr_lower          REAL,
            Re                  REAL,
            -- Geometry descriptors
            airfoil_name        TEXT,
            t_max_pct           REAL,
            camber_actual       REAL,
            -- Metadata
            evaluated_at        TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_downforce ON wing_designs(downforce_N)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_efficiency ON wing_designs(efficiency)")
    conn.commit()


def _insert_records(conn: sqlite3.Connection, records: list[dict]) -> None:
    """Bulk-insert a list of result dicts into the DB."""
    if not records:
        return
    # Build column list from first record (exclude non-DB keys)
    db_keys = [
        "camber_pct","camber_pos_pct","thickness_pct","aoa_deg",
        "flap_angle_deg","flap_chord_pct","aspect_ratio","endplate_h_pct",
        "Cl","Cd","Cd_pressure","Cd_friction","Cm",
        "Cl_3d","Cd_induced","Cd_3d","Cl_Cd",
        "downforce_N","drag_N","efficiency",
        "converged","stall_flag","x_tr_upper","x_tr_lower","Re",
        "airfoil_name","t_max_pct","camber_actual",
    ]
    placeholders = ",".join(["?"] * len(db_keys))
    cols         = ",".join(db_keys)
    rows         = [tuple(r.get(k, None) for k in db_keys) for r in records]
    conn.executemany(f"INSERT INTO wing_designs ({cols}) VALUES ({placeholders})", rows)
    conn.commit()


# ── Worker function (must be top-level for multiprocessing) ──────────────────

def _worker(params: dict) -> dict | None:
    """Evaluate one design — called in subprocess."""
    try:
        return evaluate_design(params)
    except Exception as e:
        # Return a minimal failure record so we can log it
        rec = {p: params.get(p, None) for p in PARAM_NAMES}
        rec.update({
            "Cl": None, "Cd": None, "downforce_N": None, "drag_N": None,
            "efficiency": None, "converged": 0, "stall_flag": 1,
            "airfoil_name": "FAILED", "error": str(e),
        })
        return rec


# ── Main entry point ──────────────────────────────────────────────────────────

def run_batch(
    n_samples:   int  = N_SAMPLES,
    n_workers:   int  = N_WORKERS,
    seed:        int  = RANDOM_SEED,
    resume:      bool = True,
) -> pd.DataFrame:
    """
    Run the full design-space evaluation.

    Args:
        n_samples:  number of LHS samples to evaluate
        n_workers:  parallel worker processes
        seed:       random seed
        resume:     if True, skip already-evaluated designs

    Returns:
        DataFrame of all results.
    """
    print(f"{'='*60}")
    print(f"Batch Aerodynamic Evaluation")
    print(f"  Samples:  {n_samples}")
    print(f"  Workers:  {n_workers}")
    print(f"  Database: {DB_PATH}")
    print(f"{'='*60}")

    # ── Generate samples ──────────────────────────────────────────────────────
    samples = latin_hypercube_sample(n_samples=n_samples, seed=seed)
    samples = add_baseline_and_extremes(samples)
    total   = len(samples)
    print(f"Total designs to evaluate: {total} (LHS + {total-n_samples} anchors)")

    # ── SQLite setup ──────────────────────────────────────────────────────────
    conn = sqlite3.connect(DB_PATH)
    _init_db(conn)

    # Resume: skip already-done count
    start_idx = 0
    if resume:
        n_done = conn.execute("SELECT COUNT(*) FROM wing_designs").fetchone()[0]
        start_idx = n_done
        if start_idx > 0:
            print(f"Resuming from {start_idx}/{total} (already completed)")

    pending = samples[start_idx:]
    if not pending:
        print("All designs already evaluated. Loading from DB.")
        conn.close()
        return _load_from_db()

    # ── Parallel evaluation ───────────────────────────────────────────────────
    t_start    = time.time()
    checkpoint = 50    # write to DB every N completions
    buffer     = []
    n_success  = 0
    n_fail     = 0

    print(f"\nEvaluating {len(pending)} designs...")

    with Pool(processes=n_workers) as pool:
        for i, result in enumerate(pool.imap(_worker, pending, chunksize=4)):
            if result is None:
                n_fail += 1
                continue

            if result.get("airfoil_name") == "FAILED":
                n_fail += 1
            else:
                n_success += 1

            buffer.append(result)

            # Progress bar
            done  = i + 1
            pct   = done / len(pending) * 100
            bar   = "█" * int(pct // 5) + "░" * (20 - int(pct // 5))
            elapsed = time.time() - t_start
            eta     = elapsed / done * (len(pending) - done) if done > 0 else 0
            print(f"\r  [{bar}] {done:4d}/{len(pending)} ({pct:5.1f}%)  "
                  f"✓{n_success} ✗{n_fail}  ETA {eta:.0f}s    ", end="", flush=True)

            # Checkpoint write
            if len(buffer) >= checkpoint:
                _insert_records(conn, [r for r in buffer if r.get("airfoil_name") != "FAILED"])
                buffer.clear()

    # Final flush
    _insert_records(conn, [r for r in buffer if r.get("airfoil_name") != "FAILED"])
    buffer.clear()

    elapsed = time.time() - t_start
    print(f"\n\nCompleted in {elapsed:.1f}s  ({elapsed/len(pending)*1000:.0f} ms/design)")
    print(f"  Success: {n_success}  |  Failed: {n_fail}")

    # ── Export to Parquet ─────────────────────────────────────────────────────
    df = _load_from_db(conn)
    # Save as parquet if available, else CSV
    try:
        df.to_parquet(DATASET_PATH, index=False)
        print(f"  Dataset saved: {DATASET_PATH}  ({len(df)} rows)")
    except ImportError:
        csv_path = str(DATASET_PATH).replace('.parquet', '.csv')
        df.to_csv(csv_path, index=False)
        print(f"  Dataset saved: {csv_path}  ({len(df)} rows)")

    conn.close()
    return df


def _load_from_db(conn: sqlite3.Connection | None = None) -> pd.DataFrame:
    """Load all converged designs from SQLite into a DataFrame."""
    close = conn is None
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql(
        "SELECT * FROM wing_designs WHERE converged=1 AND stall_flag=0",
        conn
    )
    if close:
        conn.close()
    return df


def load_dataset() -> pd.DataFrame:
    """Load the cached dataset (Parquet if available, else CSV). Falls back to SQLite."""
    csv_path = Path(str(DATASET_PATH).replace('.parquet', '.csv'))
    if DATASET_PATH.exists():
        return pd.read_parquet(DATASET_PATH)
    if csv_path.exists():
        return pd.read_csv(csv_path)
    return _load_from_db()


# ── CLI entry ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run batch aerodynamic evaluation")
    parser.add_argument("--samples",  type=int, default=N_SAMPLES)
    parser.add_argument("--workers",  type=int, default=N_WORKERS)
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()

    df = run_batch(
        n_samples=args.samples,
        n_workers=args.workers,
        resume=not args.no_resume,
    )

    print("\n── Dataset Summary ──────────────────────────────────────")
    print(df[["downforce_N","drag_N","efficiency","Cl","Cd_3d"]].describe().round(3))
    print(f"\nTop 5 designs by efficiency:")
    top = df.nlargest(5, "efficiency")[
        ["camber_pct","thickness_pct","aoa_deg","flap_angle_deg","downforce_N","drag_N","efficiency"]
    ]
    print(top.to_string(index=False))
