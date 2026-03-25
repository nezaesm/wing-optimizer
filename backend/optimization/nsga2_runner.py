"""
optimization/nsga2_runner.py
-----------------------------
Multi-objective wing design optimization using NSGA-II.

Objectives:
  - MAXIMIZE downforce (minimize -downforce_N, which is negative for inverted wing)
  - MINIMIZE drag (drag_N)

Constraints (enforced via penalisation):
  - All parameters within physical bounds
  - Cl < 0 (inverted wing must generate downforce)
  - Cd < 0.25 (drag limit)

Uses the XGBoost surrogate model for fitness evaluation (microseconds vs
milliseconds for physics). Top candidates validated back against physics.

References: Deb et al. (2002) NSGA-II, IEEE Transactions on Evolutionary Computation.
"""

import numpy as np
import json
import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    PARAM_NAMES, PARAM_BOUNDS, RESULTS_DIR,
    OPT_POPULATION, OPT_GENERATIONS, OPT_TOP_N_VALIDATE, RANDOM_SEED
)
from models.predict import predict_xgboost, predict_all

# ── Encoding helpers ──────────────────────────────────────────────────────────

def _decode(x: np.ndarray) -> dict:
    """Map a normalised vector x ∈ [0,1]^N to physical parameter dict."""
    params = {}
    for i, name in enumerate(PARAM_NAMES):
        lo, hi, _, _ = PARAM_BOUNDS[name]
        params[name] = float(lo + x[i] * (hi - lo))
    return params


def _encode(params: dict) -> np.ndarray:
    """Map a parameter dict to normalised [0,1]^N vector."""
    x = np.zeros(len(PARAM_NAMES))
    for i, name in enumerate(PARAM_NAMES):
        lo, hi, _, _ = PARAM_BOUNDS[name]
        x[i] = (params[name] - lo) / (hi - lo)
    return np.clip(x, 0, 1)


def _objectives(x: np.ndarray) -> tuple[float, float]:
    """
    Evaluate the two objectives for a normalised design vector.
    Returns (f1, f2) where both are minimised:
      f1 = -downforce_N  (want large downforce → small negative)
      f2 = +drag_N       (want small drag)
    """
    params = _decode(x)
    pred   = predict_xgboost(params)

    df = pred.get("downforce_N", 0.0)
    dr = pred.get("drag_N", 1.0)
    cl = pred.get("Cl", 0.0)

    # Penalty for non-inverted configurations (Cl should be negative)
    penalty = 0.0
    if cl > 0:
        penalty += 1000.0 * cl

    f1 = df + penalty   # downforce_N already negative; minimise → more downforce
    f2 =  dr + penalty   # minimise drag
    return f1, f2


# ── NSGA-II core ─────────────────────────────────────────────────────────────

def _dominates(a: np.ndarray, b: np.ndarray) -> bool:
    """True if solution a dominates solution b (Pareto dominance)."""
    return bool(np.all(a <= b) and np.any(a < b))


def _fast_non_dominated_sort(F: np.ndarray) -> list[list[int]]:
    """
    Fast non-dominated sort from Deb et al. (2002).
    Returns list of fronts, each front is a list of indices.
    F: (n_pop, n_obj) objective values (all minimised).
    """
    n = len(F)
    S       = [[] for _ in range(n)]   # S[i] = solutions dominated by i
    n_dom   = np.zeros(n, dtype=int)    # domination counter
    fronts  = [[]]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if _dominates(F[i], F[j]):
                S[i].append(j)
            elif _dominates(F[j], F[i]):
                n_dom[i] += 1
        if n_dom[i] == 0:
            fronts[0].append(i)

    k = 0
    while fronts[k]:
        next_front = []
        for i in fronts[k]:
            for j in S[i]:
                n_dom[j] -= 1
                if n_dom[j] == 0:
                    next_front.append(j)
        k += 1
        fronts.append(next_front)

    return [f for f in fronts if f]


