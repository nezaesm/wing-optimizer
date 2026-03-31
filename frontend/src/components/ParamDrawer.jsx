import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Settings2 } from 'lucide-react'

/**
 * Retractable floating parameter drawer.
 * Props:
 *   open: bool
 *   onClose: fn
 *   title: string
 *   children: React nodes (param sections)
 */
export default function ParamDrawer({ open, onClose, title = 'Parameters', children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock body scroll when drawer is open on mobile
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />

          {/* Drawer panel — slides from right on desktop, rises from bottom on mobile */}
          <motion.div
            className="param-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
            style={{ zIndex: 200 }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid rgba(139,92,246,0.12)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings2 size={15} style={{ color: '#8b5cf6' }} />
                <span style={{
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.95rem',
                  background: 'linear-gradient(90deg, #c084fc, #a3e635)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>{title}</span>
              </div>
              <button
                onClick={onClose}
                data-magnetic
                style={{
                  background: 'rgba(139,92,246,0.08)',
                  border: '1px solid rgba(139,92,246,0.15)',
                  borderRadius: '8px', padding: '7px',
                  cursor: 'none', color: '#8b5cf6',
                  display: 'flex', alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable content */}
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '14px 18px',
              display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
