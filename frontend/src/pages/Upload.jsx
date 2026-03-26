// src/pages/Upload.jsx
// ── Upload & import wing/airfoil geometry files ──────────────────────────────
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, FileText, Trash2, ChevronRight, AlertTriangle, CheckCircle, X, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  SectionTitle, BeginnerTip, ErrorBox, Spinner, WingCanvas,
  StatusBadge, MetricCard,
} from '../components/ui'
import { api } from '../api/client'

const BASE = import.meta.env.VITE_API_URL || '/api'

const FORMATS = [
  { ext: '.dat / .txt', label: 'Selig / Lednicer', desc: 'Standard airfoil coordinate format — one x y pair per line. Upper surface then lower (Selig) or header + two blocks (Lednicer).', example: '0.000 0.000\n0.012 0.027\n...' },
  { ext: '.csv',        label: 'Coordinate table', desc: 'Two-column CSV: x (0→1) and y. Same ordering as Selig format.', example: 'x,y\n0.000,0.000\n0.012,0.027' },
  { ext: '.json',       label: 'WingOpt params',   desc: 'Direct parameter dict with any WingOpt keys (camber_pct, aoa_deg, etc.). Missing keys use defaults.', example: '{"camber_pct":4,"aoa_deg":-8}' },
  { ext: '.stl',        label: '3-D surface mesh', desc: 'Binary or ASCII STL. Cross-sections are extracted automatically at 7 spanwise stations. Best for full wing designs.', example: '(binary or ASCII)' },
  { ext: '.obj',        label: 'Wavefront OBJ',    desc: 'Wavefront OBJ mesh. Vertices + face data parsed; same cross-section extraction as STL.', example: 'v 0 0 0\nv 1 0 0\n...' },
]

const PARAM_LABELS = {
  camber_pct:      { label: 'Max Camber',     unit: '%'    },
  camber_pos_pct:  { label: 'Camber Pos.',    unit: '%c'   },
  thickness_pct:   { label: 'Max Thickness',  unit: '%'    },
  aoa_deg:         { label: 'Angle of Attack',unit: '°'    },
  flap_angle_deg:  { label: 'Flap Angle',     unit: '°'    },
  flap_chord_pct:  { label: 'Flap Chord',     unit: '%c'   },
  aspect_ratio:    { label: 'Aspect Ratio',   unit: ''     },
  endplate_h_pct:  { label: 'Endplate H',     unit: '%b'   },
}

