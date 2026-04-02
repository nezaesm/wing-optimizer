// SectionShell.jsx — HTML overlay panels for sections §1–§6
// Left-anchored, dashed border panel with section metadata
// Ghost title keeps layout stable (particle title is the visual one in R3F)
import { SF } from './design/tokens'

const SECTION_INFO = {
  1: {
    num: '01',
    name: 'Train',
    desc: 'Neural surrogate model — XGBoost ensemble with Gaussian\nuncertainty bounds trained on Latin hypercube samples.',
  },
  2: {
    num: '02',
    name: 'Optimize',
    desc: 'Multi-objective NSGA-II — Pareto-optimal Cl/Cd trade-off\nsurface across the 8-dimensional parameter space.',
  },
  3: {
    num: '03',
    name: 'Validate',
    desc: 'Multi-fidelity validation — L0 panel/BL through L2 OpenFOAM\ncross-check on top Pareto candidates.',
  },
  4: {
    num: '04',
    name: 'Sensitivity',
    desc: 'One-at-a-time sensitivity sweep — parameter importance\nacross the full operating range.',
  },
  5: {
    num: '05',
    name: 'Dataset',
    desc: 'Training dataset statistics — LHS coverage, ML R² and RMSE\nacross all six aerodynamic targets.',
  },
  6: {
    num: '06',
    name: 'About',
    desc: 'WingOpt — open-source aerodynamic design intelligence.\nPhysics simulation → surrogate → optimization pipeline.',
  },
}

export default function SectionShell({ sectionIndex, active }) {
  const info = SECTION_INFO[sectionIndex]
  if (!info) return null

  return (
    <div style={{
      position:      'fixed',
      inset:         0,
      zIndex:        10,
      pointerEvents: 'none',
      opacity:       active ? 1 : 0,
      transition:    'opacity 0.55s ease',
    }}>
      {/* Left-anchored info panel */}
      <div style={{
        position:     'absolute',
        left:         '28px',
        bottom:       '88px',
        borderLeft:   '1px dashed rgba(255,255,255,0.11)',
        borderBottom: '1px dashed rgba(255,255,255,0.11)',
        padding:      '16px 20px 16px 16px',
        maxWidth:     '280px',
      }}>
        {/* Section index badge */}
        <div style={{
          fontFamily:    SF.fontMono,
          fontSize:      '9px',
          letterSpacing: '0.20em',
          color:         'rgba(200,200,200,0.28)',
          marginBottom:  '8px',
        }}>
          §{info.num}
        </div>

        {/* Ghost title — near-invisible; particle system is the real title */}
        <div style={{
          fontFamily:    '"Syne", sans-serif',
          fontWeight:    800,
          fontSize:      '26px',
          letterSpacing: '0.05em',
          color:         'rgba(255,255,255,0.03)',
          marginBottom:  '10px',
          textTransform: 'uppercase',
          lineHeight:    1.1,
        }}>
          {info.name}
        </div>

        {/* Description */}
        <div style={{
          fontFamily:    '"Plus Jakarta Sans", sans-serif',
          fontSize:      '11px',
          lineHeight:    '1.65',
          color:         'rgba(160,160,160,0.50)',
          letterSpacing: '0.018em',
          whiteSpace:    'pre-line',
        }}>
          {info.desc}
        </div>
      </div>

      {/* Top-right corner label */}
      <div style={{
        position:      'absolute',
        top:           `${SF.navH + 18}px`,
        right:         '28px',
        fontFamily:    SF.fontMono,
        fontSize:      '9px',
        letterSpacing: '0.15em',
        color:         'rgba(160,160,160,0.22)',
        textTransform: 'uppercase',
      }}>
        {info.name} · PHASE 1
      </div>
    </div>
  )
}
