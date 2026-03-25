// src/pages/Sensitivity.jsx
import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts'
import { api } from '../api/client'
import { Spinner, SectionTitle, ChartTooltip, InfoTooltip, BeginnerTip, LoadingPage } from '../components/ui'

const PARAMS = ['aoa_deg','flap_angle_deg','camber_pct','thickness_pct','aspect_ratio','flap_chord_pct','camber_pos_pct','endplate_h_pct']
const PARAM_LABELS = {
  aoa_deg: 'Angle of Attack', flap_angle_deg: 'Flap Angle', camber_pct: 'Camber',
  thickness_pct: 'Thickness', aspect_ratio: 'Aspect Ratio', flap_chord_pct: 'Flap Chord',
  camber_pos_pct: 'Camber Position', endplate_h_pct: 'Endplate Height',
}
const PARAM_UNITS = {
  aoa_deg: '°', flap_angle_deg: '°', camber_pct: '%', thickness_pct: '%',
  aspect_ratio: '', flap_chord_pct: '%', camber_pos_pct: '%', endplate_h_pct: '%',
}
const PARAM_DESCS = {
  aoa_deg:       'Changing the angle of attack has the biggest single effect — it\'s the primary downforce lever.',
  flap_angle_deg:'Flap deflection is the second most powerful control, effectively adding camber.',
  camber_pct:    'Increasing camber continuously increases downforce up to the stall point.',
  thickness_pct: 'Thickness has a moderate effect — too thin adds fragility, too thick adds drag.',
  aspect_ratio:  'Higher AR reduces induced drag but adds structural weight.',
  flap_chord_pct:'A larger flap multiplies the effect of flap deflection.',
  camber_pos_pct:'Shifts where the pressure peak sits — mostly affects stall character.',
  endplate_h_pct:'Taller endplates reduce tip losses — useful for high-downforce setups.',
}

