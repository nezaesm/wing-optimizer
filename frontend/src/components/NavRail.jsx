// NavRail.jsx — 3D navigation rail in R3F world space
// Lives at x=4.2, nodes extend along Z axis
// Group shifts in Z so active section node is always at world z≈0
// Previous node (toward camera, higher Z): faint
// Next node (into screen, lower Z): faint
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SECTION_COUNT = 8
// Local Z positions of each section node within the rail group
const SECTION_Z = [2.0, 0.4, -1.2, -2.8, -4.4, -6.0, -7.6, -9.2]
const RAIL_X = 4.2
const RAIL_Y = 0
const NODE_RADIUS = 0.06
const GLOW_RADIUS = 0.12

export default function NavRail({ scrollProxy }) {
  const groupRef   = useRef()
  const nodeRefs   = useRef([])
  const glowRef    = useRef()
  const lineRef    = useRef()

  const lineGeo = useMemo(() => {
    const points = SECTION_Z.map(z => new THREE.Vector3(0, 0, z))
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [])

  const lineMat = useMemo(() => new THREE.LineBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.25,
  }), [])

  useEffect(() => () => { lineGeo.dispose(); lineMat.dispose() }, [lineGeo, lineMat])

  useFrame(() => {
    if (!groupRef.current) return
    const t = scrollProxy.current.progress
    const active = Math.max(0, Math.min(SECTION_COUNT - 1, Math.round(t)))

    // Shift entire group so active node lands at world z≈0
    groupRef.current.position.z = -SECTION_Z[active]

    // Update each node's appearance
    nodeRefs.current.forEach((node, i) => {
      if (!node?.material) return
      const diff = i - active
      if (diff === 0) {
        node.material.opacity = 0.9
        node.material.color.setHex(0xffffff)
        node.scale.setScalar(1.0)
      } else if (diff === 1) {        // previous — toward camera
        node.material.opacity = 0.25
        node.material.color.setHex(0xaaaaaa)
        node.scale.setScalar(0.75)
      } else if (diff === -1) {       // next — into screen
        node.material.opacity = 0.20
        node.material.color.setHex(0x888888)
        node.scale.setScalar(0.65)
      } else {
        node.material.opacity = 0.07
        node.material.color.setHex(0x555555)
        node.scale.setScalar(0.5)
      }
    })

    // Reposition glow ring to active node
    if (glowRef.current) {
      glowRef.current.position.z = SECTION_Z[active]
    }
  })

  return (
    <group ref={groupRef} position={[RAIL_X, RAIL_Y, 0]}>
      {/* Connecting line along Z */}
      <line ref={lineRef} geometry={lineGeo} material={lineMat} />

      {/* Section nodes */}
      {Array.from({ length: SECTION_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={el => (nodeRefs.current[i] = el)}
          position={[0, 0, SECTION_Z[i]]}
        >
          <sphereGeometry args={[NODE_RADIUS, 8, 6]} />
          <meshBasicMaterial
            color={0xffffff}
            transparent
            opacity={0.07}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Glow ring on active node */}
      <mesh
        ref={glowRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, SECTION_Z[0]]}
      >
        <ringGeometry args={[GLOW_RADIUS * 0.75, GLOW_RADIUS * 1.25, 20]} />
        <meshBasicMaterial
          color={0xffffff}
          transparent
          opacity={0.38}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
