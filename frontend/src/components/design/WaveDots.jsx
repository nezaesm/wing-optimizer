// WaveDots.jsx — Animated dotted wave surface (replaces GridRoom)
// Renders entirely inside the existing R3F Canvas — no second WebGL context.
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Grid density
const AMOUNTX = 38
const AMOUNTY = 54
const SEP     = 0.64          // spacing between dots (scene units)
const FLOOR_Y = -2.2          // matches existing room floor
const WAVE_AMP = 0.26         // peak wave height in scene units
const SPEED    = 0.072        // animation speed (radians per frame)

// Cyan spectrum for vertex coloring  ─  trough → peak
// Trough: #001828   Peak: #00e5ff  (matches SF.cyan)
const R_LO = 0,       R_HI = 0
const G_LO = 0.094,   G_HI = 0.898   // 24/255 → 229/255
const B_LO = 0.157,   B_HI = 1.0     // 40/255 → 255/255

export default function WaveDots() {
  const countRef = useRef(0)

  // ── Build geometry once ─────────────────────────────────────────────────────
  const geometry = useMemo(() => {
    const count     = AMOUNTX * AMOUNTY
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)

    let i = 0
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iz = 0; iz < AMOUNTY; iz++) {
        positions[i * 3]     = ix * SEP - (AMOUNTX * SEP) / 2
        positions[i * 3 + 1] = 0         // animated in useFrame
        positions[i * 3 + 2] = iz * SEP - (AMOUNTY * SEP) / 2
        // Start at trough color
        colors[i * 3]     = R_LO
        colors[i * 3 + 1] = G_LO
        colors[i * 3 + 2] = B_LO
        i++
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3))
    return geo
  }, [])

  // Dispose on unmount
  useEffect(() => () => geometry.dispose(), [geometry])

  // ── Animate wave each frame ─────────────────────────────────────────────────
  useFrame(() => {
    const pos = geometry.attributes.position.array
    const col = geometry.attributes.color.array
    const c   = countRef.current

    let i = 0
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iz = 0; iz < AMOUNTY; iz++) {
        // Two overlapping sine waves — same formula as original DottedSurface
        const wave =
          Math.sin((ix + c) * 0.3) * WAVE_AMP +
          Math.sin((iz + c) * 0.5) * WAVE_AMP

        pos[i * 3 + 1] = wave

        // Map wave [-WAVE_AMP*2 … +WAVE_AMP*2] → t [0 … 1]
        const t = (wave / (WAVE_AMP * 2)) * 0.5 + 0.5

        col[i * 3]     = R_LO + t * (R_HI - R_LO)
        col[i * 3 + 1] = G_LO + t * (G_HI - G_LO)
        col[i * 3 + 2] = B_LO + t * (B_HI - B_LO)

        i++
      }
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate    = true
    countRef.current += SPEED
  })

  return (
    <points geometry={geometry} position={[0, FLOOR_Y, 0]}>
      <pointsMaterial
        size={0.055}
        vertexColors
        transparent
        opacity={0.52}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