export default function SensitivityPage() {
  const [allData, setAllData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive]   = useState('aoa_deg')

  useEffect(() => {
    api.sensitivityAll(15)
      .then(setAllData).catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingPage label="Running sensitivity analysis across all parameters…" />

  const curr = allData?.[active]
  const chartData = curr ? curr.values.map((v, i) => ({
    param:      parseFloat(v.toFixed(2)),
    downforce:  Math.abs(curr.downforce[i]),
    drag:       curr.drag[i],
    efficiency: curr.efficiency[i],
  })) : []

  const tornado = PARAMS.map(p => {
    const d = allData?.[p]
    if (!d) return { param: p, range: 0 }
    return {
      param: p,
      label: PARAM_LABELS[p],
      unit:  PARAM_UNITS[p],
      range: parseFloat((Math.max(...d.efficiency) - Math.min(...d.efficiency)).toFixed(2)),
    }
  }).sort((a, b) => b.range - a.range)

  const maxRange = tornado[0]?.range ?? 1

  return (
    <div className="animate-fade-in">
      <SectionTitle
        step={5}
        sub="Change one parameter at a time while holding all others at baseline values to measure each parameter's individual effect on aerodynamic performance."
      >
        Sensitivity Analysis
      </SectionTitle>

      <BeginnerTip icon="📊">
        <strong>What is sensitivity analysis?</strong> We want to know which design parameters matter most. This page answers that by changing one parameter at a time across its full range, measuring how much the wing's efficiency changes. A large range = that parameter is a "high-leverage" design variable.
      </BeginnerTip>

      <div className="grid grid-cols-12 gap-5 mt-5">

        {/* Tornado chart */}
        <div className="col-span-4 card p-5">
          <div className="flex items-center gap-1 mb-2">
            <span className="label">Parameter leverage ranking</span>
            <InfoTooltip text="Ranked by how much each parameter can change the wing's efficiency when swept across its full range. A longer bar = that parameter has more influence. Click any bar to explore it in detail." wide />
          </div>
          <p className="text-[11px] text-carbon-600 font-mono mb-4">Sorted by efficiency range. Click a row to see its effect curve →</p>

          <div className="flex flex-col gap-1.5">
            {tornado.map(({ param, label, unit, range }, idx) => {
              const isActive = active === param
              const barPct = (range / maxRange) * 100
              return (
                <button
                  key={param}
                  onClick={() => setActive(param)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl transition-all text-left group ${
                    isActive
                      ? 'bg-neon-blue/8 border border-neon-blue/20'
                      : 'hover:bg-carbon-800/60 border border-transparent'
                  }`}
                >
                  {/* Rank */}
                  <span className={`text-[10px] font-mono font-bold w-4 flex-shrink-0 ${isActive ? 'neon-text-blue' : 'text-carbon-600'}`}>
                    {idx + 1}
                  </span>
                  {/* Label */}
                  <span className={`text-xs font-mono w-24 truncate flex-shrink-0 ${isActive ? 'text-white font-semibold' : 'text-carbon-400 group-hover:text-carbon-300'}`}>
                    {label}
                  </span>
                  {/* Bar */}
                  <div className="flex-1 progress-track">
                    <div
                      className={`progress-fill transition-all duration-300 ${isActive ? 'bg-neon-blue' : 'bg-carbon-500 group-hover:bg-carbon-400'}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  {/* Value */}
                  <span className={`text-[11px] font-mono w-10 text-right flex-shrink-0 ${isActive ? 'neon-text-blue font-semibold' : 'text-carbon-500'}`}>
                    {range.toFixed(1)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-carbon-600 font-mono mt-3 leading-relaxed">
            Numbers show max − min efficiency range across the parameter's full sweep.
          </p>
        </div>

        {/* Detail charts */}
        <div className="col-span-8 flex flex-col gap-4">

          {/* Main chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <span className="label">{PARAM_LABELS[active]} — effect on aerodynamics</span>
                <InfoTooltip text={`This chart sweeps ${PARAM_LABELS[active]} across its full range while all other parameters stay at baseline values. Blue = downforce, amber = drag, green = efficiency (the key metric). The optimal value is where efficiency peaks.`} wide />
              </div>
              <span className="badge badge-blue">{curr?.unit || PARAM_UNITS[active]}</span>
            </div>
            <p className="text-[11px] text-carbon-500 font-mono mb-4">{PARAM_DESCS[active]}</p>

            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="2 4" />
                <XAxis dataKey="param"
                  tickFormatter={v => `${v}${PARAM_UNITS[active]}`}
                  tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
                <YAxis yAxisId="df"  orientation="left"  tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
                <YAxis yAxisId="eff" orientation="right" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
                <Tooltip content={<ChartTooltip />} />
                <Line yAxisId="df"  dataKey="downforce"  stroke="#4facfe" strokeWidth={2}   dot={false} name="|Downforce| N"  activeDot={{ r: 5 }} />
                <Line yAxisId="df"  dataKey="drag"       stroke="#f9a825" strokeWidth={1.5} dot={false} name="Drag N"         activeDot={{ r: 4 }} />
                <Line yAxisId="eff" dataKey="efficiency" stroke="#43e97b" strokeWidth={2}   dot={false} name="Efficiency"      activeDot={{ r: 5 }} strokeDasharray="none" />
              </LineChart>
            </ResponsiveContainer>

            {/* Chart legend */}
            <div className="flex gap-6 mt-3 justify-center">
              {[
                { color: '#4facfe', label: '|Downforce| (N) — left axis' },
                { color: '#f9a825', label: 'Drag (N) — left axis' },
                { color: '#43e97b', label: 'Efficiency — right axis' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 rounded" style={{ background: color }} />
                  <span className="text-[11px] font-mono text-carbon-500">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mini sparkline grid for other parameters */}
          <div>
            <p className="text-xs font-mono text-carbon-500 mb-3">Other parameters — click to explore</p>
            <div className="grid grid-cols-4 gap-2">
              {PARAMS.filter(p => p !== active).map(p => {
                const d = allData?.[p]
                if (!d) return null
                const minE = Math.min(...d.efficiency), maxE = Math.max(...d.efficiency)
                const range = (maxE - minE).toFixed(1)
                const mini = d.values.map((v, i) => ({ v, eff: d.efficiency[i] }))

                return (
                  <button key={p} onClick={() => setActive(p)}
                    className="card-sm p-3 hover:border-carbon-500/60 hover:bg-carbon-700/20 transition-all text-left group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono text-carbon-400 group-hover:text-carbon-300 transition-colors">{PARAM_LABELS[p]}</span>
                      <span className="text-[10px] font-mono text-carbon-600">±{range}</span>
                    </div>
                    <svg width="100%" height="32" viewBox="0 0 100 32">
                      <defs>
                        <linearGradient id={`grad-${p}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#4facfe" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#43e97b" stopOpacity="0.8" />
                        </linearGradient>
                      </defs>
                      {mini.map((pt, i) => {
                        if (i === 0) return null
                        const prev = mini[i - 1]
                        const x1 = ((i - 1) / (mini.length - 1)) * 100
                        const x2 = (i / (mini.length - 1)) * 100
                        const y1 = 32 - ((prev.eff - minE) / (maxE - minE + 0.001)) * 28
                        const y2 = 32 - ((pt.eff - minE)  / (maxE - minE + 0.001)) * 28
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#grad-${p})`} strokeWidth="1.5" />
                      })}
                    </svg>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
