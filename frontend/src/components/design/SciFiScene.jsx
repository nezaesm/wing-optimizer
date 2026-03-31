import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import WaveDots from './WaveDots'
import WingMesh3D from './WingMesh3D'
import Hotspot from './Hotspot'
import { SF } from './tokens'

const SCALE = 1.9

// Hotspot definitions — 5 interactive control points on the wing
function buildHotspots(params, params3d) {
  const AR = (params.aspect_ratio ?? 3.5)
  const halfSpan = AR * SCALE * 0.5
  const chordH = SCALE * 0.5

  return [
    {
      id: 'airfoil',
      position: [-chordH * 0.3, 0.18, 0],
      title: 'AIRFOIL',
      tag: 'SECTION',
      panelDir: 'up',
      paramDefs: [
        { name: 'camber_pct',     label: 'Max Camber',      min: 0, max: 9,  step: 0.1, unit: '%',  description: 'Wing curvature — more = more downforce.' },
        { name: 'camber_pos_pct', label: 'Camber Position', min: 20, max: 60, step: 1,   unit: '%c', description: 'Location of peak curvature along chord.' },
        { name: 'thickness_pct',  label: 'Thickness',       min: 6, max: 20, step: 0.5, unit: '%',  description: 'Section thickness — structural vs drag.' },
      ],
    },
    {
      id: 'aoa',
      position: [-chordH * 0.88, 0.04, halfSpan * 0.3],
      title: 'ATTACK',
      tag: 'AoA',
      panelDir: 'left',
      paramDefs: [
        { name: 'aoa_deg', label: 'Angle of Attack', min: -18, max: 0, step: 0.5, unit: '°', description: 'Pitch into airflow. More negative = more downforce.' },
      ],
    },
    {
      id: 'flap',
      position: [chordH * 0.82, -0.06, -halfSpan * 0.2],
      title: 'FLAP',
      tag: 'TE CONTROL',
      panelDir: 'right',
      paramDefs: [
        { name: 'flap_angle_deg', label: 'Flap Angle',  min: 0, max: 35, step: 1, unit: '°',  description: 'Flap deflection — biggest downforce lever.' },
        { name: 'flap_chord_pct', label: 'Flap Chord',  min: 20, max: 35, step: 1, unit: '%c', description: 'Flap size relative to total chord.' },
      ],
    },
    {
      id: 'span',
      position: [0, 0.06, halfSpan * 0.88],
      title: 'SPAN',
      tag: 'GEOMETRY',
      panelDir: 'right',
      paramDefs: [
        { name: 'aspect_ratio',   label: 'Aspect Ratio',   min: 2,  max: 5.5, step: 0.1, unit: '',    description: 'Span/chord — affects induced drag.' },
        { name: 'endplate_h_pct', label: 'Endplate Height', min: 5, max: 30,  step: 1,   unit: '%b', description: 'Tip fence height — reduces vortex losses.' },
      ],
    },
    {
      id: 'planform',
      position: [0, 0.10, -halfSpan * 0.88],
      title: 'PLANFORM',
      tag: '3D SHAPE',
      panelDir: 'left',
      paramDefs: [
        { name: 'taper_ratio', label: 'Taper Ratio',  min: 0.3, max: 1.0, step: 0.05, unit: '',  description: 'Tip/root chord ratio.' },
        { name: 'sweep_deg',   label: 'Sweep',        min: 0,   max: 30,  step: 1,    unit: '°', description: 'Quarter-chord sweep angle.' },
        { name: 'twist_deg',   label: 'Twist',        min: 0,   max: 8,   step: 0.5,  unit: '°', description: 'Washout — tip angle relative to root.' },
        { name: 'ride_height_pct', label: 'Ride Height', min: 2, max: 50, step: 1,   unit: '%c', description: 'Ground clearance / chord.' },
      ],
    },
  ]
}

// Scene lighting — silver/white metallic setup
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.14} color={0x1a1a22} />
      {/* Key light — warm white from upper-right */}
      <directionalLight position={[4, 7, 3]} intensity={2.2} color={0xdde0e8} castShadow />
      {/* Fill light — cool gray from left */}
      <directionalLight position={[-5, 2, -2]} intensity={0.7} color={0x2a2a38} />
      {/* Under-rim — subtle white bounce */}
      <pointLight position={[0, -1.8, 0]} intensity={1.2} color={0xffffff} distance={9} decay={2} />
      {/* Rear accent */}
      <pointLight position={[0, 4, -6]} intensity={0.6} color={0x505060} distance={16} />
      <hemisphereLight skyColor={0x1c1c28} groundColor={0x040408} intensity={0.65} />
    </>
  )
}

export default function SciFiScene({
  geoData,
  params,
  params3d,
  activeHotspot,
  setActiveHotspot,
  onParamChange,
  onParam3dChange,
  isAnalyzing,
}) {
  const hotspots = buildHotspots(params, params3d)

  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 1, background: SF.bg }}
      camera={{ fov: 42, position: [0, 2.2, 7.5], near: 0.01, far: 200 }}
      shadows
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color(SF.bg))
      }}
    >
      <Suspense fallback={null}>
        <Lighting />

        {/* Animated dotted wave surface */}
        <WaveDots />

        {/* Distant stars for depth */}
        <Stars radius={80} depth={30} count={600} factor={2} saturation={0.2} fade speed={0.5} />

        {/* The wing */}
        <WingMesh3D
          geoData={geoData}
          params={params}
          params3d={params3d}
          isAnalyzing={isAnalyzing}
        />

        {/* Interactive hotspots */}
        {hotspots.map(hs => {
          const combinedParams = { ...params, ...params3d }
          const handleChange = (name, val) => {
            if (Object.prototype.hasOwnProperty.call(params, name)) onParamChange(name, val)
            else onParam3dChange(name, val)
          }
          return (
            <Hotspot
              key={hs.id}
              id={hs.id}
              position={hs.position}
              title={hs.title}
              tag={hs.tag}
              params={combinedParams}
              paramDefs={hs.paramDefs}
              onParamChange={handleChange}
              activeHotspot={activeHotspot}
              setActiveHotspot={setActiveHotspot}
              panelDir={hs.panelDir}
              distanceFactor={9}
            />
          )
        })}
      </Suspense>

      {/* Orbit controls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={5.5}
        maxDistance={18}
        maxPolarAngle={Math.PI * 0.72}
        minPolarAngle={Math.PI * 0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        dampingFactor={0.08}
        enableDamping
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}
