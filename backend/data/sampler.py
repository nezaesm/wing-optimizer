"""
data/sampler.py
---------------
Latin Hypercube Sampling (LHS) over the 8-dimensional wing design space.

LHS guarantees better space-filling coverage than random sampling:
each parameter dimension is divided into N equal intervals, and exactly
one sample is placed in each interval. This prevents clustering and
ensures the ML model trains on a representative dataset.
"""

import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import PARAM_BOUNDS, PARAM_NAMES, N_PARAMS, N_SAMPLES, RANDOM_SEED


def latin_hypercube_sample(
    n_samples: int = N_SAMPLES,
    seed:      int = RANDOM_SEED,
) -> list[dict]:
    """
    Generate an LHS design of experiments over the parameter space.

    Args:
        n_samples: number of design points
        seed:      random seed for reproducibility

    Returns:
        List of parameter dicts, each containing all PARAM_NAMES keys.
    """
    rng = np.random.default_rng(seed)

    # Build LHS matrix: shape (n_samples, n_params)
    # Each column is a permuted, jittered grid in [0, 1]
    lhs = np.zeros((n_samples, N_PARAMS))
    for j in range(N_PARAMS):
        # Base grid: uniform intervals
        cut  = np.linspace(0.0, 1.0, n_samples + 1)
        # Jitter within each interval
        jitter = rng.uniform(size=n_samples)
        points = cut[:-1] + jitter * (cut[1] - cut[0])
        # Permute to break correlation between parameters
        lhs[:, j] = rng.permutation(points)

    # Scale to physical bounds
    samples = []
    for i in range(n_samples):
        params = {}
        for j, name in enumerate(PARAM_NAMES):
            lo, hi, _, _ = PARAM_BOUNDS[name]
            params[name] = float(lo + lhs[i, j] * (hi - lo))
        samples.append(params)

    return samples


def sobol_sample(
    n_samples: int = N_SAMPLES,
    seed:      int = RANDOM_SEED,
) -> list[dict]:
    """
    Quasi-random Sobol sequence sampling (alternative to LHS).
    Provides even better uniformity for high-dimensional spaces.
    Requires scipy >= 1.7.
    """
    try:
        from scipy.stats.qmc import Sobol
        sampler = Sobol(d=N_PARAMS, scramble=True, seed=seed)
        raw     = sampler.random(n_samples)
    except ImportError:
        # Fallback to LHS
        return latin_hypercube_sample(n_samples, seed)

    samples = []
    for i in range(n_samples):
        params = {}
        for j, name in enumerate(PARAM_NAMES):
            lo, hi, _, _ = PARAM_BOUNDS[name]
            params[name] = float(lo + raw[i, j] * (hi - lo))
        samples.append(params)

    return samples


def add_baseline_and_extremes(samples: list[dict]) -> list[dict]:
    """
    Append the baseline design and parameter-extreme designs to the sample list.
    These anchor points improve ML model accuracy at boundary conditions.
    """
    from config import BASELINE_PARAMS
    anchors = [BASELINE_PARAMS.copy()]

    # Min/max corners for each parameter individually (one-at-a-time)
    for name in PARAM_NAMES:
        lo, hi, _, _ = PARAM_BOUNDS[name]
        for val in [lo, hi]:
            p = BASELINE_PARAMS.copy()
            p[name] = val
            anchors.append(p)

    return samples + anchors


if __name__ == "__main__":
    print(f"Generating {N_SAMPLES} LHS samples over {N_PARAMS}D parameter space...")
    samples = latin_hypercube_sample()

    # Print coverage statistics
    import pandas as pd
    df = pd.DataFrame(samples)
    print(f"\nGenerated {len(samples)} samples")
    print("\nParameter coverage:")
    for name in PARAM_NAMES:
        lo, hi, desc, unit = PARAM_BOUNDS[name]
        print(f"  {name:20s}: [{df[name].min():.3f}, {df[name].max():.3f}]"
              f"  (bounds [{lo:.1f}, {hi:.1f}] {unit})")

    # Correlation check — LHS should have low correlations
    corr = df.corr().abs()
    np.fill_diagonal(corr.values, 0)
    print(f"\nMax inter-parameter correlation: {corr.max().max():.3f} (LHS: should be <0.10)")
