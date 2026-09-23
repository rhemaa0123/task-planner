import { useLayoutEffect, useRef } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

// Ticking a box reorders the list in the same tick, so a finished row is
// already sitting at the bottom before anything can be seen to move - the row
// you just crossed out disappears from under the pointer.
//
// This plays the move back. Every tracked row's position is remembered; when
// `signature` changes - the set of ticked work, nothing else - each row that
// ended up somewhere new is offset back to where it was and released, so it
// travels to its slot instead of jumping there. The travel itself is the
// element's own CSS transform transition.
//
// Rows report themselves through the returned `track(key, el)`, called from
// their ref. `key` must be stable for the row and unique across the list.
export function useSinkFlip(signature) {
  const nodes = useRef(new Map())
  const tops = useRef(new Map())
  const last = useRef(signature)

  const track = (key, el) => {
    if (el) nodes.current.set(key, el)
    else nodes.current.delete(key)
  }

  // Before the browser paints the new order: measure where everything landed,
  // compare against the last paint, and hand back the difference
  useLayoutEffect(() => {
    const now = new Map()
    for (const [key, el] of nodes.current) now.set(key, el.getBoundingClientRect().top)

    const reordered = last.current !== signature
    last.current = signature
    const previous = tops.current
    tops.current = now
    if (!reordered) return
    if (window.matchMedia?.(REDUCED).matches) return

    const moved = []
    for (const [key, el] of nodes.current) {
      const was = previous.get(key)
      // A row that was not on screen last paint has nowhere to travel from
      if (was === undefined) continue
      const delta = was - now.get(key)
      if (Math.abs(delta) < 1) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      moved.push(el)
    }
    if (!moved.length) return

    // One frame held at the old position, then the transform is dropped and
    // the element's own transition carries it home. Never cancelled, and not
    // guarded on the row still being mounted: a frame that did not run would
    // leave the row parked at an offset for good.
    requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = ''
        el.style.transform = ''
      }
    })
  })

  return track
}
