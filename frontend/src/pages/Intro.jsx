// src/pages/Intro.jsx
import React, { useState, useEffect } from 'react'

const STATS = [
  { value: '+41.8%', label: 'Efficiency gain' },
  { value: 'R²=0.99', label: 'Surrogate accuracy' },
  { value: '1000×', label: 'Faster than physics' },
]

const LETTERS = 'WINGOPT'.split('')

const STREAMLINES = [
  // [y, controlY1, controlY2, opacity]  — above wing
  [28,  22,  18, 0.18],
  [46,  36,  28, 0.28],
  [62,  48,  36, 0.42],
  [76,  56,  40, 0.60],
  [88,  62,  44, 0.80],  // closest to upper surface
  // below wing
  [122, 128, 130, 0.70],
  [136, 140, 142, 0.50],
  [150, 152, 154, 0.34],
  [164, 165, 166, 0.22],
  [178, 178, 178, 0.14],
]

export default function IntroPage({ onEnter }) {
  const [exiting, setExiting] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showTitle, setShowTitle] = useState(false)
  const [showBy, setShowBy] = useState(false)
  const [showCta, setShowCta] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowTitle(true), 1400)
    const t2 = setTimeout(() => setShowStats(true), 2200)
    const t3 = setTimeout(() => setShowBy(true),    2800)
    const t4 = setTimeout(() => setShowCta(true),   3400)
    return () => [t1,t2,t3,t4].forEach(clearTimeout)
  }, [])

  const handleEnter = () => {
    setExiting(true)
    setTimeout(onEnter, 900)
  }

  return (
    <>
      <style>{`
        /* ── Intro base ── */
        .intro-wrap {
          position: fixed; inset: 0; z-index: 9999;
          background: #06060a;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          overflow: hidden;
          transition: opacity 0.9s cubic-bezier(0.4,0,0.2,1), transform 0.9s cubic-bezier(0.4,0,0.2,1);
        }
        .intro-wrap.exit {
          opacity: 0;
          transform: scale(1.04);
        }

        /* ── Ambient background orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
        }
        .orb-1 {
          width: 700px; height: 400px;
          top: -120px; left: 50%;
          transform: translateX(-50%);
          background: radial-gradient(ellipse, rgba(0,200,255,0.12) 0%, transparent 70%);
          animation: orbDrift1 12s ease-in-out infinite;
        }
        .orb-2 {
          width: 500px; height: 300px;
          bottom: -80px; right: -100px;
          background: radial-gradient(ellipse, rgba(0,229,204,0.08) 0%, transparent 70%);
          animation: orbDrift2 15s ease-in-out infinite;
        }
        .orb-3 {
          width: 400px; height: 250px;
          bottom: 60px; left: -80px;
          background: radial-gradient(ellipse, rgba(57,255,136,0.05) 0%, transparent 70%);
          animation: orbDrift3 18s ease-in-out infinite;
        }
        @keyframes orbDrift1 {
          0%,100% { transform: translateX(-50%) translateY(0); }
          50%      { transform: translateX(-50%) translateY(20px); }
        }
        @keyframes orbDrift2 {
          0%,100% { transform: translateY(0) translateX(0); }
          50%      { transform: translateY(-30px) translateX(-20px); }
        }
        @keyframes orbDrift3 {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(25px); }
        }

        /* ── Grid lines ── */
        .intro-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(0,200,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,200,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%);
          mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 100%);
        }

        /* ── Wing SVG animations ── */
        .wing-upper {
          stroke-dasharray: 1600;
          stroke-dashoffset: 1600;
          animation: drawWing 1.8s cubic-bezier(0.4,0,0.2,1) 0.3s forwards;
        }
        .wing-lower {
          stroke-dasharray: 1600;
          stroke-dashoffset: 1600;
          animation: drawWing 1.8s cubic-bezier(0.4,0,0.2,1) 0.5s forwards;
        }
        .wing-fill {
          opacity: 0;
          animation: fadeInFill 1.2s ease 1.4s forwards;
        }
        .wing-camber {
          stroke-dasharray: 900;
          stroke-dashoffset: 900;
          animation: drawWing 1.4s ease 1.0s forwards;
        }
        @keyframes drawWing {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeInFill {
          to { opacity: 1; }
        }

        /* ── Streamlines ── */
        .streamline {
          stroke-dasharray: 900;
          stroke-dashoffset: 900;
        }
        .sl-0 { animation: streamFlow 1.4s ease 0.9s forwards; }
        .sl-1 { animation: streamFlow 1.4s ease 1.0s forwards; }
        .sl-2 { animation: streamFlow 1.4s ease 1.1s forwards; }
        .sl-3 { animation: streamFlow 1.4s ease 1.2s forwards; }
        .sl-4 { animation: streamFlow 1.3s ease 1.3s forwards; }
        .sl-5 { animation: streamFlow 1.4s ease 1.2s forwards; }
        .sl-6 { animation: streamFlow 1.4s ease 1.1s forwards; }
        .sl-7 { animation: streamFlow 1.4s ease 1.0s forwards; }
        .sl-8 { animation: streamFlow 1.4s ease 0.95s forwards; }
        .sl-9 { animation: streamFlow 1.4s ease 0.9s forwards; }
        @keyframes streamFlow {
          to { stroke-dashoffset: 0; }
        }

        /* ── LE glow dot ── */
        .le-dot {
          opacity: 0;
          animation: leDot 0.6s ease 0.2s forwards;
          filter: drop-shadow(0 0 8px #00c8ff);
        }
        @keyframes leDot {
          0%  { opacity: 0; r: 2; }
          50% { opacity: 1; r: 6; }
          100%{ opacity: 0.8; r: 3; }
        }

        /* ── Title letters ── */
        .intro-letter {
          display: inline-block;
          opacity: 0;
          transform: translateY(30px) scale(0.8);
          animation: letterReveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes letterReveal {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ── Fade up elements ── */
        .fade-up {
          opacity: 0;
          transform: translateY(16px);
          animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Stats ── */
        .stat-item {
          opacity: 0;
          transform: translateY(10px);
          animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }

        /* ── CTA button ── */
        .intro-cta {
          position: relative;
          padding: 14px 48px;
          border-radius: 50px;
          border: none;
          cursor: pointer;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.06em;
          color: #06060a;
          background: linear-gradient(135deg, #00c8ff 0%, #00e5cc 100%);
          box-shadow: 0 0 40px rgba(0,200,255,0.35), 0 4px 20px rgba(0,200,255,0.25);
          transition: transform 0.3s cubic-bezier(0.23,1,0.32,1), box-shadow 0.3s ease;
          animation: ctaPulse 2.5s ease-in-out infinite;
        }
        .intro-cta:hover {
          transform: translateY(-3px) scale(1.04);
          box-shadow: 0 0 60px rgba(0,200,255,0.55), 0 8px 32px rgba(0,200,255,0.35);
          animation: none;
        }
        .intro-cta::before {
          content: '';
          position: absolute; inset: -2px;
          border-radius: 52px;
          background: linear-gradient(135deg, #00c8ff, #00e5cc, #39ff88, #00c8ff);
          background-size: 300% 300%;
          z-index: -1;
          filter: blur(8px);
          opacity: 0.6;
          animation: borderSpin 4s linear infinite;
        }
        @keyframes ctaPulse {
          0%,100% { box-shadow: 0 0 40px rgba(0,200,255,0.35), 0 4px 20px rgba(0,200,255,0.25); }
          50%      { box-shadow: 0 0 60px rgba(0,200,255,0.55), 0 4px 28px rgba(0,200,255,0.35); }
        }
        @keyframes borderSpin {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* ── Scan line ── */
        .intro-scanline {
          position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 3px,
            rgba(0,0,0,0.08) 3px,
            rgba(0,0,0,0.08) 4px
          );
        }

        /* ── Corner decorations ── */
        .corner {
          position: absolute;
          width: 40px; height: 40px;
          opacity: 0.3;
        }
        .corner-tl { top: 24px; left: 24px; border-top: 1px solid var(--arc); border-left: 1px solid var(--arc); }
        .corner-tr { top: 24px; right: 24px; border-top: 1px solid var(--arc); border-right: 1px solid var(--arc); }
        .corner-bl { bottom: 24px; left: 24px; border-bottom: 1px solid var(--arc); border-left: 1px solid var(--arc); }
        .corner-br { bottom: 24px; right: 24px; border-bottom: 1px solid var(--arc); border-right: 1px solid var(--arc); }

        /* ── Bottom ticker ── */
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      <div className={`intro-wrap ${exiting ? 'exit' : ''}`}>

        {/* Scanlines */}
        <div className="intro-scanline" />

        {/* Corner decorations */}
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />

        {/* Ambient orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Grid */}
        <div className="intro-grid" />

        {/* ── Main content ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', zIndex: 1, width: '100%', maxWidth: '900px', padding: '0 40px' }}>

          {/* Top badge */}
          <div className="fade-up" style={{ animationDelay: '0.1s', marginBottom: '32px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '5px 14px', borderRadius: '999px',
              background: 'rgba(0,200,255,0.06)',
              border: '1px solid rgba(0,200,255,0.18)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.65rem', letterSpacing: '0.14em',
              color: 'rgba(0,200,255,0.8)',
              textTransform: 'uppercase',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00c8ff', boxShadow: '0 0 8px #00c8ff', animation: 'statusPulse 2s ease-in-out infinite' }} />
              AI Aerodynamic Design System
            </div>
          </div>

          {/* Wing SVG */}
          <div style={{ width: '100%', maxWidth: '820px', marginBottom: '8px' }}>
            <svg viewBox="0 0 820 210" style={{ width: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00c8ff" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#00e5cc" stopOpacity="0.03" />
                </linearGradient>
                <linearGradient id="wstroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#00c8ff" />
                  <stop offset="60%"  stopColor="#00e5cc" />
                  <stop offset="100%" stopColor="#00c8ff" stopOpacity="0.4" />
                </linearGradient>
                <linearGradient id="slGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#00c8ff" stopOpacity="0" />
                  <stop offset="20%"  stopColor="#00c8ff" stopOpacity="1" />
                  <stop offset="80%"  stopColor="#00e5cc" stopOpacity="1" />
                  <stop offset="100%" stopColor="#00e5cc" stopOpacity="0" />
                </linearGradient>
                <filter id="wingGlowBig">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" />
                </filter>
                <filter id="leDotGlow">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feComposite in="SourceGraphic" in2="b" />
                </filter>
              </defs>

              {/* Streamlines */}
              {STREAMLINES.map(([y, c1y, c2y, op], i) => {
                const isAbove = y < 105
                const mid = isAbove ? c2y : c2y
                return (
                  <path
                    key={i}
                    className={`streamline sl-${i}`}
                    d={`M -30 ${y} C 200 ${c1y}, 400 ${mid}, 620 ${y + (isAbove ? 2 : -1)} S 900 ${y}, 880 ${y}`}
                    fill="none"
                    stroke="url(#slGrad)"
                    strokeWidth="1"
                    opacity={op}
                  />
                )
              })}

              {/* Wing fill */}
              <path
                className="wing-fill"
                d="M 40 105 C 160 50, 420 38, 780 100 L 780 108 C 420 68, 160 125, 40 105 Z"
                fill="url(#wfill)"
              />

              {/* Wing glow (blurred duplicate) */}
              <path
                className="wing-upper"
                d="M 40 105 C 160 50, 420 38, 780 100"
                fill="none"
                stroke="#00c8ff"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.15"
                filter="url(#wingGlowBig)"
              />

              {/* Upper surface */}
              <path
                className="wing-upper"
                d="M 40 105 C 160 50, 420 38, 780 100"
                fill="none"
                stroke="url(#wstroke)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Lower surface */}
              <path
                className="wing-lower"
                d="M 40 105 C 160 125, 420 112, 780 108"
                fill="none"
                stroke="url(#wstroke)"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.7"
              />

              {/* Camber line */}
              <path
                className="wing-camber"
                d="M 40 105 C 160 88, 420 76, 780 104"
                fill="none"
                stroke="#ffb020"
                strokeWidth="1"
                strokeDasharray="6 5"
                opacity="0.45"
              />

              {/* Leading edge glow dot */}
              <circle className="le-dot" cx="40" cy="105" r="4" fill="#00c8ff" filter="url(#leDotGlow)" />

              {/* LE / TE labels */}
              <text x="24" y="105" textAnchor="end" fill="#00c8ff" fontSize="9" fontFamily="JetBrains Mono" dominantBaseline="middle" opacity="0.5">LE</text>
              <text x="796" y="104" textAnchor="start" fill="#00c8ff" fontSize="9" fontFamily="JetBrains Mono" dominantBaseline="middle" opacity="0.5">TE</text>

              {/* Chord fraction markers */}
              {[0.25, 0.5, 0.75].map(f => {
                const x = 40 + f * 740
                return (
                  <g key={f}>
                    <line x1={x} y1="150" x2={x} y2="165" stroke="rgba(0,200,255,0.15)" strokeWidth="1" />
                    <text x={x} y="175" textAnchor="middle" fill="rgba(0,200,255,0.25)" fontSize="8" fontFamily="JetBrains Mono">{f}c</text>
                  </g>
                )
              })}

              {/* Stat annotations floating above wing */}
              {showStats && [
                { x: 180, y: 30,  label: 'Low pressure zone', anchor: 'middle' },
                { x: 460, y: 22,  label: 'Peak suction',      anchor: 'middle' },
                { x: 680, y: 38,  label: 'Pressure recovery', anchor: 'middle' },
              ].map(({ x, y, label, anchor }, i) => (
                <g key={label} className="fade-up" style={{ animationDelay: `${i * 0.15}s` }}>
                  <line x1={x} y1={y + 8} x2={x} y2="52" stroke="rgba(0,200,255,0.2)" strokeWidth="1" strokeDasharray="3 3" />
                  <text x={x} y={y} textAnchor={anchor} fill="rgba(0,200,255,0.4)" fontSize="8.5" fontFamily="JetBrains Mono">{label}</text>
                </g>
              ))}
            </svg>
          </div>

          {/* ── Title ── */}
          <div style={{ marginBottom: '12px', lineHeight: 1 }}>
            {showTitle && (
              <h1 style={{ margin: 0, padding: 0, display: 'flex', gap: '2px', justifyContent: 'center' }}>
                {LETTERS.map((l, i) => (
                  <span
                    key={i}
                    className="intro-letter"
                    style={{
                      fontFamily: 'Syne, sans-serif',
                      fontSize: 'clamp(3.5rem, 10vw, 7rem)',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      animationDelay: `${i * 0.07}s`,
                      background: i < 4
                        ? 'linear-gradient(135deg, #00c8ff 0%, #00e5cc 100%)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(200,210,230,0.85) 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      filter: i < 4 ? 'drop-shadow(0 0 20px rgba(0,200,255,0.4))' : 'none',
                    }}
                  >
                    {l}
                  </span>
                ))}
              </h1>
            )}
          </div>

          {/* Tagline */}
          {showTitle && (
            <p className="fade-up" style={{
              animationDelay: '0.6s',
              fontFamily: 'Outfit, sans-serif',
              fontSize: 'clamp(0.85rem, 2vw, 1.05rem)',
              fontWeight: 400,
              color: 'rgba(170,185,210,0.7)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: '28px',
            }}>
              AI Aerodynamic Design Optimization
            </p>
          )}

          {/* Stats row */}
          {showStats && (
            <div style={{ display: 'flex', gap: '40px', marginBottom: '36px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {STATS.map(({ value, label }, i) => (
                <div
                  key={label}
                  className="stat-item"
                  style={{ animationDelay: `${i * 0.12}s`, textAlign: 'center' }}
                >
                  <div style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #00c8ff, #00e5cc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 0 12px rgba(0,200,255,0.3))',
                  }}>
                    {value}
                  </div>
                  <div style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.62rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'rgba(99,104,128,0.9)',
                    marginTop: '4px',
                  }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          {showBy && (
            <div className="fade-up" style={{ animationDelay: '0s', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', width: '100%', maxWidth: '360px' }}>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(0,200,255,0.25))' }} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: 'rgba(99,104,128,0.6)', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Designed &amp; Built by
              </span>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(0,200,255,0.25))' }} />
            </div>
          )}

          {/* Author */}
          {showBy && (
            <div className="fade-up" style={{ animationDelay: '0.15s', marginBottom: '44px', textAlign: 'center' }}>
              <p style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 'clamp(1.3rem, 3.5vw, 1.75rem)',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.06em',
                margin: 0,
              }}>
                Zenith Mesa
              </p>
            </div>
          )}

          {/* CTA */}
          {showCta && (
            <div className="fade-up" style={{ animationDelay: '0s' }}>
              <button className="intro-cta" onClick={handleEnter}>
                Enter Studio&nbsp;&nbsp;→
              </button>
            </div>
          )}
        </div>

        {/* Bottom scrolling ticker */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          borderTop: '1px solid rgba(0,200,255,0.07)',
          padding: '8px 0',
          overflow: 'hidden',
          background: 'rgba(0,200,255,0.02)',
        }}>
          <div style={{
            display: 'flex', gap: '60px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.6rem',
            color: 'rgba(0,200,255,0.25)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            animation: 'tickerScroll 20s linear infinite',
            width: 'max-content',
          }}>
            {[...Array(4)].flatMap(() => [
              'NACA 4412 Inverted',
              '✦',
              'Glauert Thin-Airfoil Theory',
              '✦',
              'Thwaites Boundary-Layer Method',
              '✦',
              'Latin Hypercube Sampling',
              '✦',
              'XGBoost · Gaussian Process · MLP',
              '✦',
              'NSGA-II Multi-Objective',
              '✦',
              'Flask REST API · React 18 · Vite',
              '✦',
            ]).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
