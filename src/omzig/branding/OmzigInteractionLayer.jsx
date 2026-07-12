/**
 * ŌMZIG global reactive interaction layer — mounted once in _app.
 *
 * Renders nothing into the React tree; it imperatively wires three
 * pointer-reactive behaviours so the whole portal *responds* to the user
 * rather than merely animating on its own:
 *
 *  1. Cursor spotlight — a soft brand glow that eases toward the pointer,
 *     living behind content next to the ambient aurora (z-index 0). It fades
 *     in on movement and out when the pointer goes idle or leaves the window.
 *  2. Reactive ambient aurora — publishes the eased, normalized pointer
 *     position as --omzig-mx / --omzig-my on <html> so the body::before
 *     aurora (theme.js) drifts toward the cursor.
 *  3. Magnetic CTAs — primary contained buttons pull gently toward the
 *     pointer while hovered, then spring back on leave.
 *
 * Accessibility / safety: fully inert under prefers-reduced-motion and
 * prefers-reduced-transparency, and on coarse (touch) pointers — so it never
 * fights the dense upstream CIPP surfaces or drains battery on phones. All
 * work happens in a single requestAnimationFrame loop that only runs while the
 * pointer is active, and every listener + the injected node is cleaned up.
 */
import { useEffect } from 'react'
import { usePrefersReducedMotion } from './motion'

const R = 320 // spotlight radius (matches .omzig-cursor-glow 640px box in theme.js)

export const OmzigInteractionLayer = () => {
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return
    if (window.matchMedia?.('(pointer: coarse)').matches) return // touch: no cursor to react to

    const root = document.documentElement
    const glow = document.createElement('div')
    glow.setAttribute('aria-hidden', 'true')
    glow.className = 'omzig-cursor-glow'
    document.body.appendChild(glow)

    let tx = window.innerWidth / 2
    let ty = window.innerHeight / 2
    let x = tx
    let y = ty
    let magnet = null
    let raf = null
    let idle = null

    const show = () => {
      glow.style.opacity = '1'
    }
    const hide = () => {
      glow.style.opacity = '0'
    }

    const tick = () => {
      x += (tx - x) * 0.14
      y += (ty - y) * 0.14
      glow.style.transform = `translate3d(${x - R}px, ${y - R}px, 0)`
      // Publish eased pointer so the CSS ambient aurora can drift toward it.
      root.style.setProperty('--omzig-mx', (x / window.innerWidth).toFixed(3))
      root.style.setProperty('--omzig-my', (y / window.innerHeight).toFixed(3))

      if (magnet) {
        const r = magnet.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const dx = Math.max(-1, Math.min(1, (tx - cx) / (r.width / 2 + 48)))
        const dy = Math.max(-1, Math.min(1, (ty - cy) / (r.height / 2 + 48)))
        // -1px keeps the theme's hover lift while the button is pulled.
        magnet.style.transform = `translate(${(dx * 7).toFixed(2)}px, ${(dy * 7 - 1).toFixed(2)}px)`
      }
      raf = requestAnimationFrame(tick)
    }

    const kick = () => {
      if (raf == null) raf = requestAnimationFrame(tick)
    }

    const onMove = (e) => {
      tx = e.clientX
      ty = e.clientY
      show()
      kick()
      clearTimeout(idle)
      idle = setTimeout(hide, 2600)
    }

    // Magnetic primary CTAs via event delegation (never per-button listeners).
    const onOver = (e) => {
      const btn = e.target.closest?.('.MuiButton-containedPrimary:not(.Mui-disabled)')
      if (btn) magnet = btn
    }
    const onOut = (e) => {
      if (magnet && (!e.relatedTarget || !magnet.contains(e.relatedTarget))) {
        magnet.style.transform = ''
        magnet = null
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('pointerout', onOut, { passive: true })
    document.addEventListener('mouseleave', hide)
    kick()

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(idle)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('mouseleave', hide)
      if (magnet) magnet.style.transform = ''
      glow.remove()
      root.style.removeProperty('--omzig-mx')
      root.style.removeProperty('--omzig-my')
    }
  }, [reduced])

  return null
}
