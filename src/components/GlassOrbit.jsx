import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

/** Decorative CSS 3D: no canvas, GPU scene, assets, or application state. */
export default function GlassOrbit() {
  const reduced = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const rotateY = useSpring(pointerX, { stiffness: 100, damping: 22 })
  const rotateX = useSpring(pointerY, { stiffness: 100, damping: 22 })
  const reset = () => { pointerX.set(0); pointerY.set(0) }
  const follow = (event) => {
    if (reduced || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 22)
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -18)
  }

  return <div className="glass-orbit" aria-hidden="true" onPointerMove={follow} onPointerLeave={reset}>
    <div className="glass-orbit__halo" />
    <div className="glass-orbit__ground" />
    <motion.div className="glass-orbit__scene" style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY }}>
      <div className="glass-orbit__float">
        <div className="glass-orbit__ring glass-orbit__ring--back" />
        <div className="glass-orbit__sphere"><span className="glass-orbit__shine" /><span className="glass-orbit__core" /></div>
        <div className="glass-orbit__ring glass-orbit__ring--front" />
        <div className="glass-orbit__satellite glass-orbit__satellite--sage" />
        <div className="glass-orbit__satellite glass-orbit__satellite--pearl" />
        <div className="glass-orbit__tile"><span /><span /><span /></div>
      </div>
    </motion.div>
    <span className="glass-orbit__caption">A calmer kind of momentum.</span>
  </div>
}
