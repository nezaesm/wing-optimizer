import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Activity, Sliders, FlaskConical, Target, BarChart3, ShieldCheck, Info, WifiOff, Menu, X, Upload } from 'lucide-react'
import { api } from './api/client'
import IntroPage from './pages/Intro'

import DesignPage      from './pages/Design'
import TrainPage       from './pages/Train'
import OptimizePage    from './pages/Optimize'
import ValidatePage    from './pages/Validate'
import SensitivityPage from './pages/Sensitivity'
import DatasetPage     from './pages/Dataset'
import AboutPage       from './pages/About'
import UploadPage     from './pages/Upload'

const NAV = [
  { path: '/',            label: 'Design',      icon: Sliders,      step: 1 },
  { path: '/train',       label: 'Train',        icon: FlaskConical, step: 2 },
  { path: '/optimize',    label: 'Optimize',     icon: Target,       step: 3 },
  { path: '/validate',    label: 'Validate',     icon: ShieldCheck,  step: 4 },
  { path: '/sensitivity', label: 'Sensitivity',  icon: BarChart3,    step: 5 },
  { path: '/dataset',     label: 'Dataset',      icon: Activity,     step: 6 },
  { path: '/upload',      label: 'Upload',       icon: Upload,       step: null },
  { path: '/about',       label: 'About',        icon: Info,         step: null },
]

function WingLogo() {
  return (
    <svg width="36" height="22" viewBox="0 0 40 24" className="wing-glow flex-shrink-0" fill="none">
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
      <path d="M 20 1.5 L 1 22 L 20 17.5 L 39 22 Z"
        stroke="url(#logoGrad)" strokeWidth="1.6" strokeLinejoin="round" filter="url(#logoGlow)" />
      <path d="M 6 21 Q 20 15 34 21"
        stroke="url(#logoGrad)" strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
    </svg>
  )
}

