"""
optimization/hybrid_pipeline.py
--------------------------------
7-stage hybrid optimization pipeline for WingOpt.

Pipeline stages
---------------
  Stage 1  Geometry generation & validation
  Stage 2  L0 conceptual screening (panel/BL physics)
  Stage 3  Surrogate-assisted search (NSGA-II + ensemble ML)
  Stage 4  Constraint filtering
  Stage 5  CFD validation promotion (L1 2-D section RANS)
  Stage 6  Optional L2 3-D refinement (HPC hook)
  Stage 7  Final ranking and result packaging

The pipeline is designed to be:
- Progressive: each stage only promotes the best candidates
- Transparent: every result is labelled with its fidelity level
- Safe: failed or unconverged CFD runs are caught and downgraded
- Resumable: state can be serialised and reloaded between stages

Usage
-----
    pipeline = HybridPipeline()
    result   = pipeline.run(design_space, n_init=200, n_pareto=10)
    print(result.ranked)
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np


# ── Result types ───────────────────────────────────────────────────────────────

@dataclass
class StageResult:
    stage_id:   int
    stage_name: str
    n_in:       int
    n_out:      int
    elapsed_s:  float
    notes:      List[str] = field(default_factory=list)


@dataclass
class CandidateResult:
    """
    Single design candidate after running through the pipeline.
    Carries results from every fidelity level it was evaluated at.
    """
    candidate_id:  str
    params:        Dict[str, float]

    # L0 (always present)
    l0_result:     Optional[Dict] = None

    # Surrogate (present after Stage 3)
    surrogate_result: Optional[Dict] = None

    # L1 CFD (present after Stage 5)
    l1_result:     Optional[Dict] = None

    # L2 CFD (present after Stage 6, optional)
    l2_result:     Optional[Dict] = None

    # Constraint summary
    constraint_summary: Optional[Dict] = None

    # Final ranking
    rank:          Optional[int]   = None
    pareto_front:  Optional[int]   = None   # Pareto front index (0 = dominant)
    final_Cl:      Optional[float] = None
    final_Cd:      Optional[float] = None
    final_efficiency: Optional[float] = None
    trust_label:   str             = "unset"
    confidence:    float           = 0.0
    fidelity_used: int             = 0      # highest fidelity evaluated
    promoted_to_l1: bool           = False
    promoted_to_l2: bool           = False
    notes:         List[str]       = field(default_factory=list)

    def best_result(self) -> Optional[Dict]:
        """Return highest-fidelity available result."""
        return self.l2_result or self.l1_result or self.surrogate_result or self.l0_result

    def to_dict(self) -> Dict:
        return {
            "candidate_id":     self.candidate_id,
            "params":           self.params,
            "rank":             self.rank,
            "pareto_front":     self.pareto_front,
            "final_Cl":         self.final_Cl,
            "final_Cd":         self.final_Cd,
            "final_efficiency": self.final_efficiency,
            "trust_label":      self.trust_label,
            "confidence":       self.confidence,
            "fidelity_used":    self.fidelity_used,
            "promoted_to_l1":   self.promoted_to_l1,
            "promoted_to_l2":   self.promoted_to_l2,
            "l0_result":        self.l0_result,
            "surrogate_result": self.surrogate_result,
            "l1_result":        self.l1_result,
            "constraint_summary": self.constraint_summary,
            "notes":            self.notes,
        }


@dataclass
class PipelineResult:
    """Full output from a HybridPipeline.run() call."""
    run_id:        str
    started_at:    float
    finished_at:   float
    wall_time_s:   float
    stage_log:     List[StageResult]
    ranked:        List[CandidateResult]   # best → worst
    n_evaluated_l0: int = 0
    n_evaluated_l1: int = 0
    n_evaluated_l2: int = 0
    n_constraint_violations: int = 0
    notes:         List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "run_id":          self.run_id,
            "wall_time_s":     self.wall_time_s,
            "n_evaluated_l0":  self.n_evaluated_l0,
            "n_evaluated_l1":  self.n_evaluated_l1,
            "n_evaluated_l2":  self.n_evaluated_l2,
            "n_constraint_violations": self.n_constraint_violations,
            "ranked":          [c.to_dict() for c in self.ranked],
            "stage_log":       [
                {"stage": s.stage_id, "name": s.stage_name,
                 "n_in": s.n_in, "n_out": s.n_out, "elapsed_s": s.elapsed_s}
                for s in self.stage_log
            ],
            "notes":           self.notes,
        }


# ── Pipeline ───────────────────────────────────────────────────────────────────

class HybridPipeline:
    """
    7-stage multi-fidelity optimization pipeline.

    Parameters
    ----------
    l0_top_k     : candidates kept after L0 screening (→ surrogate search)
    surrogate_top_k : candidates from surrogate search promoted to L1 CFD
    l1_top_k     : candidates kept after L1 for final ranking
    enable_l2    : whether to run L2 (3D) refinement (requires HPC)
    l2_top_k     : candidates promoted to L2 if enabled
    on_progress  : optional callback(stage_id, message) for streaming status
    """

    def __init__(
        self,
        l0_top_k:        int = 30,
        surrogate_top_k: int = 10,
        l1_top_k:        int = 5,
        enable_l2:       bool = False,
        l2_top_k:        int = 3,
        on_progress:     Optional[Callable[[int, str], None]] = None,
    ) -> None:
        self.l0_top_k        = l0_top_k
        self.surrogate_top_k = surrogate_top_k
        self.l1_top_k        = l1_top_k
        self.enable_l2       = enable_l2
        self.l2_top_k        = l2_top_k
        self.on_progress     = on_progress or (lambda s, m: None)

    def run(
        self,
        design_space: Optional[Dict[str, Tuple[float, float]]] = None,
        initial_population: Optional[List[Dict[str, float]]] = None,
        n_init: int = 200,
        n_pareto: int = 20,
        condition: Optional[Dict[str, float]] = None,
    ) -> PipelineResult:
        """
        Execute the full 7-stage pipeline.

        Parameters
        ----------
        design_space        : {param: (min, max)} bounds dict (uses defaults if None)
        initial_population  : pre-seeded designs (LHS or user-provided)
        n_init              : LHS population size if initial_population not given
        n_pareto            : target Pareto front size from NSGA-II
        condition           : operating condition dict (uses defaults if None)

        Returns
        -------
        PipelineResult with ranked candidates
        """
        run_id     = str(uuid.uuid4())[:8]
        started_at = time.time()
        stage_log: List[StageResult] = []
        result = PipelineResult(
            run_id=run_id, started_at=started_at,
            finished_at=0, wall_time_s=0, stage_log=stage_log, ranked=[],
        )

        if design_space is None:
            design_space = _DEFAULT_BOUNDS

        # ──────────────────────────────────────────────────────────────────────
        # Stage 1 — Geometry generation & LHS sampling
        # ──────────────────────────────────────────────────────────────────────
        t0 = time.time()
        self.on_progress(1, "Generating initial population via LHS...")
        candidates = self._stage1_generate(
            design_space, initial_population, n_init, condition
        )
        stage_log.append(StageResult(1, "Geometry & LHS generation",
                                     0, len(candidates), time.time() - t0))
        self.on_progress(1, f"Stage 1 done: {len(candidates)} designs generated")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 2 — L0 conceptual screening
        # ──────────────────────────────────────────────────────────────────────
        t0 = time.time()
        n_in = len(candidates)
        self.on_progress(2, f"Running L0 screening on {n_in} designs...")
        candidates = self._stage2_l0_screen(candidates, condition)
        # Keep top l0_top_k by efficiency
        candidates = _rank_by_efficiency(candidates, "l0_result")[:self.l0_top_k]
        result.n_evaluated_l0 = n_in
        stage_log.append(StageResult(2, "L0 conceptual screening",
                                     n_in, len(candidates), time.time() - t0))
        self.on_progress(2, f"Stage 2 done: {len(candidates)} screened through")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 3 — Surrogate-assisted NSGA-II search
        # ──────────────────────────────────────────────────────────────────────
        t0 = time.time()
        n_in = len(candidates)
        self.on_progress(3, f"Running surrogate NSGA-II on {n_in} seeds...")
        candidates = self._stage3_surrogate_nsga2(candidates, design_space, n_pareto)
        # Keep top surrogate_top_k
        candidates = _rank_by_efficiency(candidates, "surrogate_result")[:self.surrogate_top_k]
        stage_log.append(StageResult(3, "Surrogate-assisted NSGA-II",
                                     n_in, len(candidates), time.time() - t0))
        self.on_progress(3, f"Stage 3 done: {len(candidates)} Pareto candidates")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 4 — Constraint filtering
        # ──────────────────────────────────────────────────────────────────────
        t0 = time.time()
        n_in = len(candidates)
        self.on_progress(4, f"Checking constraints for {n_in} candidates...")
        candidates = self._stage4_constraints(candidates)
        feasible   = [c for c in candidates if _is_feasible(c)]
        n_viol     = n_in - len(feasible)
        result.n_constraint_violations = n_viol
        if feasible:
            candidates = feasible
        else:
            # All violated — keep best with warnings
            candidates.sort(key=lambda c: _violation_score(c))
            result.notes.append(
                f"All {n_in} candidates had constraint violations; "
                "keeping best-scoring for reference."
            )
        stage_log.append(StageResult(4, "Constraint filtering",
                                     n_in, len(candidates), time.time() - t0))
        self.on_progress(4, f"Stage 4 done: {len(candidates)} feasible designs")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 5 — L1 CFD validation (2D section RANS)
        # ──────────────────────────────────────────────────────────────────────
        t0 = time.time()
        n_in = len(candidates)
        self.on_progress(5, f"Running L1 CFD validation on {n_in} designs...")
        candidates = self._stage5_l1_cfd(candidates, condition)
        result.n_evaluated_l1 = sum(1 for c in candidates if c.l1_result)
        # Sort: converged L1 first, then by efficiency
        candidates = _sort_by_fidelity_and_efficiency(candidates)[:self.l1_top_k]
        stage_log.append(StageResult(5, "L1 CFD validation (2D RANS)",
                                     n_in, len(candidates), time.time() - t0))
        self.on_progress(5, f"Stage 5 done: {result.n_evaluated_l1} L1 runs completed")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 6 — Optional L2 refinement (3D RANS / HPC)
        # ──────────────────────────────────────────────────────────────────────
        if self.enable_l2:
            t0 = time.time()
            n_in = len(candidates)
            top_l2 = candidates[:self.l2_top_k]
            self.on_progress(6, f"Promoting {len(top_l2)} designs to L2 3-D CFD...")
            top_l2 = self._stage6_l2_cfd(top_l2, condition)
            result.n_evaluated_l2 = sum(1 for c in top_l2 if c.l2_result)
            # Replace in candidates list
            promoted_ids = {c.candidate_id for c in top_l2}
            candidates = top_l2 + [c for c in candidates if c.candidate_id not in promoted_ids]
            stage_log.append(StageResult(6, "L2 3D RANS refinement",
                                         n_in, len(top_l2), time.time() - t0))
            self.on_progress(6, f"Stage 6 done: {result.n_evaluated_l2} L2 runs")
        else:
            stage_log.append(StageResult(6, "L2 3D RANS refinement (skipped)", 0, 0, 0.0,
                                         notes=["L2 disabled — enable_l2=True to activate"]))

        # ──────────────────────────────────────────────────────────────────────
        # Stage 7 — Final ranking and result packaging
        # ──────────────────────────────────────────────────────────────────────
        t0 = time.time()
        self.on_progress(7, "Assembling final ranking...")
        ranked = self._stage7_rank(candidates)
        stage_log.append(StageResult(7, "Final ranking", len(candidates), len(ranked), time.time() - t0))
        self.on_progress(7, f"Pipeline complete. Top design: {_top_summary(ranked)}")

        result.ranked      = ranked
        result.finished_at = time.time()
        result.wall_time_s = result.finished_at - result.started_at
        return result

    # ── Stage implementations ──────────────────────────────────────────────────

    def _stage1_generate(
        self,
        design_space: Dict,
        initial_population: Optional[List[Dict]],
        n_init: int,
        condition: Optional[Dict],
    ) -> List[CandidateResult]:
        """Generate initial population via LHS or use provided."""
        if initial_population:
            pop = initial_population
        else:
            pop = _lhs_sample(design_space, n_init)

        # Validate geometry for each candidate
        candidates = []
        for i, params in enumerate(pop):
            cid = f"c{i:04d}"
            c   = CandidateResult(candidate_id=cid, params=params)
            try:
                from geometry.wing_definition import WingDefinition
                from geometry.geometry_validator import validate
                wd     = WingDefinition.from_flat_dict(params)
                report = validate(wd)
                if not report.valid:
                    c.notes.append(f"Geometry invalid: {report.errors[:1]}")
                    # Still keep — L0 will catch hard failures
                elif report.has_warnings:
                    c.notes.append(f"Geometry warnings: {report.warnings[:1]}")
            except Exception as exc:
                c.notes.append(f"Geometry check failed: {exc}")
            candidates.append(c)

        return candidates

    def _stage2_l0_screen(
        self,
        candidates: List[CandidateResult],
        condition: Optional[Dict],
    ) -> List[CandidateResult]:
        """Run Level-0 evaluator on all candidates."""
        try:
            from fidelity.level0 import Level0Evaluator
            ev = Level0Evaluator()
        except Exception:
            # Fallback to direct analysis call
            ev = None

        for c in candidates:
            try:
                if ev is not None:
                    fr = ev.evaluate(c.params, condition)
                    c.l0_result = _fidelity_result_to_dict(fr)
                else:
                    from analysis.aero_metrics import evaluate_design
                    merged = {**(condition or {}), **c.params}
                    c.l0_result = evaluate_design(merged)
                c.fidelity_used = max(c.fidelity_used, 0)
            except Exception as exc:
                c.l0_result = {"failed": True, "failure_reason": str(exc)}
                c.notes.append(f"L0 failed: {exc}")

        return candidates

    def _stage3_surrogate_nsga2(
        self,
        seed_candidates: List[CandidateResult],
        design_space: Dict,
        n_pareto: int,
    ) -> List[CandidateResult]:
        """
        Run surrogate-driven NSGA-II, seeded with the L0 survivors.
        Falls back to returning seed_candidates if surrogate not available.
        """
        # Try to use surrogate
        try:
            from models.surrogate import predict_uncertain

            # Build surrogate-evaluated candidates
            all_candidates = list(seed_candidates)

            # Run a quick NSGA-II with surrogate as the evaluator
            bounds     = design_space
            param_keys = list(bounds.keys())

            def _surrogate_eval(params: Dict) -> Tuple[float, float]:
                sr = predict_uncertain(params)
                obj1 = -(sr.Cl or 0.0)       # maximise downforce → minimise -Cl
                obj2 =  (sr.Cd or 0.02)       # minimise drag
                return obj1, obj2

            # Run internal NSGA-II
            pareto_params = _mini_nsga2(
                bounds        = bounds,
                evaluator     = _surrogate_eval,
                seeds         = [c.params for c in seed_candidates],
                pop_size      = max(40, n_pareto * 4),
                n_gen         = 20,
            )

            # Evaluate with surrogate and add to candidates
            seen_ids = {c.candidate_id for c in all_candidates}
            for i, params in enumerate(pareto_params):
                cid = f"s{i:04d}"
                if cid in seen_ids:
                    continue
                c = CandidateResult(candidate_id=cid, params=params)
                try:
                    sr = predict_uncertain(params)
                    c.surrogate_result = sr.to_dict()
                    c.fidelity_used    = max(c.fidelity_used, 0)
                    c.notes.append("Generated by surrogate NSGA-II")
                except Exception as exc:
                    c.notes.append(f"Surrogate eval failed: {exc}")
                all_candidates.append(c)

            # Also run surrogate on seed candidates (for consistent comparison)
            for c in seed_candidates:
                if c.surrogate_result is None:
                    try:
                        sr = predict_uncertain(c.params)
                        c.surrogate_result = sr.to_dict()
                    except Exception:
                        pass

            return all_candidates

        except Exception:
            # Surrogate not available — skip, return seeds as-is
            for c in seed_candidates:
                c.notes.append("Surrogate not available; using L0 screening result")
            return seed_candidates

    def _stage4_constraints(
        self, candidates: List[CandidateResult]
    ) -> List[CandidateResult]:
        """Run constraint engine on each candidate."""
        try:
            from constraints.engine import ConstraintEngine
            engine = ConstraintEngine()
        except Exception:
            return candidates   # skip if not available

        for c in candidates:
            best = c.best_result() or {}
            try:
                summary = engine.evaluate(c.params, best)
                c.constraint_summary = summary.to_dict()
                if not summary.feasible:
                    c.notes.append(
                        f"{summary.n_hard_violations} hard constraint violation(s)"
                    )
            except Exception as exc:
                c.notes.append(f"Constraint check failed: {exc}")

        return candidates

    def _stage5_l1_cfd(
        self,
        candidates: List[CandidateResult],
        condition: Optional[Dict],
    ) -> List[CandidateResult]:
        """Promote candidates to L1 2D section CFD."""
        try:
            from fidelity.level1_cfd import Level1Evaluator
            ev = Level1Evaluator(stub_mode=None)   # auto-detect
        except Exception:
            for c in candidates:
                c.notes.append("L1 evaluator not available")
            return candidates

        for c in candidates:
            try:
                fr = ev.evaluate(c.params, condition)
                c.l1_result      = _fidelity_result_to_dict(fr)
                c.promoted_to_l1 = True
                c.fidelity_used  = max(c.fidelity_used, 1)
            except Exception as exc:
                c.notes.append(f"L1 CFD failed: {exc}")
                c.l1_result = {"failed": True, "failure_reason": str(exc)}

        return candidates

    def _stage6_l2_cfd(
        self,
        candidates: List[CandidateResult],
        condition: Optional[Dict],
    ) -> List[CandidateResult]:
        """Promote top candidates to L2 3D RANS (stub in most deployments)."""
        try:
            from fidelity.level2_cfd import Level2Evaluator
            ev = Level2Evaluator(stub_mode=None)
        except Exception:
            for c in candidates:
                c.notes.append("L2 evaluator not available")
            return candidates

        for c in candidates:
            try:
                fr = ev.evaluate(c.params, condition)
                c.l2_result      = _fidelity_result_to_dict(fr)
                c.promoted_to_l2 = True
                c.fidelity_used  = max(c.fidelity_used, 2)
            except Exception as exc:
                c.notes.append(f"L2 CFD failed: {exc}")

        return candidates

    def _stage7_rank(
        self, candidates: List[CandidateResult]
    ) -> List[CandidateResult]:
        """Assign final ranks using highest available fidelity result."""
        # Fill final fields from best available result
        for c in candidates:
            best = c.best_result() or {}
            c.final_Cl          = best.get("Cl") or best.get("downforce_N")
            c.final_Cd          = best.get("Cd") or best.get("drag_N")
            c.final_efficiency  = best.get("efficiency") or best.get("Cl_Cd")
            c.trust_label       = best.get("trust_label", "unset")
            c.confidence        = best.get("confidence", 0.0)

        # Sort: highest efficiency, prefer higher fidelity on ties
        def _key(c: CandidateResult) -> Tuple:
            eff  = c.final_efficiency or 0.0
            fl   = c.fidelity_used
            conv = 1 if (c.l1_result or {}).get("converged") else 0
            return (-eff, -fl, -conv)

        ranked = sorted(candidates, key=_key)
        for i, c in enumerate(ranked):
            c.rank = i + 1

        return ranked


# ── LHS sampler ───────────────────────────────────────────────────────────────

def _lhs_sample(
    design_space: Dict[str, Tuple[float, float]],
    n: int,
) -> List[Dict[str, float]]:
    """Simple LHS sampling over the design space."""
    try:
        from data.sampler import LatinHypercubeSampler
        sampler = LatinHypercubeSampler()
        return sampler.sample(n)
    except Exception:
        # Fallback: uniform random
        keys = list(design_space.keys())
        samples = []
        for _ in range(n):
            p = {}
            for k, (lo, hi) in design_space.items():
                p[k] = float(np.random.uniform(lo, hi))
            samples.append(p)
        return samples


# ── Mini NSGA-II (surrogate-driven, lightweight) ──────────────────────────────

def _mini_nsga2(
    bounds:    Dict[str, Tuple[float, float]],
    evaluator: Callable[[Dict], Tuple[float, float]],
    seeds:     List[Dict],
    pop_size:  int = 40,
    n_gen:     int = 20,
) -> List[Dict]:
    """
    Minimal NSGA-II for surrogate-driven search.
    Returns parameters of Pareto-front individuals.
    """
    keys   = list(bounds.keys())
    lo_arr = np.array([bounds[k][0] for k in keys])
    hi_arr = np.array([bounds[k][1] for k in keys])

    def _dict_to_arr(d: Dict) -> np.ndarray:
        return np.array([d.get(k, (lo_arr[i] + hi_arr[i]) / 2) for i, k in enumerate(keys)])

    def _arr_to_dict(a: np.ndarray) -> Dict:
        return {k: float(np.clip(a[i], lo_arr[i], hi_arr[i])) for i, k in enumerate(keys)}

    # Initialise population
    seed_arrs  = [_dict_to_arr(s) for s in seeds]
    n_rand     = max(0, pop_size - len(seed_arrs))
    rand_arrs  = [lo_arr + np.random.rand(len(keys)) * (hi_arr - lo_arr) for _ in range(n_rand)]
    population = (seed_arrs + rand_arrs)[:pop_size]

    for _ in range(n_gen):
        # Evaluate objectives
        objectives = []
        for ind in population:
            try:
                obj = evaluator(_arr_to_dict(ind))
            except Exception:
                obj = (0.0, 1.0)
            objectives.append(obj)

        # Non-domination sort (fast approximation: sort by weighted sum)
        objs_arr = np.array(objectives)
        scores   = objs_arr[:, 0] + objs_arr[:, 1]   # lower = better for both
        ranking  = np.argsort(scores)

        # Tournament selection + SBX crossover
        new_pop = []
        for _ in range(pop_size):
            i1, i2 = np.random.choice(len(population), 2, replace=False)
            p1 = population[ranking[i1 % len(ranking)]]
            p2 = population[ranking[i2 % len(ranking)]]
            # SBX crossover (eta=15)
            child = _sbx(p1, p2, lo_arr, hi_arr, eta=15.0)
            # Polynomial mutation (eta=20, pm=1/n)
            child = _poly_mutate(child, lo_arr, hi_arr, eta=20.0, pm=1.0 / len(keys))
            new_pop.append(child)

        population = new_pop

    # Return Pareto-front individuals
    objectives = []
    for ind in population:
        try:
            obj = evaluator(_arr_to_dict(ind))
        except Exception:
            obj = (0.0, 1.0)
        objectives.append(obj)

    objs_arr = np.array(objectives)
    pareto   = _fast_pareto_front(objs_arr)
    return [_arr_to_dict(population[i]) for i in pareto]


def _sbx(p1: np.ndarray, p2: np.ndarray,
         lo: np.ndarray, hi: np.ndarray, eta: float) -> np.ndarray:
    u    = np.random.rand(len(p1))
    beta = np.where(u < 0.5,
                    (2 * u) ** (1 / (eta + 1)),
                    (1 / (2 * (1 - u))) ** (1 / (eta + 1)))
    child = 0.5 * ((1 + beta) * p1 + (1 - beta) * p2)
    return np.clip(child, lo, hi)


def _poly_mutate(ind: np.ndarray, lo: np.ndarray, hi: np.ndarray,
                 eta: float, pm: float) -> np.ndarray:
    out = ind.copy()
    for i in range(len(out)):
        if np.random.rand() < pm:
            u  = np.random.rand()
            if u < 0.5:
                delta = (2 * u) ** (1 / (eta + 1)) - 1
            else:
                delta = 1 - (2 * (1 - u)) ** (1 / (eta + 1))
            out[i] = np.clip(out[i] + delta * (hi[i] - lo[i]), lo[i], hi[i])
    return out


def _fast_pareto_front(objs: np.ndarray) -> List[int]:
    """Return indices of non-dominated solutions."""
    n      = len(objs)
    dominated = np.zeros(n, dtype=bool)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if np.all(objs[j] <= objs[i]) and np.any(objs[j] < objs[i]):
                dominated[i] = True
                break
    return [i for i in range(n) if not dominated[i]]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fidelity_result_to_dict(fr: Any) -> Dict:
    """Convert FidelityResult (dataclass) to plain dict."""
    try:
        from dataclasses import asdict
        return asdict(fr)
    except Exception:
        return fr if isinstance(fr, dict) else {}


def _rank_by_efficiency(
    candidates: List[CandidateResult], result_key: str
) -> List[CandidateResult]:
    def _eff(c: CandidateResult) -> float:
        r = getattr(c, result_key) or {}
        return r.get("efficiency") or r.get("Cl_Cd") or 0.0
    return sorted(candidates, key=_eff, reverse=True)


def _sort_by_fidelity_and_efficiency(
    candidates: List[CandidateResult]
) -> List[CandidateResult]:
    def _key(c: CandidateResult) -> Tuple:
        l1 = c.l1_result or {}
        conv = 1 if l1.get("converged") else 0
        eff  = l1.get("efficiency") or (c.l0_result or {}).get("efficiency") or 0.0
        return (-conv, -eff)
    return sorted(candidates, key=_key)


def _is_feasible(c: CandidateResult) -> bool:
    cs = c.constraint_summary
    if cs is None:
        return True  # no constraint data → assume ok
    return cs.get("feasible", True)


def _violation_score(c: CandidateResult) -> float:
    cs = c.constraint_summary
    if cs is None:
        return 0.0
    return float(cs.get("violation_score", 0.0))


def _top_summary(ranked: List[CandidateResult]) -> str:
    if not ranked:
        return "no candidates"
    top = ranked[0]
    eff = top.final_efficiency
    fl  = top.fidelity_used
    return f"efficiency={eff:.3f if eff else 'N/A'}, fidelity=L{fl}"


# ── Default design space ───────────────────────────────────────────────────────

_DEFAULT_BOUNDS: Dict[str, Tuple[float, float]] = {
    "camber_pct":      (0.0,  9.0),
    "camber_pos_pct":  (20.0, 60.0),
    "thickness_pct":   (6.0,  20.0),
    "aoa_deg":         (-18.0, 0.0),
    "flap_angle_deg":  (0.0,  35.0),
    "flap_chord_pct":  (20.0, 35.0),
    "aspect_ratio":    (2.0,  5.5),
    "endplate_h_pct":  (5.0,  30.0),
}
