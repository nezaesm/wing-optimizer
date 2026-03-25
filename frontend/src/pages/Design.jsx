// src/pages/Design.jsx
import React, { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { Play, Zap, RotateCcw, TrendingDown, Layers, Wind, Settings2 } from 'lucide-react'
import { api } from '../api/client'
import {
  AccordionGroup, ParamSlider, MetricCard, WingCanvas,
  StatusBadge, ErrorBox, SectionTitle, ChartTooltip,
  InfoTooltip, BeginnerTip, LoadingPage, ProgressBar
} from '../components/ui'

const AIRFOIL_PARAMS = [
  {
    name: 'camber_pct', label: 'Max Camber', min: 0, max: 9, step: 0.1, unit: '%',
    description: 'How curved the wing is. More camber = more downforce but stalls sooner.',
    tooltip: 'Camber is the maximum curvature of the wing\'s centreline. A higher value bends the wing more aggressively, generating more downforce — but too much causes the airflow to "stall" and detach, ruining performance.',
  },
  {
    name: 'camber_pos_pct', label: 'Camber Position', min: 20, max: 60, step: 1, unit: '%c',
    description: 'Where along the chord the peak curvature sits.',
    tooltip: 'The location of maximum camber as a percentage of the chord. Moving it forward loads the front of the wing; rearward shifts suction peaks toward the trailing edge.',
  },
  {
    name: 'thickness_pct', label: 'Max Thickness', min: 6, max: 20, step: 0.5, unit: '%',
    description: 'How thick the wing cross-section is. Thicker = stronger but more drag.',
    tooltip: 'Maximum section thickness as a percentage of chord. Thicker wings are structurally stiffer and delay stall, but add friction drag.',
  },
]

const AERO_PARAMS = [
  {
    name: 'aoa_deg', label: 'Angle of Attack', min: -18, max: 0, step: 0.5, unit: '°',
    description: 'How steeply the wing tilts into the air. More negative = more downforce.',
    tooltip: 'For an inverted wing like on a race car, a more negative angle points the nose down into the airflow, increasing the pressure difference that produces downforce.',
  },
  {
    name: 'flap_angle_deg', label: 'Flap Deflection', min: 0, max: 35, step: 1, unit: '°',
    description: 'Trailing-edge flap angle — biggest lever for downforce.',
    tooltip: 'The trailing-edge flap rotates downward to increase effective camber. Same principle as aircraft landing flaps — dramatically increases downforce but also drag.',
  },
  {
    name: 'flap_chord_pct', label: 'Flap Chord', min: 20, max: 35, step: 1, unit: '%c',
    description: 'How large the flap is relative to the whole wing.',
    tooltip: 'The size of the flap element as a fraction of total chord length. A larger flap has more authority but adds drag when deflected.',
  },
]

const GEOMETRY_PARAMS = [
  {
    name: 'aspect_ratio', label: 'Aspect Ratio', min: 2, max: 5.5, step: 0.1, unit: '',
    description: 'Span vs width. Higher = less induced drag but heavier.',
    tooltip: 'Aspect ratio = span² ÷ area. A high aspect ratio (long, narrow wing) reduces tip vortices that waste energy as "induced drag".',
  },
  {
    name: 'endplate_h_pct', label: 'Endplate Height', min: 5, max: 30, step: 1, unit: '%b',
    description: 'The vertical fences at wing tips. Taller = less vortex loss.',
    tooltip: 'Endplates are the vertical fins at the ends of Formula wings. They block air from leaking around the tips, effectively making the wing behave as if it has a larger span.',
  },
]

const BASELINE = {
  camber_pct: 4, camber_pos_pct: 40, thickness_pct: 12,
  aoa_deg: -5, flap_angle_deg: 10, flap_chord_pct: 25,
  aspect_ratio: 3.5, endplate_h_pct: 15,
}

const METRIC_TOOLTIPS = {
  downforce: 'Downforce is the aerodynamic force pushing the car toward the track. Like lift on an aircraft wing, but inverted. The baseline generates ~400–600 N.',
  drag: 'Drag is the aerodynamic resistance opposing forward motion. Lower drag = higher top speed, but usually means less downforce.',
  efficiency: 'Efficiency = |Downforce| ÷ Drag. A higher number means more downforce for each unit of drag — the key performance metric.',
  cl: 'Cl is the 2D lift coefficient — how much lift the airfoil cross-section generates per unit area. Negative = downforce direction.',
  cd: 'Cd is the 2D drag coefficient. Dimensionless. Includes friction drag and pressure (form) drag.',
  ld: 'L/D ratio: the 2D aerodynamic efficiency of the airfoil alone, before 3D effects like tip vortices.',
}

export default function DesignPage() {
  const [params, setParams]     = useState(BASELINE)
  const [geometry, setGeometry] = useState(null)
  const [metrics, setMetrics]   = useState(null)
  const [mlPred, setMlPred]     = useState(null)
  const [sweep, setSweep]       = useState(null)
  const [loading, setLoading]   = useState({ geo: false, phys: false, ml: false, sweep: false })
  const [error, setError]       = useState('')
  const [baseline, setBaseline] = useState(null)
  const geoTimer = useRef(null)

  useEffect(() => {
    api.baseline().then(b => setBaseline(b.metrics)).catch(() => {})
    fetchGeometry(BASELINE)
  }, [])

  const setLoad = (key, val) => setLoading(l => ({ ...l, [key]: val }))

  const fetchGeometry = async (p) => {
    setLoad('geo', true)
    try { setGeometry(await api.geometry(p)) } catch {}
    setLoad('geo', false)
  }

  const handleParam = (name, val) => {
    const next = { ...params, [name]: val }
    setParams(next)
    clearTimeout(geoTimer.current)
    geoTimer.current = setTimeout(() => fetchGeometry(next), 300)
  }

  const runPhysics = async () => {
    setLoad('phys', true); setError('')
    try { setMetrics(await api.evaluate(params)) } catch (e) { setError(e.message) }
    setLoad('phys', false)
  }

  const runML = async () => {
    setLoad('ml', true); setError('')
    try { setMlPred(await api.predict(params)) } catch (e) { setError(e.message) }
    setLoad('ml', false)
  }

  const runSweep = async () => {
    setLoad('sweep', true)
    try {
      const res = await api.sweep({ params, aoa_start: -18, aoa_end: -1, n_points: 18 })
      setSweep(res.sweep)
    } catch (e) { setError(e.message) }
    setLoad('sweep', false)
  }

  const reset = () => {
    setParams(BASELINE)
    fetchGeometry(BASELINE)
    setMetrics(null); setMlPred(null); setSweep(null); setError('')
  }

  const m  = metrics?.metrics
  const bl = baseline

  // Summaries for collapsed accordion headers
  const airfoilSummary  = `${params.camber_pct.toFixed(1)}% · ${params.camber_pos_pct}%c · ${params.thickness_pct.toFixed(1)}%`
  const aeroSummary     = `${params.aoa_deg}° · ${params.flap_angle_deg}° flap`
  const geometrySummary = `AR ${params.aspect_ratio.toFixed(1)} · EP ${params.endplate_h_pct}%`

  return (
    <div className="animate-fade-in">
      <SectionTitle
        step={1}
        sub="Adjust the 8 design parameters to shape a Formula-style front wing, then evaluate its aerodynamic performance."
      >
        Wing Design Studio
      </SectionTitle>

      {/* Beginner intro */}
      <BeginnerTip icon="🏎️">
        New here? A Formula-style front wing generates <strong>downforce</strong> — aerodynamic force pushing the car toward the track for better cornering grip.
        Use the parameter sliders on the left to shape the wing, then click <strong>Run Physics Solver</strong> to calculate the aerodynamic forces.
        Hover the{' '}
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>?</span>
        {' '}icons for plain-English explanations.
      </BeginnerTip>

      <div className="grid grid-cols-12 gap-5 mt-5">

        {/* ── Left panel: parameter sliders ─────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#dde2ed' }}>
              Parameters
            </span>
            <button onClick={reset} className="btn-ghost py-1 px-3" style={{ fontSize: '0.75rem' }}>
              <RotateCcw size={11} /> Reset
            </button>
          </div>

          {/* Accordion parameter groups */}
          <AccordionGroup
            title="Airfoil Shape"
            icon={Layers}
            defaultOpen={true}
            summary={airfoilSummary}
            tooltip="These parameters control the 2D cross-section profile. Think of it as choosing the shape of a slice through the wing."
          >
            {AIRFOIL_PARAMS.map(cfg => (
              <ParamSlider key={cfg.name} {...cfg} value={params[cfg.name]} onChange={handleParam} />
            ))}
          </AccordionGroup>

          <AccordionGroup
            title="Aerodynamic Settings"
            icon={Wind}
            defaultOpen={true}
            summary={aeroSummary}
            tooltip="These settings control how the wing is positioned and adjusted in the airstream — the primary levers for tuning downforce vs drag."
          >
            {AERO_PARAMS.map(cfg => (
              <ParamSlider key={cfg.name} {...cfg} value={params[cfg.name]} onChange={handleParam} />
            ))}
          </AccordionGroup>

          <AccordionGroup
            title="Wing Geometry"
            icon={Settings2}
            defaultOpen={false}
            summary={geometrySummary}
            tooltip="These define the overall 3D shape — including how the wing handles airflow at the tips."
          >
            {GEOMETRY_PARAMS.map(cfg => (
              <ParamSlider key={cfg.name} {...cfg} value={params[cfg.name]} onChange={handleParam} />
            ))}
          </AccordionGroup>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-1">
            <button onClick={runPhysics} disabled={loading.phys} className="btn-primary w-full justify-center">
              <Play size={13} />
              {loading.phys ? 'Solving physics…' : 'Run Physics Solver'}
            </button>
            <button onClick={runML} disabled={loading.ml} className="btn-secondary w-full justify-center">
              <Zap size={13} />
              {loading.ml ? 'Predicting…' : 'ML Quick Predict'}
            </button>
            <button onClick={runSweep} disabled={loading.sweep} className="btn-ghost w-full justify-center" style={{ fontSize: '0.78rem' }}>
              <TrendingDown size={12} />
              {loading.sweep ? 'Sweeping angles…' : 'AoA Polar Sweep'}
            </button>
          </div>

          {/* Button explainer */}
          <div className="card p-4 flex flex-col gap-3">
            {[
              { dot: 'var(--arc)',      label: 'Physics Solver',   desc: 'Real aerodynamic equations (~1s, accurate)' },
              { dot: 'var(--teal)',     label: 'ML Quick Predict', desc: 'AI models trained on physics data (~1ms)' },
              { dot: '#3e4257',         label: 'AoA Polar Sweep',  desc: 'Tests all angles of attack at once' },
            ].map(({ dot, label, desc }) => (
              <div key={label} className="flex items-start gap-2.5">
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dot, flexShrink: 0, marginTop: '5px', boxShadow: `0 0 6px ${dot}` }} />
                <div>
                  <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.78rem', fontWeight: 600, color: '#a8b2c8' }}>{label}</p>
                  <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.72rem', color: '#636880', marginTop: '1px' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Centre panel: geometry + results ──────────────────────────────── */}
        <div className="col-span-6 flex flex-col gap-4">

          {/* Wing cross-section preview */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="label">Wing cross-section</span>
                <InfoTooltip text="This diagram shows the 2D profile (slice) of the wing. The blue line is the upper surface, teal is the lower surface, and the dashed amber line is the mean camber line. LE = Leading Edge (front), TE = Trailing Edge (back)." wide />
              </div>
              {geometry && (
                <span className="badge badge-gray">{geometry.name}</span>
              )}
            </div>
            {loading.geo
              ? (
                <div className="h-40 flex items-center justify-center gap-2" style={{ color: '#636880', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--arc)', borderTopColor: 'transparent' }} className="animate-spin" />
                  Updating geometry…
                </div>
              )
              : <WingCanvas geometry={geometry} height={160} />
            }
            {geometry && (
              <div className="flex gap-6 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  { label: 'Thickness', value: `${geometry.thickness_pct?.toFixed(1)}%` },
                  { label: 'Camber',    value: `${geometry.camber_pct?.toFixed(1)}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-2 items-center">
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#636880', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 500, color: '#fff' }}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Performance metrics */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="label">Performance results</span>
              {!m && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3e4257', fontStyle: 'italic' }}>
                  — run the physics solver to see values
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 stagger">
              <MetricCard
                label="Downforce" value={m ? m.downforce_N.toFixed(0) : '—'} unit="N" color="blue"
                tooltip={METRIC_TOOLTIPS.downforce}
                delta={m && bl ? ((m.downforce_N - bl.downforce_N) / Math.abs(bl.downforce_N)) * 100 : undefined}
              />
              <MetricCard
                label="Drag" value={m ? m.drag_N.toFixed(1) : '—'} unit="N" color="amber"
                tooltip={METRIC_TOOLTIPS.drag}
                delta={m && bl ? ((m.drag_N - bl.drag_N) / Math.abs(bl.drag_N)) * 100 : undefined}
              />
              <MetricCard
                label="Efficiency |DF|/D" value={m ? m.efficiency.toFixed(2) : '—'} color="green"
                tooltip={METRIC_TOOLTIPS.efficiency}
                delta={m && bl ? ((m.efficiency - bl.efficiency) / Math.abs(bl.efficiency)) * 100 : undefined}
              />
              <MetricCard label="Cl (2D)"  value={m ? m.Cl.toFixed(4) : '—'}            color="cyan" small tooltip={METRIC_TOOLTIPS.cl} />
              <MetricCard label="Cd (2D)"  value={m ? m.Cd.toFixed(5) : '—'}            color="cyan" small tooltip={METRIC_TOOLTIPS.cd} />
              <MetricCard label="L/D"      value={m ? (m.Cl / m.Cd).toFixed(1) : '—'}  color="cyan" small tooltip={METRIC_TOOLTIPS.ld} />
            </div>
          </div>

          {/* Flow status badges */}
          {m && (
            <div className="card p-4 flex items-center gap-4 flex-wrap">
              <StatusBadge
                ok={m.converged}
                label={m.converged ? 'Flow converged' : 'Diverged'}
                tooltip="Convergence means the physics solver found a stable solution. Divergence usually means the angle of attack is too extreme."
              />
              <StatusBadge
                ok={!m.stall_flag}
                label={m.stall_flag ? '⚠ Stall detected' : 'Attached flow'}
                tooltip="Stall occurs when the angle of attack is too steep and airflow separates from the wing surface. This causes a sudden loss of downforce."
              />
              {m.x_tr_upper !== undefined && (
                <div className="flex items-center gap-1.5" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#636880' }}>
                  <InfoTooltip text="Transition: where airflow changes from smooth (laminar) to turbulent. Earlier transition means more turbulent flow and higher skin friction drag." />
                  <span>Transition: {m.x_tr_upper?.toFixed(2)}c upper / {m.x_tr_lower?.toFixed(2)}c lower</span>
                </div>
              )}
            </div>
          )}

          <ErrorBox message={error} />

          {/* AoA Polar curve */}
          {sweep && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center gap-2 mb-4">
                <span className="label">AoA polar — Cl & Efficiency vs Angle of Attack</span>
                <InfoTooltip text="This chart shows how the wing's lift (Cl) and efficiency change as the angle of attack sweeps from -18° to -1°. The point where Cl drops sharply is the stall angle — beyond that, performance falls off rapidly." wide />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={sweep} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" />
                  <XAxis dataKey="aoa_deg" tickFormatter={v => `${v}°`} />
                  <YAxis yAxisId="cl"  orientation="left" />
                  <YAxis yAxisId="eff" orientation="right" />
                  <Tooltip content={<ChartTooltip />} />
                  <Line yAxisId="cl"  dataKey="Cl"         stroke="var(--arc)"      strokeWidth={2}   dot={false} name="Cl (lift coeff)" />
                  <Line yAxisId="eff" dataKey="efficiency" stroke="var(--phosphor)" strokeWidth={1.5} dot={false} name="Efficiency" />
                  <ReferenceLine yAxisId="cl" y={0} stroke="rgba(255,255,255,0.06)" />
                </LineChart>
              </ResponsiveContainer>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', color: '#636880', marginTop: '8px' }}>
                Watch for the sharp Cl drop — that's stall. The green efficiency curve shows the best operating angle.
              </p>
            </div>
          )}
        </div>

        {/* ── Right panel: ML predictions ───────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-4">

          {/* ML Panel */}
          <div className="card p-5">
            <div className="flex items-center gap-1 mb-4">
              <span className="label">AI Surrogate Models</span>
              <InfoTooltip text="Instead of running the full physics solver (which takes ~1 second), we trained three AI models on 1,217 physics-evaluated designs. They predict performance in under 1 millisecond — 1000× faster." wide />
            </div>

            {mlPred ? (
              <div className="flex flex-col gap-3">
                {['xgboost', 'gp', 'mlp', 'ensemble'].map((model) => {
                  const p = mlPred[model]
                  if (!p) return null
                  const isEnsemble = model === 'ensemble'
                  const modelNames = { xgboost: 'XGBoost', gp: 'Gaussian Process', mlp: 'MLP Neural Net', ensemble: 'Ensemble' }
                  const modelDescs = {
                    xgboost: 'Tree-based, fast + SHAP',
                    gp: 'Uncertainty-aware',
                    mlp: 'Deep learning',
                    ensemble: 'Average of all 3',
                  }
                  return (
                    <div
                      key={model}
                      className={`card-sm p-3.5 ${isEnsemble ? 'card-glow-blue' : ''}`}
                      style={isEnsemble ? { borderColor: 'rgba(0,200,255,0.25)' } : {}}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span style={{
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: isEnsemble ? 'var(--arc)' : '#dde2ed',
                        }}>
                          {isEnsemble ? '★ ' : ''}{modelNames[model]}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', color: '#636880' }}>
                          {modelDescs[model]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {[
                          ['Cl',       p.Cl?.toFixed(4)],
                          ['Cd',       p.Cd?.toFixed(5)],
                          ['Downforce',`${p.downforce_N?.toFixed(0)} N`],
                          ['Effic.',   p.efficiency?.toFixed(2)],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between items-baseline">
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', color: '#636880' }}>{k}</span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, color: isEnsemble ? 'var(--arc)' : '#dde2ed' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Confidence */}
                <div className="card-sm p-3.5">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="label">Prediction confidence</span>
                    <InfoTooltip text="The Gaussian Process estimates confidence based on how similar this design is to the training data. High confidence (>80%) means the models are in familiar territory." />
                  </div>
                  <ProgressBar value={mlPred.reliability * 100} color="green" showLabel />
                  <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#636880', marginTop: '6px' }}>
                    {mlPred.reliability > 0.8 ? 'High confidence — well-covered by training data'
                    : mlPred.reliability > 0.5 ? 'Moderate — verify with physics solver'
                    : 'Low — design outside training distribution'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Zap size={28} style={{ color: '#1d1f2e' }} />
                <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem', color: '#636880', lineHeight: 1.6 }}>
                  Click <span style={{ color: '#dde2ed', fontWeight: 600 }}>ML Quick Predict</span> to run all three AI models instantly
                </p>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#3e4257' }}>
                  Results in &lt;1ms
                </p>
              </div>
            )}
          </div>

          {/* vs Baseline comparison */}
          {metrics?.vs_baseline && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center gap-1 mb-4">
                <span className="label">vs Baseline wing</span>
                <InfoTooltip text="Comparison against the stock NACA 4412 inverted baseline. Green = improvement, red = worse." />
              </div>
              {[
                { key: 'downforce_pct',  label: 'Downforce', tip: 'More is better — higher = more grip' },
                { key: 'drag_pct',       label: 'Drag',      tip: 'Less is better — lower = more top speed' },
                { key: 'efficiency_pct', label: 'Efficiency', tip: 'More is better — the key metric' },
              ].map(({ key, label, tip }) => {
                const v = metrics.vs_baseline[key]
                const pos = v > 0
                const color = pos ? 'var(--phosphor)' : 'var(--signal)'
                return (
                  <div key={key} className="mb-3 last:mb-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1">
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#636880', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {label}
                        </span>
                        <InfoTooltip text={tip} />
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 600, color }}>
                        {pos ? '+' : ''}{v?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(Math.abs(v), 100)}%`,
                          marginLeft: pos ? 0 : `${100 - Math.min(Math.abs(v), 100)}%`,
                          background: color,
                          boxShadow: `0 0 8px ${color}`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
