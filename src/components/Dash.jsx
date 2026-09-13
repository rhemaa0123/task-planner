import React from 'react'

// The one dashed line every "drawn in pencil" box uses - "nothing here yet",
// a frozen week, a missed day, a week still ahead: 6px dashes at a 1px
// weight, uniform around every corner.
//
// This has to be a live SVG element sized by ordinary CSS layout, not a
// background/mask image: a mask is rasterised at its own size and then
// stretched to fit the box, and every box here is far wider than it is
// tall, so a non-uniform stretch thickened the rounded corners into a
// blob while the straight edges stayed a hairline. Laid out at 100% of a
// `position: relative` parent, the rect's own geometry (x/y/width/height/rx,
// set as CSS so percentages resolve against that box) never goes through a
// separate scaling step, so the stroke reads the same weight all the way
// round whatever the box's shape. `r` is the visible corner radius - it
// only needs to roughly match the box's own `border-radius`, not equal it,
// since the two draw independently.
export function DashedOutline({ r = 10 }) {
  return (
    <svg className="dash-svg" aria-hidden="true">
      <rect className="dash-rect" style={{ rx: `${r - 0.5}px` }} />
    </svg>
  )
}
