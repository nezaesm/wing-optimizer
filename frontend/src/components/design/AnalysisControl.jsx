import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, Play, Zap, Box, TrendingDown, X, AlertCircle } from 'lucide-react'
import HolographicPanel from './HolographicPanel'
import { SF } from './tokens'

const ANALYSIS_TYPES = [
  {
    id: 'physics',
    label: 'L0 Physics',
    sub: 'Panel method + Boundary layer',
    icon: Play,
    color: SF.cyan,
    badge: 'L0',
  },
  {
    id: 'ml',
    label: 'ML Predict',
    sub: 'Ensemble surrogate · < 1 ms',
    icon: Zap,
    color: SF.green,
    badge: 'AI',
  },
  {
    id: '3d',
    label: '3D VLM',
    sub: 'Vortex Lattice · Ground effect',
    icon: Box,
    color: '#a78bfa',
    badge: '3D',
  },
  {
    id: 'sweep',
    label: 'AoA Sweep',
    sub: 'Polar curve · 18 conditions',
    icon: TrendingDown,
    color: SF.amber,
    badge: 'SWEEP',
  },
]

function AnalysisOption({ type, selected, onSelect, loading }) {
  const Icon = type.icon
  const isSelected = selected === type.id
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(type.id)}
      style={{
        width: '100%',
        padding: '9px 11px',
        borderRadius: '5px',
        background: isSelected ? SF.cyanGhost : 'transparent',
        border: `1px solid ${isSelected ? SF.border : SF.borderDim}`,
        display: 'flex', alignItems: 'center', gap: '9px',
        cursor: 'none', textAlign: 'left',
        transition: 'all 0.18s',
        marginBottom: '4px',
      }}
      onMouseEnter={e => {
        if (!isSelected) { e.currentTarget.style.background = 'rgba(0,229,255,0.03)'; e.currentTarget.style.borderColor = SF.borderDim }
      }}
      onMouseLeave={e => {
        if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = SF.borderDim }
      }}
    >
      <div style={{
        width: '28px', height: '28px', borderRadius: '4px', flexShrink: 0,
        background: `${type.color}14`,
        border: `1px solid ${type.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} color={type.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontFamily: SF.fontMono, fontSize: '10px', fontWeight: 600, color: isSelected ? SF.cyan : SF.textSub, letterSpacing: '0.04em' }}>
            {type.label}
          </span>
          <span style={{
            fontFamily: SF.fontMono, fontSize: '8px',
            color: type.color, background: `${type.color}12`,
            border: `1px solid ${type.color}25`,
            borderRadius: '3px', padding: '0 4px',
          }}>
            {type.badge}
          </span>
        </div>
        <p style={{ fontFamily: SF.fontSans, fontSize: '9px', color: SF.textMuted, margin: '1px 0 0', lineHeight: 1.4 }}>
          {type.sub}
        </p>
      </div>
      {isSelected && (
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: SF.cyan, boxShadow: SF.glowSm, flexShrink: 0 }} />
      )}
    </motion.button>
  )
}

export default function AnalysisControl({
  onRun,
  loading,
  analysisType,
  setAnalysisType,
  apiStatus,
}) {
  const [open, setOpen] = useState(false)

  const handleRun = () => {
    if (!analysisType) return
    onRun(analysisType)
    setOpen(false)
  }

  const isOffline = apiStatus === 'offline'

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: '32px',
          right: '32px',
          zIndex: 35,
          width: '48px', height: '48px',
          borderRadius: '50%',
          background: open
            ? `radial-gradient(circle, ${SF.cyanFaint}, ${SF.cyanGhost})`
            : SF.bgPanel,
          border: `1px solid ${open ? SF.borderBright : SF.border}`,
          boxShadow: open ? SF.glowMd : SF.glowSm,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'none',
          transition: 'all 0.22s',
        }}
      >
        {open
          ? <X size={17} color={SF.cyan} />
          : <Settings2 size={17} color={SF.cyanDim} />
        }
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ duration: 0.2, ease: SF.ease }}
            style={{
              position: 'fixed',
              bottom: '92px',
              right: '28px',
              zIndex: 35,
              width: '264px',
            }}
          >
            <HolographicPanel
              title="Analysis"
              tag="SELECT MODE"
              onClose={() => setOpen(false)}
              visible={true}
              width={264}
            >
              {/* API status warning */}
              {isOffline && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 9px', marginBottom: '10px',
                  background: 'rgba(255,61,90,0.07)',
                  border: '1px solid rgba(255,61,90,0.22)',
                  borderRadius: '4px',
                }}>
                  <AlertCircle size={11} color={SF.red} />
                  <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.red }}>
                    Backend offline
                  </span>
                </div>
              )}

              {ANALYSIS_TYPES.map(type => (
                <AnalysisOption
                  key={type.id}
                  type={type}
                  selected={analysisType}
                  onSelect={setAnalysisType}
                  loading={loading}
                />
              ))}

              {/* Run button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleRun}
                disabled={!analysisType || loading || isOffline}
                style={{
                  width: '100%', marginTop: '8px',
                  padding: '9px',
                  borderRadius: '5px',
                  background: !analysisType || loading || isOffline
                    ? SF.cyanGhost
                    : `linear-gradient(135deg, ${SF.cyanFaint}, rgba(0,180,210,0.15))`,
                  border: `1px solid ${!analysisType || loading ? SF.borderDim : SF.border}`,
                  color: !analysisType || loading || isOffline ? SF.textMuted : SF.cyan,
                  fontFamily: SF.fontMono,
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  cursor: analysisType && !loading && !isOffline ? 'none' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  boxShadow: analysisType && !loading && !isOffline ? SF.glowSm : 'none',
                  transition: 'all 0.18s',
                }}
              >
                {loading ? (
                  <>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: `2px solid ${SF.cyanDim}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                    ANALYZING…
                  </>
                ) : (
                  <>
                    <Play size={11} />
                    RUN ANALYSIS
                  </>
                )}
              </motion.button>
            </HolographicPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
