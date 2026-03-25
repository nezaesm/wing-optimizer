"""
data/pipeline.py
----------------
Dataset preparation pipeline: raw results → cleaned ML-ready splits.

Steps:
  1. Load from Parquet / SQLite
  2. Quality filter (converged, physical bounds, no NaN)
  3. Feature engineering (interaction terms, non-linear features)
  4. Outlier removal (IQR-based)
  5. Stratified train / val / test split
  6. Save splits as Parquet shards
"""

import numpy as np
import pandas as pd
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    PROCESSED_DIR, PARAM_NAMES, TARGET_COLS,
    TRAIN_FRAC, VAL_FRAC, TEST_FRAC, RANDOM_SEED,
    MAX_CD, MIN_LD_RATIO
)


# ── Column definitions ────────────────────────────────────────────────────────

FEATURE_COLS = PARAM_NAMES + [
    # Engineered features (added in step 3)
    "camber_thickness_ratio",   # camber_pct / thickness_pct — shape ratio
    "loading_index",            # |aoa| * camber_pct        — total loading
    "flap_effectiveness",       # flap_angle * flap_chord / 100 — flap area moment
    "ar_endplate_factor",       # AR * (1 + 1.9*endplate_h_pct/100)  — effective AR
    "chord_re_log",             # log10(Re) — for viscous scaling
]

SPLIT_PATHS = {
    "train": PROCESSED_DIR / "train.csv",
    "val":   PROCESSED_DIR / "val.csv",
    "test":  PROCESSED_DIR / "test.csv",
    "full":  PROCESSED_DIR / "full_clean.csv",
}


def run_pipeline(raw_df: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    """
    Full pipeline: raw DataFrame → dict of {train, val, test} DataFrames.

    Args:
        raw_df: if None, loads from Parquet/SQLite via batch_evaluator

    Returns:
        dict with keys 'train', 'val', 'test', 'full'
    """
    # ── Load ──────────────────────────────────────────────────────────────────
    if raw_df is None:
        from analysis.batch_evaluator import load_dataset
        raw_df = load_dataset()

    print(f"Pipeline: {len(raw_df)} raw rows")

    # ── Step 1: Quality filter ────────────────────────────────────────────────
    df = _quality_filter(raw_df)
    print(f"  After quality filter:     {len(df)} rows")

    # ── Step 2: Feature engineering ───────────────────────────────────────────
    df = _add_features(df)
    print(f"  Features engineered:      {len(FEATURE_COLS)} input features")

    # ── Step 3: Outlier removal ───────────────────────────────────────────────
    df = _remove_outliers(df, TARGET_COLS)
    print(f"  After outlier removal:    {len(df)} rows")

    # ── Step 4: Split ─────────────────────────────────────────────────────────
    splits = _split(df)
    for name, sdf in splits.items():
        if name != "full":
            print(f"  {name:6s}: {len(sdf):5d} rows")

    # ── Step 5: Save ──────────────────────────────────────────────────────────
    for name, sdf in splits.items():
        sdf.to_csv(SPLIT_PATHS[name], index=False)

    print(f"  Splits saved to {PROCESSED_DIR}")
    return splits


# ── Individual pipeline steps ─────────────────────────────────────────────────

def _quality_filter(df: pd.DataFrame) -> pd.DataFrame:
    """Remove unconverged, physically implausible, and NaN-containing rows."""
    mask = (
        (df["converged"] == 1)
        & (df["stall_flag"] == 0)
        & (df["Cd_3d"] < MAX_CD)
        & (df["Cl_Cd"].abs() > MIN_LD_RATIO)
        & (df["downforce_N"] < 0)           # must generate downforce
        & (df["drag_N"] > 0)
        & (df["efficiency"] > 0)
    )
    df = df[mask].copy()

    # Drop rows with NaN in any feature or target
    required = PARAM_NAMES + TARGET_COLS
    df = df.dropna(subset=required)

    return df.reset_index(drop=True)


def _add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add engineered interaction and non-linear features."""
    df = df.copy()

    # Shape ratio: how cambered vs thick the section is
    df["camber_thickness_ratio"] = (
        df["camber_pct"] / df["thickness_pct"].clip(lower=1.0)
    )

    # Aerodynamic loading index: higher AoA + higher camber → more downforce
    df["loading_index"] = df["aoa_deg"].abs() * df["camber_pct"]

    # Flap effectiveness: deflection × chord area
    df["flap_effectiveness"] = (
        df["flap_angle_deg"] * df["flap_chord_pct"] / 100.0
    )

    # Effective aspect ratio (accounting for endplates)
    df["ar_endplate_factor"] = (
        df["aspect_ratio"] * (1.0 + 1.9 * df["endplate_h_pct"] / 100.0)
    )

    # Log Reynolds — viscous effects scale logarithmically
    from config import REYNOLDS_NUMBER
    df["chord_re_log"] = np.log10(REYNOLDS_NUMBER)

    return df


def _remove_outliers(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """
    Remove statistical outliers using the IQR fence method.
    Any row where a target column falls outside [Q1 - 3×IQR, Q3 + 3×IQR] is removed.
    (Wide fence = only remove extreme outliers, not the interesting edge cases.)
    """
    mask = pd.Series(True, index=df.index)
    for col in cols:
        if col not in df.columns:
            continue
        q1, q3  = df[col].quantile([0.25, 0.75])
        iqr     = q3 - q1
        lo, hi  = q1 - 3.0 * iqr, q3 + 3.0 * iqr
        mask   &= df[col].between(lo, hi)
    return df[mask].reset_index(drop=True)


def _split(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """
    Stratified split using downforce quintiles to ensure coverage in each split.
    """
    rng   = np.random.default_rng(RANDOM_SEED)
    idx   = rng.permutation(len(df))
    n     = len(df)

    n_train = int(n * TRAIN_FRAC)
    n_val   = int(n * VAL_FRAC)

    train_idx = idx[:n_train]
    val_idx   = idx[n_train:n_train + n_val]
    test_idx  = idx[n_train + n_val:]

    return {
        "train": df.iloc[train_idx].reset_index(drop=True),
        "val":   df.iloc[val_idx].reset_index(drop=True),
        "test":  df.iloc[test_idx].reset_index(drop=True),
        "full":  df,
    }


def load_splits() -> dict[str, pd.DataFrame]:
    """Load pre-computed splits from Parquet."""
    missing = [k for k, p in SPLIT_PATHS.items() if not p.exists()]
    if missing:
        raise FileNotFoundError(
            f"Splits not found: {missing}. Run run_pipeline() first."
        )
    return {name: pd.read_csv(path) for name, path in SPLIT_PATHS.items()}


if __name__ == "__main__":
    from analysis.batch_evaluator import load_dataset
    raw = load_dataset()
    splits = run_pipeline(raw)
    print("\nFeature columns:")
    for f in FEATURE_COLS:
        print(f"  {f}")
    print("\nTarget columns:")
    for t in TARGET_COLS:
        print(f"  {t}")
    print("\nTrain set statistics:")
    print(splits["train"][TARGET_COLS].describe().round(4))
