// src/components/ui.jsx — shared primitive components

import React, { useState } from 'react'
import { Loader2, HelpCircle, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react'

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} style={{ color: 'var(--arc)' }} />
}

// ── InfoTooltip — hover ? icon with plain-English explanation ─────────────────
export function InfoTooltip({ text, wide = false }) {
  return (
    <div className="tooltip-trigger cursor-help ml-1">
      <HelpCircle size={12} style={{ color: '#3e4257', transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = '#636880'}
        onMouseLeave={e => e.currentTarget.style.color = '#3e4257'}
      />
      <div className={`tooltip-bubble ${wide ? '!w-72' : ''}`}>{text}</div>
    </div>
  )
}

// ── BeginnerTip — contextual callout for newcomers ────────────────────────────
export function BeginnerTip({ children, icon = '💡' }) {
  return (
    <div className="tip-box flex gap-3">
      <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
      <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem', color: '#a8b2c8', lineHeight: 1.65 }}>
        {children}
      </p>
    </div>
  )
}

// ── MetricCard ────────────────────────────────────────────────────────────────
export function MetricCard({ label, value, unit = '', delta, color = 'blue', small = false, tooltip, icon: Icon }) {
  const colorVars = {
    blue:  'var(--arc)',
    green: 'var(--phosphor)',
    amber: 'var(--ember)',
    red:   'var(--signal)',
    cyan:  'var(--teal)',
    white: '#ffffff',
  }
  const glowColors = {
    blue:  'rgba(0,200,255,0.12)',
    green: 'rgba(57,255,136,0.12)',
    amber: 'rgba(255,176,32,0.12)',
    red:   'rgba(255,61,90,0.12)',
    cyan:  'rgba(0,229,204,0.12)',
    white: 'transparent',
  }
  const c = colorVars[color] || colorVars.blue
  const g = glowColors[color] || 'transparent'
  const deltaPositive = delta !== undefined && delta >= 0
  const deltaZero     = delta !== undefined && Math.abs(delta) < 0.05

  return (
    <div
      className="metric-card group"
      style={{ '--metric-glow': g }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="metric-label">{label}</span>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        {Icon && <Icon size={13} style={{ color: '#3e4257' }} />}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: small ? '1.2rem' : '1.45rem',
          fontWeight: 600,
          color: c,
          textShadow: `0 0 20px ${g}`,
        }}>
          {value ?? '—'}
        </span>
        {unit && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#636880' }}>
            {unit}
          </span>
        )}
      </div>
      {delta !== undefined && !deltaZero && (
        <div className="flex items-center gap-1 mt-1" style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.7rem',
          color: deltaPositive ? 'var(--phosphor)' : 'var(--signal)',
        }}>
          {deltaPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {deltaPositive ? '+' : ''}{delta.toFixed(1)}% vs baseline
        </div>
      )}
      {delta !== undefined && deltaZero && (
        <div className="flex items-center gap-1 mt-1" style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#636880',
        }}>
          <Minus size={10} /> No change vs baseline
        </div>
      )}
    </div>
  )
}

// ── AccordionGroup — collapsible parameter section ────────────────────────────
export function AccordionGroup({ title, icon: Icon, children, tooltip, defaultOpen = true, summary }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="accordion-group">
      <button className="accordion-header" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon size={13} style={{ color: open ? 'var(--arc)' : '#636880', transition: 'color 0.2s' }} />
          )}
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.65rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            color: open ? '#a8b2c8' : '#636880',
            transition: 'color 0.2s',
          }}>
            {title}
          </span>
          {tooltip && <InfoTooltip text={tooltip} wide />}
        </div>
        <div className="flex items-center gap-2">
          {!open && summary && (
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.65rem',
              color: '#3e4257',
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {summary}
            </span>
          )}
          <ChevronDown
            size={14}
            style={{
              color: '#636880',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s cubic-bezier(0.23,1,0.32,1)',
            }}
          />
        </div>
      </button>

      {open && (
        <div className="accordion-content">
          {children}
        </div>
      )}
    </div>
  )
}

