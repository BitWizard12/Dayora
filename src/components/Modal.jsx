import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { modalEntrance } from '../styles/motion'
import { createPortal } from 'react-dom'

export default function Modal({ title, onClose, children }) {
  const dialog = useRef(null)
  const close = useRef(onClose)
  const titleId = useId()
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...dialog.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter((el) => !el.disabled && el.getClientRects().length)
    const frame = requestAnimationFrame(() => (dialog.current.querySelector('[data-initial-focus]') || focusable()[0] || dialog.current)?.focus())
    const onKey = (event) => {
      if (event.key === 'Escape') close.current()
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0]
      const last = items.at(-1)
      if (!first) { event.preventDefault(); dialog.current.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = overflow; window.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <motion.section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} variants={modalEntrance} initial="hidden" animate="visible" exit="exit">
      <header className="modal__header"><div><h2 id={titleId}>{title}</h2><p>Keep your team moving forward.</p></div><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header>{children}
    </motion.section>
  </motion.div>, document.body)
}
