// FloatingNav.jsx — WINGOPT logo + centered floating pill
// No React Router — uses activeSection index + goToSection callback
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import { Sliders, FlaskConical, Target, ShieldCheck, BarChart3, Activity, Info, Upload, Wind } from 'lucide-react'

// Section order: Design(0), Train(1), Optimize(2), Validate(3), Sensitivity(4), Dataset(5), About(6), Upload(7)
const NAV = [
  { index: 0, label: 'Design',      icon: Sliders      },
  { index: 1, label: 'Train',        icon: FlaskConical },
  { index: 2, label: 'Optimize',     icon: Target       },
  { index: 3, label: 'Validate',     icon: ShieldCheck  },
  { index: 4, label: 'Sensitivity',  icon: BarChart3    },
  { index: 5, label: 'Dataset',      icon: Activity     },
  { index: 6, label: 'About',        icon: Info         },
  { index: 7, label: 'Upload',       icon: Upload       },
]

const SILVER    = '#d4d4d4'
const ICON_W    = 40
const LIMELIGHT = 44
const SCRAMBLE  = '_!X$0-+*#'

function rChar(p) {
  let c
  do { c = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)] } while (c === p)
  return c
}

function ScrambleNavLabel({ text, active }) {
  const [display, setDisplay] = useState('')
  const ivRef    = useRef(null)
  const stepRef  = useRef(0)
  const phaseRef = useRef('p1')

  useEffect(() => {
    if (ivRef.current) clearInterval(ivRef.current)
    if (!active) { setDisplay(''); return }

    stepRef.current  = 0
    phaseRef.current = 'p1'
    const len   = text.length
    const SPEED = 30

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
    }, SPEED)

    return () => clearInterval(ivRef.current)
  }, [active, text])

  return <>{display}</>
}

function WingGem() {
  return (
    <div style={{
      width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
      background: 'linear-gradient(135deg, #3a3a46, #aaaaaa)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    }}>
      <Wind size={12} color="#fff" />
    </div>
  )
}

function NavRefraction({ navRef }) {
  const [pos, setPos] = useState({ x: -1, y: -1 })
  const rafRef = useRef(null)

  useEffect(() => {
    const el = navRef.current
    if (!el) return

    const onMove = (e) => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const rect = el.getBoundingClientRect()
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      })
    }
    const onLeave = () => setPos({ x: -1, y: -1 })

    el.addEventListener('mousemove', onMove,  { passive: true })
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [navRef])

  if (pos.x < 0) return null
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: '100px',
      background: `radial-gradient(circle 78px at ${pos.x}px ${pos.y}px, rgba(255,255,255,0.08), transparent 70%)`,
      pointerEvents: 'none', zIndex: 3,
    }} />
  )
}

