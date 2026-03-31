import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { SF } from './tokens'

// ── Corner ornament – L-shaped bracket ────────────────────────────────────────
function Corner({ pos }) {
  const s = {
    position: 'absolute',
    width: '10px', height: '10px',
    ...(pos.includes('top')    ? { top: 0 }    : { bottom: 0 }),
    ...(pos.includes('left')   ? { left: 0 }   : { right: 0 }),
    borderColor: SF.cyanBright,
    borderStyle: 'solid',
    borderWidth: 0,
    ...(pos.includes('top')    ? { borderTopWidth: '1.5px' }    : { borderBottomWidth: '1.5px' }),
    ...(pos.includes('left')   ? { borderLeftWidth: '1.5px' }   : { borderRightWidth: '1.5px' }),
    boxShadow: SF.glowSm,
  }
  return <div style={s} />
}

// ── Horizontal rule used inside panels ────────────────────────────────────────
export function PanelDivider() {
  return (
    <div style={{
      height: '1px',
      background: `linear-gradient(90deg, transparent, ${SF.border} 30%, ${SF.border} 70%, transparent)`,
      margin: '8px 0',
    }} />
  )
}

// ── Label row with small mono tag ─────────────────────────────────────────────
export function PanelLabel({ children }) {
  return (
    <span style={{
      fontFamily: SF.fontMono,
      fontSize: '9px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: SF.textMuted,
    }}>
      {children}
    </span>
  )
}

// ── Main panel wrapper ─────────────────────────────────────────────────────────
export default function HolographicPanel({
  title,
  tag,
  children,
  onClose,
  width = 240,
  style = {},
  className = '',
  visible = true,
}) {
  const panelRef = useRef()

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onClose])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.88, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 4 }}
          transition={{ duration: 0.22, ease: SF.ease }}
          style={{
            position: 'relative',
            width,
            background: SF.bgPanel,
            border: `1px solid ${SF.border}`,
            borderRadius: '6px',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: `${SF.glowSm}, inset 0 1px 0 rgba(0,229,255,0.07)`,
            overflow: 'hidden',
            pointerEvents: 'auto',
            ...style,
          }}
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Corner ornaments */}
          <Corner pos="top-left" />
          <Corner pos="top-right" />
          <Corner pos="bottom-left" />
          <Corner pos="bottom-right" />

          {/* Top stripe */}
          <div style={{
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${SF.cyan} 40%, ${SF.cyanBright} 60%, transparent)`,
            boxShadow: SF.glowSm,
          }} />

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px 7px',
            borderBottom: `1px solid ${SF.borderDim}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              {/* Pulsing status dot */}
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: SF.cyan,
                boxShadow: SF.glowSm,
                animation: 'sfPulse 1.8s ease-in-out infinite',
              }} />
              <span style={{
                fontFamily: SF.fontMono,
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: SF.textSub,
              }}>
                {title}
              </span>
              {tag && (
                <span style={{
                  fontFamily: SF.fontMono,
                  fontSize: '8px',
                  color: SF.textMuted,
                  background: SF.cyanGhost,
                  border: `1px solid ${SF.borderDim}`,
                  borderRadius: '3px',
                  padding: '1px 5px',
                }}>
                  {tag}
                </span>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', cursor: 'none',
                  color: SF.textMuted, padding: '2px',
                  display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = SF.cyan}
                onMouseLeave={e => e.currentTarget.style.color = SF.textMuted}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: '10px 12px 12px' }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