// ── ParamSlider ───────────────────────────────────────────────────────────────
export function ParamSlider({ label, name, min, max, step = 0.1, value, unit, onChange, description, tooltip }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <label style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem', color: '#a8b2c8', fontWeight: 500 }}>
            {label}
          </label>
          {tooltip && <InfoTooltip text={tooltip} wide />}
        </div>
        <div className="flex items-baseline gap-1">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>
            {value.toFixed(step < 1 ? 1 : 0)}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#636880' }}>{unit}</span>
        </div>
      </div>
      <div className="relative">
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(name, parseFloat(e.target.value))}
          className="slider-track w-full"
          style={{
            background: `linear-gradient(to right, var(--arc) ${pct}%, rgba(255,255,255,0.07) ${pct}%)`,
          }}
        />
        <div className="flex justify-between mt-1">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#3e4257' }}>{min}{unit}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#3e4257' }}>{max}{unit}</span>
        </div>
      </div>
      {description && (
        <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.75rem', color: '#636880', lineHeight: 1.5, marginTop: '-4px' }}>
          {description}
        </p>
      )}
    </div>
  )
}

// ── ParamGroup — labelled section of sliders (non-collapsible version) ─────────
export function ParamGroup({ title, icon: Icon, children, tooltip }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {Icon && <Icon size={13} style={{ color: '#636880' }} />}
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.10em', color: '#636880' }}>
          {title}
        </span>
        {tooltip && <InfoTooltip text={tooltip} wide />}
      </div>
      {children}
    </div>
  )
}

