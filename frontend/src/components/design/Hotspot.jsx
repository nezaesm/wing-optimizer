import { useState, useCallback, useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import HolographicPanel, { PanelDivider } from './HolographicPanel'
import { SF } from './tokens'

// ── Scramble helper ───────────────────────────────────────────────────────────
const SCRAMBLE = '_!X$0-+*#'
function rChar(p) {
  let c; do { c = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)] } while (c === p); return c
}

// ── Sci-fi slider ─────────────────────────────────────────────────────────────
function SciFiSlider({ label, value, min, max, step, unit, onChange, description }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontFamily: SF.fontMono, fontSize: '9px', color: SF.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </span>
        <span style={{ fontFamily: SF.fontMono, fontSize: '11px', fontWeight: 600, color: SF.cyan }}>
          {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}{unit}
        </span>
      </div>
      <div style={{ position: 'relative', height: '4px', borderRadius: '2px', background: SF.cyanGhost, border: `1px solid ${SF.borderDim}` }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`, borderRadius: '2px',
          background: `linear-gradient(90deg, ${SF.cyanFaint}, ${SF.cyan})`,
          boxShadow: SF.glowSm,
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          onPointerDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          style={{ position: 'absolute', inset: '-6px 0', opacity: 0, cursor: 'none', width: '100%', WebkitAppearance: 'none' }}
        />
      </div>
      {description && (
        <p style={{ fontFamily: SF.fontSans, fontSize: '9px', color: SF.textMuted, marginTop: '3px', lineHeight: 1.4 }}>
          {description}
        </p>
      )}
    </div>
  )
}

// ── Hover tooltip with scramble animation ─────────────────────────────────────
// Shows above the dot on hover; hides when panel is open.
function HoverTooltip({ title, visible }) {
  const [display, setDisplay] = useState('')
  const ivRef    = useRef(null)
  const stepRef  = useRef(0)
  const phaseRef = useRef('p1')

  useEffect(() => {
    if (ivRef.current) clearInterval(ivRef.current)
    if (!visible) { setDisplay(''); return }

    stepRef.current = 0
    phaseRef.current = 'p1'
    const len = title.length

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
        for (let i = 0; i < revealed; i++) chars.push(title[i])
        if (revealed < len) chars.push(step % 2 === 0 ? '_' : rChar())
        while (chars.length < len) chars.push(rChar())
        setDisplay(chars.join(''))
        stepRef.current++
        if (stepRef.current >= len * 2) { clearInterval(ivRef.current); setDisplay(title) }
      }
    }, 35)

    return () => clearInterval(ivRef.current)
  }, [visible, title])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.94 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{ opacity: 0, y: 3, scale: 0.96 }}
          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
          style={{
            position:        'absolute',
            bottom:          '28px',
            left:            '50%',
            transform:       'translateX(-50%)',
            background:      'rgba(2, 4, 12, 0.92)',
            border:          '1px solid rgba(200,200,200,0.18)',
            borderRadius:    '3px',
            padding:         '4px 9px',
            fontFamily:      '"JetBrains Mono", monospace',
            fontSize:        '8px',
            fontWeight:      600,
            letterSpacing:   '0.22em',
            color:           'rgba(220, 220, 220, 0.90)',
            textTransform:   'uppercase',
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
            backdropFilter:  'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow:       '0 0 12px rgba(180,180,180,0.10)',
          }}
        >
          {display}
          {/* Small bottom tick */}
          <div style={{
            position: 'absolute', bottom: '-4px', left: '50%',
            transform: 'translateX(-50%)',
            width: '1px', height: '4px',
            background: 'rgba(200,200,200,0.25)',
          }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Hotspot dot — white with gray glow ────────────────────────────────────────
function HotspotDot({ active, hovered, onClick, onEnter, onLeave }) {
  const midBorder = (hovered || active) ? 'rgba(255,255,255,0.50)' : 'rgba(170,170,170,0.22)'
  const coreColor = active  ? '#ffffff'
                  : hovered ? 'rgba(230,230,230,0.90)'
                  :           'rgba(200,200,200,0.55)'
  const glow = active  ? '0 0 14px rgba(255,255,255,0.40), 0 0 4px rgba(255,255,255,0.70)'
             : hovered ? '0 0 8px rgba(255,255,255,0.25)'
             :           '0 0 5px rgba(180,180,180,0.12)'

  return (
    <div
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onClick={onClick}
      style={{ position: 'relative', width: '18px', height: '18px', cursor: 'none', pointerEvents: 'auto' }}
    >
      {/* Outer pulse ring */}
      <div style={{
        position: 'absolute', inset: '-5px', borderRadius: '50%',
        border: '1px solid rgba(180,180,180,0.18)',
        animation: active ? 'none' : 'hotRing 2.2s ease-out infinite',
        opacity: active ? 0 : 0.65,
      }} />
      {/* Mid ring */}
      <div style={{
        position: 'absolute', inset: '-1px', borderRadius: '50%',
        border: `1px solid ${midBorder}`,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: glow,
      }} />
      {/* Core */}
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%',
        background: coreColor, boxShadow: glow,
        transition: 'all 0.18s',
      }} />
    </div>
  )
}

// ── Panel direction offset ────────────────────────────────────────────────────
function getPanelOffset(direction) {
  switch (direction) {
    case 'right':  return { transform: 'translateY(-50%)', left: '28px', top: '50%' }
    case 'left':   return { transform: 'translateY(-50%)', right: '28px', top: '50%' }
    case 'up':     return { transform: 'translateX(-50%)', bottom: '28px', left: '50%' }
    case 'down':
    default:       return { transform: 'translateX(-50%)', top: '28px', left: '50%' }
  }
}

// ── Main Hotspot ──────────────────────────────────────────────────────────────
export default function Hotspot({
  id,
  position,
  title,
  tag,
  params,
  paramDefs,
  onParamChange,
  activeHotspot,
  setActiveHotspot,
  panelDir = 'right',
  distanceFactor = 8,
}) {
  const [hovered, setHovered] = useState(false)
  const isActive = activeHotspot === id

  // Show tooltip only when hovered AND panel is not open
  const showTooltip = hovered && !isActive

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    setActiveHotspot(isActive ? null : id)
    setHovered(false)
  }, [id, isActive, setActiveHotspot])

  const panelOffset = getPanelOffset(panelDir)

  return (
    <Html
      position={position}
      center={false}
      distanceFactor={distanceFactor}
      style={{ overflow: 'visible', pointerEvents: 'none' }}
      zIndexRange={[20, 30]}
      occlude={false}
    >
      {/* Outer wrapper passthrough — interactive children use pointerEvents: auto */}
      <div style={{ position: 'relative', pointerEvents: 'none' }}>

        {/* Hover tooltip — above dot, scramble reveal */}
        <HoverTooltip title={title} visible={showTooltip} />

        {/* The dot — explicit pointerEvents: auto breaks through parent none */}
        <HotspotDot
          active={isActive}
          hovered={hovered}
          onClick={handleClick}
          onEnter={() => setHovered(true)}
          onLeave={() => setHovered(false)}
        />

        {/* Panel — positioned relative to dot */}
        <div style={{
          position:     'absolute',
          ...panelOffset,
          zIndex:       25,
          pointerEvents: isActive ? 'auto' : 'none',
          width:        '220px',
        }}>
          <HolographicPanel
            title={title}
            tag={tag}
            onClose={() => setActiveHotspot(null)}
            visible={isActive}
            width={220}
          >
            {paramDefs.map((def, i) => (
              <div key={def.name}>
                {i > 0 && <PanelDivider />}
                <SciFiSlider
                  {...def}
                  value={params[def.name] ?? def.min}
                  onChange={(v) => onParamChange(def.name, v)}
                />
              </div>
            ))}
          </HolographicPanel>
        </div>

        {/* Connecting line — dot to panel edge */}
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position:   'absolute',
              pointerEvents: 'none',
              width:      '20px',
              height:     '1px',
              background: `linear-gradient(90deg, ${SF.cyanDim}, transparent)`,
              top:        '50%',
              left:       '18px',
            }}
          />
        )}
      </div>
    </Html>
  )
}