def _crowding_distance(F: np.ndarray, front: list[int]) -> np.ndarray:
    """Compute crowding distance for a single front."""
    n = len(front)
    if n <= 2:
        return np.full(n, np.inf)

    dist = np.zeros(n)
    for m in range(F.shape[1]):
        vals   = F[front, m]
        order  = np.argsort(vals)
        dist[order[0]]  = np.inf
        dist[order[-1]] = np.inf
        span = vals[order[-1]] - vals[order[0]]
        if span < 1e-10:
            continue
        for i in range(1, n - 1):
            dist[order[i]] += (vals[order[i+1]] - vals[order[i-1]]) / span

    return dist


def _tournament_select(pop, F, fronts, crowd, rng, n_select):
    """Binary tournament selection on (front rank, -crowding distance)."""
    n   = len(pop)
    sel = []
    # Build rank and crowd arrays indexed by individual
    rank_of  = np.zeros(n, dtype=int)
    crowd_of = np.zeros(n)
    for r, front in enumerate(fronts):
        for i in front:
            rank_of[i] = r
    for r, front in enumerate(fronts):
        cd = _crowding_distance(F, front)
        for k, i in enumerate(front):
            crowd_of[i] = cd[k]

    for _ in range(n_select):
        a, b = rng.choice(n, size=2, replace=False)
        if rank_of[a] < rank_of[b]:
            sel.append(a)
        elif rank_of[b] < rank_of[a]:
            sel.append(b)
        elif crowd_of[a] > crowd_of[b]:
            sel.append(a)
        else:
            sel.append(b)
    return sel


def _crossover_mutate(parent_a, parent_b, rng, eta_c=15, eta_m=20, pm=0.1):
    """
    Simulated binary crossover (SBX) + polynomial mutation.
    Both parents are [0,1]^N; offspring clipped to [0,1].
    """
    n    = len(parent_a)
    # SBX crossover
    child = parent_a.copy()
    u     = rng.random(n)
    beta  = np.where(
        u <= 0.5,
        (2 * u) ** (1 / (eta_c + 1)),
        (1 / (2 * (1 - u))) ** (1 / (eta_c + 1))
    )
    for i in range(n):
        if rng.random() < 0.5:
            child[i] = 0.5 * ((1 + beta[i]) * parent_a[i] + (1 - beta[i]) * parent_b[i])

    # Polynomial mutation
    for i in range(n):
        if rng.random() < pm:
            u = rng.random()
            delta = np.where(
                u < 0.5,
                (2 * u) ** (1 / (eta_m + 1)) - 1,
                1 - (2 * (1 - u)) ** (1 / (eta_m + 1))
            )
            child[i] += delta

    return np.clip(child, 0, 1)


# ── Main NSGA-II loop ─────────────────────────────────────────────────────────

