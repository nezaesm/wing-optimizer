"""
fidelity — Multi-fidelity evaluation stack for WingOpt
=======================================================

Level 0  Conceptual screening (fast in-house panel/BL solver)
Level 1  2-D RANS section CFD (SU2 / OpenFOAM)
Level 2  3-D Full-wing RANS CFD (OpenFOAM / SU2)

Usage
-----
    from fidelity import get_evaluator, FidelityLevel

    evaluator = get_evaluator(FidelityLevel.LEVEL_0_CONCEPTUAL)
    result    = evaluator.evaluate(design_params, condition)
    print(result.trust_label, result.Cl, result.confidence)
"""

from fidelity.base      import FidelityLevel, FidelityResult, FidelityEvaluator, FIDELITY_LABELS
from fidelity.level0    import Level0Evaluator
from fidelity.level1_cfd import Level1Evaluator
from fidelity.level2_cfd import Level2Evaluator


_EVALUATORS = {
    FidelityLevel.LEVEL_0_CONCEPTUAL: Level0Evaluator,
    FidelityLevel.LEVEL_1_CFD_2D:     Level1Evaluator,
    FidelityLevel.LEVEL_2_CFD_3D:     Level2Evaluator,
}


def get_evaluator(level: FidelityLevel, **kwargs) -> FidelityEvaluator:
    """Return a configured evaluator for the requested fidelity level."""
    cls = _EVALUATORS.get(level)
    if cls is None:
        raise ValueError(f"Unknown fidelity level: {level}")
    return cls(**kwargs)


__all__ = [
    "FidelityLevel",
    "FidelityResult",
    "FidelityEvaluator",
    "FIDELITY_LABELS",
    "Level0Evaluator",
    "Level1Evaluator",
    "Level2Evaluator",
    "get_evaluator",
]
