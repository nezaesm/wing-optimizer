// src/pages/Design.jsx — §0 HTML overlay for the Design studio
// SciFiScene is now in App.jsx (persistent across all sections)
// This component renders only the 2D UI layer on top of the R3F canvas
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../api/client'
import AnalysisOverlay from '../components/design/AnalysisOverlay'
import ResultsPanel from '../components/design/ResultsPanel'
import CircularAnalysisMenu from '../components/design/CircularAnalysisMenu'
import { SF } from '../components/design/tokens'

// ── Corner data displays ──────────────────────────────────────────────────────
function CornerData({ params, metrics }) {
  const items = [
    { k: 'AoA',    v: `${params.aoa_deg}°` },
    { k: 'Camber', v: `${params.camber_pct.toFixed(1)}%` },
    { k: 'AR',     v: params.aspect_ratio.toFixed(1) },
    ...(metrics ? [
      { k: 'Cl',  v: metrics.Cl?.toFixed(3)         ?? '—' },
      { k: 'Eff', v: metrics.efficiency?.toFixed(2) ?? '—' },
    ] : []),
  ]
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1.2 }}
      style={{ position: 'fixed', top: `${SF.navH + 16}px`, left: '24px', zIndex: 20, pointerEvents: 'none' }}
    >
      {items.map(({ k, v }) => (
        <div key={k} style={{ display: 'flex', gap: '8px', lineHeight: '1.9' }}>
          <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, minWidth: '40px' }}>{k}</span>
          <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.cyanDim }}>{v}</span>
        </div>
      ))}
    </motion.div>
  )
}

function CornerDataRight({ metrics }) {
  if (!metrics) return null
  const items = [
    { k: 'DF',   v: `${metrics.downforce_N?.toFixed(0)} N` },
    { k: 'Drag', v: `${metrics.drag_N?.toFixed(1)} N` },
    { k: 'Cd',   v: metrics.Cd?.toFixed(5) ?? '—' },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      style={{ position: 'fixed', top: `${SF.navH + 16}px`, right: '88px', zIndex: 20, pointerEvents: 'none', textAlign: 'right' }}
    >
      {items.map(({ k, v }) => (
        <div key={k} style={{ display: 'flex', gap: '8px', lineHeight: '1.9', justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted }}>{k}</span>
          <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.cyanDim }}>{v}</span>
        </div>
      ))}
    </motion.div>
  )
}

function PageTitle() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      style={{
        position: 'fixed', top: `${SF.navH + 14}px`, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}
    >
      <span style={{ fontFamily: SF.fontMono, fontSize: '9px', letterSpacing: '0.18em', color: SF.textMuted }}>
        WING · DESIGN · STUDIO
      </span>
      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: SF.cyanFaint }} />
      <span style={{ fontFamily: SF.fontMono, fontSize: '9px', letterSpacing: '0.1em', color: SF.cyanGhost }}>
        NACA SERIES
      </span>
    </motion.div>
  )
}

function HotspotHint({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 2.5, duration: 0.5 }}
          style={{
            position: 'fixed', bottom: '100px', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20, pointerEvents: 'none',
            fontFamily: SF.fontMono, fontSize: '9px',
            color: SF.textMuted, letterSpacing: '0.1em',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: SF.cyanDim, animation: 'sfPulse 2s infinite' }} />
          CLICK HOTSPOT DOTS TO MODIFY PARAMETERS
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: SF.cyanDim, animation: 'sfPulse 2s infinite' }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ErrorToast({ error, onDismiss }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          style={{
            position: 'fixed', bottom: '100px', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50, padding: '9px 16px',
            background: 'rgba(255,61,90,0.10)',
            border: '1px solid rgba(255,61,90,0.32)',
            borderRadius: '6px', backdropFilter: 'blur(20px)',
            fontFamily: SF.fontMono, fontSize: '10px', color: SF.red,
            display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'none', pointerEvents: 'auto',
          }}
          onClick={onDismiss}
        >
          ⚠ {error}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function KeyHints() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 3 }}
      style={{
        position: 'fixed', bottom: '28px', left: '28px',
        zIndex: 20, pointerEvents: 'none',
        display: 'flex', gap: '14px',
      }}
    >
      {[
        { key: 'DRAG',              action: 'ROTATE' },
        { key: 'PINCH/HOLD+SCROLL', action: 'ZOOM'   },
        { key: 'ESC',               action: 'CLOSE PANEL' },
        { key: 'SCROLL',            action: 'NEXT SECTION' },
      ].map(({ key, action }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            fontFamily: SF.fontMono, fontSize: '8px', color: SF.textMuted,
            background: SF.cyanGhost, border: `1px solid ${SF.borderDim}`,
            borderRadius: '3px', padding: '1px 5px',
          }}>
            {key}
          </span>
          <span style={{ fontFamily: SF.fontMono, fontSize: '8px', color: SF.textMuted, opacity: 0.5 }}>
            {action}
          </span>
        </div>
      ))}
    </motion.div>
  )
}

