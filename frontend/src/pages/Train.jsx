// src/pages/Train.jsx
import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { api } from '../api/client'
import { Spinner, SectionTitle, MetricCard, ChartTooltip, InfoTooltip, BeginnerTip, LoadingPage } from '../components/ui'

const MODELS = ['xgboost', 'gp', 'mlp']
const MODEL_COLORS = { xgboost: '#4facfe', gp: '#43e97b', mlp: '#f9a825' }
const MODEL_LABELS = { xgboost: 'XGBoost', gp: 'Gaussian Process', mlp: 'MLP (128-64-32)' }
const TARGETS = ['Cl', 'Cd', 'Cl_Cd', 'downforce_N', 'drag_N', 'efficiency']
const TARGET_LABELS = { Cl: 'Cl', Cd: 'Cd', Cl_Cd: 'Cl/Cd', downforce_N: 'Downforce', drag_N: 'Drag', efficiency: 'Efficiency' }

const MODEL_INFO = {
  xgboost: {
    desc: 'Gradient boosted decision trees. Fast, accurate, and great at showing which parameters matter most (SHAP analysis).',
    why: 'State-of-the-art for structured/tabular data. 500 trees, depth 6, learning rate 0.05.',
  },
  gp: {
    desc: 'Gaussian Process regression. Slightly slower but uniquely provides a confidence interval alongside each prediction.',
    why: 'Matérn 5/2 kernel. The uncertainty estimate is useful for knowing when the model is "out of its training range".',
  },
  mlp: {
    desc: 'Multi-layer perceptron neural network with 3 hidden layers (128 → 64 → 32 neurons).',
    why: 'ReLU activations, Adam optimiser, L2 regularisation, early stopping. Deep learning baseline.',
  },
}

