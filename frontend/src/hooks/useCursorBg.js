import { useEffect } from 'react'

/**
 * Updates --mx / --my CSS variables on <body> so index.css body::after
 * can render a cursor-reactive violet radial glow.
 * Throttled to one RAF per frame for performance.
 */
export function useCursorBg() {
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return

    let scheduled = false

    const onMove = (e) => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        document.body.style.setProperty('--mx', `${e.clientX}px`)
        document.body.style.setProperty('--my', `${e.clientY}px`)
        scheduled = false
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
}