// ── Main DesignPage — now a pure overlay, receives state from App ─────────────
export default function DesignPage({
  visible,
  params,
  params3d,
  sceneMode,
  setSceneMode,
  apiStatus,
}) {
  const [analysisType, setAnalysisType] = useState('physics')
  const [results,      setResults]      = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [showHint,     setShowHint]     = useState(true)
  const [baseline,     setBaseline]     = useState(null)

  useEffect(() => {
    api.baseline().then(b => setBaseline(b.metrics)).catch(() => {})
  }, [])

  const handleRunAnalysis = useCallback(async (type) => {
    setLoading(true)
    setError('')
    setSceneMode('analyzing')
    setResults(null)

    try {
      let res = null
      switch (type) {
        case 'physics': {
          res = await api.evaluate(params)
          try { await api.checkConstraints({ params, metrics: res.metrics || {} }) } catch {}
          break
        }
        case 'ml': {
          res = await api.predict(params)
          res = { metrics: { Cl: res.Cl, Cd: res.Cd, downforce_N: res.downforce_N, drag_N: res.drag_N, efficiency: res.efficiency, converged: true, stall_flag: false }, predictions: res }
          break
        }
        case '3d': {
          const data = await api.analyze3d({ ...params, ...params3d })
          let baseMetrics = null
          try { baseMetrics = (await api.evaluate(params)).metrics } catch {}
          res = { ...(baseMetrics ? { metrics: baseMetrics } : {}), ...data }
          break
        }
        case 'sweep': {
          const data = await api.sweep({ params, aoa_start: -18, aoa_end: -1, n_points: 18 })
          res = { sweep: data.sweep, metrics: null }
          break
        }
        default: break
      }
      setResults(res)
      setSceneMode('results')
    } catch (e) {
      setError(e.message || 'Analysis failed')
      setSceneMode('idle')
    } finally {
      setLoading(false)
    }
  }, [params, params3d, setSceneMode])

  return (
    <>
      {/* Animation keyframes */}
      <style>{`
        @keyframes sfPulse  { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.3); } }
        @keyframes hotRing  { 0%      { transform:scale(1); opacity:0.7; } 100% { transform:scale(2.6); opacity:0; } }
        @keyframes scanShimmer { from { left:-40px; } to { left:calc(100% + 40px); } }
        @keyframes spin     { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>

      {/* Fade wrapper for §0 visibility */}
      <div style={{
        opacity:       visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition:    'opacity 0.55s ease',
      }}>
        <PageTitle />
        <CornerData params={params} metrics={results?.metrics} />
        <CornerDataRight metrics={results?.metrics} />
        <HotspotHint show={showHint && visible} />
        <KeyHints />

        <AnalysisOverlay
          visible={sceneMode === 'analyzing'}
          analysisType={analysisType}
        />

        <ResultsPanel
          results={results}
          analysisType={analysisType}
          baseline={baseline}
          visible={sceneMode === 'results'}
          onClose={() => setSceneMode('idle')}
        />

        <CircularAnalysisMenu
          onRun={handleRunAnalysis}
          loading={loading}
          analysisType={analysisType}
          setAnalysisType={setAnalysisType}
          apiStatus={apiStatus}
        />

        <ErrorToast error={error} onDismiss={() => setError('')} />
      </div>
    </>
  )
}
