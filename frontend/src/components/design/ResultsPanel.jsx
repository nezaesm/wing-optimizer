// ResultsPanel.jsx — Draggable floating analysis results window
import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingDown, TrendingUp, GripHorizontal } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'
import { PanelDivider } from './HolographicPanel'
import { SF } from './tokens'

// ── Corner L-bracket ornament ─────────────────────────────────────────────────
function Corner({ pos }) {
  return (
    <div style={{
      position: 'absolute',
      width: '8px', height: '8px',
      ...(pos.includes('top')  ? { top: 0 }    : { bottom: 0 }),
      ...(pos.includes('left') ? { left: 0 }   : { right: 0 }),
      borderColor: SF.cyanBright,
      borderStyle: 'solid',
      borderWidth: 0,
      ...(pos.includes('top')  ? { borderTopWidth: '1.5px' }    : { borderBottomWidth: '1.5px' }),
      ...(pos.includes('left') ? { borderLeftWidth: '1.5px' }   : { borderRightWidth: '1.5px' }),
      boxShadow: SF.glowSm,
    }} />
  )
}

// ── Single metric row ─────────────────────────────────────────────────────────
function MetricRow({ label, value, unit, color = SF.cyan, delta }) {
  const pos  = delta !== undefined && delta >= 0
  const zero = delta !== undefined && Math.abs(delta) < 0.05
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: SF.fontMono, fontSize: '13px', fontWeight: 600, color, textShadow: `0 0 10px ${color}44` }}>
          {value ?? '—'}
        </span>
        {unit && <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, marginLeft: '3px' }}>{unit}</span>}
        {delta !== undefined && !zero && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px', marginTop: '1px' }}>
            {pos ? <TrendingDown size={8} color={SF.green} /> : <TrendingUp size={8} color={SF.red} />}
            <span style={{ fontFamily: SF.fontMono, fontSize: '8px', color: pos ? SF.green : SF.red }}>
              {pos ? '+' : ''}{delta?.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ ok, label }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 7px', borderRadius: '3px',
      background: ok ? 'rgba(0,255,136,0.08)' : 'rgba(255,61,90,0.08)',
      border: `1px solid ${ok ? 'rgba(0,255,136,0.22)' : 'rgba(255,61,90,0.22)'}`,
      fontFamily: SF.fontMono, fontSize: '8px',
      color: ok ? SF.green : SF.red,
    }}>
      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: ok ? SF.green : SF.red }} />
      {label}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({ label }) {
  return (
    <div style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, marginBottom: '6px', letterSpacing: '0.1em' }}>
      {label}
    </div>
  )
}

