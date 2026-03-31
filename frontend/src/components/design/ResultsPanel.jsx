import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus, X } from 'lucide-react'
import HolographicPanel, { PanelDivider } from './HolographicPanel'
import { SF } from './tokens'

function MetricRow({ label, value, unit, sub, color = SF.cyan, delta }) {
  const pos = delta !== undefined && delta >= 0
  const zero = delta !== undefined && Math.abs(delta) < 0.05
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 0',
    }}>
      <div>
        <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </span>
        {sub && (
          <span style={{ fontFamily: SF.fontMono, fontSize: '8px', color: SF.textMuted, opacity: 0.6, marginLeft: '4px' }}>
            {sub}
          </span>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: SF.fontMono, fontSize: '13px', fontWeight: 600, color, textShadow: `0 0 12px ${color}55` }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, marginLeft: '3px' }}>{unit}</span>
        )}
        {delta !== undefined && !zero && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px', marginTop: '1px' }}>
            {pos ? <TrendingDown size={9} color={SF.green} /> : <TrendingUp size={9} color={SF.red} />}
            <span style={{ fontFamily: SF.fontMono, fontSize: '8px', color: pos ? SF.green : SF.red }}>
              {pos ? '+' : ''}{delta?.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

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
      <div style={{
        width: '5px', height: '5px', borderRadius: '50%',
        background: ok ? SF.green : SF.red,
        animation: ok ? 'sfPulse 2s infinite' : 'none',
      }} />
      {label}
    </div>
  )
}

// ── VLM result section ─────────────────────────────────────────────────────────
function VLMSection({ data }) {
  if (!data?.results_3d) return null
  const r = data.results_3d
  return (
    <div>
      <PanelDivider />
      <div style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, marginBottom: '6px', letterSpacing: '0.1em' }}>
        3D VLM
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
        <MetricRow label="CL 3D" value={r.CL_3d?.toFixed(3) ?? '—'} color={SF.cyan} />
        <MetricRow label="CD 3D" value={r.CD_3d?.toFixed(4) ?? '—'} color={SF.amber} />
        <MetricRow label="DF 3D" value={r.downforce_3d_N?.toFixed(0) ?? '—'} unit="N" color={SF.cyan} />
        <MetricRow label="Drag" value={r.drag_3d_N?.toFixed(1) ?? '—'} unit="N" color={SF.amber} />
      </div>
      {r.ground_effect_factor !== undefined && (
        <MetricRow label="Ground Effect" value={`×${r.ground_effect_factor?.toFixed(3)}`} color={SF.green} />
      )}
    </div>
  )
}

// ── ML prediction section ──────────────────────────────────────────────────────
function MLSection({ data }) {
  if (!data?.predictions) return null
  const p = data.predictions
  return (
    <div>
      <PanelDivider />
      <div style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, marginBottom: '6px', letterSpacing: '0.1em' }}>
        ML SURROGATE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
        <MetricRow label="Cl" value={p.Cl?.toFixed(4) ?? '—'} color={SF.cyan} />
        <MetricRow label="Cd" value={p.Cd?.toFixed(5) ?? '—'} color={SF.amber} />
        <MetricRow label="DF" value={p.downforce_N?.toFixed(0) ?? '—'} unit="N" color={SF.cyan} />
        <MetricRow label="Eff" value={p.efficiency?.toFixed(2) ?? '—'} color={SF.green} />
      </div>
    </div>
  )
}

// ── Main ResultsPanel ──────────────────────────────────────────────────────────
export default function ResultsPanel({ results, analysisType, baseline, onClose, visible }) {
  const [expanded, setExpanded] = useState(false)
  if (!results || !visible) return null

  const m = results.metrics
  const bl = baseline

  const pct = (cur, base) => base ? ((cur - base) / Math.abs(base)) * 100 : undefined

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.35, ease: SF.ease }}
          style={{
            position: 'fixed',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            pointerEvents: 'auto',
            minWidth: '520px',
            maxWidth: '90vw',
          }}
        >
          <div style={{
            background: SF.bgPanel,
            border: `1px solid ${SF.border}`,
            borderRadius: '8px',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow: `${SF.glowMd}, 0 8px 50px rgba(0,0,0,0.75)`,
            overflow: 'hidden',
          }}>
            {/* Top accent */}
            <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${SF.cyan} 30%, ${SF.cyanBright} 50%, ${SF.cyan} 70%, transparent)`, boxShadow: SF.glowSm }} />

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 16px 8px',
              borderBottom: `1px solid ${SF.borderDim}`,
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: SF.cyan, boxShadow: SF.glowSm, animation: 'sfPulse 2s infinite' }} />
              <span style={{ fontFamily: SF.fontMono, fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', color: SF.textSub, flex: 1 }}>
                ANALYSIS RESULTS
              </span>
              <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, background: SF.cyanGhost, border: `1px solid ${SF.borderDim}`, borderRadius: '3px', padding: '1px 6px' }}>
                {analysisType?.toUpperCase() ?? 'L0'}
              </span>
              {m && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <StatusChip ok={m.converged} label={m.converged ? 'CONVERGED' : 'DIVERGED'} />
                  <StatusChip ok={!m.stall_flag} label={m.stall_flag ? 'STALL' : 'ATTACHED'} />
                </div>
              )}
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'none', color: SF.textMuted, padding: '2px', display: 'flex' }}
                onMouseEnter={e => e.currentTarget.style.color = SF.cyan}
                onMouseLeave={e => e.currentTarget.style.color = SF.textMuted}
              >
                <X size={13} />
              </button>
            </div>

            {/* Main metrics grid */}
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0 8px' }}>
              {m && <>
                <MetricRow label="Downforce" value={m.downforce_N?.toFixed(0)} unit="N" color={SF.cyan}
                  delta={pct(m.downforce_N, bl?.downforce_N)} />
                <MetricRow label="Drag" value={m.drag_N?.toFixed(1)} unit="N" color={SF.amber}
                  delta={pct(m.drag_N, bl?.drag_N)} />
                <MetricRow label="Efficiency" value={m.efficiency?.toFixed(2)} color={SF.green}
                  delta={pct(m.efficiency, bl?.efficiency)} />
                <MetricRow label="Cl" value={m.Cl?.toFixed(4)} color={SF.cyan} />
                <MetricRow label="Cd" value={m.Cd?.toFixed(5)} color={SF.amber} />
                <MetricRow label="L/D" value={(m.Cl / m.Cd)?.toFixed(1)} color={SF.green} />
              </>}
            </div>

            {/* Expandable extra data */}
            {(results.results_3d || results.predictions) && (
              <>
                <button
                  onClick={() => setExpanded(e => !e)}
                  style={{
                    width: '100%', padding: '6px 16px',
                    background: 'none', border: 'none',
                    borderTop: `1px solid ${SF.borderDim}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    cursor: 'none', color: SF.textMuted,
                    fontFamily: SF.fontMono, fontSize: '9px', letterSpacing: '0.1em',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = SF.cyan}
                  onMouseLeave={e => e.currentTarget.style.color = SF.textMuted}
                >
                  {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {expanded ? 'COLLAPSE' : 'EXPAND DETAILS'}
                </button>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden', padding: '0 16px 12px' }}
                    >
                      <VLMSection data={results} />
                      <MLSection data={results} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
