// TunnelBackground.jsx — WebGL tunnel shader, fullscreen
import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'

const vertexShader = `void main(){ gl_Position = vec4(position, 1.0); }`

const fragmentShader = `
uniform float iTime;
uniform vec3 iResolution;

#define TAU 6.2831853071795865
#define TUNNEL_LAYERS 96
#define RING_POINTS 128
#define POINT_SIZE 1.8
#define POINT_COLOR_A vec3(1.0)
#define POINT_COLOR_B vec3(0.7)
#define SPEED 0.7

float sq(float x){ return x*x; }

vec2 AngRep(vec2 uv, float angle){
  vec2 polar = vec2(atan(uv.y, uv.x), length(uv));
  polar.x = mod(polar.x + angle/2.0, angle) - angle/2.0;
  return polar.y * vec2(cos(polar.x), sin(polar.x));
}

float sdCircle(vec2 uv, float r){ return length(uv) - r; }

vec3 MixShape(float sd, vec3 fill, vec3 target){
  float blend = smoothstep(0.0, 1.0/iResolution.y, sd);
  return mix(fill, target, blend);
}

vec2 TunnelPath(float x){
  vec2 offs = vec2(
    0.2 * sin(TAU * x * 0.5) + 0.4 * sin(TAU * x * 0.2 + 0.3),
    0.3 * cos(TAU * x * 0.3) + 0.2 * cos(TAU * x * 0.1)
  );
  offs *= smoothstep(1.0, 4.0, x);
  return offs;
}

void main(){
  vec2 res = iResolution.xy / iResolution.y;
  vec2 uv = gl_FragCoord.xy / iResolution.y - res/2.0;
  vec3 color = vec3(0.0);
  float repAngle = TAU / float(RING_POINTS);
  float pointSize = POINT_SIZE / (2.0 * iResolution.y);
  float camZ = iTime * SPEED;
  vec2 camOffs = TunnelPath(camZ);

  for(int i = 1; i <= TUNNEL_LAYERS; i++){
    float pz = 1.0 - (float(i) / float(TUNNEL_LAYERS));
    pz -= mod(camZ, 4.0 / float(TUNNEL_LAYERS));
    vec2 offs = TunnelPath(camZ + pz) - camOffs;
    float ringRad = 0.15 * (1.0 / sq(pz * 0.8 + 0.4));
    if(abs(length(uv + offs) - ringRad) < pointSize * 1.5){
      vec2 aruv = AngRep(uv + offs, repAngle);
      float pdist = sdCircle(aruv - vec2(ringRad, 0.0), pointSize);
      vec3 ptColor = (mod(float(i/2), 2.0) == 0.0) ? POINT_COLOR_A : POINT_COLOR_B;
      float shade = (1.0 - pz);
      color = MixShape(pdist, ptColor * shade, color);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`

export default function TunnelBackground() {
  const canvasRef  = useRef(null)
  const ctxRef     = useRef(null)
  const animRef    = useRef(null)
  const lastTimeRef = useRef(0)
  const pausedRef  = useRef(false)
  const rafResizeRef = useRef(false)

  const animate = useCallback((time) => {
    if (!ctxRef.current) return
    animRef.current = requestAnimationFrame(animate)
    if (pausedRef.current) { lastTimeRef.current = time; return }
    time *= 0.001
    const delta = time - (lastTimeRef.current || time)
    lastTimeRef.current = time
    ctxRef.current.material.uniforms.iTime.value += delta * 0.5
    ctxRef.current.renderer.render(ctxRef.current.scene, ctxRef.current.camera)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const cssW = window.innerWidth
    const cssH = window.innerHeight
    // Cap DPR at 2 to avoid excessive GPU load
    const dpr  = Math.min(window.devicePixelRatio || 1, 2)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(dpr)
    // false = don't let Three.js overwrite canvas CSS with explicit px values;
    // our CSS (100vw × 100vh) handles display sizing.
    renderer.setSize(cssW, cssH, false)

    const scene    = new THREE.Scene()
    const camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // *** Key fix: iResolution must be drawing-buffer pixels, not CSS pixels.
    // gl_FragCoord runs in drawing-buffer space (cssW*dpr × cssH*dpr).
    // Passing CSS pixels here shifts the computed center by (dpr-1)/2 of the
    // screen width — on a 2× display this is exactly half a screen to the left.
    const material = new THREE.ShaderMaterial({
      uniforms: {
        iTime:       { value: 0 },
        iResolution: { value: new THREE.Vector3(cssW * dpr, cssH * dpr, 1) },
      },
      vertexShader,
      fragmentShader,
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    const mesh     = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    ctxRef.current = { renderer, scene, camera, material, mesh, geometry }

    // Resize: recalculate both renderer size and iResolution
    const handleResize = () => {
      if (!ctxRef.current || rafResizeRef.current) return
      rafResizeRef.current = true
      requestAnimationFrame(() => {
        rafResizeRef.current = false
        const nw   = window.innerWidth
        const nh   = window.innerHeight
        const ndpr = Math.min(window.devicePixelRatio || 1, 2)
        ctxRef.current.renderer.setPixelRatio(ndpr)
        ctxRef.current.renderer.setSize(nw, nh, false)
        ctxRef.current.material.uniforms.iResolution.value.set(nw * ndpr, nh * ndpr, 1)
      })
    }
    window.addEventListener('resize', handleResize)

    const handleVisibility = () => { pausedRef.current = !!document.hidden }
    document.addEventListener('visibilitychange', handleVisibility)
    handleVisibility()

    animRef.current = requestAnimationFrame(animate)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)
      try {
        scene.remove(mesh)
        geometry.dispose()
        material.dispose()
        renderer.dispose()
      } catch (e) { /* ignore */ }
      ctxRef.current = null
    }
  }, [animate])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 0, display: 'block',
      }}
    />
  )
}
