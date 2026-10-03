import React, { useState, useEffect, useRef } from 'react'

// The same contract as `EditableText` in the projects pane - save on blur,
// Enter to commit and hand on - for the pages that came later: the name box in
// the sidebar, a month's goals, a year's twelve lines. Kept separate rather
// than hoisted out of `ProjectsSidebar.jsx` because that one carries the
// board's own baggage (readOnly for a frozen week, the font-ready focus dance)
// and these fields are plainer; what they do share is the behaviour, which is
// written the same way in both.
export function InlineText({
  value,
  onSave,
  onEnter,
  placeholder,
  className,
  autoFocus,
  multiline = false,
  rows = 3,
  ...rest
}) {
  const [text, setText] = useState(value || '')
  const ref = useRef(null)
  // What the parent last received - Enter saves, and the blur that follows
  // when focus moves on must not save the same text a second time
  const committed = useRef(value || '')

  useEffect(() => {
    setText(value || '')
    committed.current = value || ''
  }, [value])

  const commit = () => {
    if ((text || '') === committed.current) return
    committed.current = text || ''
    onSave(text)
  }

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const common = {
    ref,
    className,
    value: text,
    placeholder,
    onChange: (e) => setText(e.target.value),
    onBlur: (e) => {
      commit()
      e.currentTarget.scrollLeft = 0
    },
    ...rest,
  }

  // A note is a paragraph: Enter inside it is a new line, and the only commit
  // is the blur. A single-line field treats Enter as "done".
  if (multiline) return <textarea {...common} rows={rows} />

  return (
    <input
      type="text"
      {...common}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        commit()
        if (onEnter && text.trim()) onEnter()
        else e.currentTarget.blur()
      }}
    />
  )
}
