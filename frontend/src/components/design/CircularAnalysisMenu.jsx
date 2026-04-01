// CircularAnalysisMenu.jsx — Liquid glass circular command menu replacing AnalysisControl
// Trigger at bottom-right; 4 analysis items spread in upper-left arc (no screen overflow).
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings2, Play, Zap, Box, TrendingDown } from 'lucide-react'
import { SF } from './tokens'

// ── Shared constants ──────────────────────────────────────────────────────────
const SCRAMBLE = '_!X$0-+*#'
function rChar(prev) {
  let c
  do { c = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)] } while (c === prev)
  return c
}

// Same two-phase scramble animation used in FloatingNav / hotspots
function ScrambleLabel({ text, active, speed = 26 }) {
  const [display, setDisplay] = useState('')
  const ivRef    = useRef(null)
  const stepRef  = useRef(0)
  const phaseRef = useRef('p1')

  useEffect(() => {
    if (ivRef.current) clearInterval(ivRef.current)
    if (!active) { setDisplay(''); return }

    stepRef.current = 0
    phaseRef.current = 'p1'
    const len = text.length

    ivRef.current = setInterval(() => {
      const step = stepRef.current
      if (phaseRef.current === 'p1') {
        const fill  = Math.min(step + 1, len)
        const chars = []
        for (let i = 0; i < fill; i++) chars.push(rChar(i > 0 ? chars[i - 1] : undefined))
        while (chars.length < len) chars.push('\u00A0')
        setDisplay(chars.join(''))
        stepRef.current++
        if (stepRef.current >= len * 2) { phaseRef.current = 'p2'; stepRef.current = 0 }
      } else {
        const revealed = Math.floor(step / 2)
        const chars    = []
        for (let i = 0; i < revealed; i++) chars.push(text[i])
        if (revealed < len) chars.push(step % 2 === 0 ? '_' : rChar())
        while (chars.length < len) chars.push(rChar())
        setDisplay(chars.join(''))
        stepRef.current++
        if (stepRef.current >= len * 2) { clearInterval(ivRef.current); setDisplay(text) }
      }
    }, speed)

    return () => clearInterval(ivRef.current)
  }, [active, text, speed])

  return <>{display}</>
}

// ── Liquid glass style helper ─────────────────────────────────────────────────
const glass = (overrides = {}) => ({
  background:           'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.07) 100%)',
  backdropFilter:       'blur(22px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
  border:               '1px solid rgba(255,255,255,0.15)',
  boxShadow:            '0 8px 32px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(0,0,0,0.07)',
  ...overrides,
})

// ── Analysis item definitions ─────────────────────────────────────────────────
// Arc: -180° → -90° (upper-left quadrant, 30° spacing for 4 items)
// All items stay within screen bounds for trigger at bottom:32px right:32px
const RADIUS = 88
const ITEMS = [
  { id: 'physics', label: 'L0 PHYSICS',  short: 'PHYSICS',  icon: Play,        color: SF.cyan,   angle: -180 },
  { id: 'ml',      label: 'ML PREDICT',  short: 'ML PRED',  icon: Zap,         color: SF.green,  angle: -150 },
  { id: '3d',      label: '3D VLM',      short: '3D VLM',   icon: Box,         color: '#a78bfa', angle: -120 },
  { id: 'sweep',   label: 'AoA SWEEP',   short: 'AoA SWEEP', icon: TrendingDown, color: SF.amber, angle: -90  },
]

function getPos(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: Math.cos(rad) * RADIUS, y: Math.sin(rad) * RADIUS }
}

// ── Specular sheen overlay (reusable for glass circles) ──────────────────────
function Sheen({ style = {} }) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '52%',
      borderRadius: '50% 50% 0 0',
      background: 'linear-gradient(to bottom, rgba(255,255,255,0.16), transparent)',
      pointerEvents: 'none',
      ...style,
    }} />
  )
}

