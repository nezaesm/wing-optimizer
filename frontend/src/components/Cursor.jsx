import { useRef } from 'react'
import { useCursor } from '../hooks/useCursor'

export default function Cursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)
  useCursor(dotRef, ringRef)

  return (
    <>
      {/* Dot — snaps instantly to mouse, mix-blend-mode difference */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: '#ffffff',
          pointerEvents: 'none',
          zIndex: 99999,
          mixBlendMode: 'difference',
          willChange: 'transform',
          transition: 'opacity 0.2s ease',
        }}
      />
      {/* Ring — lerp follow, morphs on hover */}
      <div
        ref={ringRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '32px', height: '32px',
          borderRadius: '50%',
          border: '1.5px solid rgba(139,92,246,0.6)',
          background: 'transparent',
          pointerEvents: 'none',
          zIndex: 99998,
          willChange: 'transform, width, height',
          transition: [
            'width 0.28s cubic-bezier(0.23,1,0.32,1)',
            'height 0.28s cubic-bezier(0.23,1,0.32,1)',
            'border-radius 0.28s cubic-bezier(0.23,1,0.32,1)',
            'border-color 0.2s ease',
            'background 0.2s ease',
            'opacity 0.2s ease',
          ].join(', '),
        }}
      />
    </>
  )
}
