// SectionTitle.jsx — 3D particle titles for sections §1–§6
// Canvas pixel sampling → particle BufferGeometry in R3F world space
// Particles lerp between dispersed (explosion) and formed (text) states
// Titles are angled ~50° around Y, slightly toward camera, Z-scattered for depth
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SECTION_NAMES = ['Design', 'Train', 'Optimize', 'Validate', 'Sensitivity', 'Dataset', 'About', 'Upload']
// Particle titles only for §1–§6
const TITLE_SECTIONS = [1, 2, 3, 4, 5, 6]

// Z positions matching NavRail world positions when rail is at group.position.z=0
// These are fixed world-space Z positions for each section's title
const SECTION_WORLD_Z = [5.0, 3.0, 0.8, -1.2, -3.2, -5.2, -7.2, -9.2]

const STRIDE      = 4
const Y_LAYERS    = 2
const Z_SCATTER   = 0.7
const CANVAS_W    = 800
const CANVAS_H    = 128
const SCALE       = 42      // world units per canvas pixel

async function buildParticlePositions(text) {
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width  = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = 'white'
  ctx.font = `800 80px Syne, sans-serif`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2)

  const { data } = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)
  const positions = []

  for (let cy = 0; cy < CANVAS_H; cy += STRIDE) {
    for (let cx = 0; cx < CANVAS_W; cx += STRIDE) {
      const idx = (cy * CANVAS_W + cx) * 4
      if (data[idx + 3] > 120) {
        for (let layer = 0; layer < Y_LAYERS; layer++) {
          const wx = (cx - CANVAS_W / 2) / SCALE
          const wy = (CANVAS_H / 2 - cy) / SCALE + layer * 0.13
          const wz = (Math.random() - 0.5) * Z_SCATTER
          positions.push(wx, wy, wz)
        }
      }
    }
  }

  return new Float32Array(positions)
}

// ── Single section title ─────────────────────────────────────────────────────
function TitleParticles({ name, sectionIndex, scrollProxy }) {
  const [ready, setReady] = useState(false)
  const particlesRef  = useRef(null)   // formed positions
  const dispersedRef  = useRef(null)   // explosion positions
  const geoRef        = useRef(null)
  const matRef        = useRef(new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.038,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  }))

  useEffect(() => {
    const mat = matRef.current

    buildParticlePositions(name).then(pos => {
      particlesRef.current = pos

      // Random dispersed positions — particles start here, fly to text shape
      const dispersed = new Float32Array(pos.length)
      for (let i = 0; i < pos.length; i += 3) {
        dispersed[i]     = (Math.random() - 0.5) * 14
        dispersed[i + 1] = (Math.random() - 0.5) * 7
        dispersed[i + 2] = (Math.random() - 0.5) * 9
      }
      dispersedRef.current = dispersed

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(dispersed.slice(), 3))
      geoRef.current = geo

      setReady(true)
    })

    return () => {
      mat.dispose()
      geoRef.current?.dispose()
    }
  }, [name])

  useFrame(() => {
    if (!ready || !particlesRef.current || !dispersedRef.current || !geoRef.current) return

    const t = scrollProxy.current.progress
    // formProgress: 1 at target section, falls off to 0 at ±0.5 section away
    const formProgress = Math.max(0, 1 - Math.abs(t - sectionIndex) * 2)

    matRef.current.opacity = formProgress * 0.88

    // Skip heavy position updates when invisible
    if (formProgress < 0.005) return

    const posAttr  = geoRef.current.attributes.position
    const formed   = particlesRef.current
    const disp     = dispersedRef.current

    for (let i = 0; i < formed.length; i++) {
      posAttr.array[i] = disp[i] + (formed[i] - disp[i]) * formProgress
    }
    posAttr.needsUpdate = true
  })

  if (!ready) return null

  return (
    <group
      position={[3.2, 1.6, SECTION_WORLD_Z[sectionIndex]]}
      rotation={[0.06, -Math.PI * 0.28, 0]}
    >
      <points geometry={geoRef.current} material={matRef.current} />
    </group>
  )
}

// ── All titles ───────────────────────────────────────────────────────────────
export default function SectionTitle({ scrollProxy }) {
  return (
    <>
      {TITLE_SECTIONS.map(idx => (
        <TitleParticles
          key={idx}
          name={SECTION_NAMES[idx]}
          sectionIndex={idx}
          scrollProxy={scrollProxy}
        />
      ))}
    </>
  )
}
