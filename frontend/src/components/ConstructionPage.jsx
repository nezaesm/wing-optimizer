// ConstructionPage.jsx — tunnel background + centered retro character
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { SF } from './design/tokens'
import TunnelBackground from './TunnelBackground'

// ── Retro pixel character with animated hammer ────────────────────────────────
function RetroCharacter() {
  const [hammerUp, setHammerUp] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setHammerUp(h => !h), 480)
    return () => clearInterval(id)
  }, [])

  const PX = 10

  const px = (color) => ({
    display: 'inline-block',
    width: `${PX}px`, height: `${PX}px`,
    background: color,
    flexShrink: 0,
  })

  // 9-col sprite: H=helmet, V=visor, S=skin, B=suit, C=accent, X=eye, ' '=transparent
  const rows = [
    '   HHH   ',
    '  HHHHH  ',
    '  HVVVH  ',
    '  HVSXH  ',
    '  HVVVH  ',
    '   HHH   ',
    '  CBBBC  ',
    ' CBBBBBC ',
    '  CBBBC  ',
    '   BBB   ',
    '   B B   ',
    '  BB BB  ',
  ]

  const colorMap = {
    H: '#d8d8e0',   // helmet — light silver
    V: '#8898a8',   // visor — muted steel blue-gray
    S: '#b8a898',   // skin — desaturated, cooler tone
    B: '#2a2c34',   // suit body — dark charcoal
    C: '#6a6a7a',   // suit accent — mid silver-gray
    X: '#10101a',   // eye
    ' ': 'transparent',
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Sprite */}
      <div style={{ lineHeight: `${PX}px` }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', height: `${PX}px` }}>
            {row.split('').map((c, ci) => (
              <div key={ci} style={px(colorMap[c] ?? 'transparent')} />
            ))}
          </div>
        ))}
      </div>

      {/* Hammer */}
      <motion.div
        animate={{
          rotate: hammerUp ? -55 : 12,
          x: hammerUp ? 1 : 5,
          y: hammerUp ? -6 : 10,
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          right: '-20px',
          top: `${PX * 3}px`,
          transformOrigin: '50% 100%',
        }}
      >
        <div style={{ width: '4px', height: '26px', background: '#505058', marginLeft: '6px' }} />
        <div style={{
          width: '17px', height: '9px',
          background: 'linear-gradient(135deg, #c8ccd8 0%, #707080 100%)',
          borderRadius: '2px',
          boxShadow: '0 1px 6px rgba(180,180,200,0.3)',
        }} />
      </motion.div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ConstructionPage() {
  return (
    <>
      {/* Full-screen WebGL tunnel */}
      <TunnelBackground />

      {/* Soft vignette so character reads against the bright tunnel center */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 55% 55% at 50% 50%, transparent 15%, rgba(0,2,8,0.55) 100%)',
      }} />

      {/* Centered content */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        zIndex: 2,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '18px',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: SF.ease }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <RetroCharacter />

          {/* Label */}
          <span style={{
            fontFamily: SF.fontMono,
            fontSize: '11px',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'rgba(220,220,228,0.75)',
          }}>
            Under Construction
          </span>
        </motion.div>
      </div>
    </>
  )
}
