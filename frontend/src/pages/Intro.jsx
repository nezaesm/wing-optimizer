// Intro.jsx — scramble title reveal + cursor warp + Enter key navigation
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import { WaveBackground } from '../components/WaveBackground'

const TITLE_TEXT   = 'WINGOPT'
const SCRAMBLE_CHARS = '_!X$0-+*#'
const SCRAMBLE_SPEED = 55 // ms per tick — slower, readable reveal

function randomChar(prev) {
  let c
  do { c = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)] }
  while (c === prev)
  return c
}

// ── Streamlines data ──────────────────────────────────────────────────────────
const STREAMLINES = [
  { d: 'M -40 72  C 160 55,  380 48,  640 68  S 900 70,  880 72',  w: 0.8, op: 0.14 },
  { d: 'M -40 88  C 160 68,  380 58,  640 82  S 900 85,  880 88',  w: 1.0, op: 0.24 },
  { d: 'M -40 102 C 160 80,  380 68,  640 94  S 900 98,  880 102', w: 1.2, op: 0.36 },
  { d: 'M -40 115 C 160 92,  380 78,  640 104 S 900 110, 880 115', w: 1.4, op: 0.50 },
  { d: 'M -40 126 C 160 102, 380 88,  640 114 S 900 120, 880 126', w: 1.0, op: 0.55 },
  { d: 'M -40 142 C 160 148, 380 145, 640 143 S 900 142, 880 142', w: 1.0, op: 0.44 },
  { d: 'M -40 155 C 160 158, 380 156, 640 155 S 900 155, 880 155', w: 0.8, op: 0.28 },
  { d: 'M -40 168 C 160 170, 380 169, 640 168 S 900 168, 880 168', w: 0.7, op: 0.16 },
  { d: 'M -40 180 C 160 181, 380 180, 640 180 S 900 180, 880 180', w: 0.6, op: 0.08 },
]

// ── Wing SVG — white/silver palette, no glow filters ─────────────────────────
function StreamlineSVG() {
  return (
    <svg
      viewBox="0 0 840 210"
      style={{ width: '100%', maxWidth: '680px', overflow: 'visible', display: 'block' }}
    >
      <defs>
        <linearGradient id="slGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0" />
          <stop offset="20%"  stopColor="#cccccc" stopOpacity="0.55" />
          <stop offset="70%"  stopColor="#aaaaaa" stopOpacity="0.40" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="50%"  stopColor="#dddddd" stopOpacity="0.70" />
          <stop offset="100%" stopColor="#999999" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="wFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {STREAMLINES.map((sl, i) => (
        <motion.path
          key={i}
          d={sl.d}
          stroke="url(#slGrad)"
          strokeWidth={sl.w}
          fill="none"
          strokeLinecap="round"
          opacity={sl.op}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, delay: 0.14 + i * 0.08, ease: [0.23, 1, 0.32, 1] }}
        />
      ))}

      {/* Wing body fill */}
      <motion.path
        d="M 55 133 C 200 72, 460 56, 780 108 L 780 116 C 460 88, 200 140, 55 133 Z"
        fill="url(#wFill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.0, delay: 0.5 }}
      />

      {/* Leading edge */}
      <motion.path
        d="M 55 133 C 200 72, 460 56, 780 108"
        fill="none" stroke="url(#wGrad)" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.3, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
      />

      {/* Trailing edge */}
      <motion.path
        d="M 55 133 C 200 150, 460 140, 780 116"
        fill="none" stroke="url(#wGrad)" strokeWidth="0.9" strokeLinecap="round" opacity={0.35}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.3, delay: 0.22, ease: [0.23, 1, 0.32, 1] }}
      />

      {/* TE flap micro-detail */}
      <motion.path
        d="M 680 112 C 730 116, 760 124, 755 132 C 720 128, 690 120, 680 112 Z"
        fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.16)" strokeWidth="0.8"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2 }}
      />

      {/* Leading-edge dot */}
      <motion.circle
        cx="55" cy="133" r="2.5" fill="#ffffff" opacity={0.85}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 0.85, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.14, ease: [0.23, 1, 0.32, 1] }}
      />
    </svg>
  )
}

