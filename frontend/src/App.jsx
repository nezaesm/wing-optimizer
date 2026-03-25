import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Activity, Sliders, FlaskConical, Target, BarChart3, ShieldCheck, Info, WifiOff } from 'lucide-react'
import { api } from './api/client'

import DesignPage      from './pages/Design'
import TrainPage       from './pages/Train'
import OptimizePage    from './pages/Optimize'
import ValidatePage    from './pages/Validate'
import SensitivityPage from './pages/Sensitivity'
import DatasetPage     from './pages/Dataset'
import AboutPage       from './pages/About'

const NAV = [
  { path: '/',            label: 'Design',      icon: Sliders,      step: 1 },
  { path: '/train',       label: 'Train',        icon: FlaskConical, step: 2 },
  { path: '/optimize',    label: 'Optimize',     icon: Target,       step: 3 },
  { path: '/validate',    label: 'Validate',     icon: ShieldCheck,  step: 4 },
  { path: '/sensitivity', label: 'Sensitivity',  icon: BarChart3,    step: 5 },
  { path: '/dataset',     label: 'Dataset',      icon: Activity,     step: 6 },
  { path: '/about',       label: 'About',        icon: Info,         step: null },
]

function WingLogo() {
  return (
    <svg width="40" height="24" viewBox="0 0 40 24" className="wing-glow flex-shrink-0" fill="none">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#00c8ff" />
          <stop offset="100%" stopColor="#00e5cc" />
        </linearGradient>
        <filter id="logoGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" />
        </filter>
      </defs>
      {/* Delta wing silhouette */}
      <path
        d="M 20 1.5 L 1 22 L 20 17.5 L 39 22 Z"
        stroke="url(#logoGrad)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        filter="url(#logoGlow)"
      />
      {/* Inner accent line */}
      <path
        d="M 6 21 Q 20 15 34 21"
        stroke="url(#logoGrad)"
        strokeWidth="0.8"
        opacity="0.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking')

  useEffect(() => {
    api.health()
      .then(d => setApiStatus(d.models_loaded ? 'ready' : 'partial'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <div className="scanline-overlay min-h-screen flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(8,9,13,0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 1px 0 rgba(0,200,255,0.04), 0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Top accent line */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.4) 30%, rgba(0,229,204,0.4) 70%, transparent 100%)',
        }} />

        <div className="max-w-screen-2xl mx-auto px-5 flex items-center h-14 gap-4">

          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <WingLogo />
            <div className="flex items-baseline gap-2">
              <span style={{
                fontFamily: 'Syne, sans-serif',
                fontWeight: 800,
                fontSize: '1.05rem',
                letterSpacing: '0.05em',
                background: 'linear-gradient(135deg, #00c8ff 0%, #00e5cc 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                WING
              </span>
              <span style={{
                fontFamily: 'Syne, sans-serif',
                fontWeight: 800,
                fontSize: '1.05rem',
                letterSpacing: '0.05em',
                color: '#fff',
              }}>
                OPT
              </span>
              <span className="hidden lg:block text-carbon-500 text-xs font-mono" style={{ fontSize: '0.65rem', letterSpacing: '0.08em' }}>
                AI AERO
              </span>
            </div>
          </div>

          {/* Vertical divider */}
          <div className="w-px h-6 bg-carbon-700/60 flex-shrink-0" />

          {/* Nav */}
          <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
            {NAV.map(({ path, label, icon: Icon, step }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-200 whitespace-nowrap group relative ${
                    isActive
                      ? 'text-white'
                      : 'text-carbon-400 hover:text-white'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'rgba(0,200,255,0.08)',
                  border: '1px solid rgba(0,200,255,0.15)',
                  boxShadow: '0 0 12px rgba(0,200,255,0.08)',
                } : {
                  background: 'transparent',
                  border: '1px solid transparent',
                }}
              >
                {({ isActive }) => (
                  <>
                    {step ? (
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          background: isActive ? 'var(--arc)' : 'rgba(255,255,255,0.06)',
                          color: isActive ? '#06080f' : '#636880',
                          transition: 'all 0.2s',
                        }}
                      >
                        {step}
                      </span>
                    ) : null}
                    <Icon size={13} className="flex-shrink-0" />
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: '0.85rem' }}>
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* API status */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.7rem',
              background: apiStatus === 'ready'   ? 'rgba(57,255,136,0.06)'  :
                          apiStatus === 'partial' ? 'rgba(255,176,32,0.06)' :
                          apiStatus === 'offline' ? 'rgba(255,61,90,0.06)'  :
                                                    'rgba(255,255,255,0.04)',
              border: `1px solid ${
                apiStatus === 'ready'   ? 'rgba(57,255,136,0.20)'  :
                apiStatus === 'partial' ? 'rgba(255,176,32,0.20)' :
                apiStatus === 'offline' ? 'rgba(255,61,90,0.20)'  :
                                          'rgba(255,255,255,0.07)'
              }`,
              color: apiStatus === 'ready'   ? 'var(--phosphor)' :
                     apiStatus === 'partial' ? 'var(--ember)'    :
                     apiStatus === 'offline' ? 'var(--signal)'   :
                                               '#636880',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 status-pulse"
              style={{
                background: apiStatus === 'ready'   ? 'var(--phosphor)' :
                            apiStatus === 'partial' ? 'var(--ember)'    :
                            apiStatus === 'offline' ? 'var(--signal)'   :
                                                      '#636880',
              }}
            />
            {apiStatus === 'ready'   ? 'API ready' :
             apiStatus === 'partial' ? 'Partial'   :
             apiStatus === 'offline' ? 'Offline'   : 'Connecting…'}
          </div>
        </div>
      </header>

      {/* Offline banner */}
      {apiStatus === 'offline' && (
        <div style={{
          background: 'rgba(255,61,90,0.06)',
          borderBottom: '1px solid rgba(255,61,90,0.18)',
          padding: '10px 20px',
        }} className="flex items-center gap-3">
          <WifiOff size={14} style={{ color: 'var(--signal)', flexShrink: 0 }} />
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.8rem', color: '#ffa0b0' }}>
            <span style={{ fontWeight: 600 }}>Backend offline.</span>{' '}
            Run{' '}
            <code style={{
              background: 'rgba(255,61,90,0.12)',
              padding: '1px 7px', borderRadius: '5px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
            }}>python main.py</code>
            {' '}in the backend folder.
          </p>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-5 py-7">
        <Routes>
          <Route path="/"            element={<DesignPage />} />
          <Route path="/train"       element={<TrainPage />} />
          <Route path="/optimize"    element={<OptimizePage />} />
          <Route path="/validate"    element={<ValidatePage />} />
          <Route path="/sensitivity" element={<SensitivityPage />} />
          <Route path="/dataset"     element={<DatasetPage />} />
          <Route path="/about"       element={<AboutPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '12px 20px',
      }}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3e4257', letterSpacing: '0.06em' }}>
            WINGOPT — AI AERODYNAMIC DESIGN
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3e4257', letterSpacing: '0.04em' }}>
            PHYSICS → ML SURROGATES → NSGA-II
          </span>
        </div>
      </footer>
    </div>
  )
}
