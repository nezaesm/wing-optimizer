// useInputHandler.js — Wheel event dispatcher for scroll vs zoom
// ctrl+wheel → zoom (trackpad pinch)
// mousedown+wheel → zoom (mouse button held + scroll)
// plain wheel → section navigation (window scroll → GSAP ScrollTrigger)
import { useEffect, useRef } from 'react'

export function useInputHandler({ orbitRef }) {
  const mouseDownRef = useRef(false)
  const zoomTimerRef = useRef(null)

  useEffect(() => {
    const onMouseDown = () => { mouseDownRef.current = true }
    const onMouseUp   = () => { mouseDownRef.current = false }

    const onWheel = (e) => {
      const isZoom = e.ctrlKey || mouseDownRef.current
      if (isZoom) {
        e.preventDefault()
        if (orbitRef?.current) {
          orbitRef.current.enableZoom = true
          clearTimeout(zoomTimerRef.current)
          zoomTimerRef.current = setTimeout(() => {
            if (orbitRef?.current) orbitRef.current.enableZoom = false
          }, 300)
        }
        // don't scroll the page
      }
      // else: let the wheel event fall through to normal window scroll
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup',   onMouseUp)
    window.addEventListener('wheel',     onWheel, { passive: false })

    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup',   onMouseUp)
      window.removeEventListener('wheel',     onWheel)
      clearTimeout(zoomTimerRef.current)
    }
  }, [orbitRef])
}
