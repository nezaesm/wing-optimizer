// WaveDots.jsx — Cinematic dotted terrain landscape (GPU shader-based)
// Matches WorldQuant Foundry reference: organic hills, perspective depth, no rect bounds.
// All terrain displacement runs on GPU — zero per-frame JS work beyond uTime tick.
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Grid: 200 × 130 = 26 000 points — ≈ 170 u wide × 105 u deep
const COLS = 200
const ROWS = 130
const SEP  = 0.85   // world-unit spacing

// ── Vertex shader ──────────────────────────────────────────────────────────────
const vertexShader = /* glsl */`
uniform float uTime;
varying float vAlpha;

// Hash without sin — avoids precision artifacts on some drivers
vec2 hash2(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(vec2(p.x * p.y, p.x + p.y)) * 2.0 - 1.0;
}

// Smooth gradient noise
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

// 3-octave fBm — produces organic mountain terrain
float fbm(vec2 p) {
  float v = 0.0;
  v += 0.500 * gnoise(p);
  v += 0.250 * gnoise(p * 2.07 + vec2(5.2, 1.3));
  v += 0.125 * gnoise(p * 4.31 + vec2(1.7, 9.2));
  return v;   // range ≈ [−0.875, +0.875]
}

void main() {
  vec3 pos = position;

  // ── Terrain displacement ────────────────────────────────────────────────────
  // Primary organic hills via fBm (slow drift over time)
  float n = fbm(pos.xz * 0.13 + uTime * 0.016);
  pos.y += n * 3.4;

  // Secondary gentle rolling swell (different frequencies for richness)
  pos.y += sin(pos.x * 0.22 + uTime * 0.10) * 0.40;
  pos.y += cos(pos.z * 0.18 + uTime * 0.07) * 0.32;

  // ── Depth calculations ──────────────────────────────────────────────────────
  vec4 mvPos  = modelViewMatrix * vec4(pos, 1.0);
  float depth = -mvPos.z;   // positive = in front of camera
  float tDepth = clamp(depth / 88.0, 0.0, 1.0);

  // ── Point size: large near, tiny far (perspective simulation on top of GL) ──
  gl_PointSize = mix(4.8, 0.6, tDepth * tDepth);

  // ── Opacity layers ──────────────────────────────────────────────────────────
  // 1. Depth fade: strong falloff in background
  float sq      = tDepth * tDepth * 1.05;
  float depthFade = 1.0 - smoothstep(0.0, 1.0, sq);

  // 2. Lateral edge fade: only clips very extreme X edges — keeps it wide
  float xEdge  = 1.0 - smoothstep(0.72, 1.0, abs(pos.x) / 82.0);

  // 3. Near-camera fade: hide dots right under camera
  float nearFade = smoothstep(1.5, 9.0, depth);

  vAlpha = depthFade * xEdge * nearFade * 0.84;

  gl_Position = projectionMatrix * mvPos;
}
`

// ── Fragment shader ────────────────────────────────────────────────────────────
const fragmentShader = /* glsl */`
varying float vAlpha;

void main() {
  // Soft antialiased circle — discard outside radius
  vec2  uv = gl_PointCoord - 0.5;
  float d  = length(uv);
  if (d > 0.5) discard;

  float aa = 1.0 - smoothstep(0.30, 0.50, d);
  // Silver-white color matching project palette (SF.cyanBright ≈ #f0f0f0)
  gl_FragColor = vec4(0.87, 0.88, 0.92, vAlpha * aa);
}
`

// ── Component ─────────────────────────────────────────────────────────────────
export default function WaveDots() {
  const pointsRef = useRef()

  // Respect prefers-reduced-motion — stop animation but keep terrain visible
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )

  // Build flat XZ grid once — terrain Y displaced entirely in vertex shader
  const geometry = useMemo(() => {
    const count = COLS * ROWS
    const pos   = new Float32Array(count * 3)
    let i = 0
    for (let ir = 0; ir < ROWS; ir++) {
      for (let ic = 0; ic < COLS; ic++) {
        // X: centred at 0, spans ≈ ±85 u
        pos[i * 3]     = (ic - COLS / 2) * SEP
        // Y: zeroed; shader displaces
        pos[i * 3 + 1] = 0
        // Z: from +6 (just in front of camera) → −103 (deep background)
        pos[i * 3 + 2] = 6.0 - ir * SEP
        i++
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return geo
  }, [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  // Only update the time uniform — no geometry mutations
  useFrame((_, delta) => {
    if (reducedMotion.current) return
    if (pointsRef.current) {
      pointsRef.current.material.uniforms.uTime.value += delta
    }
  })

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      position={[0, -3.8, 0]}
    />
  )
}