export default function TrainPage() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')

  useEffect(() => {
    api.modelMetrics()
      .then(setMetrics)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingPage label="Loading model metrics…" />
  if (err) return <div className="p-8 text-neon-red font-mono text-sm">{err}</div>

  const r2Data = TARGETS.map(target => {
    const row = { target: TARGET_LABELS[target] || target }
    MODELS.forEach(m => { row[m] = metrics?.[m]?.test?.[target]?.r2 ?? 0 })
    return row
  })

  const meanR2 = MODELS.map(m => ({
    model: MODEL_LABELS[m],
    key: m,
    r2:    metrics?.[m]?.test?.mean_r2 ?? 0,
    rmse:  metrics?.[m]?.test?.mean_rmse ?? 0,
    color: MODEL_COLORS[m],
  }))

  const shap = Object.entries(metrics?.shap_importance || {}).slice(0, 8).map(([k, v]) => ({
    feature: k.replace(/_/g, ' '),
    importance: parseFloat(v.toFixed(4)),
  }))

  const r2Grade = r2 => r2 > 0.97 ? { label: 'Excellent', cls: 'badge-green' }
    : r2 > 0.92 ? { label: 'Very Good', cls: 'badge-blue' }
    : r2 > 0.85 ? { label: 'Good', cls: 'badge-amber' }
    : { label: 'Fair', cls: 'badge-gray' }

  return (
    <div className="animate-fade-in">
      <SectionTitle
        step={2}
        sub="Three AI surrogate models were trained on 1,217 wing designs evaluated by the physics solver. These models replace the physics solver for the fast-running optimization step."
      >
        ML Surrogate Models
      </SectionTitle>

      <BeginnerTip icon="🤖">
        <strong>What is a surrogate model?</strong> Running the physics solver takes ~1 second per design. To explore thousands of designs during optimization, we first train AI models on a batch of physics results. These "surrogate" (stand-in) models can then predict performance in under 1 millisecond — 1,000× faster — making large-scale optimization feasible.
      </BeginnerTip>

      {/* What is R² callout */}
      <div className="card p-4 mt-4 mb-5 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center flex-shrink-0">
          <span className="font-mono font-bold text-sm neon-text-blue">R²</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Understanding R² (R-squared)</p>
          <p className="text-xs text-carbon-400 leading-relaxed">
            R² measures how accurately the AI model predicts the physics results on <em>unseen</em> test data.
            <strong className="text-neon-green"> R²=1.0</strong> = perfect predictions.
            <strong className="text-neon-amber"> R²=0.9</strong> = explains 90% of variation.
            <strong className="text-neon-red"> R²&lt;0.8</strong> = unreliable. Our models score 0.95–0.99.
          </p>
        </div>
      </div>

      {/* Model summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5 stagger">
        {meanR2.map(({ model, key, r2, rmse, color }) => {
          const grade = r2Grade(r2)
          return (
            <div key={model} className="card p-5 hover:card-glow-blue transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-sm font-semibold" style={{ color }}>{model}</span>
                <span className={`badge text-xs ${grade.cls}`}>{grade.label}</span>
              </div>
              <div className="text-4xl font-mono font-bold mb-1" style={{ color }}>
                {r2.toFixed(4)}
              </div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-mono text-carbon-400">Mean R² on held-out test set</span>
                <InfoTooltip text="The model was trained on 80% of the 1,217 designs and tested on the remaining 20% it had never seen. This R² score measures accuracy on that unseen test set." />
              </div>
              <div className="text-xs font-mono text-carbon-500">RMSE: {rmse.toFixed(4)}</div>

              {/* Progress bar showing R² visually */}
              <div className="mt-3 progress-track">
                <div className="progress-fill" style={{ width: `${r2 * 100}%`, background: color, opacity: 0.7 }} />
              </div>

              {/* Short description */}
              <p className="text-[11px] text-carbon-500 mt-3 leading-relaxed">{MODEL_INFO[key]?.desc}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* Per-target R² chart */}
        <div className="card p-5">
          <div className="flex items-center gap-1 mb-4">
            <span className="label">Accuracy per output variable</span>
            <InfoTooltip text="Each wing design has 6 output values (Cl, Cd, Downforce, Drag, Efficiency, and Cl/Cd). This chart shows how accurately each model predicts each one. All bars should be close to 1.0 for a good surrogate." wide />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={r2Data} layout="vertical" margin={{ left: 64, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" domain={[0.8, 1]} tickFormatter={v => v.toFixed(2)} />
              <YAxis type="category" dataKey="target" width={60}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
              <Tooltip content={<ChartTooltip />} />
              {MODELS.map(m => (
                <Bar key={m} dataKey={m} name={MODEL_LABELS[m]} fill={MODEL_COLORS[m]} opacity={0.85} radius={[0, 3, 3, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 justify-center flex-wrap">
            {MODELS.map(m => (
              <div key={m} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: MODEL_COLORS[m] }} />
                <span className="text-xs font-mono text-carbon-400">{MODEL_LABELS[m]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SHAP feature importance */}
        <div className="card p-5">
          <div className="flex items-center gap-1 mb-4">
            <span className="label">What drives performance? (SHAP)</span>
            <InfoTooltip text="SHAP (SHapley Additive exPlanations) shows how much each input parameter contributes to the model's predictions. A longer bar = that parameter has more influence on the output. This tells us which design parameters matter most." wide />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={shap} layout="vertical" margin={{ left: 88, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" tickFormatter={v => v.toFixed(2)} />
              <YAxis type="category" dataKey="feature" width={84}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#6e7681' }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="importance" name="SHAP importance" radius={[0, 3, 3, 0]}>
                {shap.map((_, i) => (
                  <Cell key={i} fill={`rgba(79,172,254,${1 - i * 0.09})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-carbon-500 font-mono mt-2 leading-relaxed">
            Angle of attack dominates lift. Flap deflection and camber are secondary levers.
          </p>
        </div>
      </div>

      {/* Architecture details */}
      <div className="card p-5">
        <div className="flex items-center gap-1 mb-4">
          <span className="label">Model architecture details</span>
          <InfoTooltip text="Technical details of how each model is built. The inference time shows how fast it can predict once trained — compare this to the ~1 second physics solver." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-carbon-700/60">
                {['Model', 'Architecture', 'Purpose', 'Mean R²', 'Speed'].map(h => (
                  <th key={h} className={`text-carbon-400 pb-3 pr-4 font-medium uppercase tracking-wider text-left`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-700/40">
              {[
                { name: 'XGBoost',          arch: '500 trees, depth 6, η=0.05', purpose: 'Primary surrogate + SHAP analysis',  key: 'xgboost', time: '<1 ms' },
                { name: 'Gaussian Process', arch: 'Matérn 5/2 kernel, 300 pts', purpose: 'Uncertainty quantification',          key: 'gp',      time: '~5 ms' },
                { name: 'MLP (128-64-32)',  arch: 'ReLU, Adam, L2=1e-4, ES',    purpose: 'Deep learning baseline comparison',  key: 'mlp',     time: '<1 ms' },
              ].map(row => (
                <tr key={row.key} className="hover:bg-carbon-700/20 transition-colors">
                  <td className="py-3 pr-4 font-semibold" style={{ color: MODEL_COLORS[row.key] }}>{row.name}</td>
                  <td className="py-3 pr-4 text-carbon-300">{row.arch}</td>
                  <td className="py-3 pr-4 text-carbon-400">{row.purpose}</td>
                  <td className="py-3 pr-4">
                    <span className="text-white font-semibold">{(metrics?.[row.key]?.test?.mean_r2 ?? 0).toFixed(4)}</span>
                  </td>
                  <td className="py-3">
                    <span className="badge badge-green">{row.time}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-carbon-700/40 flex items-center gap-2">
          <span className="text-[11px] font-mono text-carbon-500">Physics solver baseline: ~1,000 ms per design</span>
          <span className="text-carbon-700">→</span>
          <span className="text-[11px] font-mono neon-text-green">ML surrogates: &lt;5 ms — 200–1000× speedup</span>
        </div>
      </div>
    </div>
  )
}
