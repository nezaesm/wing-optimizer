// src/pages/Dataset.jsx
import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { api } from '../api/client'
import { Spinner, SectionTitle, MetricCard, ChartTooltip, InfoTooltip, BeginnerTip, LoadingPage } from '../components/ui'

const PARAM_LABELS = {
  camber_pct: 'Camber (%)', camber_pos_pct: 'Camber pos (%)', thickness_pct: 'Thickness (%)',
  aoa_deg: 'Angle of Attack (°)', flap_angle_deg: 'Flap Angle (°)', flap_chord_pct: 'Flap Chord (%)',
  aspect_ratio: 'Aspect Ratio', endplate_h_pct: 'Endplate Height (%)',
}

export default function DatasetPage() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.datasetStats().then(setStats).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingPage label="Loading dataset statistics…" />
  if (!stats) return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <span className="text-4xl opacity-30">🗄️</span>
      <p className="text-white font-medium">No dataset found</p>
      <p className="text-sm text-carbon-400">Run <code className="font-mono bg-carbon-800 px-1.5 py-0.5 rounded">python batch_evaluator.py</code> in the backend to generate the training dataset.</p>
    </div>
  )

  const s = stats.stats

  const distData = ['downforce_N', 'drag_N', 'efficiency'].map(k => ({
    key: k,
    label: k === 'downforce_N' ? 'Downforce (N)' : k === 'drag_N' ? 'Drag (N)' : 'Efficiency',
    mean: s[k]?.mean?.toFixed(2),
    std:  s[k]?.std?.toFixed(2),
    min:  s[k]?.min?.toFixed(2),
    max:  s[k]?.max?.toFixed(2),
    p25:  s[k]?.['25%']?.toFixed(2),
    p75:  s[k]?.['75%']?.toFixed(2),
  }))

  // Build data for bar chart of param ranges
  const paramRangeData = Object.entries(stats.param_ranges ?? {}).map(([k, v]) => ({
    name: PARAM_LABELS[k] || k.replace(/_/g, ' '),
    min: parseFloat(v.min?.toFixed(1)),
    mean: parseFloat(v.mean?.toFixed(1)),
    max: parseFloat(v.max?.toFixed(1)),
    range: parseFloat((v.max - v.min).toFixed(1)),
  }))

  return (
    <div className="animate-fade-in">
      <SectionTitle
        step={6}
        sub="The training dataset contains 1,217 wing designs, each evaluated by the physics solver. Latin Hypercube Sampling ensures even coverage across all 8 design dimensions."
      >
        Training Dataset
      </SectionTitle>

      <BeginnerTip icon="🗃️">
        <strong>How was the training data generated?</strong> We can't train AI models without data. We used <strong>Latin Hypercube Sampling (LHS)</strong> — a statistical technique that divides the 8-dimensional design space into equal probability zones and picks one sample from each, ensuring the designs are spread evenly rather than randomly clustered. Each sampled design was then evaluated by the physics solver to get its aerodynamic properties.
      </BeginnerTip>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mt-4 mb-5 stagger">
        <MetricCard label="Total designs" value={stats.n_rows?.toLocaleString()} color="blue"
          tooltip="Total number of wing designs in the training dataset, each evaluated by the physics solver." />
        <MetricCard label="Input parameters" value="8" color="cyan"
          tooltip="The 8 design variables: camber, camber position, thickness, angle of attack, flap angle, flap chord, aspect ratio, and endplate height." />
        <MetricCard label="Sampling method" value="LHS" color="cyan"
          tooltip="Latin Hypercube Sampling. Unlike random sampling, LHS guarantees that the samples are evenly distributed across each input dimension, making efficient use of the physics solver runs." />
        <MetricCard label="Physics solver" value="Glauert + BL" color="amber"
          tooltip="Custom Python implementation of Glauert thin-airfoil theory with Thwaites boundary-layer method for transition prediction. 3D finite-wing correction included. Takes ~1ms per design." />
      </div>

      {/* Output statistics table */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-1 mb-4">
          <span className="label">Output distribution statistics</span>
          <InfoTooltip text="Statistical summary of the three key aerodynamic outputs across all 1,217 designs in the dataset. Min/Q25/Mean/Q75/Max show the spread — a wide range means diverse designs, which is good for training." wide />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-carbon-700/60">
                {['Output', 'Min', 'Q25 (25%)', 'Mean', 'Q75 (75%)', 'Max', 'Std Dev'].map((h, i) => (
                  <th key={h} className={`text-carbon-400 pb-3 pr-4 font-medium uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {distData.map((row, ri) => {
                const colors = ['neon-text-blue', 'neon-text-amber', 'neon-text-green']
                return (
                  <tr key={row.key} className="border-b border-carbon-700/30 hover:bg-carbon-700/15 transition-colors last:border-0">
                    <td className={`py-3 pr-4 font-semibold ${colors[ri]}`}>{row.label}</td>
                    {[row.min, row.p25, row.mean, row.p75, row.max, row.std].map((v, i) => (
                      <td key={i} className={`py-3 pr-4 text-right ${i === 2 ? 'text-white font-semibold' : 'text-carbon-300'}`}>{v}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-carbon-600 font-mono mt-3">Q25 = 25th percentile (lower quartile). Q75 = 75th percentile (upper quartile). Std = standard deviation (spread).</p>
      </div>

      {/* Parameter coverage */}
      <div className="card p-5">
        <div className="flex items-center gap-1 mb-4">
          <span className="label">Input parameter coverage</span>
          <InfoTooltip text="How well each input parameter is covered by the dataset. Good coverage (mean near the centre of min–max range) means the ML models can interpolate confidently across the full design space." wide />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(stats.param_ranges ?? {}).map(([k, v]) => {
            const pct = ((v.mean - v.min) / (v.max - v.min + 0.001)) * 100
            return (
              <div key={k} className="card-sm p-4 hover:border-carbon-500/60 transition-all">
                <div className="text-[11px] font-mono text-carbon-400 mb-3">{PARAM_LABELS[k] || k.replace(/_/g, ' ')}</div>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-carbon-600">{v.min?.toFixed(1)}</span>
                  <span className="text-white font-semibold">{v.mean?.toFixed(1)}</span>
                  <span className="text-carbon-600">{v.max?.toFixed(1)}</span>
                </div>
                <div className="progress-track">
                  {/* Mean position marker */}
                  <div className="h-full bg-neon-blue/40 rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="progress-track mt-0.5">
                  <div className="h-full bg-neon-blue rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-mono text-carbon-600">min</span>
                  <span className="text-[10px] font-mono text-neon-blue">mean</span>
                  <span className="text-[10px] font-mono text-carbon-600">max</span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-carbon-600 font-mono mt-4">
          The blue bar shows the mean position within the min–max range. Centered means are ideal — the dataset samples the middle of the design space evenly.
        </p>
      </div>
    </div>
  )
}
