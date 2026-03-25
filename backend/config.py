"""
config.py
---------
Central configuration for the Wing Optimizer project.
All paths, physics constants, parameter bounds, and
sampling/training hyperparameters live here.
"""

from pathlib import Path

# ── Project root ──────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent
DATA_DIR    = ROOT / "data"
RAW_DIR     = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODELS_DIR  = ROOT / "models" / "saved"
RESULTS_DIR = ROOT / "results"

for d in [RAW_DIR, PROCESSED_DIR, MODELS_DIR, RESULTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

DB_PATH     = DATA_DIR / "db.sqlite"
DATASET_PATH = PROCESSED_DIR / "wing_dataset.parquet"

# ── Flow conditions (Formula-style front wing at ~150 km/h) ───────────────────
FREESTREAM_VELOCITY   = 41.67   # m/s  (150 km/h)
AIR_DENSITY           = 1.225   # kg/m³ at sea level, 15°C
KINEMATIC_VISCOSITY   = 1.461e-5  # m²/s
REFERENCE_CHORD       = 0.25    # m  — main element chord
REFERENCE_SPAN        = 1.60    # m  — half-car width, both sides
REFERENCE_AREA        = REFERENCE_CHORD * REFERENCE_SPAN  # m²

# Reynolds number at reference conditions
REYNOLDS_NUMBER = (FREESTREAM_VELOCITY * REFERENCE_CHORD) / KINEMATIC_VISCOSITY
# ≈ 712 000  — transitional/turbulent, well within XFoil/panel regime

# ── Design parameter space ────────────────────────────────────────────────────
# Each entry: (min, max, description, unit)
PARAM_BOUNDS = {
    "camber_pct":     (0.0,   9.0,  "Max camber as % chord",         "%"),
    "camber_pos_pct": (20.0,  60.0, "Camber position as % chord",    "%"),
    "thickness_pct":  (6.0,   20.0, "Max thickness as % chord",      "%"),
    "aoa_deg":        (-18.0,  0.0, "Angle of attack (inverted)",    "°"),
    "flap_angle_deg": (0.0,   35.0, "Main-element flap deflection",  "°"),
    "flap_chord_pct": (20.0,  35.0, "Flap chord as % main chord",    "%"),
    "aspect_ratio":   (2.0,    5.5, "Wing aspect ratio (span²/area)","—"),
    "endplate_h_pct": (5.0,   30.0, "Endplate height as % span",     "%"),
}

PARAM_NAMES = list(PARAM_BOUNDS.keys())
N_PARAMS    = len(PARAM_NAMES)

# ── Baseline design (clean NACA 4412 inverted) ────────────────────────────────
BASELINE_PARAMS = {
    "camber_pct":     4.0,
    "camber_pos_pct": 40.0,
    "thickness_pct":  12.0,
    "aoa_deg":        -5.0,
    "flap_angle_deg": 10.0,
    "flap_chord_pct": 25.0,
    "aspect_ratio":   3.5,
    "endplate_h_pct": 15.0,
}

# ── Aerodynamic constraints (physical limits) ─────────────────────────────────
MAX_Cl_MAGNITUDE  = 3.5    # |Cl| — beyond this, likely separated flow
MIN_LD_RATIO      = 2.0    # L/D  — discard catastrophically draggy designs
MAX_CD            = 0.25   # Cd   — upper drag limit
STALL_MARGIN_DEG  = 2.0    # keep AoA this far from predicted stall AoA

# ── Geometry discretisation ───────────────────────────────────────────────────
N_PANELS          = 150    # chordwise panels per surface (odd number)
N_SPAN_STATIONS   = 20     # spanwise VLM panels
COSINE_SPACING    = True   # cluster panels near LE/TE for accuracy

# ── Dataset generation ────────────────────────────────────────────────────────
N_SAMPLES         = 1200   # LHS samples — covers 8D space well
N_WORKERS         = 2      # parallel workers (match CPU count)
RANDOM_SEED       = 42

# ── Train / val / test split ──────────────────────────────────────────────────
TRAIN_FRAC = 0.70
VAL_FRAC   = 0.15
TEST_FRAC  = 0.15

# ── Target outputs (what the ML model predicts) ───────────────────────────────
TARGET_COLS = ["Cl", "Cd", "Cl_Cd", "downforce_N", "drag_N", "efficiency"]

# ── Optimization objectives ───────────────────────────────────────────────────
OPT_MAXIMIZE = "downforce_N"
OPT_MINIMIZE = "drag_N"
OPT_POPULATION   = 100   # NSGA-II population size
OPT_GENERATIONS  = 200   # NSGA-II max generations
OPT_TOP_N_VALIDATE = 10  # top-N designs sent to physics validation