// ─────────────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const navigate  = useNavigate()
  const inputRef  = useRef(null)

  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState(null)   // last parsed upload
  const [error,     setError]     = useState(null)
  const [uploads,   setUploads]   = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [expandedFmt, setExpandedFmt] = useState(null)

  // Load existing uploads on mount
  useEffect(() => {
    api.uploadList()
      .then(d => setUploads(d.uploads || []))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }, [])

  // ── Drop / file selection ──────────────────────────────────────────────

  const handleFiles = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    setError(null)
    setResult(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${BASE}/upload/geometry`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setResult(json)
      // Refresh list
      api.uploadList().then(d => setUploads(d.uploads || [])).catch(() => {})
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const onDragOver = (e) => { e.preventDefault(); setDragging(true)  }
  const onDragLeave = ()  => setDragging(false)

  // ── Load design into Design page ──────────────────────────────────────

  const loadIntoDesign = (params) => {
    sessionStorage.setItem('wopt_loaded_params', JSON.stringify(params))
    navigate('/')
  }

  // ── Delete upload ─────────────────────────────────────────────────────

  const deleteUpload = async (id) => {
    try {
      await api.uploadDelete(id)
      setUploads(prev => prev.filter(u => u.upload_id !== id))
      if (result?.upload_id === id) setResult(null)
    } catch (e) {
      setError(e.message)
    }
  }

  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in" style={{ maxWidth: 900 }}>
      <SectionTitle sub="Import your own wing or airfoil geometry">
        Upload Design
      </SectionTitle>

      <BeginnerTip icon="📂">
        Upload a geometry file — the tool will automatically extract the airfoil parameters
        and let you run all analysis, ML prediction, and optimization on your design.
        Supports standard airfoil coordinate files, 3-D surface meshes, and direct parameter JSON.
      </BeginnerTip>

      {/* ── Drop zone ──────────────────────────────────────────────────── */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--arc)' : 'rgba(255,255,255,0.10)'}`,
          borderRadius: 16,
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          cursor: 'pointer',
          background: dragging
            ? 'rgba(0,200,255,0.05)'
            : 'rgba(14,15,23,0.6)',
          transition: 'all 0.2s ease',
          marginBottom: 24,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".dat,.txt,.csv,.json,.stl,.obj"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        {uploading ? (
          <>
            <Spinner size={32} className="text-neon-blue" />
            <span style={{ fontFamily: 'Outfit,sans-serif', color: '#a8b2c8' }}>
              Parsing geometry…
            </span>
          </>
        ) : (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'rgba(0,200,255,0.08)',
              border: '1px solid rgba(0,200,255,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={24} style={{ color: 'var(--arc)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontFamily: 'Syne,sans-serif', fontWeight: 600, fontSize: '1rem',
                color: '#dde2ed', margin: 0,
              }}>
                Drop a geometry file here
              </p>
              <p style={{
                fontFamily: 'Outfit,sans-serif', fontSize: '0.82rem',
                color: '#636880', marginTop: 4,
              }}>
                or click to browse — .dat .csv .json .stl .obj
              </p>
            </div>
          </>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {/* ── Parse result ───────────────────────────────────────────────── */}
      {result && <ParseResult result={result} onLoad={loadIntoDesign} />}

      {/* ── Format reference ───────────────────────────────────────────── */}
      <h2 style={{
        fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: '1rem',
        color: '#fff', marginBottom: 12, marginTop: result ? 32 : 0,
      }}>
        Supported Formats
      </h2>
      <div className="card-sm" style={{ marginBottom: 32, overflow: 'hidden' }}>
        {FORMATS.map((fmt, i) => (
          <div
            key={fmt.ext}
            onClick={() => setExpandedFmt(expandedFmt === i ? null : i)}
            style={{
              borderBottom: i < FORMATS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              background: expandedFmt === i ? 'rgba(0,200,255,0.04)' : 'transparent',
              transition: 'background 0.15s',
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono,monospace', fontSize: '0.75rem',
                color: 'var(--arc)', minWidth: 90, flexShrink: 0,
              }}>{fmt.ext}</span>
              <span style={{
                fontFamily: 'Outfit,sans-serif', fontWeight: 500,
                fontSize: '0.88rem', color: '#dde2ed', flex: 1,
              }}>{fmt.label}</span>
              <ChevronRight
                size={14}
                style={{
                  color: '#636880', flexShrink: 0,
                  transform: expandedFmt === i ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.2s',
                }}
              />
            </div>
            {expandedFmt === i && (
              <div style={{
                padding: '0 16px 14px 118px',
                fontFamily: 'Outfit,sans-serif', fontSize: '0.82rem',
                color: '#a8b2c8', lineHeight: 1.6,
              }}>
                {fmt.desc}
                {fmt.example && (
                  <pre style={{
                    marginTop: 8,
                    fontFamily: 'JetBrains Mono,monospace',
                    fontSize: '0.68rem',
                    color: '#636880',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    overflowX: 'auto',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {fmt.example}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Upload history ─────────────────────────────────────────────── */}
      <h2 style={{
        fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: '1rem',
        color: '#fff', marginBottom: 12,
      }}>
        Uploaded Designs
      </h2>

      {loadingList ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0' }}>
          <Spinner size={16} />
          <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: '0.85rem', color: '#636880' }}>
            Loading…
          </span>
        </div>
      ) : uploads.length === 0 ? (
        <div className="card-sm" style={{ padding: '28px 20px', textAlign: 'center' }}>
          <FileText size={24} style={{ color: '#3e4257', margin: '0 auto 10px' }} />
          <p style={{
            fontFamily: 'Outfit,sans-serif', fontSize: '0.85rem',
            color: '#636880', margin: 0,
          }}>
            No uploads yet — drop a file above to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {uploads.map(u => (
            <UploadRow
              key={u.upload_id}
              upload={u}
              onLoad={() => loadIntoDesign(u.params)}
              onDelete={() => deleteUpload(u.upload_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ParseResult — shows extracted params + geometry preview + load button
// ─────────────────────────────────────────────────────────────────────────────

function ParseResult({ result, onLoad }) {
  const params  = result.params  || {}
  const airfoil = result.airfoil || null
  const warns   = result.warnings || []
  const sections = result.sections || []

  return (
    <div className="card card-glow-blue animate-slide-up" style={{ padding: 20, marginBottom: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <CheckCircle size={16} style={{ color: 'var(--phosphor)' }} />
            <span style={{
              fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: '0.95rem', color: '#fff',
            }}>
              {result.filename}
            </span>
            <span className="badge badge-blue" style={{ fontSize: '0.62rem' }}>
              {result.format?.toUpperCase() || 'PARSED'}
            </span>
            {result.has_3d && (
              <span className="badge badge-amber" style={{ fontSize: '0.62rem' }}>3D MESH</span>
            )}
          </div>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.68rem', color: '#636880' }}>
            ID: {result.upload_id}
            {result.n_points > 0 && ` · ${result.n_points.toLocaleString()} points`}
            {sections.length > 0 && ` · ${sections.length} sections`}
          </span>
        </div>
        <button
          onClick={() => onLoad(params)}
          className="btn-primary"
          style={{ padding: '8px 18px', fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Load into Design →
        </button>
      </div>

      {/* Warnings */}
      {warns.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14,
          padding: '10px 14px',
          background: 'rgba(255,176,32,0.05)',
          border: '1px solid rgba(255,176,32,0.18)',
          borderRadius: 10,
        }}>
          {warns.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={12} style={{ color: 'var(--ember)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: '0.78rem', color: '#d4a84b' }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: airfoil ? '1fr 1fr' : '1fr', gap: 16 }}>

        {/* Extracted params */}
        <div>
          <p className="label" style={{ marginBottom: 8 }}>Extracted Parameters</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(PARAM_LABELS).map(([key, { label, unit }]) => (
              <div
                key={key}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: '0.8rem', color: '#a8b2c8' }}>
                  {label}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.8rem', color: '#fff' }}>
                  {typeof params[key] === 'number'
                    ? params[key].toFixed(key === 'aspect_ratio' ? 2 : 1)
                    : '–'
                  }
                  {unit && (
                    <span style={{ color: '#636880', marginLeft: 3, fontSize: '0.7rem' }}>{unit}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Geometry preview */}
        {airfoil && (
          <div>
            <p className="label" style={{ marginBottom: 8 }}>Geometry Preview</p>
            <div className="card-sm" style={{ padding: 12 }}>
              <WingCanvas
                geometry={{
                  x_upper: airfoil.x_upper, y_upper: airfoil.y_upper,
                  x_lower: airfoil.x_lower, y_lower: airfoil.y_lower,
                  x_camber: airfoil.x_camber, y_camber: airfoil.y_camber,
                }}
                height={120}
              />
            </div>
            {sections.length > 1 && (
              <p style={{
                fontFamily: 'JetBrains Mono,monospace', fontSize: '0.65rem',
                color: '#636880', marginTop: 6,
              }}>
                {sections.length} spanwise cross-sections extracted — showing mid-span
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UploadRow — single row in upload history
// ─────────────────────────────────────────────────────────────────────────────

function UploadRow({ upload, onLoad, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const date = upload.uploaded_at
    ? new Date(upload.uploaded_at * 1000).toLocaleString()
    : ''

  return (
    <div
      className="card-sm"
      style={{ padding: 0, overflow: 'hidden', transition: 'border-color 0.2s' }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <FileText size={15} style={{ color: 'var(--arc)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: 'Outfit,sans-serif', fontWeight: 500, fontSize: '0.85rem',
              color: '#dde2ed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {upload.filename}
            </span>
            <span className="badge badge-gray" style={{ fontSize: '0.6rem', flexShrink: 0 }}>
              {upload.format?.toUpperCase()}
            </span>
            {upload.has_3d && (
              <span className="badge badge-amber" style={{ fontSize: '0.6rem', flexShrink: 0 }}>3D</span>
            )}
          </div>
          <span style={{
            fontFamily: 'JetBrains Mono,monospace', fontSize: '0.62rem', color: '#3e4257',
          }}>
            {date} · ID: {upload.upload_id}
          </span>
        </div>

        <button
          onClick={e => { e.stopPropagation(); onLoad() }}
          className="btn-secondary"
          style={{ padding: '5px 12px', fontSize: '0.75rem', flexShrink: 0 }}
        >
          Load
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#636880', display: 'flex', alignItems: 'center',
            padding: 4, borderRadius: 6,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--signal)'}
          onMouseLeave={e => e.currentTarget.style.color = '#636880'}
        >
          <Trash2 size={14} />
        </button>
        <ChevronRight
          size={13}
          style={{
            color: '#3e4257',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </div>

      {expanded && (
        <div style={{
          padding: '0 14px 14px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          animation: 'slideUp 0.2s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 6,
            marginTop: 12,
          }}>
            {upload.params && Object.entries(PARAM_LABELS).map(([key, { label, unit }]) => (
              <div
                key={key}
                style={{
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.6rem', color: '#636880', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.82rem', color: '#dde2ed' }}>
                  {typeof upload.params[key] === 'number'
                    ? upload.params[key].toFixed(key === 'aspect_ratio' ? 2 : 1)
                    : '–'
                  }
                  <span style={{ color: '#3e4257', fontSize: '0.65rem', marginLeft: 2 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
          {upload.warnings?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {upload.warnings.map((w, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 6, alignItems: 'flex-start',
                  fontFamily: 'Outfit,sans-serif', fontSize: '0.75rem', color: '#d4a84b',
                  marginTop: 3,
                }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
