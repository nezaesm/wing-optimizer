// src/api/client.js
// All backend calls go through here. Set VITE_API_URL in Vercel dashboard.

const BASE = import.meta.env.VITE_API_URL || '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  health:       ()       => request('GET',  '/health'),
  baseline:     ()       => request('GET',  '/design/baseline'),
  evaluate:     (params) => request('POST', '/design/evaluate', params),
  geometry:     (params) => request('POST', '/design/geometry', params),
  sweep:        (body)   => request('POST', '/design/sweep', body),
  predict:      (params) => request('POST', '/predict', params),
  modelMetrics: ()       => request('GET',  '/models/metrics'),
  optimize:     (body)   => request('POST', '/optimize', body),
  optimizeHybrid: (body) => request('POST', '/optimize/hybrid', body),
  optimizeResults: ()    => request('GET',  '/optimize/results'),
  validate:     (n=10)   => request('POST', `/validate?n_top=${n}`),
  validateResults: ()    => request('GET',  '/validate/results'),
  sensitivity:  (param, n=20) => request('GET', `/sensitivity?param=${param}&n_points=${n}`),
  sensitivityAll: (n=15)     => request('GET', `/sensitivity/all?n_points=${n}`),
  datasetStats: ()       => request('GET',  '/dataset/stats'),

  // Multi-fidelity
  fidelityEvaluate:  (body)         => request('POST', '/fidelity/evaluate', body),
  multiCondition:    (body)         => request('POST', '/fidelity/multi-condition', body),
  validateGeometry:  (params)       => request('POST', '/fidelity/validate-geometry', params),
  predictUncertain:  (params)       => request('POST', '/predict/uncertain', params),
  checkConstraints:  (body)         => request('POST', '/constraints/check', body),
  cfdStatus:         (runId)        => request('GET',  `/cfd/status/${runId}`),
  cfdArtifacts:      (limit=20)     => request('GET',  `/cfd/artifacts?limit=${limit}`),

  // 3D VLM analysis
  analyze3d: (body) => request('POST', '/design/analyze-3d', body),

  // Upload management
  uploadList:   ()   => request('GET',    '/upload/list'),
  uploadGet:    (id) => request('GET',    `/upload/${id}`),
  uploadDelete: (id) => request('DELETE', `/upload/${id}`),
}
