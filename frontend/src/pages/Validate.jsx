// src/pages/Validate.jsx
import React, { useState, useEffect } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts'
import { ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import { Spinner, SectionTitle, MetricCard, StatusBadge, ErrorBox, InfoTooltip, BeginnerTip, LoadingPage, ProgressBar, FidelityBadge } from '../components/ui'

export default function ValidatePage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError]     = useState('')
  const [selected, setSel]    = useState(null)

  useEffect(() => {
    api.validateResults()
      .then(d => { setData(d); setSel(d.validated_designs[0]) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const runValidation = async () => {
    setRunning(true); setError('')
    try {
      const res = await api.validate(10)
      setData(res)
      setSel(res.validated_designs[0])
    } catch (e) { setError(e.message) }
    setRunning(false)
  }

  if (loading) return <LoadingPage label="Loading validation results…" />

  const designs  = data?.validated_designs ?? []
  const summary  = data?.summary ?? {}
  const baseline = data?.baseline ?? {}

  const scatterDF = designs.map(d => ({
    physics: Math.abs(d.physics?.downforce_N ?? 0),
    ml:      Math.abs(d.ml_prediction?.downforce_N ?? 0),
    rank: d.rank,
  }))

  return (
    <div className="animate-fade-in">
      <SectionTitle
        step={4}
        sub="Top Pareto-front designs are re-evaluated using the L0 conceptual physics solver to verify surrogate predictions. For higher fidelity, use the Hybrid Pipeline (Step 3) with L1 2D CFD validation."
      >
        Physics Validation
      </SectionTitle>

      <div className="flex items-center gap-2 mb-3">
        <FidelityBadge level={0} label="L0 Conceptual Screening" trust="moderate" />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#636880' }}>
          Panel/BL physics · ±15–25% uncertainty · fast screening only
        </span>
      </div>

      <BeginnerTip icon="🔬">
        <strong>Why validate?</strong> The ML surrogates are fast but approximate. Re-running top designs through the L0 physics solver confirms predictions are in the right range. For engineering decisions, use the Hybrid Pipeline (Step 3) to promote shortlisted designs to L1 2D RANS CFD validation.
      </BeginnerTip>

      <div className="flex items-center gap-4 mt-4 mb-4">
        <button onClick={runValidation} disabled={running} className="btn-primary" data-magnetic>
          {running ? <Spinner size={14} /> : <ShieldCheck size={14} />}
          {running ? 'Running L0 validation…' : 'Re-run L0 Validation'}
        </button>
        <span className="text-xs text-carbon-400 font-mono">
          Runs top 10 Pareto designs through the L0 panel/BL solver (~10s). Results are conceptual estimates, not CFD.
        </span>
      </div>

      <ErrorBox message={error} />

      {data && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-4 gap-4 mb-5 stagger">
            <MetricCard
              label="Downforce prediction error" value={`${summary.mape_downforce?.toFixed(1)}%`}
              color={summary.mape_downforce < 5 ? 'green' : 'amber'}
              tooltip="Mean Absolute Percentage Error on downforce predictions. Under 5% is excellent — it means the ML model's downforce predictions were within 5% of the real physics answer."
            />
            <MetricCard
              label="Drag prediction error" value={`${summary.mape_drag?.toFixed(1)}%`}
              color={summary.mape_drag < 5 ? 'green' : 'amber'}
              tooltip="Mean Absolute Percentage Error on drag predictions. The ML model is slightly less accurate on drag than downforce, which is expected as drag involves more complex phenomena."
            />
            <MetricCard
              label="Best downforce found" value={`${Math.abs(summary.best_downforce_N ?? 0).toFixed(0)}`} unit="N" color="blue"
              tooltip="The highest downforce confirmed by the physics solver among all validated designs. This is the real, physics-verified value — not just an ML prediction."
            />
            <MetricCard
              label="Efficiency gain vs baseline" value={`+${summary.best_improvement_pct?.toFixed(1)}%`} color="green"
              tooltip="How much better the best optimized design is compared to the stock baseline wing, as measured by the efficiency metric (|Downforce|/Drag)."
            />
          </div>

          <div className="grid grid-cols-12 gap-4">

            {/* Ranked design list */}
            <div className="col-span-5 card p-5">
              <div className="flex items-center gap-1 mb-4">
                <span className="label">Top 10 validated designs</span>
                <InfoTooltip text="These are the top Pareto-front designs, now re-evaluated by the physics solver. Click any design to see the detailed side-by-side comparison of ML prediction vs physics truth." />
              </div>
              <div className="flex flex-col gap-2">
                {designs.map(d => {
                  const isSel = selected?.rank === d.rank
                  const phys  = d.physics
                  const eff   = phys?.efficiency ?? 0
                  const blEff = baseline?.efficiency ?? 1
                  const imp   = ((eff - blEff) / Math.abs(blEff)) * 100
                  return (
                    <button
                      key={d.rank}
                      onClick={() => setSel(d)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isSel
                          ? 'border-neon-blue/40 bg-neon-blue/5 card-glow-blue'
                          : 'border-carbon-700/60 bg-carbon-800/30 hover:border-carbon-500/60 hover:bg-carbon-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono font-bold ${isSel ? 'neon-text-blue' : 'text-carbon-400'}`}>#{d.rank}</span>
                          <StatusBadge ok={phys?.converged && !phys?.stall} label={phys?.stall ? 'Stall' : 'OK'} />
                        </div>
                        <span className={`text-xs font-mono font-semibold ${imp > 0 ? 'neon-text-green' : 'text-carbon-400'}`}>
                          {imp > 0 ? '+' : ''}{imp.toFixed(1)}% eff
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs font-mono">
                        <span><span className="text-carbon-500">DF</span> <span className="neon-text-blue font-medium">{phys?.downforce_N?.toFixed(0)} N</span></span>
                        <span><span className="text-carbon-500">Drag</span> <span className="text-white">{phys?.drag_N?.toFixed(1)} N</span></span>
                        <span><span className="text-carbon-500">Eff</span> <span className="text-white">{eff.toFixed(2)}</span></span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: charts + detail */}
            <div className="col-span-7 flex flex-col gap-4">

              {/* ML vs Physics scatter */}
              <div className="card p-5">
                <div className="flex items-center gap-1 mb-2">
                  <span className="label">ML prediction accuracy — downforce</span>
                  <InfoTooltip text="Each dot is one validated design. The X-axis is the actual physics result; the Y-axis is what the ML model predicted. Points on the dashed diagonal line = perfect predictions. Points clustered near the line = high accuracy." wide />
                </div>
                <p className="text-[11px] text-carbon-500 font-mono mb-4">
                  Points near the dashed line = accurate ML predictions. Mean error: <strong className="neon-text-green">{summary.mape_downforce?.toFixed(1)}%</strong>
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 4" />
                    <XAxis dataKey="physics" name="Physics |DF|"
                      label={{ value: 'Physics solver (N) — truth', position: 'insideBottom', offset: -12, fill: '#6e7681', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <YAxis dataKey="ml" name="ML |DF|"
                      label={{ value: 'ML prediction (N)', angle: -90, position: 'insideLeft', fill: '#6e7681', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                      <div className="card-sm p-3 text-xs font-mono">
                        <div className="font-semibold text-white mb-1.5">Design #{payload[0]?.payload?.rank}</div>
                        <div className="flex justify-between gap-4"><span className="text-carbon-400">Physics</span><span className="neon-text-green">{payload[0]?.payload?.physics?.toFixed(0)} N</span></div>
                        <div className="flex justify-between gap-4"><span className="text-carbon-400">ML pred</span><span className="neon-text-blue">{payload[0]?.payload?.ml?.toFixed(0)} N</span></div>
                        <div className="flex justify-between gap-4"><span className="text-carbon-400">Error</span>
                          <span className={Math.abs(((payload[0]?.payload?.ml - payload[0]?.payload?.physics) / payload[0]?.payload?.physics) * 100) < 5 ? 'neon-text-green' : 'neon-text-amber'}>
                            {(((payload[0]?.payload?.ml - payload[0]?.payload?.physics) / payload[0]?.payload?.physics) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ) : null} />
                    <ReferenceLine stroke="#30363d" strokeDasharray="5 4"
                      segment={[{ x: 0, y: 0 }, { x: 800, y: 800 }]}
                      label={{ value: 'perfect prediction', fill: '#484f58', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Scatter data={scatterDF} fill="#4facfe" opacity={0.85} r={5} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Selected design comparison */}
              {selected && (
                <div className="card p-5 animate-slide-in">
                  <div className="flex items-center justify-between mb-4">
                    <span className="label">Design #{selected.rank} — side-by-side comparison</span>
                    <InfoTooltip text="Left column shows values calculated by the physics solver (ground truth). Right column shows what the ML model predicted. Percentage errors in green/amber show how close the ML was." />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-neon-green" />
                        <span className="text-xs font-mono font-semibold neon-text-green">L0 PHYSICS (conceptual)</span>
                      </div>
                      {[
                        ['Downforce', selected.physics?.downforce_N?.toFixed(1), 'N'],
                        ['Drag',      selected.physics?.drag_N?.toFixed(2),      'N'],
                        ['Efficiency',selected.physics?.efficiency?.toFixed(3),   ''],
                        ['Cl (2D)',   selected.physics?.Cl?.toFixed(4),           ''],
                        ['Cd (3D)',   selected.physics?.Cd_3d?.toFixed(5),        ''],
                      ].map(([k, v, u]) => (
                        <div key={k} className="flex justify-between py-2 border-b border-carbon-700/40 last:border-0 text-xs font-mono">
                          <span className="text-carbon-400">{k}</span>
                          <span className="text-white font-medium">{v} <span className="text-carbon-600">{u}</span></span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-neon-blue" />
                        <span className="text-xs font-mono font-semibold neon-text-blue">ML PREDICTION</span>
                      </div>
                      {[
                        ['Downforce',   selected.ml_prediction?.downforce_N?.toFixed(1), 'N',  'downforce_N'],
                        ['Drag',        selected.ml_prediction?.drag_N?.toFixed(2),      'N',  'drag_N'],
                        ['Efficiency',  selected.ml_prediction?.efficiency?.toFixed(3),   '',   'efficiency'],
                        ['Reliability', `${((selected.ml_prediction?.reliability ?? 0) * 100).toFixed(1)}%`, '', null],
                      ].map(([k, v, u, resKey]) => (
                        <div key={k} className="flex justify-between items-center py-2 border-b border-carbon-700/40 last:border-0 text-xs font-mono">
                          <span className="text-carbon-400">{k}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{v} <span className="text-carbon-600">{u}</span></span>
                            {resKey && selected.residuals_pct?.[resKey] !== undefined && (
                              <span className={`text-[11px] font-semibold ${Math.abs(selected.residuals_pct[resKey]) < 5 ? 'neon-text-green' : 'neon-text-amber'}`}>
                                ({selected.residuals_pct[resKey] > 0 ? '+' : ''}{selected.residuals_pct[resKey].toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* vs baseline */}
                  {selected.vs_baseline && (
                    <div className="mt-4 pt-4 border-t border-carbon-700/40">
                      <div className="flex items-center gap-1 mb-3">
                        <span className="text-xs font-mono text-carbon-400">vs Baseline wing (NACA 4412 inverted)</span>
                        <InfoTooltip text="The baseline is a standard NACA 4412 inverted airfoil with default settings. These percentages show how much the optimized design improves on it." />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { k: 'downforce_pct', label: 'Downforce' },
                          { k: 'drag_pct',      label: 'Drag' },
                          { k: 'efficiency_pct',label: 'Efficiency' },
                        ].map(({ k, label }) => {
                          const v = selected.vs_baseline[k]
                          const pos = v > 0
                          return (
                            <div key={k} className="text-center">
                              <div className={`text-2xl font-mono font-bold ${pos ? 'neon-text-green' : 'neon-text-red'}`}>
                                {pos ? '+' : ''}{v?.toFixed(1)}%
                              </div>
                              <div className="text-xs text-carbon-500 font-mono">{label}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