// ── Sweep polar chart ─────────────────────────────────────────────────────────
function SweepChart({ sweep }) {
  if (!sweep?.length) return null

  const data = sweep.map(pt => ({
    aoa:  Number(pt.aoa?.toFixed(1)),
    Cl:   Number(pt.Cl?.toFixed(3)),
    LD:   Number(pt.Cl_Cd?.toFixed(1)),
    Cdx:  Number((pt.Cd * 1000)?.toFixed(2)),   // Cd × 1000 for scale
  }))

  const bestCl = [...data].sort((a, b) => Math.abs(b.Cl) - Math.abs(a.Cl))[0]
  const bestLD = [...data].sort((a, b) => Math.abs(b.LD) - Math.abs(a.LD))[0]

  const tooltipStyle = {
    background: 'rgba(1,4,8,0.96)',
    border: `1px solid ${SF.border}`,
    borderRadius: '4px',
    fontFamily: SF.fontMono,
    fontSize: '8px',
    color: SF.textSub,
    padding: '5px 8px',
    boxShadow: 'none',
  }

  return (
    <div>
      <PanelDivider />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <SectionHead label="AoA POLAR SWEEP" />
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { label: 'Cl',     color: SF.cyan  },
            { label: 'L/D',    color: SF.green },
            { label: 'Cd×10³', color: SF.amber },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <div style={{ width: '10px', height: '1.5px', background: color }} />
              <span style={{ fontFamily: SF.fontMono, fontSize: '7px', color: SF.textMuted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 14, left: -10 }}>
          <CartesianGrid stroke={SF.borderDim} strokeDasharray="3 3" strokeOpacity={0.4} />
          <XAxis
            dataKey="aoa"
            stroke={SF.borderDim}
            tick={{ fill: SF.textMuted, fontSize: 7, fontFamily: SF.fontMono }}
            label={{ value: 'AoA (°)', position: 'insideBottom', offset: -6, fill: SF.textMuted, fontSize: 7, fontFamily: SF.fontMono }}
          />
          <YAxis stroke={SF.borderDim} tick={{ fill: SF.textMuted, fontSize: 7, fontFamily: SF.fontMono }} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={v => `AoA: ${v}°`}
            cursor={{ stroke: SF.cyanDim, strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <ReferenceLine y={0} stroke={SF.borderDim} strokeDasharray="2 2" />
          <Line type="monotone" dataKey="Cl"  stroke={SF.cyan}  dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="LD"  stroke={SF.green} dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="Cdx" stroke={SF.amber} dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px', marginTop: '6px' }}>
        <MetricRow label="Peak |Cl|"      value={Math.abs(bestCl?.Cl ?? 0).toFixed(3)} color={SF.cyan}  />
        <MetricRow label="Peak L/D"       value={Math.abs(bestLD?.LD ?? 0).toFixed(1)}  color={SF.green} />
        <MetricRow label="Best AoA (Cl)"  value={`${bestCl?.aoa ?? '—'}°`}              color={SF.textSub} />
        <MetricRow label="Best AoA (L/D)" value={`${bestLD?.aoa ?? '—'}°`}              color={SF.textSub} />
      </div>
    </div>
  )
}

// ── Label mapping ─────────────────────────────────────────────────────────────
const LABEL_MAP = {
  physics: 'L0 PHYSICS',
  ml:      'ML SURROGATE',
  '3d':    '3D VLM',
  sweep:   'AoA SWEEP',
}

// ── Main ResultsPanel ─────────────────────────────────────────────────────────
export default function ResultsPanel({ results, analysisType, baseline, onClose, visible }) {
  // Draggable position — starts left-center, avoids circular menu at bottom-right
  const [pos, setPos] = useState(() => ({
    x: 32,
    y: Math.max(80, ((typeof window !== 'undefined' ? window.innerHeight : 800) / 2) - 240),
  }))

  const dragging  = useRef(false)
  const startRef  = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const onDragStart = useCallback((e) => {
    dragging.current = true
    startRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    e.preventDefault()
  }, [pos])

  const onDragMove = useCallback((e) => {
    if (!dragging.current) return
    setPos({
      x: startRef.current.px + (e.clientX - startRef.current.mx),
      y: startRef.current.py + (e.clientY - startRef.current.my),
    })
  }, [])

  const onDragEnd = useCallback(() => { dragging.current = false }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup',   onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup',   onDragEnd)
    }
  }, [onDragMove, onDragEnd])

  if (!results || !visible) return null

  const m  = results.metrics
  const bl = baseline
  const pct = (cur, base) => base ? ((cur - base) / Math.abs(base)) * 100 : undefined

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.88, x: -10 }}
          animate={{ opacity: 1, scale: 1,    x: 0   }}
          exit={{    opacity: 0, scale: 0.90,  x: -6  }}
          transition={{ duration: 0.22, ease: SF.ease }}
          style={{
            position: 'fixed',
            left:     `${pos.x}px`,
            top:      `${pos.y}px`,
            zIndex:   30,
            width:    '300px',
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          {/* ── Panel shell ── */}
          <div style={{
            position: 'relative',
            background: SF.bgPanel,
            border: `1px solid ${SF.border}`,
            borderRadius: '6px',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow: `${SF.glowSm}, 0 8px 50px rgba(0,0,0,0.75)`,
            overflow: 'hidden',
          }}>
            <Corner pos="top-left"     />
            <Corner pos="top-right"    />
            <Corner pos="bottom-left"  />
            <Corner pos="bottom-right" />

            {/* Top cyan accent stripe */}
            <div style={{
              height: '2px',
              background: `linear-gradient(90deg, transparent, ${SF.cyan} 30%, ${SF.cyanBright} 50%, ${SF.cyan} 70%, transparent)`,
              boxShadow: SF.glowSm,
            }} />

            {/* ── Drag handle header ── */}
            <div
              onMouseDown={onDragStart}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px 7px',
                borderBottom: `1px solid ${SF.borderDim}`,
                cursor: 'none',
              }}
            >
              <GripHorizontal size={10} color={SF.textMuted} style={{ flexShrink: 0, opacity: 0.55 }} />
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: SF.cyan, boxShadow: SF.glowSm,
                animation: 'sfPulse 1.8s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: SF.fontMono, fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.1em', color: SF.textSub, flex: 1,
              }}>
                ANALYSIS RESULTS
              </span>
              <span style={{
                fontFamily: SF.fontMono, fontSize: '8px', color: SF.textMuted,
                background: SF.cyanGhost, border: `1px solid ${SF.borderDim}`,
                borderRadius: '3px', padding: '1px 5px', flexShrink: 0,
              }}>
                {LABEL_MAP[analysisType] ?? analysisType?.toUpperCase()}
              </span>
              <button
                onClick={onClose}
                onMouseDown={e => e.stopPropagation()}
                style={{ background: 'none', border: 'none', cursor: 'none', color: SF.textMuted, padding: '2px', display: 'flex', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = SF.cyan}
                onMouseLeave={e => e.currentTarget.style.color = SF.textMuted}
              >
                <X size={12} />
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ padding: '10px 12px 12px', maxHeight: '70vh', overflowY: 'auto' }}>

              {/* Status chips */}
              {m && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <StatusChip ok={m.converged}   label={m.converged  ? 'CONVERGED' : 'DIVERGED'} />
                  <StatusChip ok={!m.stall_flag} label={m.stall_flag ? 'STALL'     : 'ATTACHED'} />
                </div>
              )}

              {/* Primary force/efficiency metrics */}
              {m && (
                <>
                  <MetricRow label="Downforce" value={m.downforce_N?.toFixed(0)} unit="N" color={SF.cyan}
                    delta={pct(m.downforce_N, bl?.downforce_N)} />
                  <MetricRow label="Drag"      value={m.drag_N?.toFixed(1)}      unit="N" color={SF.amber}
                    delta={pct(m.drag_N, bl?.drag_N)} />
                  <MetricRow label="Efficiency" value={m.efficiency?.toFixed(2)}          color={SF.green}
                    delta={pct(m.efficiency, bl?.efficiency)} />

                  <PanelDivider />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
                    <MetricRow label="Cl"  value={m.Cl?.toFixed(4)}             color={SF.cyan}  />
                    <MetricRow label="Cd"  value={m.Cd?.toFixed(5)}             color={SF.amber} />
                    <MetricRow label="L/D" value={(m.Cl / m.Cd)?.toFixed(1)}    color={SF.green} />
                    {m.Cd_pressure !== undefined && (
                      <MetricRow label="Cd_p" value={m.Cd_pressure?.toFixed(5)} color={SF.textSub} />
                    )}
                  </div>
                </>
              )}

              {/* ML surrogate details */}
              {results.predictions && (
                <div>
                  <PanelDivider />
                  <SectionHead label="ML ENSEMBLE" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
                    <MetricRow label="Cl"  value={results.predictions.Cl?.toFixed(4)}          color={SF.cyan}  />
                    <MetricRow label="Cd"  value={results.predictions.Cd?.toFixed(5)}          color={SF.amber} />
                    <MetricRow label="DF"  value={results.predictions.downforce_N?.toFixed(0)} unit="N" color={SF.cyan} />
                    <MetricRow label="Eff" value={results.predictions.efficiency?.toFixed(2)}  color={SF.green} />
                  </div>
                </div>
              )}

              {/* 3D VLM section */}
              {results.results_3d && (
                <div>
                  <PanelDivider />
                  <SectionHead label="3D VLM" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
                    <MetricRow label="CL 3D" value={results.results_3d.CL_3d?.toFixed(3)}         color={SF.cyan}  />
                    <MetricRow label="CD 3D" value={results.results_3d.CD_3d?.toFixed(4)}         color={SF.amber} />
                    <MetricRow label="DF 3D" value={results.results_3d.downforce_3d_N?.toFixed(0)} unit="N" color={SF.cyan} />
                    <MetricRow label="Drag"  value={results.results_3d.drag_3d_N?.toFixed(1)}     unit="N" color={SF.amber} />
                  </div>
                  {results.results_3d.ground_effect_factor !== undefined && (
                    <MetricRow label="Ground Effect" value={`×${results.results_3d.ground_effect_factor?.toFixed(3)}`} color={SF.green} />
                  )}
                </div>
              )}

              {/* AoA sweep polar chart */}
              {results.sweep && <SweepChart sweep={results.sweep} />}

              {/* No-data fallback */}
              {!m && !results.sweep && !results.predictions && !results.results_3d && (
                <div style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, textAlign: 'center', padding: '12px 0' }}>
                  NO DATA
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
