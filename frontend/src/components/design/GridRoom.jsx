import { useRef, useMemo } from 'react'
import { Grid, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const W = 24, H = 14, D = 30 // room dimensions
const hw = W / 2, hd = D / 2
const FLOOR_Y = -2.2

// Box-frame edges of the holographic room
const FRAME_EDGES = [
  // Floor rect
  [[-hw, FLOOR_Y, -hd], [hw, FLOOR_Y, -hd]],
  [[hw, FLOOR_Y, -hd], [hw, FLOOR_Y, hd]],
  [[hw, FLOOR_Y, hd], [-hw, FLOOR_Y, hd]],
  [[-hw, FLOOR_Y, hd], [-hw, FLOOR_Y, -hd]],
  // Ceiling rect
  [[-hw, FLOOR_Y + H, -hd], [hw, FLOOR_Y + H, -hd]],
  [[hw, FLOOR_Y + H, -hd], [hw, FLOOR_Y + H, hd]],
  [[hw, FLOOR_Y + H, hd], [-hw, FLOOR_Y + H, hd]],
  [[-hw, FLOOR_Y + H, hd], [-hw, FLOOR_Y + H, -hd]],
  // Vertical pillars
  [[-hw, FLOOR_Y, -hd], [-hw, FLOOR_Y + H, -hd]],
  [[hw, FLOOR_Y, -hd], [hw, FLOOR_Y + H, -hd]],
  [[hw, FLOOR_Y, hd], [hw, FLOOR_Y + H, hd]],
  [[-hw, FLOOR_Y, hd], [-hw, FLOOR_Y + H, hd]],
]

// Build a flat grid of line segments as a buffer geometry
function makeGridGeo(width, height, divX, divY) {
  const pts = []
  for (let i = 0; i <= divX; i++) {
    const x = -width / 2 + (i / divX) * width
    pts.push(x, -height / 2, 0, x, height / 2, 0)
  }
  for (let j = 0; j <= divY; j++) {
    const y = -height / 2 + (j / divY) * height
    pts.push(-width / 2, y, 0, width / 2, y, 0)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return geo
}

function WallGrid({ width, height, position, rotation, opacity = 0.18 }) {
  const geo = useMemo(() => makeGridGeo(width, height, 14, 8), [width, height])
  return (
    <lineSegments geometry={geo} position={position} rotation={rotation}>
      <lineBasicMaterial color={0x003850} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

// Horizontal scan ring that floats through the room
function ScanLine() {
  const ref = useRef()
  const pts = useMemo(() => [
    new THREE.Vector3(-hw, 0, -hd),
    new THREE.Vector3(hw, 0, -hd),
    new THREE.Vector3(hw, 0, hd),
    new THREE.Vector3(-hw, 0, hd),
    new THREE.Vector3(-hw, 0, -hd),
  ], [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = (clock.elapsedTime * 0.12) % 1
    ref.current.position.y = FLOOR_Y + t * H
    const a = Math.sin(t * Math.PI) * 0.07
    if (ref.current.material) ref.current.material.opacity = a
  })

  return (
    <Line
      ref={ref}
      points={pts}
      color={0x00e5ff}
      lineWidth={1}
      transparent
      opacity={0.04}
    />
  )
}

// Corner accent marks at the floor
function CornerAccents() {
  const len = 1.8
  const corners = [
    { pos: [-hw, FLOOR_Y, -hd], lines: [[len, 0, 0], [0, 0, len]] },
    { pos: [hw, FLOOR_Y, -hd],  lines: [[-len, 0, 0], [0, 0, len]] },
    { pos: [hw, FLOOR_Y, hd],   lines: [[-len, 0, 0], [0, 0, -len]] },
    { pos: [-hw, FLOOR_Y, hd],  lines: [[len, 0, 0], [0, 0, -len]] },
  ]
  return (
    <>
      {corners.map(({ pos, lines }, ci) =>
        lines.map((dir, li) => (
          <Line
            key={`${ci}-${li}`}
            points={[pos, [pos[0] + dir[0], pos[1] + dir[1], pos[2] + dir[2]]]}
            color={0x00e5ff}
            lineWidth={1.2}
            transparent
            opacity={0.55}
          />
        ))
      )}
    </>
  )
}

export default function GridRoom() {
  return (
    <group>
      {/* Floor grid */}
      <Grid
        position={[0, FLOOR_Y, 0]}
        args={[W, D]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#001e2e"
        sectionSize={4}
        sectionThickness={0.7}
        sectionColor="#005070"
        fadeDistance={26}
        fadeStrength={1.4}
        followCamera={false}
        infiniteGrid={false}
      />

      {/* Room frame */}
      {FRAME_EDGES.map(([s, e], i) => (
        <Line
          key={i}
          points={[s, e]}
          color={0x00e5ff}
          lineWidth={0.5}
          transparent
          opacity={0.18}
        />
      ))}

      {/* Wall grids */}
      <WallGrid
        width={W} height={H}
        position={[0, FLOOR_Y + H / 2, -hd]}
        rotation={[0, 0, 0]}
        opacity={0.13}
      />
      <WallGrid
        width={D} height={H}
        position={[-hw, FLOOR_Y + H / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        opacity={0.10}
      />
      <WallGrid
        width={D} height={H}
        position={[hw, FLOOR_Y + H / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        opacity={0.10}
      />

      <CornerAccents />
      <ScanLine />
    </group>
  )
}
