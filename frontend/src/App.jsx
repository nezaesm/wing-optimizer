import React, { useState, useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { api } from './api/client'
import { useCursorBg } from './hooks/useCursorBg'
import { useInputHandler } from './hooks/useInputHandler'
import Cursor from './components/Cursor'
import FloatingNav from './components/FloatingNav'
import IntroPage from './pages/Intro'
import DesignPage from './pages/Design'
import SciFiScene from './components/design/SciFiScene'
import SectionShell from './components/SectionShell'
import ConstructionPage from './components/ConstructionPage'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)

const SECTION_COUNT = 8

// Design state defaults (hoisted from Design.jsx)
const BASELINE = {
  camber_pct: 4, camber_pos_pct: 40, thickness_pct: 12,
  aoa_deg: -5, flap_angle_deg: 10, flap_chord_pct: 25,
  aspect_ratio: 3.5, endplate_h_pct: 15,
}
const BASELINE_3D = {
  taper_ratio: 1.0, sweep_deg: 0.0, twist_deg: 0.0,
  ride_height_pct: 8.0, flap_gap_pct: 1.5,
}

// ── Main experience (after intro) ─────────────────────────────────────────────
function MainExperience() {
  useCursorBg()

  // Design state
  const [params,        setParams]        = useState(BASELINE)
  const [params3d,      setParams3d]      = useState(BASELINE_3D)
  const [geoData,       setGeoData]       = useState(null)
  const [activeHotspot, setActiveHotspot] = useState(null)
  const [sceneMode,     setSceneMode]     = useState('idle')
  const [apiStatus,     setApiStatus]     = useState('checking')

  // Scroll state
  const [activeSection, setActiveSection] = useState(0)
  const scrollProxy = useRef({ progress: 0, waveMode: 0, zoomEnabled: false })
  const orbitRef    = useRef(null)
  const spacerRef   = useRef(null)
  const stRef       = useRef(null)
  const geoTimer    = useRef(null)

  // Zoom input handler
  useInputHandler({ orbitRef })

  // Geometry fetch
  const fetchGeometry = useCallback(async (p) => {
    try { setGeoData(await api.geometry(p)) } catch {}
  }, [])

  useEffect(() => {
    api.health()
      .then(d => setApiStatus(d.models_loaded ? 'ready' : 'partial'))
      .catch(() => setApiStatus('offline'))

    // Check for params imported from Upload page
    const loaded = sessionStorage.getItem('wopt_loaded_params')
    if (loaded) {
      try {
        const p    = JSON.parse(loaded)
        const base = Object.fromEntries(Object.keys(BASELINE).map(k => [k, p[k] ?? BASELINE[k]]))
        setParams(base)
        fetchGeometry(base)
        sessionStorage.removeItem('wopt_loaded_params')
        return
      } catch {}
    }
    fetchGeometry(BASELINE)
  }, [fetchGeometry])

  // GSAP ScrollTrigger — drives scrollProxy from window scroll
  useEffect(() => {
    if (!spacerRef.current) return

    stRef.current = ScrollTrigger.create({
      trigger: spacerRef.current,
      start:   'top top',
      end:     'bottom bottom',
      scrub:   1.2,
      snap: {
        snapTo:   1 / (SECTION_COUNT - 1),
        duration: { min: 0.3, max: 0.6 },
        ease:     'power1.inOut',
      },
      onUpdate(self) {
        const p   = self.progress * (SECTION_COUNT - 1)
        scrollProxy.current.progress = p
        scrollProxy.current.waveMode = p
        const idx = Math.round(p)
        setActiveSection(prev => prev !== idx ? idx : prev)
      },
    })

    return () => stRef.current?.kill()
  }, [])  // runs once after mount — spacerRef is stable

  const goToSection = useCallback((idx) => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    gsap.to(window, {
      scrollTo: (idx / (SECTION_COUNT - 1)) * maxScroll,
      duration: 1.2,
      ease:     'power2.inOut',
      overwrite: true,
    })
  }, [])

  const handleParam = useCallback((name, val) => {
    setParams(prev => {
      const next = { ...prev, [name]: val }
      clearTimeout(geoTimer.current)
      geoTimer.current = setTimeout(() => fetchGeometry(next), 300)
      return next
    })
  }, [fetchGeometry])

  const handleParam3d = useCallback((name, val) => {
    setParams3d(p => ({ ...p, [name]: val }))
  }, [])

  return (
    <div>
      <Cursor />

      {/* Page height spacer — gives window its scrollable height (8 × 100vh) */}
      <div ref={spacerRef} style={{ height: `${SECTION_COUNT * 100}vh`, pointerEvents: 'none' }} />

      {/* Persistent R3F canvas — fixed, always in DOM */}
      <SciFiScene
        geoData={geoData}
        params={params}
        params3d={params3d}
        activeHotspot={activeHotspot}
        setActiveHotspot={setActiveHotspot}
        onParamChange={handleParam}
        onParam3dChange={handleParam3d}
        isAnalyzing={sceneMode === 'analyzing'}
        scrollProxy={scrollProxy}
        orbitRef={orbitRef}
      />

      {/* FloatingNav pill */}
      <FloatingNav
        apiStatus={apiStatus}
        activeSection={activeSection}
        goToSection={goToSection}
      />

      {/* §0 Design overlays */}
      <DesignPage
        visible={activeSection === 0}
        params={params}
        params3d={params3d}
        sceneMode={sceneMode}
        setSceneMode={setSceneMode}
        apiStatus={apiStatus}
      />

      {/* §1–§6 section shells */}
      {[1, 2, 3, 4, 5, 6].map(idx => (
        <SectionShell
          key={idx}
          sectionIndex={idx}
          active={activeSection === idx}
        />
      ))}

      {/* §7 Upload — preserved construction page */}
      <div style={{
        position:      'fixed',
        inset:         0,
        zIndex:        10,
        opacity:       activeSection === 7 ? 1 : 0,
        pointerEvents: activeSection === 7 ? 'auto' : 'none',
        transition:    'opacity 0.55s ease',
      }}>
        <ConstructionPage pageName="Upload" />
      </div>

      {/* Offline banner */}
      {apiStatus === 'offline' && activeSection !== 0 && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'rgba(255,61,90,0.08)',
          border: '1px solid rgba(255,61,90,0.18)',
          borderRadius: '100px', padding: '8px 20px',
          display: 'flex', alignItems: 'center', gap: '8px',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: '#ffa0b0' }}>
            Backend offline — run{' '}
            <code style={{ background: 'rgba(255,61,90,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
              python main.py
            </code>
          </span>
        </div>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [introDone, setIntroDone] = useState(
    () => sessionStorage.getItem('wopt_intro') === '1'
  )

  if (!introDone) {
    return (
      <>
        <Cursor />
        <IntroPage
          onEnter={() => {
            sessionStorage.setItem('wopt_intro', '1')
            setIntroDone(true)
          }}
        />
      </>
    )
  }

  return <MainExperience />
}
