import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'

const SCALE = 1.9   // chord length in scene units
const N_SPAN = 32   // span-wise divisions

/**
 * Build the wing surface geometry (open-ended tube along span).
 */
function buildWingGeo(profile2d, params, params3d) {
  const { aspect_ratio = 3.5 } = params
  const { taper_ratio = 1.0, sweep_deg = 0, twist_deg = 0 } = params3d

  const span = aspect_ratio * SCALE
  const sweepRad = (sweep_deg * Math.PI) / 180
  const N_P = profile2d.length
  const positions = [], uvs = [], indices = []

  for (let si = 0; si <= N_SPAN; si++) {
    const t = si / N_SPAN
    const z = (t - 0.5) * span
    const absT = Math.abs(2 * t - 1)
    const cScale = 1.0 - absT * (1.0 - taper_ratio)
    const sweepOff = Math.sign(z || 1) * absT * span * 0.5 * Math.tan(sweepRad)
    const twistRad = absT * twist_deg * (Math.PI / 180)
    const cosA = Math.cos(twistRad), sinA = Math.sin(twistRad)

    for (let pi = 0; pi < N_P; pi++) {
      const [px, py] = profile2d[pi]
      const sx = px * cScale * SCALE
      const sy = py * cScale * SCALE
      const rx = cosA * sx - sinA * sy
      const ry = sinA * sx + cosA * sy
      positions.push(rx + sweepOff, ry, z)
      uvs.push(pi / (N_P - 1), t)
    }
  }

  for (let si = 0; si < N_SPAN; si++) {
    for (let pi = 0; pi < N_P; pi++) {
      const nextPi = (pi + 1) % N_P
      const a = si * N_P + pi,        b = si * N_P + nextPi
      const c = (si + 1) * N_P + pi,  d = (si + 1) * N_P + nextPi
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/**
 * Build a filled wingtip cap at the left (side=-1) or right (side=+1) tip.
 * Closes the hollow airfoil tube so the wing looks solid from every angle.
 */
function buildWingtipGeo(profile2d, params, params3d, side) {
  const { aspect_ratio = 3.5 } = params
  const { taper_ratio = 1.0, sweep_deg = 0, twist_deg = 0 } = params3d

  const span = aspect_ratio * SCALE
  const sweepRad = (sweep_deg * Math.PI) / 180
  const z = side * span * 0.5
  // absT = 1 at both tips
  const cScale = taper_ratio
  const sweepOff = side * span * 0.5 * Math.tan(sweepRad)
  const twistRad = twist_deg * (Math.PI / 180)
  const cosA = Math.cos(twistRad), sinA = Math.sin(twistRad)

  const shape = new THREE.Shape()
  profile2d.forEach(([px, py], i) => {
    const sx = px * cScale * SCALE
    const sy = py * cScale * SCALE
    const rx = cosA * sx - sinA * sy
    const ry = sinA * sx + cosA * sy
    if (i === 0) shape.moveTo(rx + sweepOff, ry)
    else         shape.lineTo(rx + sweepOff, ry)
  })

  const geo = new THREE.ShapeGeometry(shape)
  geo.translate(0, 0, z)
  return geo
}

/**
 * Build a flat endplate at a wingtip.
 */
function buildEndplateGeo(params, side = 1) {
  const { aspect_ratio = 3.5, endplate_h_pct = 15 } = params
  const span = aspect_ratio * SCALE
  const epH = (endplate_h_pct / 100) * span * 0.18
  const chordW = SCALE * 0.85
  const z = side * (span / 2)
  const geo = new THREE.PlaneGeometry(chordW, epH)
  geo.translate(0, epH * 0.5, z)
  geo.rotateY(Math.PI / 2)
  return geo
}

/**
 * Combine upper + lower surface coords into a closed 2D profile loop.
 */
function makeProfile2D(geoData) {
  if (!geoData) return null
  const { x_upper, y_upper, x_lower, y_lower } = geoData
  const N = x_upper.length
  const profile = []
  for (let i = 0; i < N; i++) profile.push([x_upper[i] - 0.5, y_upper[i]])
  for (let i = N - 2; i >= 1; i--) profile.push([x_lower[i] - 0.5, y_lower[i]])
  return profile
}

// Fallback NACA-like profile when API is offline
const DEFAULT_PROFILE = (() => {
  const pts = [], n = 40
  for (let i = 0; i <= n; i++) {
    const x = i / n
    const y = 0.12 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1015 * x ** 4)
    pts.push([x - 0.5, y])
  }
  for (let i = n - 1; i >= 1; i--) {
    const x = i / n
    pts.push([x - 0.5, -(0.12 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1015 * x ** 4))])
  }
  return pts
})()

export default function WingMesh3D({ geoData, params, params3d, isAnalyzing = false }) {
  const groupRef = useRef()
  const epLeftRef = useRef()
  const epRightRef = useRef()

  const profile2d = useMemo(() => makeProfile2D(geoData) || DEFAULT_PROFILE, [geoData])

  // Geometry — rebuild when shape params change
  const wingGeo = useMemo(
    () => buildWingGeo(profile2d, params, params3d),
    [profile2d, params.aspect_ratio, params3d.taper_ratio, params3d.sweep_deg, params3d.twist_deg]
  )
  const tipLeftGeo  = useMemo(
    () => buildWingtipGeo(profile2d, params, params3d, -1),
    [profile2d, params.aspect_ratio, params3d.taper_ratio, params3d.sweep_deg, params3d.twist_deg]
  )
  const tipRightGeo = useMemo(
    () => buildWingtipGeo(profile2d, params, params3d, +1),
    [profile2d, params.aspect_ratio, params3d.taper_ratio, params3d.sweep_deg, params3d.twist_deg]
  )
  const epLeftGeo  = useMemo(() => buildEndplateGeo(params, -1), [params.aspect_ratio, params.endplate_h_pct])
  const epRightGeo = useMemo(() => buildEndplateGeo(params, +1), [params.aspect_ratio, params.endplate_h_pct])

  // Shared wing material — single instance used by surface + tip caps
  const wingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:             new THREE.Color(0xc4c8d8),
    roughness:         0.12,
    metalness:         0.85,
    emissive:          new THREE.Color(0x282830),
    emissiveIntensity: 0.22,
    side:              THREE.DoubleSide,  // solid from every viewing angle
  }), [])

  // Geometry disposal
  useEffect(() => () => wingGeo.dispose(),    [wingGeo])
  useEffect(() => () => tipLeftGeo.dispose(), [tipLeftGeo])
  useEffect(() => () => tipRightGeo.dispose(),[tipRightGeo])
  useEffect(() => () => epLeftGeo.dispose(),  [epLeftGeo])
  useEffect(() => () => epRightGeo.dispose(), [epRightGeo])
  useEffect(() => () => wingMat.dispose(),    [wingMat])

  // Idle float + analysis flicker
  useFrame(({ clock: c }) => {
    if (!groupRef.current) return
    const t = c.elapsedTime
    groupRef.current.position.y = Math.sin(t * 0.55) * 0.045
    groupRef.current.rotation.y = Math.sin(t * 0.18) * 0.025
    if (isAnalyzing) {
      wingMat.opacity    = 0.72 + Math.sin(t * 12) * 0.08
      wingMat.transparent = true
    } else {
      wingMat.opacity    = 1
      wingMat.transparent = false
    }
  })

  return (
    <group ref={groupRef} position={[0, 0.1, 0]}>
      {/* Wing surface — DoubleSide so both faces render uniformly */}
      <mesh geometry={wingGeo} material={wingMat} castShadow receiveShadow>
        <Edges geometry={wingGeo} color="#c8ccd8" lineWidth={1.0} threshold={14} />
      </mesh>

      {/* Tip caps — close the hollow airfoil tube at each wingtip */}
      <mesh geometry={tipLeftGeo}  material={wingMat} />
      <mesh geometry={tipRightGeo} material={wingMat} />

      {/* Endplates */}
      <mesh ref={epLeftRef} geometry={epLeftGeo}>
        <meshStandardMaterial
          color={0xb0b0c0} roughness={0.18} metalness={0.85}
          emissive={0x141420} emissiveIntensity={0.14}
          side={THREE.DoubleSide}
        />
        <Edges geometry={epLeftGeo} color="#c0c0cc" lineWidth={0.9} threshold={1} />
      </mesh>
      <mesh ref={epRightRef} geometry={epRightGeo}>
        <meshStandardMaterial
          color={0xb0b0c0} roughness={0.18} metalness={0.85}
          emissive={0x141420} emissiveIntensity={0.14}
          side={THREE.DoubleSide}
        />
        <Edges geometry={epRightGeo} color="#c0c0cc" lineWidth={0.9} threshold={1} />
      </mesh>

      {/* Subtle reflection plane */}
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SCALE * 1.1, params.aspect_ratio * SCALE + 0.5]} />
        <meshBasicMaterial
          color={0x282832} transparent opacity={0.08}
          depthWrite={false} blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
