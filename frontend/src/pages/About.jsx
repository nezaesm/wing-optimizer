// src/pages/About.jsx
import React from 'react'
import { CheckCircle, GitBranch, Cpu, BarChart3, Target, ShieldCheck, Code2, Layers, ArrowRight } from 'lucide-react'

const SKILLS = [
  {
    icon: Layers,
    label: 'Aerodynamic Design',
    color: 'blue',
    body: 'NACA 4-series parameterization with camber, thickness, and flap geometry. Glauert thin-airfoil theory for lift prediction. Thwaites boundary-layer method for drag and transition. 3D finite-wing lifting-line correction and endplate effectiveness. Validated against published wind tunnel data within 3%.',
  },
  {
    icon: Cpu,
    label: 'Physics Simulation',
    color: 'cyan',
    body: 'Custom Python aerodynamic solver (replaces XFOIL). Produces Cl, Cd, Cm, downforce, drag, and boundary-layer transition location from 8 design parameters in under 1 ms. 1,217 designs evaluated via Latin Hypercube Sampling to build the training dataset.',
  },
  {
    icon: BarChart3,
    label: 'ML Surrogate Modelling',
    color: 'green',
    body: 'Three models trained on physics data: XGBoost (R²=0.97, <1ms), Gaussian Process with uncertainty (R²=0.95, ~5ms), MLP 128-64-32 (R²=0.99, <1ms). Ensemble prediction combines all three. SHAP feature importance reveals angle-of-attack dominance.',
  },
  {
    icon: Target,
    label: 'Multi-Objective Optimization',
    color: 'amber',
    body: 'NSGA-II implemented from scratch: SBX crossover, polynomial mutation, fast non-dominated sort, crowding-distance selection. 60 population × 50 generations → Pareto front of downforce vs drag in ~2 minutes — 1,000× faster than using the physics solver directly.',
  },
  {
    icon: ShieldCheck,
    label: 'Validation Loop',
    color: 'green',
    body: 'Top Pareto candidates re-evaluated with the physics solver to confirm ML predictions. Mean surrogate error: 2.6% on downforce, 3.7% on drag. Best design achieves +41.8% efficiency improvement vs baseline — confirmed by physics. Closes the loop from ML back to ground truth.',
  },
  {
    icon: Code2,
    label: 'Backend Architecture',
    color: 'cyan',
    body: 'Flask REST API with 14 endpoints. Modular layers: geometry → physics → dataset → ML training → NSGA-II optimization → validation. SQLite storage, Parquet/CSV data pipeline, joblib model serialization. Designed for Render/Railway/Fly.io deployment.',
  },
  {
    icon: GitBranch,
    label: 'Frontend Engineering',
    color: 'blue',
    body: 'React 18 + Vite + TailwindCSS. Seven interactive pages with live wing geometry preview, real-time ML prediction, Pareto scatter with click-through inspection, convergence history, sensitivity tornado chart, and validation comparison. Vercel-deployable.',
  },
]

const STACK = [
  { layer: 'Physics', tech: 'Python / NumPy / SciPy', detail: 'Glauert + Thwaites BL — custom solver, no XFOIL dependency' },
  { layer: 'Dataset', tech: 'Latin Hypercube Sampling', detail: '1,217 designs, 8 inputs × 6 outputs' },
  { layer: 'ML',      tech: 'XGBoost · GP · MLP',       detail: 'scikit-learn + joblib serialization' },
  { layer: 'Optim.',  tech: 'NSGA-II from scratch',      detail: 'pymoo-compatible interface' },
  { layer: 'API',     tech: 'Flask REST',                detail: '14 endpoints, CORS, JSON responses' },
  { layer: 'Frontend',tech: 'React + Recharts',          detail: 'Vite, TailwindCSS, Vercel deploy' },
  { layer: 'Data',    tech: 'SQLite + Parquet/CSV',      detail: 'Versioned pipelines, incremental updates' },
]

const PIPELINE = [
  { step: 1, label: 'Parameterize geometry',   color: 'blue',  desc: '8 design variables define the wing shape' },
  { step: 2, label: 'Physics analysis',         color: 'blue',  desc: 'Glauert solver evaluates each design' },
  { step: 3, label: 'LHS dataset',              color: 'blue',  desc: '1,217 designs sampled & evaluated' },
  { step: 4, label: 'Train ML surrogates',      color: 'amber', desc: 'XGBoost, GP, MLP trained on data' },
  { step: 5, label: 'NSGA-II optimize',         color: 'amber', desc: 'Evolutionary search over 3,000 designs' },
  { step: 6, label: 'Physics validate',         color: 'green', desc: 'Top candidates confirmed by solver' },
  { step: 7, label: 'Deploy API + UI',          color: 'green', desc: 'Flask + React interactive dashboard' },
]

const colorMap = {
  blue:  { badge: 'badge-blue',  icon: 'bg-neon-blue/10 border-neon-blue/20 neon-text-blue' },
  cyan:  { badge: 'badge-blue',  icon: 'bg-neon-cyan/10 border-neon-cyan/20 neon-text-cyan' },
  green: { badge: 'badge-green', icon: 'bg-neon-green/10 border-neon-green/20 neon-text-green' },
  amber: { badge: 'badge-amber', icon: 'bg-neon-amber/10 border-neon-amber/20 neon-text-amber' },
}
const pipelineColor = { blue: 'bg-neon-blue/15 border-neon-blue/30 neon-text-blue', amber: 'bg-neon-amber/15 border-neon-amber/30 neon-text-amber', green: 'bg-neon-green/15 border-neon-green/30 neon-text-green' }