// ── Wing 3D parallax ──────────────────────────────────────────────────────────
function WingSection({ mx, my }) {
  const x       = useSpring(useTransform(mx, v => v * 0.016), { stiffness: 88, damping: 22, mass: 0.8 })
  const y       = useSpring(useTransform(my, v => v * 0.011), { stiffness: 88, damping: 22, mass: 0.8 })
  const rotateY = useSpring(useTransform(mx, v => v * 0.004), { stiffness: 88, damping: 22 })
  const rotateX = useSpring(useTransform(my, v => -v * 0.003), { stiffness: 88, damping: 22 })
  return (
    <motion.div style={{ x, y, rotateX, rotateY, transformPerspective: 1400, marginBottom: '4px', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <StreamlineSVG />
    </motion.div>
  )
}

// ── Per-character warp + color wave ──────────────────────────────────────────
// During scramble: dim gray. After warp active: flowing white→dark→white wave
// staggered by charIndex so the gradient sweeps left→right continuously.
function WarpChar({ displayChar, warpActive, charIndex, offsetX, titleCenterY, mx, my }) {
  const txMv = useMotionValue(0)
  const tyMv = useMotionValue(0)
  const x = useSpring(txMv, { stiffness: 265, damping: 24, mass: 0.48 })
  const y = useSpring(tyMv, { stiffness: 265, damping: 24, mass: 0.48 })

  useEffect(() => {
    if (!warpActive) return
    const RADIUS = 145
    const update = () => {
      const dx   = mx.get() - offsetX
      const dy   = my.get() - titleCenterY
      const dist = Math.hypot(dx, dy)
      if (dist < RADIUS && dist > 0.5) {
        const force = (1 - dist / RADIUS) * 19
        txMv.set(-(dx / dist) * force)
        tyMv.set(-(dy / dist) * force)
      } else {
        txMv.set(0)
        tyMv.set(0)
      }
    }
    const u1 = mx.on('change', update)
    const u2 = my.on('change', update)
    return () => { u1(); u2() }
  }, [warpActive, offsetX, titleCenterY, mx, my, txMv, tyMv])

  return (
    <motion.span
      custom={charIndex}
      variants={{
        scramble: { color: 'rgba(140, 140, 140, 0.65)' },
        warp: (i) => ({
          color: ['#f0f0f0', '#3a3a3a', '#f0f0f0'],
          transition: {
            duration: 5,
            repeat: Infinity,
            repeatType: 'loop',
            delay: i * 0.16,
            ease: 'easeInOut',
          },
        }),
      }}
      animate={warpActive ? 'warp' : 'scramble'}
      style={{ x, y, display: 'inline-block' }}
    >
      {displayChar}
    </motion.span>
  )
}

// ── Title: scramble reveal → cursor warp ─────────────────────────────────────
function WarpTitle({ mx, my, onDone }) {
  const titleRef    = useRef(null)
  const intervalRef = useRef(null)
  const stepRef     = useRef(0)

  const [phase, setPhase]               = useState('idle')
  const [warpActive, setWarpActive]     = useState(false)
  const [displayChars, setDisplayChars] = useState(() => Array(TITLE_TEXT.length).fill('\u00A0'))
  const [charData, setCharData]         = useState(() =>
    TITLE_TEXT.split('').map(char => ({ char, offsetX: 0, titleCenterY: 0 }))
  )

  useEffect(() => {
    const t = setTimeout(() => setPhase('phase1'), 320)
    return () => clearTimeout(t)
  }, [])

  // Phase 1: grow random chars left-to-right
  useEffect(() => {
    if (phase !== 'phase1') return
    if (intervalRef.current) clearInterval(intervalRef.current)
    stepRef.current = 0
    const maxSteps = TITLE_TEXT.length * 2

    intervalRef.current = setInterval(() => {
      const step = stepRef.current
      const len  = Math.min(step + 1, TITLE_TEXT.length)
      const chars = []
      for (let i = 0; i < len; i++) chars.push(randomChar(i > 0 ? chars[i - 1] : undefined))
      while (chars.length < TITLE_TEXT.length) chars.push('\u00A0')
      setDisplayChars([...chars])
      stepRef.current += 1
      if (stepRef.current >= maxSteps) { clearInterval(intervalRef.current); setPhase('phase2') }
    }, SCRAMBLE_SPEED)

    return () => clearInterval(intervalRef.current)
  }, [phase])

  // Phase 2: reveal chars left-to-right with flicker
  useEffect(() => {
    if (phase !== 'phase2') return
    if (intervalRef.current) clearInterval(intervalRef.current)
    stepRef.current = 0

    intervalRef.current = setInterval(() => {
      const step     = stepRef.current
      const revealed = Math.floor(step / 2)
      const chars    = []
      for (let i = 0; i < revealed && i < TITLE_TEXT.length; i++) chars.push(TITLE_TEXT[i])
      if (revealed < TITLE_TEXT.length) chars.push(step % 2 === 0 ? '_' : randomChar())
      while (chars.length < TITLE_TEXT.length) chars.push(randomChar())
      setDisplayChars([...chars])
      stepRef.current += 1
      if (stepRef.current >= TITLE_TEXT.length * 2) {
        clearInterval(intervalRef.current)
        setDisplayChars(TITLE_TEXT.split(''))
        setPhase('warp')
      }
    }, SCRAMBLE_SPEED)

    return () => clearInterval(intervalRef.current)
  }, [phase])

  // Measure char positions with pretext → activate spring warp
  useEffect(() => {
    if (phase !== 'warp') return
    document.fonts.ready.then(() => {
      if (!titleRef.current) return
      const rect         = titleRef.current.getBoundingClientRect()
      const titleCenterY = rect.top + rect.height / 2 - window.innerHeight / 2
      const fs           = Math.min(Math.max(48, window.innerWidth * 0.12), 112)
      const font         = `700 ${fs}px "JetBrains Mono", monospace`
      let cumX = 0
      const measured = TITLE_TEXT.split('').map(char => {
        const prepared   = prepareWithSegments(char, font)
        const { lines }  = layoutWithLines(prepared, 4000, fs * 1.25)
        const w          = lines[0]?.width ?? fs * 0.6
        const item       = { char, w, cumX }
        cumX += w
        return item
      })
      const totalW    = cumX
      const titleLeft = rect.left + rect.width / 2 - totalW / 2
      setCharData(measured.map(d => ({
        char:         d.char,
        offsetX:      titleLeft + d.cumX + d.w / 2 - window.innerWidth / 2,
        titleCenterY,
      })))
      setWarpActive(true)
      onDone?.()
    })
  }, [phase, onDone])

  return (
    <motion.div
      ref={titleRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: 0.18 }}
      style={{
        display:        'flex',
        justifyContent: 'center',
        fontFamily:     '"JetBrains Mono", monospace',
        fontWeight:     700,
        fontSize:       'clamp(3rem, 12vw, 7rem)',
        letterSpacing:  '0.04em',
        lineHeight:     1,
        marginBottom:   '10px',
        whiteSpace:     'nowrap',
        userSelect:     'none',
      }}
    >
      {charData.map((d, i) => (
        <WarpChar
          key={i}
          charIndex={i}
          displayChar={displayChars[i] ?? d.char}
          warpActive={warpActive}
          offsetX={d.offsetX}
          titleCenterY={d.titleCenterY}
          mx={mx}
          my={my}
        />
      ))}
    </motion.div>
  )
}

// ── Live mouse position readout — isolated component, re-renders itself only ──
function MouseReadout({ mx, my, visible }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const update = () => setPos({
      x: Math.round(mx.get() + window.innerWidth  / 2),
      y: Math.round(my.get() + window.innerHeight / 2),
    })
    const u1 = mx.on('change', update)
    const u2 = my.on('change', update)
    return () => { u1(); u2() }
  }, [mx, my])

  const fmt = (n) => String(n).padStart(4, '0')

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{
            position:   'absolute',
            bottom:     '28px',
            right:      '24px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize:   '0.52rem',
            letterSpacing: '0.12em',
            color:      'rgba(255,255,255,0.18)',
            textTransform: 'uppercase',
            lineHeight: 1.8,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ color: 'rgba(255,255,255,0.10)', marginBottom: '3px' }}>CUR.POS</div>
          <div>X · {fmt(pos.x)}</div>
          <div>Y · {fmt(pos.y)}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Small scan-line label above the wing ─────────────────────────────────────
