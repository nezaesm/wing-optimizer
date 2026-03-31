// WaveBackground.jsx — converted from TS reference, tuned for sci-fi cyan aesthetic
// Uses simplex-noise for organic wave motion that reacts to cursor
import { useEffect, useRef } from 'react'
import { createNoise2D } from 'simplex-noise'

export function WaveBackground({
  strokeColor     = 'rgba(0, 229, 255, 0.12)',
  backgroundColor = 'transparent',
  xGap            = 22,    // horizontal spacing between lines
  yGap            = 11,    // vertical point density per line
}) {
  const containerRef = useRef(null)
  const svgRef       = useRef(null)
  const mouseRef     = useRef({ x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false })
  const pathsRef     = useRef([])
  const linesRef     = useRef([])
  const noiseRef     = useRef(null)
  const rafRef       = useRef(null)
  const boundingRef  = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return

    noiseRef.current = createNoise2D()
    setSize()
    setLines()

    window.addEventListener('resize',    onResize)
    window.addEventListener('mousemove', onMouseMove)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize',    onResize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Measure container ────────────────────────────────────────────────────
  const setSize = () => {
    if (!containerRef.current || !svgRef.current) return
    boundingRef.current = containerRef.current.getBoundingClientRect()
    const { width, height } = boundingRef.current
    svgRef.current.style.width  = `${width}px`
    svgRef.current.style.height = `${height}px`
  }

  // ── Build SVG path grid ─────────────────────────────────────────────────
  const setLines = () => {
    if (!svgRef.current || !boundingRef.current) return
    const { width, height } = boundingRef.current

    linesRef.current = []
    pathsRef.current.forEach(p => p.remove())
    pathsRef.current = []

    const oWidth     = width + 200
    const oHeight    = height + 30
    const totalLines = Math.ceil(oWidth  / xGap)
    const totalPts   = Math.ceil(oHeight / yGap)
    const xStart     = (width  - xGap * totalLines) / 2
    const yStart     = (height - yGap * totalPts)   / 2

    for (let i = 0; i < totalLines; i++) {
      const points = []
      for (let j = 0; j < totalPts; j++) {
        points.push({
          x: xStart + xGap * i,
          y: yStart + yGap * j,
          wave:   { x: 0, y: 0 },
          cursor: { x: 0, y: 0, vx: 0, vy: 0 },
        })
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('fill',         'none')
      path.setAttribute('stroke',       strokeColor)
      path.setAttribute('stroke-width', '1')
      svgRef.current.appendChild(path)
      pathsRef.current.push(path)
      linesRef.current.push(points)
    }
  }

  const onResize    = () => { setSize(); setLines() }
  const onMouseMove = (e) => {
    if (!boundingRef.current) return
    const m = mouseRef.current
    m.x = e.pageX - boundingRef.current.left
    m.y = e.pageY - boundingRef.current.top + window.scrollY
    if (!m.set) {
      m.sx = m.x; m.sy = m.y
      m.lx = m.x; m.ly = m.y
      m.set = true
    }
  }

  // ── Per-frame wave + cursor influence ───────────────────────────────────
  const movePoints = (time) => {
    const lines = linesRef.current
    const mouse = mouseRef.current
    const noise = noiseRef.current
    if (!noise) return

    lines.forEach(points => {
      points.forEach(p => {
        const move = noise(
          (p.x + time * 0.008) * 0.003,
          (p.y + time * 0.003) * 0.002,
        ) * 8
        p.wave.x = Math.cos(move) * 12
        p.wave.y = Math.sin(move) * 6

        const dx = p.x - mouse.sx
        const dy = p.y - mouse.sy
        const d  = Math.hypot(dx, dy)
        const l  = Math.max(175, mouse.vs)

        if (d < l) {
          const s = 1 - d / l
          const f = Math.cos(d * 0.001) * s
          p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00035
          p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00035
        }

        p.cursor.vx += (0 - p.cursor.x) * 0.01
        p.cursor.vy += (0 - p.cursor.y) * 0.01
        p.cursor.vx *= 0.95
        p.cursor.vy *= 0.95
        p.cursor.x  += p.cursor.vx
        p.cursor.y  += p.cursor.vy
        p.cursor.x   = Math.min(50, Math.max(-50, p.cursor.x))
        p.cursor.y   = Math.min(50, Math.max(-50, p.cursor.y))
      })
    })
  }

  const moved = (p, withCursor = true) => ({
    x: p.x + p.wave.x + (withCursor ? p.cursor.x : 0),
    y: p.y + p.wave.y + (withCursor ? p.cursor.y : 0),
  })

  const drawLines = () => {
    linesRef.current.forEach((points, li) => {
      if (points.length < 2 || !pathsRef.current[li]) return
      const first = moved(points[0], false)
      let d = `M ${first.x} ${first.y}`
      for (let i = 1; i < points.length; i++) {
        const c = moved(points[i])
        d += ` L ${c.x} ${c.y}`
      }
      pathsRef.current[li].setAttribute('d', d)
    })
  }

  const tick = (time) => {
    const m  = mouseRef.current
    m.sx    += (m.x - m.sx) * 0.1
    m.sy    += (m.y - m.sy) * 0.1
    const dx = m.x - m.lx
    const dy = m.y - m.ly
    const d  = Math.hypot(dx, dy)
    m.v      = d
    m.vs    += (d - m.vs) * 0.1
    m.vs     = Math.min(100, m.vs)
    m.lx     = m.x
    m.ly     = m.y
    m.a      = Math.atan2(dy, dx)

    movePoints(time)
    drawLines()
    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <div
      ref={containerRef}
      style={{
        position:      'absolute',
        inset:         0,
        backgroundColor,
        overflow:      'hidden',
        pointerEvents: 'none',   // don't block clicks on content above
      }}
    >
      <svg
        ref={svgRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        xmlns="http://www.w3.org/2000/svg"
      />
    </div>
  )
}