export default function FloatingNav({ apiStatus, activeSection, goToSection }) {
  const [hoveredIndex, setHoveredIndex]       = useState(null)
  const [limelightReady, setLimelightReady]   = useState(false)
  const iconRefs     = useRef([])
  const limelightRef = useRef(null)
  const navPillRef   = useRef(null)

  const tileLeftMV     = useMotionValue(0)
  const tileLeftSpring = useSpring(tileLeftMV, { stiffness: 370, damping: 28, mass: 0.65 })
  const firstHoverRef  = useRef(true)

  const activeIndex = activeSection ?? 0

  // Limelight position follows active section
  useLayoutEffect(() => {
    const limelight = limelightRef.current
    const iconEl    = iconRefs.current[activeIndex]
    if (!limelight || !iconEl) return
    const newLeft = iconEl.offsetLeft + iconEl.offsetWidth / 2 - LIMELIGHT / 2
    limelight.style.left = `${newLeft}px`
    if (!limelightReady) setTimeout(() => setLimelightReady(true), 50)
  }, [activeIndex, limelightReady])

  // Glass tile spring position
  useLayoutEffect(() => {
    if (hoveredIndex === null) { firstHoverRef.current = true; return }
    const el = iconRefs.current[hoveredIndex]
    if (!el) return
    const newLeft = el.offsetLeft - 4
    if (firstHoverRef.current) { tileLeftMV.jump(newLeft); firstHoverRef.current = false }
    else tileLeftMV.set(newLeft)
  }, [hoveredIndex, tileLeftMV])

  return (
    <>
      {/* WINGOPT logo — top-left */}
      <div style={{
        position: 'fixed', top: '18px', left: '24px',
        zIndex: 151, display: 'flex', alignItems: 'center', gap: '9px',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        <WingGem />
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontWeight: 700,
          fontSize: '16px', letterSpacing: '0.07em',
          background: 'linear-gradient(90deg, #ffffff 0%, #787878 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent', color: 'transparent',
        }}>
          WINGOPT
        </span>
      </div>

      {/* Floating nav pill — centered */}
      <nav
        ref={navPillRef}
        aria-label="Main navigation"
        style={{
          position: 'fixed', top: '18px', left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 150, display: 'flex', alignItems: 'center', gap: '2px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)',
          backdropFilter: 'blur(32px) saturate(1.7)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.7)',
          border: '1px solid rgba(255,255,255,0.11)',
          borderRadius: '100px', padding: '5px 5px',
          boxShadow: [
            '0 0 0 1px rgba(255,255,255,0.04) inset',
            '0 8px 36px rgba(0,0,0,0.62)',
            'inset 0 1px 0 rgba(255,255,255,0.13)',
            'inset 0 -1px 0 rgba(0,0,0,0.08)',
          ].join(', '),
          whiteSpace: 'nowrap',
          maxWidth: 'calc(100vw - 200px)',
          overflow: 'visible',
        }}
      >
        {/* Specular edge highlight */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '100px',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 50%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <NavRefraction navRef={navPillRef} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', zIndex: 2 }}>

          {/* Hover glass tile */}
          <AnimatePresence>
            {hoveredIndex !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                style={{
                  position: 'absolute', top: 0,
                  left: tileLeftSpring,
                  width: `${ICON_W + 8}px`, height: '100%',
                  borderRadius: '100px', pointerEvents: 'none', zIndex: 1,
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.08) 100%)',
                  backdropFilter: 'blur(10px) saturate(1.5)',
                  WebkitBackdropFilter: 'blur(10px) saturate(1.5)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.30)',
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: 0, height: '55%',
                  borderRadius: '100px 100px 0 0',
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.15), transparent)',
                  pointerEvents: 'none',
                }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Limelight bar */}
          <div
            ref={limelightRef}
            style={{
              position: 'absolute', top: 0,
              width: `${LIMELIGHT}px`, height: '2px',
              borderRadius: '0 0 6px 6px',
              background: SILVER,
              boxShadow: `0 0 6px ${SILVER}, 0 0 18px rgba(200,200,200,0.50)`,
              left: '-999px',
              transition: limelightReady ? 'left 0.38s cubic-bezier(0.23,1,0.32,1)' : 'none',
              pointerEvents: 'none', zIndex: 10,
            }}
          >
            <div style={{
              position: 'absolute', left: '-28%', top: '2px',
              width: '156%', height: '42px',
              background: 'linear-gradient(to bottom, rgba(200,200,200,0.18), transparent)',
              clipPath: 'polygon(10% 100%, 24% 0, 76% 0, 90% 100%)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Nav buttons */}
          {NAV.map(({ index, label, icon: Icon }) => {
            const isActive  = index === activeIndex
            const isHovered = hoveredIndex === index

            return (
              <button
                key={index}
                data-magnetic
                onClick={() => goToSection?.(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  display: 'flex', alignItems: 'center',
                  textDecoration: 'none', background: 'none', border: 'none',
                  borderRadius: '100px', overflow: 'hidden',
                  cursor: 'none', padding: '7px 0',
                  flexShrink: 0, position: 'relative', zIndex: 2,
                }}
              >
                <div
                  ref={el => (iconRefs.current[index] = el)}
                  style={{
                    width: `${ICON_W}px`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, position: 'relative',
                  }}
                >
                  <Icon
                    size={14}
                    style={{
                      color: isActive  ? '#ffffff'
                           : isHovered ? 'rgba(240,240,240,0.88)'
                           :             'rgba(140,140,140,0.38)',
                      transition: 'color 0.18s ease', flexShrink: 0,
                      filter: isHovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.30))' : 'none',
                    }}
                  />
                </div>

                <motion.span
                  initial={false}
                  animate={isHovered
                    ? { maxWidth: 90, opacity: 1, paddingRight: 12 }
                    : { maxWidth: 0,  opacity: 0, paddingRight: 0  }
                  }
                  transition={{ type: 'spring', stiffness: 340, damping: 26, mass: 0.65 }}
                  style={{
                    display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap',
                    fontFamily: '"JetBrains Mono", monospace', fontSize: '10px',
                    letterSpacing: '0.10em', fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#ffffff' : 'rgba(220,220,220,0.72)',
                    textTransform: 'uppercase', lineHeight: 1,
                  }}
                >
                  <ScrambleNavLabel text={label} active={isHovered} />
                </motion.span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div style={{
          width: '1px', height: '16px',
          background: 'rgba(255,255,255,0.08)',
          marginLeft: '2px', flexShrink: 0, zIndex: 2,
        }} />

        {/* API status pill */}
        <div
          data-magnetic
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '7px 12px', borderRadius: '100px',
            background: apiStatus === 'ready'
              ? 'rgba(255,255,255,0.05)'
              : apiStatus === 'offline'
              ? 'rgba(255,61,90,0.07)'
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              apiStatus === 'ready'   ? 'rgba(255,255,255,0.12)'
              : apiStatus === 'offline' ? 'rgba(255,61,90,0.22)'
              : 'rgba(255,255,255,0.06)'
            }`,
            boxShadow: apiStatus === 'ready' ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'none',
            fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', fontWeight: 500,
            color: apiStatus === 'ready'   ? SILVER
                 : apiStatus === 'offline' ? '#ff3d5a'
                 : 'rgba(160,160,160,0.45)',
            cursor: 'none', flexShrink: 0, position: 'relative', zIndex: 2,
          }}
        >
          <span className="status-pulse" style={{
            width: '6px', height: '6px', borderRadius: '50%',
            flexShrink: 0, display: 'inline-block',
            background: apiStatus === 'ready'   ? SILVER
                      : apiStatus === 'offline' ? '#ff3d5a'
                      : 'rgba(160,160,160,0.45)',
          }} />
          <span className="hidden sm:inline">
            {apiStatus === 'ready' ? 'API' : apiStatus === 'offline' ? 'Off' : '…'}
          </span>
        </div>
      </nav>
    </>
  )
}
