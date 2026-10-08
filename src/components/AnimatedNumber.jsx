import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'

export default function AnimatedNumber({ value, className }) {
  const element = useRef(null)
  const previous = useRef(0)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced) {
      previous.current = value
      element.current.textContent = String(value)
      return
    }
    const controls = animate(previous.current, value, {
      duration: 0.65,
      ease: 'easeOut',
      onUpdate: (current) => {
        previous.current = current
        if (element.current) element.current.textContent = String(Math.round(current))
      },
    })
    return () => controls.stop()
  }, [value, reduced])
  return <p className={className} aria-label={String(value)}><span ref={element} aria-hidden="true">{0}</span></p>
}