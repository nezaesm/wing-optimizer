import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SF } from './tokens'

const ANALYSIS_SCRIPTS = {
  physics: [
    'INITIALIZING PANEL METHOD SOLVER...',
    'LOADING BOUNDARY LAYER ENGINE v2.4',
    'COMPUTING PRESSURE DISTRIBUTION...',
    'EVALUATING TRANSITION CRITERION...',
    'PRANDTL LIFTING-LINE INTEGRATION...',
    'APPLYING VISCOUS CORRECTIONS...',
    'COMPUTING DOWNFORCE COEFFICIENT...',
    'ANALYSIS COMPLETE',
  ],
  ml: [
    'LOADING SURROGATE MODEL ENSEMBLE...',
    'XGBoost · GP · MLP INITIALIZED',
    'FEATURE ENGINEERING [8 params]...',
    'ENSEMBLE PREDICTION IN PROGRESS...',
    'APPLYING UNCERTAINTY BOUNDS...',
    'PREDICTION COMPLETE',
  ],
  '3d': [
    'INITIALIZING VORTEX LATTICE METHOD...',
    'DISCRETIZING WING PANELS: 24×32...',
    'COMPUTING AERODYNAMIC INFLUENCE...',
    'SOLVING DOUBLET STRENGTHS...',
    'EVALUATING GROUND EFFECT...',
    'INTEGRATING SPAN LOADING...',
    '3D VLM ANALYSIS COMPLETE',
  ],
  sweep: [
    'PREPARING ANGLE-OF-ATTACK SWEEP...',
    'RANGE: −18° → −1° [18 POINTS]',
    'EVALUATING CONDITION 01/18...',
    'EVALUATING CONDITION 06/18...',
    'EVALUATING CONDITION 12/18...',
    'EVALUATING CONDITION 18/18...',
    'POLAR CURVE COMPLETE',
  ],
}

function TerminalLine({ text, delay }) {
  const [shown, setShown] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setShown(true)
      let i = 0
      const interval = setInterval(() => {
        setTyped(text.slice(0, i + 1))
        i++
        if (i >= text.length) clearInterval(interval)
      }, 22)
      return () => clearInterval(interval)
    }, delay)
    return () => clearTimeout(t)
  }, [text, delay])

  if (!shown) return null
  const isLast = text.includes('COMPLETE')

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        fontFamily: SF.fontMono,
        fontSize: '10px',
        lineHeight: '1.8',
        color: isLast ? SF.cyan : SF.textMuted,
        display: 'flex', alignItems: 'center', gap: '8px',
      }}
    >
      <span style={{ color: SF.cyanFaint }}>›</span>
      <span>{typed}</span>
      {isLast && (
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: SF.cyan, boxShadow: SF.glowSm,
          animation: 'sfPulse 1.2s ease-in-out infinite',
        }} />
      )}
    </motion.div>
  )
}

function ScanBar({ progress }) {
  return (
    <div style={{ position: 'relative', height: '2px', width: '100%', background: SF.cyanGhost, borderRadius: '1px', overflow: 'hidden' }}>
      <motion.div
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          height: '100%', borderRadius: '1px',
          background: `linear-gradient(90deg, ${SF.cyanFaint}, ${SF.cyan})`,
          boxShadow: SF.glowSm,
        }}
      />
      {/* shimmer */}
      <div style={{
        position: 'absolute', top: 0, height: '100%', width: '40px',
        background: `linear-gradient(90deg, transparent, ${SF.cyanBright}, transparent)`,
        animation: 'scanShimmer 1.5s linear infinite',
      }} />
    </div>
  )
}

function DataFlicker({ values }) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setCurrent(c => (c + 1) % values.length), 320)
    return () => clearInterval(id)
  }, [values.length])
  return (
    <span style={{ fontFamily: SF.fontMono, fontSize: '10px', color: SF.cyanDim }}>
      {values[current]}
    </span>
  )
}

