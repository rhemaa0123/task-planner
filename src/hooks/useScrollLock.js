import { useLayoutEffect } from 'react'

/* ============================================================
   Hold the page still while something is over it.

   `.modal-overlay` is `position: fixed; inset: 0`, which covers the page but
   does not stop it scrolling underneath. On a mouse that is barely noticeable
   - the wheel is over a dialog and the page creeps behind it. On a phone it is
   the whole experience: a drag anywhere on the overlay scrolls the plan away
   behind the dialog, and closing it leaves you somewhere else entirely.

   `overscroll-behavior` does not fix this. That stops a scroll *inside* the
   card from chaining out to the page once the card hits its end; it has
   nothing to say about a touch that starts on the backdrop, where there is no
   scroller to chain from in the first place.

   So the body is locked outright. Three details that are easy to get wrong:

   - **Where the page was is not `window.scrollY` at lock time.** Most dialogs
     here focus their first field on open, and focusing anything inside a
     `position: fixed` overlay scrolls the *document* to that element's
     document offset - which, for a fixed element, is 0. So by the time the
     lock runs the page has already been thrown to the top, and reading
     scrollY then saves 0 and restores 0. This was true before the lock
     existed: opening any of these dialogs used to leave you at the top of the
     page when it closed.
     What saves it is that a scroll's *event* is not dispatched until the next
     frame, while the lock runs in the same task as the focus. So `lastY`,
     kept from scroll events, still holds where the page actually was.
   - **It has to land before paint**, hence `useLayoutEffect`. Otherwise there
     can be one painted frame of the top of the page behind the scrim.
   - **Locks nest.** A dialog can open over the drawer. A counter means the
     inner one closing does not unlock the page under the outer one; only the
     last release puts anything back.
   ============================================================ */

let depth = 0
let saved = 0
let lastY = typeof window === 'undefined' ? 0 : window.scrollY

if (typeof window !== 'undefined') {
  // While locked the document cannot move, and the one scroll event that does
  // arrive is the deferred report of the focus jump above - not a position
  // anyone chose. So only an unlocked page updates this.
  const note = () => { if (depth === 0) lastY = window.scrollY }
  window.addEventListener('scroll', note, { passive: true })
  // Scroll events lag a frame behind the scroll they report. A press is
  // always before the click it becomes, and before any focus jump that click
  // causes - so reading the position at the press, in the capture phase, is
  // exact even when the page moved in the very same frame (a scrollIntoView,
  // or a test driver bringing an off-screen button into view to click it).
  window.addEventListener('pointerdown', note, { capture: true, passive: true })
  window.addEventListener('keydown', note, { capture: true, passive: true })
}

export function useScrollLock(active = true) {
  useLayoutEffect(() => {
    if (!active) return

    if (depth === 0) {
      saved = lastY
      const body = document.body
      // The scrollbar's width is given back as padding, or the page jogs
      // sideways by ~15px the moment it stops being scrollable
      const gutter = window.innerWidth - document.documentElement.clientWidth
      body.style.position = 'fixed'
      body.style.top = `${-saved}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      if (gutter > 0) body.style.paddingRight = `${gutter}px`
    }
    depth += 1

    return () => {
      depth -= 1
      if (depth > 0) return
      const body = document.body
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      body.style.paddingRight = ''
      // `instant`, not smooth - this is putting the page back where it was,
      // not a journey anyone asked for
      window.scrollTo({ top: saved, left: 0, behavior: 'instant' })
      lastY = saved
    }
  }, [active])
}
