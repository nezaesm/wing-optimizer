import { useEffect } from 'react'

/**
 * Attaches custom cursor logic to document.
 * dot  — snaps instantly to mouse position
 * ring — follows with lerp (smooth lag)
 * Magnetic effect on [data-magnetic] elements: ring morphs to match element shape
 */
export function useCursor(dotRef, ringRef) {
  const mouse = { x: -200, y: -200 }
  const current = { x: -200, y: -200 }

  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return

    let rafId = null

    const lerp = (a, b, t) => a + (b - a) * t

    const onMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }

    const tick = () => {
      current.x = lerp(current.x, mouse.x, 0.12)
      current.y = lerp(current.y, mouse.y, 0.12)

      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate(${mouse.x}px, ${mouse.y}px) translate(-50%,-50%)`
      }
      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${current.x}px, ${current.y}px) translate(-50%,-50%)`
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    window.addEventListener('mousemove', onMove, { passive: true })

    // Magnetic effect on [data-magnetic] elements
    const onEnter = (e) => {
      const el = e.currentTarget
      if (!ringRef.current) return
      const rect = el.getBoundingClientRect()
      const computed = window.getComputedStyle(el)
      ringRef.current.style.width  = `${rect.width  + 18}px`
      ringRef.current.style.height = `${rect.height + 18}px`
      ringRef.current.style.borderRadius = computed.borderRadius
      ringRef.current.style.borderColor = 'rgba(163,230,53,0.65)'
      ringRef.current.style.background = 'rgba(139,92,246,0.04)'
    }
    const onLeave = () => {
      if (!ringRef.current) return
      ringRef.current.style.width  = '32px'
      ringRef.current.style.height = '32px'
      ringRef.current.style.borderRadius = '50%'
      ringRef.current.style.borderColor = 'rgba(139,92,246,0.6)'
      ringRef.current.style.background = 'transparent'
    }

    let magneticEls = []

    const attach = (el) => {
      el.addEventListener('mouseenter', onEnter)
      el.addEventListener('mouseleave', onLeave)
    }
    const detach = (el) => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }

    const refreshMagnetic = () => {
      magneticEls.forEach(detach)
      magneticEls = Array.from(document.querySelectorAll('[data-magnetic]'))
      magneticEls.forEach(attach)
    }

    refreshMagnetic()

    const observer = new MutationObserver(refreshMagnetic)
    observer.observe(document.body, { childList: true, subtree: true })

    // Hide cursor when leaving window
    const onLeaveWindow = () => {
      if (dotRef.current)  dotRef.current.style.opacity = '0'
      if (ringRef.current) ringRef.current.style.opacity = '0'
    }
    const onEnterWindow = () => {
      if (dotRef.current)  dotRef.current.style.opacity = '1'
      if (ringRef.current) ringRef.current.style.opacity = '1'
    }
    document.addEventListener('mouseleave', onLeaveWindow)
    document.addEventListener('mouseenter', onEnterWindow)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMove)
      magneticEls.forEach(detach)
      observer.disconnect()
      document.removeEventListener('mouseleave', onLeaveWindow)
      document.removeEventListener('mouseenter', onEnterWindow)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
