// src/pages/Optimize.jsx
import React, { useState, useEffect } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts'
import { Play } from 'lucide-react'
import { api } from '../api/client'
import { Spinner, SectionTitle, MetricCard, ErrorBox, InfoTooltip, BeginnerTip, LoadingPage, FidelityBadge, ConstraintPanel } from '../components/ui'

export default function OptimizePage() {
  const [results, setResults]           = useState(null)
  const [hybridResults, setHybridRes]   = useState(null)
  const [loading, setLoading]           = useState(false)
  const [loadingResults, setLoadingR]   = useState(true)
  const [error, setError]               = useState('')
  const [selected, setSelected]         = useState(null)
  const [mode, setMode]                 = useState('nsga2')  // 'nsga2' | 'hybrid'
  const [config, setConfig]             = useState({ pop_size: 60, n_gen: 50 })
  const [hybridConfig, setHybridConfig] = useState({ n_init: 80, n_pareto: 15, enable_l2: false })

  useEffect(() => {
    api.optimizeResults()
      .then(setResults).catch(() => {})
      .finally(() => setLoadingR(false))
  }, [])

  const runOptimize = async () => {
    setLoading(true); setError('')
    try {
      if (mode === 'hybrid') {
        const res = await api.optimizeHybrid(hybridConfig)
        setHybridRes(res)
      } else {
        await api.optimize(config)
        const full = await api.optimizeResults()
        setResults(full)
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const pareto = results?.pareto_params    ?? []
  const preds  = results?.pareto_predictions ?? []
  const fs     = results?.pareto_F          ?? []

  const scatterData = pareto.map((p, i) => ({
    drag:       Math.abs(fs[i]?.[1] ?? preds[i]?.drag_N ?? 0),
    downforce:  Math.abs(fs[i]?.[0] ?? Math.abs(preds[i]?.downforce_N ?? 0)),
    efficiency: preds[i]?.efficiency ?? 0,
    rank: i + 1,
    params: p,
    pred: preds[i],
  })).filter(d => d.downforce > 0)

  const convData = (results?.convergence ?? []).map(c => ({
    gen: c.gen,
    bestDF:  Math.abs(c.best_downforce ?? 0),
    bestEff: c.best_efficiency ?? 0,
  }))

  const CustomDot = ({ cx, cy, payload }) => {
    const isSel = selected?.rank === payload.rank
    // Color by efficiency: high = green, low = amber
    const maxEff = Math.max(...scatterData.map(d => d.efficiency), 1)
    const t = payload.efficiency / maxEff
    const r = isSel ? 9 : 5
    return (
      <circle cx={cx} cy={cy} r={r}
        fill={isSel ? '#4facfe' : `rgba(67,233,123,${0.4 + t * 0.6})`}
        stroke={isSel ? '#00f2fe' : 'transparent'} strokeWidth={2}
        style={{ cursor: 'pointer', transition: 'r 0.15s' }}
        onClick={() => setSelected(payload)}
      />
    )
  }

  const ParetoTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="card-sm p-3 text-xs font-mono shadow-2xl">
        <div className="neon-text-blue font-semibold mb-2">Design #{d.rank}</div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between gap-4"><span className="text-carbon-400">Downforce</span><span className="text-white font-medium">{d.downforce.toFixed(0)} N</span></div>
          <div className="flex justify-between gap-4"><span className="text-carbon-400">Drag</span><span className="neon-text-amber font-medium">{d.drag.toFixed(1)} N</span></div>
          <div className="flex justify-between gap-4"><span className="text-carbon-400">Efficiency</span><span className="neon-text-green font-medium">{d.efficiency?.toFixed(2)}</span></div>
        </div>
        <div className="text-carbon-600 mt-2 border-t border-carbon-700 pt-1.5">Click to inspect parameters →</div>
      </div>
    )
  }

  const PARAM_LABELS = {
    camber_pct: 'Camber', camber_pos_pct: 'Camber pos', thickness_pct: 'Thickness',
    aoa_deg: 'Angle of attack', flap_angle_deg: 'Flap angle', flap_chord_pct: 'Flap chord',
    aspect_ratio: 'Aspect ratio', endplate_h_pct: 'Endplate height',
  }

  return (
    <div className="animate-fade-in">
      <SectionTitle
        step={3}
        sub="NSGA-II evolutionary algorithm explores thousands of designs using the ML surrogates to find the best possible trade-off between downforce and drag."
      >
        Pareto Optimization
      </SectionTitle>

      <BeginnerTip icon="⚙️">
        <strong>What is a Pareto front?</strong> You can't maximize downforce AND minimize drag simultaneously — improving one usually worsens the other. The Pareto front is the set of designs where you can't do better on one objective without getting worse on the other. Every dot on the scatter chart is a Pareto-optimal design: the "best possible" trade-offs.
      </BeginnerTip>

      {/* Mode selector */}
      <div className="flex gap-2 mt-4 mb-3">
        {[
          { id: 'nsga2',  label: 'NSGA-II (Surrogate)',  sub: 'Fast · ML-only' },
          { id: 'hybrid', label: 'Hybrid Pipeline',       sub: '7-stage · L0→L1 CFD' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: mode === m.id ? 'rgba(0,200,255,0.10)' : 'rgba(255,255,255,0.04)',
            borderLeft: `2px solid ${mode === m.id ? 'var(--arc)' : 'transparent'}`,
            transition: 'all 0.15s',
          }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem', fontWeight: 600, color: mode === m.id ? 'var(--arc)' : '#dde2ed' }}>{m.label}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', color: '#636880' }}>{m.sub}</span>
          </button>
        ))}
      </div>

      {/* Config + run */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-1 mb-4">
          <span className="font-display font-semibold text-white text-sm">
            {mode === 'hybrid' ? 'Hybrid Pipeline Settings' : 'Optimization Settings'}
          </span>
          <InfoTooltip text={mode === 'hybrid'
            ? "The hybrid pipeline runs 7 stages: LHS sampling → L0 physics screening → surrogate NSGA-II → constraint filtering → L1 2D CFD validation → optional L2 3D → final ranking."
            : "NSGA-II evolutionary algorithm: starts with random designs and breeds better solutions over multiple generations using ML surrogates as the evaluator."
          } wide />
        </div>

        {mode === 'nsga2' ? (
          <div className="flex items-end gap-6 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <label className="label flex items-center gap-1">
                Population size
                <InfoTooltip text="How many designs to evaluate simultaneously each generation." />
              </label>
              <input type="number" min={20} max={200} value={config.pop_size}
                onChange={e => setConfig(c => ({ ...c, pop_size: +e.target.value }))}
                className="input-field w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label flex items-center gap-1">
                Generations
                <InfoTooltip text="How many rounds of evolution to run." />
              </label>
              <input type="number" min={10} max={300} value={config.n_gen}
                onChange={e => setConfig(c => ({ ...c, n_gen: +e.target.value }))}
                className="input-field w-28"
              />
            </div>
            <div className="text-xs font-mono text-carbon-500 pb-2">
              = {(config.pop_size * config.n_gen).toLocaleString()} ML evals
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-6 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <label className="label">LHS Init. Samples</label>
              <input type="number" min={20} max={500} value={hybridConfig.n_init}
                onChange={e => setHybridConfig(c => ({ ...c, n_init: +e.target.value }))}
                className="input-field w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label">Pareto Targets</label>
              <input type="number" min={5} max={50} value={hybridConfig.n_pareto}
                onChange={e => setHybridConfig(c => ({ ...c, n_pareto: +e.target.value }))}
                className="input-field w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label">Enable L2 3D</label>
              <button
                onClick={() => setHybridConfig(c => ({ ...c, enable_l2: !c.enable_l2 }))}
                style={{
                  padding: '6px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: hybridConfig.enable_l2 ? 'rgba(57,255,136,0.12)' : 'rgba(255,255,255,0.05)',
                  color: hybridConfig.enable_l2 ? 'var(--phosphor)' : '#636880',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem',
                }}
              >
                {hybridConfig.enable_l2 ? 'ON — HPC needed' : 'OFF'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <FidelityBadge level={mode === 'hybrid' ? 1 : 0} label={mode === 'hybrid' ? 'Hybrid L0→L1' : 'L0 Surrogate'} />
          <button onClick={runOptimize} disabled={loading} className="btn-primary">
            {loading ? <Spinner size={14} /> : <Play size={14} />}
            {loading ? 'Optimising…' : mode === 'hybrid' ? 'Run Hybrid Pipeline' : 'Run NSGA-II'}
          </button>
        </div>

        {loading && (
          <div className="mt-4 pt-4 border-t border-carbon-700/40">
            <div className="flex items-center gap-3 text-xs font-mono text-carbon-400">
              <div className="w-3 h-3 rounded-full border border-neon-blue border-t-transparent animate-spin flex-shrink-0" />
              {mode === 'hybrid' ? 'Running 7-stage hybrid pipeline…' : `Evaluating ${config.pop_size}×${config.n_gen} candidates…`}
            </div>
          </div>
        )}
      </div>

      <ErrorBox message={error} />

      {loadingResults && !results && <LoadingPage label="Loading optimization results…" />}

      {results && (
        <div className="grid grid-cols-12 gap-4 animate-slide-up">

          {/* Pareto scatter */}
          <div className="col-span-7 card p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <span className="label">Pareto front — downforce vs drag trade-off</span>
                <InfoTooltip text="Each green dot is a different Pareto-optimal wing design. Moving right = more drag. Moving up = more downforce. The 'ideal' is upper-left (maximum downforce, minimum drag) — but physics prevents that. Brighter green = higher efficiency." wide />
              </div>
              <span className="badge badge-blue">{scatterData.length} solutions</span>
            </div>
            <p className="text-[11px] text-carbon-500 font-mono mb-4">Upper-left = high downforce, low drag. Click any dot to inspect that design's parameters.</p>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" />
                <XAxis dataKey="drag" name="Drag (N)"
                  label={{ value: 'Drag (N) →', position: 'insideBottom', offset: -12, fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <YAxis dataKey="downforce" name="Downforce (N)"
                  label={{ value: '|Downforce| (N)', angle: -90, position: 'insideLeft', offset: 10, fill: '#6e7681', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <Tooltip content={<ParetoTooltip />} />
                <Scatter data={scatterData} shape={<CustomDot />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Right side */}
          <div className="col-span-5 flex flex-col gap-4">

            {/* Convergence chart */}
            <div className="card p-5">
              <div className="flex items-center gap-1 mb-4">
                <span className="label">Convergence history</span>
                <InfoTooltip text="As the algorithm runs more generations, it finds progressively better designs. This chart shows the best downforce and efficiency found so far at each generation. A flattening curve means the algorithm has converged." wide />
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={convData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" />
                  <XAxis dataKey="gen" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }}
                    label={{ value: 'generation', position: 'insideBottom', offset: -2, fill: '#6e7681', fontSize: 10 }} />
                  <YAxis yAxisId="df" orientation="left" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
                  <YAxis yAxisId="eff" orientation="right" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
                  <Tooltip content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="card-sm p-2 text-xs font-mono">
                        <div className="text-carbon-400 mb-1">Gen {payload[0]?.payload?.gen}</div>
                        {payload.map(p => (
                          <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(1)}</div>
                        ))}
                      </div>
                    ) : null
                  } />
                  <Line yAxisId="df"  dataKey="bestDF"  stroke="#4facfe" strokeWidth={2}   dot={false} name="|Downforce| N" />
                  <Line yAxisId="eff" dataKey="bestEff" stroke="#43e97b" strokeWidth={1.5} dot={false} name="Efficiency" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Run stats */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Total evaluations" value={(results.n_evaluations ?? 0).toLocaleString()} color="blue" small
                tooltip="Total number of wing designs evaluated by the ML surrogate during the optimization run." />
              <MetricCard label="Run time" value={`${results.elapsed_s?.toFixed(0)}s`} color="amber" small
                tooltip="Wall-clock time for the entire optimization. Using ML surrogates instead of physics makes this feasible — the physics solver alone would take hours." />
            </div>

            {/* Selected design detail */}
            {selected ? (
              <div className="card p-5 animate-slide-in">
                <div className="flex items-center justify-between mb-3">
                  <span className="label">Design #{selected.rank} — parameters</span>
                  <span className="badge badge-blue">Selected</span>
                </div>
                <div className="flex flex-col gap-1.5 mb-4">
                  {Object.entries(selected.params || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center">
                      <span className="text-xs font-mono text-carbon-400">{PARAM_LABELS[k] || k.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-mono text-white font-medium">{typeof v === 'number' ? v.toFixed(2) : v}</span>
                    </div>
                  ))}
                </div>
                <div className="divider pt-3">
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="flex justify-between"><span className="text-carbon-400">Downforce</span><span className="neon-text-blue font-semibold">{selected.pred?.downforce_N?.toFixed(0)} N</span></div>
                    <div className="flex justify-between"><span className="text-carbon-400">Drag</span><span className="neon-text-amber font-semibold">{selected.pred?.drag_N?.toFixed(1)} N</span></div>
                    <div className="flex justify-between"><span className="text-carbon-400">Efficiency</span><span className="neon-text-green font-semibold">{selected.pred?.efficiency?.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-carbon-400">Cl</span><span className="text-white">{selected.pred?.Cl?.toFixed(4)}</span></div>
                  </div>
                  <p className="text-[11px] text-carbon-600 font-mono mt-2">Surrogate estimates — go to Validate to confirm with L0 physics.</p>
                </div>
              </div>
            ) : (
              <div className="card p-5 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-2xl opacity-30">👆</span>
                <p className="text-xs text-carbon-500 font-mono">Click a dot on the Pareto front to inspect its design parameters</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hybrid pipeline results */}
      {hybridResults && (
        <div className="animate-slide-up mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="label">Hybrid Pipeline Results</span>
            <FidelityBadge level={1} label={`L0→L1 · ${hybridResults.n_evaluated_l1 ?? 0} L1 runs`} />
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <MetricCard label="L0 evaluated" value={hybridResults.n_evaluated_l0 ?? 0} color="amber" small />
            <MetricCard label="L1 CFD runs" value={hybridResults.n_evaluated_l1 ?? 0} color="blue" small />
            <MetricCard label="Constraint violations" value={hybridResults.n_constraint_violations ?? 0} color="red" small />
            <MetricCard label="Wall time" value={`${hybridResults.wall_time_s?.toFixed(0)}s`} color="cyan" small />
          </div>
          <div className="flex flex-col gap-3">
            {(hybridResults.ranked ?? []).slice(0, 5).map((c, i) => (
              <div key={c.candidate_id} className="card p-4" style={{
                borderLeft: `2px solid ${i === 0 ? 'var(--arc)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: i === 0 ? 'var(--arc)' : '#dde2ed' }}>
                      #{c.rank} {i === 0 ? '— Best design' : ''}
                    </span>
                  </div>
                  <FidelityBadge level={c.fidelity_used} trust={c.trust_label} converged={(c.l1_result || {}).converged} />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ['Downforce', c.final_Cl !== null ? `${c.final_Cl?.toFixed(4)} Cl` : '—', 'blue'],
                    ['Efficiency', c.final_efficiency?.toFixed(2) ?? '—', 'green'],
                    ['L1 conv.',  c.promoted_to_l1 ? ((c.l1_result || {}).converged ? 'Yes' : 'No') : 'N/A', 'cyan'],
                    ['Confidence', c.confidence !== null ? `${(c.confidence * 100).toFixed(0)}%` : '—', 'amber'],
                  ].map(([k, v, col]) => (
                    <div key={k}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#636880', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 600, color: `var(--${col === 'blue' ? 'arc' : col === 'green' ? 'phosphor' : col === 'cyan' ? 'teal' : 'ember'})` }}>{v}</div>
                    </div>
                  ))}
                </div>
                {c.constraint_summary && <ConstraintPanel summary={c.constraint_summary} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