// ── Analysis item button ──────────────────────────────────────────────────────
function AnalysisItem({ item, index, analysisType, onSelect, loading, isOffline }) {
  const [hovered, setHovered] = useState(false)
  const pos        = getPos(item.angle)
  const isSelected = analysisType === item.id
  const disabled   = loading || (isOffline && item.id !== 'ml')
  const Icon       = item.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: 0, y: 0, scale: 0.15 }}
      animate={{ opacity: 1, x: pos.x - 24, y: pos.y - 24, scale: 1 }}
      exit={{
        opacity: 0,
        x: pos.x * 0.15,
        y: pos.y * 0.15,
        scale: 0.15,
        transition: { duration: 0.18, delay: (ITEMS.length - 1 - index) * 0.03 },
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 26, delay: index * 0.05 }}
      style={{ position: 'absolute', left: 0, top: 0, width: '48px', height: '48px' }}
    >
      <motion.button
        onMouseEnter={() => !disabled && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => !disabled && onSelect(item.id)}
        whileHover={!disabled ? { scale: 1.12 } : {}}
        whileTap={!disabled   ? { scale: 0.90 } : {}}
        style={{
          width: '48px', height: '48px',
          borderRadius: '50%',
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'none',
          opacity: disabled ? 0.38 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'box-shadow 0.18s, background 0.18s, border 0.18s',
          ...glass({
            background: isSelected
              ? `linear-gradient(135deg, ${item.color}22, rgba(255,255,255,0.06))`
              : 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
            border: isSelected
              ? `1px solid ${item.color}55`
              : hovered
              ? '1px solid rgba(255,255,255,0.26)'
              : '1px solid rgba(255,255,255,0.15)',
            boxShadow: hovered && !disabled
              ? `0 8px 32px rgba(0,0,0,0.52), 0 0 18px ${item.color}28, inset 0 1px 0 rgba(255,255,255,0.24)`
              : isSelected
              ? `0 6px 22px rgba(0,0,0,0.44), 0 0 12px ${item.color}20, inset 0 1px 0 rgba(255,255,255,0.20)`
              : '0 6px 22px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.18)',
          }),
        }}
      >
        <Icon
          size={15}
          color={hovered || isSelected ? item.color : 'rgba(190,190,190,0.65)'}
          style={{ transition: 'color 0.16s', flexShrink: 0 }}
        />
        <Sheen />

        {/* Active selection dot */}
        {isSelected && (
          <div style={{
            position: 'absolute', top: '-2px', right: '-2px',
            width: '9px', height: '9px', borderRadius: '50%',
            background: item.color,
            border: '2px solid #010408',
            boxShadow: `0 0 7px ${item.color}90`,
          }} />
        )}

        {/* Scramble label tooltip — appears to the left */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.14 }}
              style={{
                position:   'absolute',
                right:      'calc(100% + 9px)',
                top:        '50%',
                transform:  'translateY(-50%)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                padding:    '4px 9px',
                borderRadius: '5px',
                fontFamily:   SF.fontMono,
                fontSize:     '9px',
                fontWeight:   600,
                letterSpacing: '0.12em',
                color:        item.color,
                textTransform: 'uppercase',
                minWidth:     '72px',
                textAlign:    'center',
                ...glass({ borderRadius: '5px' }),
              }}
            >
              <ScrambleLabel text={item.short} active={hovered} speed={24} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CircularAnalysisMenu({
  onRun,
  loading,
  analysisType,
  setAnalysisType,
  apiStatus,
}) {
  const [isOpen, setIsOpen]           = useState(false)
  const [hovTrigger, setHovTrigger]   = useState(false)
  const isOffline = apiStatus === 'offline'

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const handleSelect = useCallback((id) => {
    setAnalysisType(id)
    onRun(id)
    setIsOpen(false)
  }, [setAnalysisType, onRun])

  return (
    <>
      {/* Backdrop — subtle blur so other UI is still readable */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 34,
              background: 'rgba(1,4,8,0.22)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              cursor: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Menu container — trigger + items */}
      <div style={{
        position: 'fixed',
        bottom:   '32px',
        right:    '32px',
        zIndex:   35,
        width:    '48px',
        height:   '48px',
      }}>
        {/* Items origin — centered on trigger */}
        <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
          <AnimatePresence>
            {isOpen && ITEMS.map((item, i) => (
              <AnalysisItem
                key={item.id}
                item={item}
                index={i}
                analysisType={analysisType}
                onSelect={handleSelect}
                loading={loading}
                isOffline={isOffline}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Trigger button */}
        <motion.button
          onMouseEnter={() => setHovTrigger(true)}
          onMouseLeave={() => setHovTrigger(false)}
          onClick={() => setIsOpen(o => !o)}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.93 }}
          style={{
            position: 'relative',
            width: '48px', height: '48px',
            borderRadius: '50%',
            cursor: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'box-shadow 0.22s, border 0.22s',
            ...glass({
              background: isOpen
                ? 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))'
                : 'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
              border: `1px solid ${isOpen
                ? 'rgba(255,255,255,0.28)'
                : hovTrigger
                ? 'rgba(255,255,255,0.22)'
                : 'rgba(255,255,255,0.15)'}`,
              boxShadow: isOpen
                ? '0 8px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.28), 0 0 22px rgba(200,200,200,0.10)'
                : hovTrigger
                ? '0 8px 28px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.22)'
                : '0 6px 22px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.16)',
            }),
          }}
        >
          {/* Icon — rotates to × when open */}
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          >
            <Settings2
              size={17}
              color={isOpen ? 'rgba(255,255,255,0.90)' : 'rgba(190,190,190,0.60)'}
            />
          </motion.div>

          <Sheen />

          {/* "ANALYSIS" scramble label above trigger (only when closed + hovered) */}
          <AnimatePresence>
            {hovTrigger && !isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.14 }}
                style={{
                  position:   'absolute',
                  bottom:     'calc(100% + 9px)',
                  left:       '50%',
                  transform:  'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  padding:    '4px 9px',
                  borderRadius: '5px',
                  fontFamily:   SF.fontMono,
                  fontSize:     '9px',
                  fontWeight:   600,
                  letterSpacing: '0.14em',
                  color:        'rgba(210,210,210,0.85)',
                  textTransform: 'uppercase',
                  ...glass({ borderRadius: '5px' }),
                }}
              >
                <ScrambleLabel text="ANALYSIS" active={hovTrigger && !isOpen} speed={22} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* API offline badge */}
          {isOffline && (
            <div style={{
              position: 'absolute', top: '-2px', right: '-2px',
              width: '10px', height: '10px', borderRadius: '50%',
              background: SF.red,
              border: '2px solid #010408',
              boxShadow: `0 0 6px ${SF.red}90`,
            }} />
          )}

          {/* Loading spinner */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(1,4,8,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  border: '2px solid rgba(200,200,200,0.14)',
                  borderTopColor: 'rgba(200,200,200,0.72)',
                  animation: 'spin 0.8s linear infinite',
                }} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  )
}