def run_nsga2(
    pop_size:   int = OPT_POPULATION,
    n_gen:      int = OPT_GENERATIONS,
    seed:       int = RANDOM_SEED,
    verbose:    bool = True,
) -> dict:
    """
    Run NSGA-II multi-objective optimization.

    Returns:
        dict with keys: pareto_front, pareto_params, pareto_predictions,
                        convergence_history, elapsed_s
    """
    rng   = np.random.default_rng(seed)
    n_dim = len(PARAM_NAMES)
    t0    = time.time()

    if verbose:
        print(f"NSGA-II  |  pop={pop_size}  gen={n_gen}  dim={n_dim}")
        print(f"Objectives: max downforce, min drag  (ML surrogate)")

    # ── Initialise population ─────────────────────────────────────────────────
    pop = rng.random((pop_size, n_dim))   # normalised [0,1]^N
    F   = np.array([_objectives(x) for x in pop])

    history = []   # (gen, mean_f1, mean_f2, best_f1, best_f2)

    # ── Generational loop ─────────────────────────────────────────────────────
    for gen in range(n_gen):

        # Non-dominated sort + crowding on combined pop
        fronts = _fast_non_dominated_sort(F)
        crowd  = {r: _crowding_distance(F, front) for r, front in enumerate(fronts)}

        # Tournament selection → offspring
        parents_idx = _tournament_select(pop, F, fronts, crowd, rng, pop_size)
        offspring   = []
        for i in range(0, len(parents_idx) - 1, 2):
            a, b = parents_idx[i], parents_idx[i+1]
            child = _crossover_mutate(pop[a], pop[b], rng)
            offspring.append(child)

        offspring = np.array(offspring)
        F_off     = np.array([_objectives(x) for x in offspring])

        # Combine parent + offspring
        pop_combined = np.vstack([pop, offspring])
        F_combined   = np.vstack([F, F_off])

        # Select next generation via elitist NSGA-II selection
        fronts_new = _fast_non_dominated_sort(F_combined)
        new_pop_idx = []
        for front in fronts_new:
            if len(new_pop_idx) + len(front) <= pop_size:
                new_pop_idx.extend(front)
            else:
                # Fill remainder by crowding distance
                needed = pop_size - len(new_pop_idx)
                cd     = _crowding_distance(F_combined, front)
                top    = sorted(range(len(front)), key=lambda k: -cd[k])[:needed]
                new_pop_idx.extend([front[k] for k in top])
                break

        pop = pop_combined[new_pop_idx]
        F   = F_combined[new_pop_idx]

        # Log progress
        pareto_mask = np.array([_fast_non_dominated_sort(F)[0]], dtype=object)
        pareto_F    = F[_fast_non_dominated_sort(F)[0]]
        history.append({
            "gen": gen + 1,
            "mean_downforce": float(F[:, 0].mean()),
            "mean_drag":      float(F[:, 1].mean()),
            "best_downforce": float(pareto_F[:, 0].min()),
            "best_efficiency": float((abs(pareto_F[:, 0]) / np.maximum(pareto_F[:, 1], 1e-3)).max()),
            "pareto_size":    len(pareto_F),
        })

        if verbose and (gen % max(1, n_gen // 10) == 0 or gen == n_gen - 1):
            h = history[-1]
            print(f"  Gen {gen+1:4d}/{n_gen}  "
                  f"best DF={h['best_downforce']:+.1f}N  "
                  f"best eff={h['best_efficiency']:.2f}  "
                  f"Pareto={h['pareto_size']}")

    # ── Extract Pareto front ───────────────────────────────────────────────────
    pareto_idx    = _fast_non_dominated_sort(F)[0]
    pareto_pop    = pop[pareto_idx]
    pareto_F      = F[pareto_idx]
    pareto_params = [_decode(x) for x in pareto_pop]
    pareto_preds  = [predict_xgboost(p) for p in pareto_params]

    # Sort Pareto front by downforce
    order         = np.argsort(pareto_F[:, 0])   # ascending f1 = ascending -df
    pareto_params = [pareto_params[i] for i in order]
    pareto_preds  = [pareto_preds[i]  for i in order]
    pareto_F      = pareto_F[order]

    elapsed = time.time() - t0
    if verbose:
        print(f"\nCompleted in {elapsed:.1f}s")
        print(f"Pareto front: {len(pareto_params)} solutions")
        print(f"\nTop-5 by efficiency:")
        efficiencies = [
            abs(p["downforce_N"]) / max(p["drag_N"], 1e-3) for p in pareto_preds
        ]
        top5 = sorted(range(len(pareto_preds)), key=lambda i: efficiencies[i])[:5]
        for rank, i in enumerate(top5):
            p = pareto_params[i]; pr = pareto_preds[i]
            print(f"  #{rank+1}  DF={pr['downforce_N']:+.1f}N  D={pr['drag_N']:.1f}N  "
                  f"eff={efficiencies[i]:.2f}  "
                  f"aoa={p['aoa_deg']:.1f}°  flap={p['flap_angle_deg']:.1f}°")

    result = {
        "pareto_params":      pareto_params,
        "pareto_predictions": pareto_preds,
        "pareto_F":           pareto_F.tolist(),
        "convergence":        history,
        "elapsed_s":          elapsed,
        "n_evaluations":      pop_size * n_gen,
    }

    # Save results
    save_path = RESULTS_DIR / "optimized_designs.json"
    with open(save_path, "w") as f:
        json.dump(result, f, indent=2, default=float)
    if verbose:
        print(f"\nSaved: {save_path}")

    return result


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--pop",  type=int, default=OPT_POPULATION)
    parser.add_argument("--gen",  type=int, default=OPT_GENERATIONS)
    args = parser.parse_args()
    run_nsga2(pop_size=args.pop, n_gen=args.gen)