function SystemTag() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.6 }}
      style={{
        position:      'absolute',
        top:           '28px',
        left:          '50%',
        transform:     'translateX(-50%)',
        display:       'flex',
        alignItems:    'center',
        gap:           '10px',
        fontFamily:    'JetBrains Mono, monospace',
        fontSize:      '0.48rem',
        letterSpacing: '0.24em',
        color:         'rgba(255,255,255,0.14)',
        textTransform: 'uppercase',
        whiteSpace:    'nowrap',
        pointerEvents: 'none',
        userSelect:    'none',
      }}
    >
      <span style={{ display: 'inline-block', width: '24px', height: '1px', background: 'rgba(255,255,255,0.14)' }} />
      <span>WOPT · AER.SIM · V0.9</span>
      <span style={{ display: 'inline-block', width: '24px', height: '1px', background: 'rgba(255,255,255,0.14)' }} />
    </motion.div>
  )
}

// ── Decorative ticks separator ────────────────────────────────────────────────
function ScanDivider({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           '6px',
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      '0.46rem',
            letterSpacing: '0.16em',
            color:         'rgba(255,255,255,0.16)',
            userSelect:    'none',
            pointerEvents: 'none',
          }}
        >
          <span style={{ width: '18px', height: '1px', background: 'rgba(255,255,255,0.16)' }} />
          <span>◆</span>
          <span style={{ width: '28px', height: '1px', background: 'rgba(255,255,255,0.10)' }} />
          <span>· · ·</span>
          <span style={{ width: '28px', height: '1px', background: 'rgba(255,255,255,0.10)' }} />
          <span>◆</span>
          <span style={{ width: '18px', height: '1px', background: 'rgba(255,255,255,0.16)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Corner accents ─────────────────────────────────────────────────────────────
const CORNER_STYLES = [
  { top: '18px',    left:  '18px',  borderTop: '1px solid rgba(255,255,255,0.10)', borderLeft:   '1px solid rgba(255,255,255,0.10)' },
  { top: '18px',    right: '18px',  borderTop: '1px solid rgba(255,255,255,0.10)', borderRight:  '1px solid rgba(255,255,255,0.10)' },
  { bottom: '18px', left:  '18px',  borderBottom: '1px solid rgba(255,255,255,0.10)', borderLeft:  '1px solid rgba(255,255,255,0.10)' },
  { bottom: '18px', right: '18px',  borderBottom: '1px solid rgba(255,255,255,0.10)', borderRight: '1px solid rgba(255,255,255,0.10)' },
]

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntroPage({ onEnter }) {
  const [ready, setReady] = useState(false)

  const mx = useMotionValue(0)
  const my = useMotionValue(0)

  useEffect(() => {
    const onMove = (e) => {
      mx.set(e.clientX - window.innerWidth  / 2)
      my.set(e.clientY - window.innerHeight / 2)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [mx, my])

  // Show enter prompt after scramble finishes
  const handleScrambleDone = () => setTimeout(() => setReady(true), 200)

  // Enter key triggers navigation
  useEffect(() => {
    if (!ready) return
    const onKey = (e) => { if (e.key === 'Enter') onEnter() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, onEnter])

  const subX = useSpring(useTransform(mx, v => v * 0.006), { stiffness: 115, damping: 22, mass: 0.6 })
  const subY = useSpring(useTransform(my, v => v * 0.005), { stiffness: 115, damping: 22, mass: 0.6 })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#010408', overflow: 'hidden' }}>

      <WaveBackground />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 58% 52% at 50% 52%, rgba(1,4,8,0.84), transparent)',
      }} />

      {/* Corner accents */}
      {CORNER_STYLES.map((s, i) => (
        <motion.div
          key={i}
          style={{ position: 'absolute', width: '22px', height: '22px', ...s }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.04 + i * 0.04, duration: 0.55 }}
        />
      ))}

      {/* Top center system tag */}
      <SystemTag />

      {/* Live cursor position — bottom right */}
      <MouseReadout mx={mx} my={my} visible={ready} />

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}>

        <WingSection mx={mx} my={my} />

        <WarpTitle mx={mx} my={my} onDone={handleScrambleDone} />

        {/* Mid-depth parallax layer */}
        <motion.div
          style={{
            x: subX, y: subY,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Byline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.9 }}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.56rem',
              letterSpacing: '0.22em',
              color: 'rgba(255,255,255,0.18)',
              textTransform: 'uppercase',
              textAlign: 'center',
              margin: 0,
            }}
          >
            Designed by — Zenith Mesa
          </motion.p>

          {/* Decorative scan divider */}
          <ScanDivider visible={ready} />

          {/* Press Enter prompt */}
          <AnimatePresence>
            {ready && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.45em',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.58rem',
                  letterSpacing: '0.22em',
                  color: 'rgba(255,255,255,0.32)',
                  textTransform: 'uppercase',
                  userSelect: 'none',
                  marginTop: '8px',
                }}
              >
                <span>press enter to start</span>
                <motion.span
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, times: [0, 0.45, 0.5, 0.95] }}
                  style={{ color: 'rgba(255,255,255,0.50)' }}
                >
                  _
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