// ── Mobile bottom tab bar ──────────────────────────────────────────────────────
function MobileNav({ apiStatus }) {
  const location = useLocation()
  const mainNav = NAV.filter(n => n.step !== null)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: 'rgba(8,9,13,0.97)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.55)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div style={{
        height: '1.5px',
        background: apiStatus === 'ready'
          ? 'linear-gradient(90deg, transparent, rgba(57,255,136,0.45), transparent)'
          : apiStatus === 'offline'
          ? 'linear-gradient(90deg, transparent, rgba(255,61,90,0.45), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(0,200,255,0.3), transparent)',
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mainNav.length}, 1fr)` }}>
        {mainNav.map(({ path, label, icon: Icon, step }) => {
          const isActive = path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(path)
          return (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '3px',
                padding: '10px 2px 9px',
                textDecoration: 'none',
                color: isActive ? 'var(--arc)' : '#636880',
                transition: 'color 0.15s',
                position: 'relative',
                minHeight: '58px',
              }}
            >
              {isActive && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '24px', height: '2px', borderRadius: '0 0 3px 3px',
                  background: 'var(--arc)', boxShadow: '0 0 8px var(--arc)',
                }} />
              )}
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={19} />
                {step && (
                  <span style={{
                    position: 'absolute', top: '-5px', right: '-6px',
                    width: '13px', height: '13px', borderRadius: '50%',
                    background: isActive ? 'var(--arc)' : '#1d1f2e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.48rem', fontWeight: 700,
                    color: isActive ? '#06080f' : '#636880',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {step}
                  </span>
                )}
              </span>
              <span style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '0.58rem', fontWeight: 500,
                letterSpacing: '0.01em', lineHeight: 1,
                color: isActive ? 'var(--arc)' : '#636880',
              }}>
                {label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

// ── Slide-in drawer (mobile) ───────────────────────────────────────────────────
function MobileDrawer({ open, onClose, apiStatus }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 61,
        width: 'min(280px, 85vw)',
        background: 'rgba(14,15,23,0.99)',
        borderLeft: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '-8px 0 48px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <WingLogo />
            <span style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1rem',
              background: 'linear-gradient(135deg, #00c8ff, #00e5cc)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>WINGOPT</span>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '7px', cursor: 'pointer', color: '#a8b2c8',
            padding: '6px', display: 'flex', alignItems: 'center',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {NAV.map(({ path, label, icon: Icon, step }) => (
            <NavLink key={path} to={path} end={path === '/'} onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '13px',
                padding: '14px 14px', borderRadius: '10px', marginBottom: '3px',
                textDecoration: 'none',
                background: isActive ? 'rgba(0,200,255,0.08)' : 'transparent',
                borderLeft: `2px solid ${isActive ? 'var(--arc)' : 'transparent'}`,
                color: isActive ? '#fff' : '#a8b2c8',
              })}
            >
              {({ isActive }) => (
                <>
                  {step ? (
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive ? 'var(--arc)' : 'rgba(255,255,255,0.07)',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', fontWeight: 700,
                      color: isActive ? '#06080f' : '#636880',
                    }}>{step}</span>
                  ) : (
                    <span style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--arc)' : '#636880' }}>
                      <Icon size={15} />
                    </span>
                  )}
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: '0.95rem' }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem',
            color: apiStatus === 'ready' ? 'var(--phosphor)' : apiStatus === 'offline' ? 'var(--signal)' : 'var(--ember)',
          }}>
            <span className="status-pulse" style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: apiStatus === 'ready' ? 'var(--phosphor)' : apiStatus === 'offline' ? 'var(--signal)' : 'var(--ember)',
            }} />
            {apiStatus === 'ready' ? 'Backend online' : apiStatus === 'offline' ? 'Backend offline' : 'Connecting…'}
          </div>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#3e4257', marginTop: '8px' }}>
            WINGOPT — AI AERODYNAMIC DESIGN
          </p>
        </div>
      </div>
    </>
  )
}

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [introDone, setIntroDone] = useState(
    () => sessionStorage.getItem('wopt_intro') === '1'
  )

  useEffect(() => {
    api.health()
      .then(d => setApiStatus(d.models_loaded ? 'ready' : 'partial'))
      .catch(() => setApiStatus('offline'))
  }, [])

  if (!introDone) {
    return (
      <IntroPage onEnter={() => {
        sessionStorage.setItem('wopt_intro', '1')
        setIntroDone(true)
      }} />
    )
  }

  return (
    <div className="scanline-overlay min-h-screen flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{
        background: 'rgba(8,9,13,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 1px 0 rgba(0,200,255,0.04), 0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.4) 30%, rgba(0,229,204,0.4) 70%, transparent 100%)' }} />

        <div className="max-w-screen-2xl mx-auto flex items-center h-14 gap-3" style={{ padding: '0 16px' }}>

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <WingLogo />
            <div className="flex items-baseline gap-1">
              <span style={{
                fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em',
                background: 'linear-gradient(135deg, #00c8ff 0%, #00e5cc 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>WING</span>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em', color: '#fff' }}>OPT</span>
              <span className="hidden lg:block font-mono text-carbon-500" style={{ fontSize: '0.6rem', letterSpacing: '0.08em' }}>AI AERO</span>
            </div>
          </div>

          <div className="hidden md:block w-px h-6 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto">
            {NAV.map(({ path, label, icon: Icon, step }) => (
              <NavLink key={path} to={path} end={path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-200 whitespace-nowrap ${
                    isActive ? 'text-white' : 'text-carbon-400 hover:text-white'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'rgba(0,200,255,0.08)',
                  border: '1px solid rgba(0,200,255,0.15)',
                  boxShadow: '0 0 12px rgba(0,200,255,0.08)',
                } : { background: 'transparent', border: '1px solid transparent' }}
              >
                {({ isActive }) => (
                  <>
                    {step ? (
                      <span style={{
                        width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', fontWeight: 600,
                        background: isActive ? 'var(--arc)' : 'rgba(255,255,255,0.06)',
                        color: isActive ? '#06080f' : '#636880', transition: 'all 0.2s',
                      }}>{step}</span>
                    ) : null}
                    <Icon size={13} className="flex-shrink-0" />
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Desktop API status */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0" style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem',
            background: apiStatus === 'ready' ? 'rgba(57,255,136,0.06)' : apiStatus === 'offline' ? 'rgba(255,61,90,0.06)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${apiStatus === 'ready' ? 'rgba(57,255,136,0.20)' : apiStatus === 'offline' ? 'rgba(255,61,90,0.20)' : 'rgba(255,255,255,0.07)'}`,
            color: apiStatus === 'ready' ? 'var(--phosphor)' : apiStatus === 'offline' ? 'var(--signal)' : '#636880',
          }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 status-pulse" style={{
              background: apiStatus === 'ready' ? 'var(--phosphor)' : apiStatus === 'offline' ? 'var(--signal)' : '#636880',
            }} />
            {apiStatus === 'ready' ? 'API ready' : apiStatus === 'offline' ? 'Offline' : 'Connecting…'}
          </div>

          {/* Mobile: dot + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <span className="w-2 h-2 rounded-full status-pulse" style={{
              background: apiStatus === 'ready' ? 'var(--phosphor)' : apiStatus === 'offline' ? 'var(--signal)' : '#636880',
            }} />
            <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '8px', padding: '7px', cursor: 'pointer', color: '#a8b2c8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '36px', minHeight: '36px',
            }}>
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} apiStatus={apiStatus} />

      {/* Offline banner */}
      {apiStatus === 'offline' && (
        <div style={{ background: 'rgba(255,61,90,0.06)', borderBottom: '1px solid rgba(255,61,90,0.18)', padding: '10px 16px' }}
          className="flex items-center gap-3">
          <WifiOff size={14} style={{ color: 'var(--signal)', flexShrink: 0 }} />
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.8rem', color: '#ffa0b0' }}>
            <span style={{ fontWeight: 600 }}>Backend offline.</span>{' '}
            Run <code style={{ background: 'rgba(255,61,90,0.12)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.73rem' }}>python main.py</code> in the backend folder.
          </p>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full" style={{ padding: '20px 16px' }}>
        {/* Extra bottom padding on mobile for the fixed tab bar */}
        <div style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }} className="md:pb-8">
          <Routes>
            <Route path="/"            element={<DesignPage />} />
            <Route path="/train"       element={<TrainPage />} />
            <Route path="/optimize"    element={<OptimizePage />} />
            <Route path="/validate"    element={<ValidatePage />} />
            <Route path="/sensitivity" element={<SensitivityPage />} />
            <Route path="/dataset"     element={<DatasetPage />} />
            <Route path="/upload"      element={<UploadPage />} />
            <Route path="/about"       element={<AboutPage />} />
          </Routes>
        </div>
      </main>

      {/* Desktop footer */}
      <footer className="hidden md:block" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 20px' }}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3e4257', letterSpacing: '0.06em' }}>
            WINGOPT — AI AERODYNAMIC DESIGN
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3e4257' }}>
            PHYSICS → ML SURROGATES → NSGA-II
          </span>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <MobileNav apiStatus={apiStatus} />
    </div>
  )
}
