import React, { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { api } from './api/client'
import { useCursorBg } from './hooks/useCursorBg'
import Cursor from './components/Cursor'
import FloatingNav from './components/FloatingNav'
import PageTransition from './components/PageTransition'
import IntroPage from './pages/Intro'
import DesignPage from './pages/Design'
import ConstructionPage from './components/ConstructionPage'

// Wrapper for non-Design pages — construction experience
function ConstructionRoute({ pageName }) {
  return (
    <PageTransition>
      <ConstructionPage pageName={pageName} />
    </PageTransition>
  )
}

export default function App() {
  useCursorBg()

  const [apiStatus, setApiStatus] = useState('checking')
  const [introDone, setIntroDone] = useState(
    () => sessionStorage.getItem('wopt_intro') === '1'
  )
  const location = useLocation()

  useEffect(() => {
    api.health()
      .then(d => setApiStatus(d.models_loaded ? 'ready' : 'partial'))
      .catch(() => setApiStatus('offline'))
  }, [])

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

  const isDesign = location.pathname === '/'

  return (
    <div className="min-h-screen">
      <Cursor />
      <FloatingNav apiStatus={apiStatus} />

      {/* Offline banner — only show on non-Design pages */}
      {apiStatus === 'offline' && !isDesign && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'rgba(255,61,90,0.08)',
          border: '1px solid rgba(255,61,90,0.18)',
          borderRadius: '100px',
          padding: '8px 20px',
          display: 'flex', alignItems: 'center', gap: '8px',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: '#ffa0b0' }}>
            Backend offline — run{' '}
            <code style={{ background: 'rgba(255,61,90,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
              python main.py
            </code>
          </span>
        </div>
      )}

      {/* Design page renders itself as a portal — no container needed */}
      {isDesign && (
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<DesignPage />} />
          </Routes>
        </AnimatePresence>
      )}

      {/* All other pages — construction experience inside standard container */}
      {!isDesign && (
        <main style={{ paddingTop: '88px', minHeight: '100vh' }}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/train"       element={<ConstructionRoute pageName="Train" />} />
              <Route path="/optimize"    element={<ConstructionRoute pageName="Optimize" />} />
              <Route path="/validate"    element={<ConstructionRoute pageName="Validate" />} />
              <Route path="/sensitivity" element={<ConstructionRoute pageName="Sensitivity" />} />
              <Route path="/dataset"     element={<ConstructionRoute pageName="Dataset" />} />
              <Route path="/upload"      element={<ConstructionRoute pageName="Upload" />} />
              <Route path="/about"       element={<ConstructionRoute pageName="About" />} />
            </Routes>
          </AnimatePresence>
        </main>
      )}
    </div>
  )
}