// ── WingCanvas — pure SVG 2D cross-section ────────────────────────────────────
export function WingCanvas({ geometry, height = 180 }) {
  if (!geometry) return (
    <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: '#3e4257' }}>
      <svg width="40" height="20" viewBox="0 0 40 20" opacity="0.4">
        <path d="M2 16 Q8 4 20 2 Q32 2 38 9 L38 12 Q32 8 20 6 Q8 8 2 18 Z"
          fill="none" stroke="var(--arc)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#3e4257' }}>
        Adjust parameters to preview wing
      </span>
    </div>
  )

  const { x_upper, y_upper, x_lower, y_lower, x_camber, y_camber } = geometry
  const W = 560, H = height
  const pad = 28
  const mapX = x => pad + x * (W - pad * 2)
  const mapY = y => H / 2 - y * (H - pad * 2) * 5

  const upper  = x_upper.map((x, i) => `${mapX(x)},${mapY(y_upper[i])}`).join(' ')
  const lower  = x_lower.map((x, i) => `${mapX(x)},${mapY(y_lower[i])}`).join(' ')
  const camber = x_camber.map((x, i) => `${mapX(x)},${mapY(y_camber[i])}`).join(' ')
  const outerPath = `M ${upper} L ${lower.split(' ').reverse().join(' ')} Z`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id="wingFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00c8ff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#00e5cc" stopOpacity="0.03" />
        </linearGradient>
        <filter id="wingLineGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" />
        </filter>
      </defs>

      {/* Subtle grid */}
      {[0.25, 0.5, 0.75].map(x => (
        <line key={x} x1={mapX(x)} y1={pad - 4} x2={mapX(x)} y2={H - pad + 4}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3 4"/>
      ))}
      <line x1={pad - 4} y1={H/2} x2={W - pad + 4} y2={H/2}
        stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3 4"/>

      {/* Wing fill */}
      <path d={outerPath} fill="url(#wingFill)" />

      {/* Upper surface glow */}
      <polyline points={upper} fill="none" stroke="#00c8ff" strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.15"/>
      {/* Upper surface line */}
      <polyline points={upper} fill="none" stroke="#00c8ff" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 3px rgba(0,200,255,0.6))' }}/>

      {/* Lower surface */}
      <polyline points={lower} fill="none" stroke="#00e5cc" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>

      {/* Camber line */}
      <polyline points={camber} fill="none" stroke="#ffb020" strokeWidth="1"
        strokeDasharray="5 4" opacity="0.55"/>

      {/* Labels */}
      <text x={mapX(0) - 6} y={H/2} textAnchor="end" fill="#00c8ff" fontSize="9"
        fontFamily="JetBrains Mono" dominantBaseline="middle" opacity="0.7">LE</text>
      <text x={mapX(1) + 6} y={H/2} textAnchor="start" fill="#00c8ff" fontSize="9"
        fontFamily="JetBrains Mono" dominantBaseline="middle" opacity="0.7">TE</text>
      {[0.25, 0.5, 0.75].map(x => (
        <text key={x} x={mapX(x)} y={H - pad + 14} textAnchor="middle"
          fill="#3e4257" fontSize="8" fontFamily="JetBrains Mono">{x}c</text>
      ))}

      {/* Legend */}
      <g opacity="0.7">
        <line x1={W - 110} y1={H - 10} x2={W - 94} y2={H - 10} stroke="#00c8ff" strokeWidth="2"/>
        <text x={W - 90} y={H - 10} fill="#636880" fontSize="8" fontFamily="JetBrains Mono" dominantBaseline="middle">upper</text>
        <line x1={W - 110} y1={H - 1}  x2={W - 94} y2={H - 1}  stroke="#00e5cc" strokeWidth="1.5"/>
        <text x={W - 90} y={H - 1}  fill="#636880" fontSize="8" fontFamily="JetBrains Mono" dominantBaseline="middle">lower</text>
        <line x1={W - 110} y1={H + 8}  x2={W - 94} y2={H + 8}  stroke="#ffb020" strokeWidth="1" strokeDasharray="4 3"/>
        <text x={W - 90} y={H + 8}  fill="#636880" fontSize="8" fontFamily="JetBrains Mono" dominantBaseline="middle">camber</text>
      </g>
    </svg>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ ok, label, tooltip }) {
  return (
    <div className="tooltip-trigger">
      <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${ok ? 'status-pulse' : ''}`}
          style={{ background: ok ? 'var(--phosphor)' : 'var(--signal)' }}
        />
        {label}
      </span>
      {tooltip && <div className="tooltip-bubble">{tooltip}</div>}
    </div>
  )
}

// ── ErrorBox ──────────────────────────────────────────────────────────────────
export function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid rgba(255,61,90,0.25)',
      background: 'rgba(255,61,90,0.06)',
      padding: '14px 16px',
      display: 'flex', gap: '12px', alignItems: 'flex-start',
    }}>
      <span style={{ color: 'var(--signal)', flexShrink: 0 }}>⚠</span>
      <div>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: 'var(--signal)', fontWeight: 500 }}>
          Error
        </p>
        <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.78rem', color: '#ffaaaa', marginTop: '3px' }}>
          {message}
        </p>
      </div>
    </div>
  )
}

// ── SectionTitle ──────────────────────────────────────────────────────────────
export function SectionTitle({ children, sub, step }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        {step && (
          <span style={{
            width: '28px', height: '28px',
            borderRadius: '50%',
            border: '1px solid rgba(0,200,255,0.3)',
            background: 'rgba(0,200,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.7rem', fontWeight: 600,
            color: 'var(--arc)',
            flexShrink: 0,
          }}>
            {step}
          </span>
        )}
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.5rem', fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>
          {children}
        </h2>
      </div>
      {sub && (
        <p style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '0.88rem',
          color: '#636880',
          lineHeight: 1.65,
          marginLeft: step ? '43px' : '0',
        }}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ── DataRow ───────────────────────────────────────────────────────────────────
export function DataRow({ label, value, unit, highlight, tooltip }) {
  return (
    <div className="flex justify-between items-center py-2.5 group" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-1">
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: '#636880', transition: 'color 0.15s' }}>
          {label}
        </span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.85rem',
        fontWeight: 500,
        color: highlight ? 'var(--arc)' : '#dde2ed',
      }}>
        {value}
        {unit && <span style={{ color: '#636880', fontSize: '0.7rem', marginLeft: '4px' }}>{unit}</span>}
      </span>
    </div>
  )
}

// ── ChartTooltip ──────────────────────────────────────────────────────────────
export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0e0f17',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: '10px',
      padding: '10px 13px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {label !== undefined && (
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#636880', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {label}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {payload.map(p => (
          <div key={p.dataKey} className="flex justify-between gap-6 items-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: p.color }}>{p.name}</span>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>
              {typeof p.value === 'number' ? p.value.toFixed(3) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── LoadingPage ───────────────────────────────────────────────────────────────
export function LoadingPage({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24" style={{ color: '#636880' }}>
      <Spinner size={28} />
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>{label}</span>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon && <div style={{ fontSize: '2.5rem', opacity: 0.25 }}>{icon}</div>}
      <p style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#dde2ed' }}>{title}</p>
      {body && (
        <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem', color: '#636880', maxWidth: '340px', lineHeight: 1.65 }}>
          {body}
        </p>
      )}
      {action}
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, color = 'blue', showLabel = false }) {
  const pct = Math.min((value / max) * 100, 100)
  const colorMap = {
    blue:  'var(--arc)',
    green: 'var(--phosphor)',
    amber: 'var(--ember)',
    red:   'var(--signal)',
  }
  const c = colorMap[color] || colorMap.blue
  return (
    <div className="flex items-center gap-2">
      <div className="progress-track flex-1">
        <div
          className="progress-fill"
          style={{ width: `${pct}%`, background: c, boxShadow: `0 0 8px ${c}` }}
        />
      </div>
      {showLabel && (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#636880', width: '36px', textAlign: 'right' }}>
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  )
}