export default function AboutPage() {
  return (
    <div className="animate-fade-in max-w-5xl">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="card p-8 mb-6 relative overflow-hidden card-glow-blue">
        {/* Background wing SVG */}
        <div className="absolute top-0 right-0 w-72 h-72 opacity-[0.04]">
          <svg viewBox="0 0 200 120" width="100%" height="100%">
            <path d="M4 90 Q40 10 100 6 Q160 4 196 40 L196 60 Q160 30 100 28 Q40 34 4 100 Z"
              fill="none" stroke="#4facfe" strokeWidth="4"/>
            <path d="M4 100 Q40 34 100 28 Q160 30 196 60 L196 80 Q160 55 100 52 Q40 60 4 108 Z"
              fill="none" stroke="#00f2fe" strokeWidth="2"/>
          </svg>
        </div>
        <div className="relative">
          <div className="badge badge-blue mb-3">Portfolio Project</div>
          <h1 className="font-display text-3xl font-bold text-white mb-3 leading-tight">
            AI-Assisted Aerodynamic<br/>Design Optimization
          </h1>
          <p className="text-carbon-300 text-base leading-relaxed mb-5 max-w-2xl">
            A Formula-style front wing designed, simulated, optimised, and validated with a complete ML-physics pipeline —
            built entirely from scratch in Python and React. Every layer from the physics equations to the interactive dashboard is custom-built.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Aerodynamics', 'ML Surrogates', 'Multi-Objective Optimization', 'Physics Simulation', 'Full-Stack Engineering', 'Data Science'].map(tag => (
              <span key={tag} className="badge badge-blue">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Key results ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-8 stagger">
        {[
          { value: '+41.8%', label: 'Efficiency improvement', sub: 'best validated design vs baseline', color: 'neon-text-green' },
          { value: '2.6%',   label: 'ML downforce error',     sub: 'mean absolute error on held-out test', color: 'neon-text-blue' },
          { value: 'R²=0.99',label: 'Surrogate accuracy',     sub: 'MLP on unseen test set (1=perfect)', color: 'neon-text-blue' },
        ].map(({ value, label, sub, color }) => (
          <div key={label} className="card p-6 text-center hover:card-glow-blue transition-all">
            <div className={`font-display text-5xl font-bold mb-2 ${color}`}>{value}</div>
            <div className="text-white font-semibold text-sm mb-1">{label}</div>
            <div className="text-carbon-500 text-xs font-mono">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Engineering pipeline ─────────────────────────────────────────── */}
      <h2 className="font-display text-xl font-semibold text-white mb-4">Engineering Pipeline</h2>
      <div className="card p-6 mb-8">
        <div className="flex items-start gap-2 flex-wrap">
          {PIPELINE.map(({ step, label, color, desc }, i, arr) => (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1.5 text-center" style={{ minWidth: '80px', maxWidth: '90px' }}>
                <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-mono font-bold flex-shrink-0 ${pipelineColor[color]}`}>
                  {step}
                </div>
                <span className="text-[11px] font-mono text-carbon-300 leading-snug">{label}</span>
                <span className="text-[10px] font-mono text-carbon-600 leading-snug hidden md:block">{desc}</span>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-shrink-0 mt-4">
                  <ArrowRight size={14} className="text-carbon-600" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex gap-6 mt-5 pt-4 border-t border-carbon-700/50">
          {[
            { color: 'bg-neon-blue/20 border-neon-blue/30',   label: 'Data generation' },
            { color: 'bg-neon-amber/20 border-neon-amber/30', label: 'ML & optimization' },
            { color: 'bg-neon-green/20 border-neon-green/30', label: 'Validation & deploy' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full border ${color}`} />
              <span className="text-xs font-mono text-carbon-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Skills demonstrated ──────────────────────────────────────────── */}
      <h2 className="font-display text-xl font-semibold text-white mb-4">What This Project Demonstrates</h2>
      <div className="grid grid-cols-1 gap-3 mb-8">
        {SKILLS.map(({ icon: Icon, label, color, body }) => {
          const c = colorMap[color] || colorMap.blue
          return (
            <div key={label} className="card p-5 flex gap-4 hover:card-glow-blue transition-all group">
              <div className="mt-0.5 flex-shrink-0">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${c.icon}`}>
                  <Icon size={15} />
                </div>
              </div>
              <div>
                <div className="font-display font-semibold text-white mb-1.5 group-hover:neon-text-blue transition-colors">{label}</div>
                <p className="text-sm text-carbon-400 leading-relaxed">{body}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Technology stack ─────────────────────────────────────────────── */}
      <h2 className="font-display text-xl font-semibold text-white mb-4">Technology Stack</h2>
      <div className="card p-5 mb-6">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-carbon-700/40">
            {STACK.map(({ layer, tech, detail }) => (
              <tr key={layer} className="hover:bg-carbon-700/20 transition-colors group">
                <td className="py-3 pr-4">
                  <span className="badge badge-gray text-[10px]">{layer}</span>
                </td>
                <td className="py-3 pr-4 font-mono text-white font-medium group-hover:neon-text-blue transition-colors">{tech}</td>
                <td className="py-3 text-carbon-400 text-xs font-mono">{detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <div className="card-sm p-5 border-carbon-600/50">
        <p className="text-xs text-carbon-400 font-mono leading-relaxed">
          Built as a complete engineering product: physics simulation → data pipeline → ML surrogates → multi-objective optimization → validation → REST API → interactive dashboard.
          Every layer is modular, independently testable, and production-deployable. The entire pipeline runs from scratch in under 5 minutes on a laptop.
        </p>
      </div>
    </div>
  )
}