export default function AnalysisOverlay({ visible, analysisType, onDone, error }) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('scan')  // 'scan' | 'compute' | 'done'
  const timerRef = useRef()

  const scripts = ANALYSIS_SCRIPTS[analysisType] || ANALYSIS_SCRIPTS.physics

  useEffect(() => {
    if (!visible) { setProgress(0); setPhase('scan'); return }
    setProgress(0)
    setPhase('scan')

    // Phase 1: scan line (0.4s)
    timerRef.current = setTimeout(() => {
      setPhase('compute')
      // Progress ticks
      let p = 0
      const tick = setInterval(() => {
        p += Math.random() * 12 + 4
        if (p >= 100) { p = 100; clearInterval(tick) }
        setProgress(p)
      }, 280)
    }, 600)

    return () => clearTimeout(timerRef.current)
  }, [visible, analysisType])

  // When API returns (onDone called externally), we show complete
  useEffect(() => {
    if (!visible) setPhase('scan')
  }, [visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            pointerEvents: 'none',
          }}
        >
          {/* Dim overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(1,4,8,0.55)',
            backdropFilter: 'blur(1px)',
          }} />

          {/* Horizontal scan sweep */}
          {phase === 'scan' && (
            <motion.div
              initial={{ top: '0%' }}
              animate={{ top: '100%' }}
              transition={{ duration: 0.55, ease: 'linear' }}
              style={{
                position: 'absolute', left: 0, right: 0, height: '2px',
                background: `linear-gradient(90deg, transparent, ${SF.cyan}, transparent)`,
                boxShadow: `0 0 24px ${SF.cyan}, 0 0 60px rgba(0,229,255,0.3)`,
              }}
            />
          )}

          {/* Terminal window */}
          {phase === 'compute' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.3, ease: SF.ease }}
              style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '340px',
                background: SF.bgPanel,
                border: `1px solid ${SF.border}`,
                borderRadius: '8px',
                backdropFilter: 'blur(32px)',
                boxShadow: `${SF.glowMd}, 0 8px 40px rgba(0,0,0,0.7)`,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              {/* Top accent */}
              <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${SF.cyan}, transparent)`, boxShadow: SF.glowSm }} />

              {/* Header bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 14px 8px',
                borderBottom: `1px solid ${SF.borderDim}`,
              }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: [SF.red, SF.amber, SF.green][i], opacity: 0.6 }} />
                  ))}
                </div>
                <span style={{ fontFamily: SF.fontMono, fontSize: '10px', color: SF.textMuted, letterSpacing: '0.1em', flex: 1, textAlign: 'center' }}>
                  AERODYNAMIC ANALYSIS TERMINAL
                </span>
              </div>

              {/* Terminal body */}
              <div style={{ padding: '12px 14px 10px', minHeight: '140px' }}>
                {scripts.map((line, i) => (
                  <TerminalLine key={line} text={line} delay={i * 420} />
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ padding: '0 14px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <PanelLabel>PROGRESS</PanelLabel>
                  <DataFlicker values={['COMPUTING...', 'CONVERGING...', 'INTEGRATING...', 'EVALUATING...']} />
                </div>
                <ScanBar progress={progress} />
              </div>

              {/* Data flicker panel */}
              <div style={{
                margin: '0 14px 14px',
                padding: '8px 10px',
                background: SF.cyanGhost,
                border: `1px solid ${SF.borderDim}`,
                borderRadius: '4px',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
              }}>
                {[
                  ['CL', () => (-(0.8 + Math.random() * 0.3)).toFixed(3)],
                  ['CD', () => (0.02 + Math.random() * 0.015).toFixed(4)],
                  ['ΔP', () => (400 + Math.random() * 40).toFixed(0) + ' N'],
                  ['η', () => (18 + Math.random() * 8).toFixed(1)],
                ].map(([k, gen]) => (
                  <div key={k} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted }}>{k}</span>
                    <AnimatedValue gen={gen} />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Corner indicators */}
          {['tl','tr','bl','br'].map(c => (
            <motion.div
              key={c}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{
                position: 'absolute',
                ...(c.includes('t') ? { top: '24px' } : { bottom: '24px' }),
                ...(c.includes('l') ? { left: '24px' } : { right: '24px' }),
                fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted,
                letterSpacing: '0.08em',
              }}
            >
              {c === 'tl' && 'WINGOPT · AERO LAB'}
              {c === 'tr' && 'L0·L1·L2'}
              {c === 'bl' && 'SCAN IN PROGRESS'}
              {c === 'br' && progress < 100 ? `${Math.round(progress)}%` : 'DONE'}
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PanelLabel({ children }) {
  return (
    <span style={{ fontFamily: SF.fontMono, fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: SF.textMuted }}>
      {children}
    </span>
  )
}

function AnimatedValue({ gen }) {
  const [v, setV] = useState(gen())
  useEffect(() => {
    const id = setInterval(() => setV(gen()), 450)
    return () => clearInterval(id)
  }, [gen])
  return <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.cyan }}>{v}</span>
}
