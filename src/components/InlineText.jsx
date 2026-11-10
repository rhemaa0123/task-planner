import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'

// The same contract as `EditableText` in the projects pane - save on blur,
// Enter to commit and hand on - for the pages that came later: the name box in
// the sidebar, a year's lines and a month's tasks. Kept separate rather
// than hoisted out of `ProjectsSidebar.jsx` because that one carries the
// board's own baggage (readOnly for a frozen week, the font-ready focus dance)
// and these fields are plainer; what they do share is the behaviour, which is
// written the same way in both.
//
// `wrap` is a single line of text that wraps instead of scrolling: a list item
// is read as often as it is typed, and an objective cut off at the width of
// its box cannot be read at all. It grows with what is in it, and Enter still
// means "done" - there are no line breaks inside a list item.
export function InlineText({
  value,
  onSave,
  onEnter,
  placeholder,
  className,
  autoFocus,
  multiline = false,
  wrap = false,
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

  // A wrapped line is exactly as tall as its text - measured again when the
  // window changes width, and once the web font has landed, since both move
  // where the words break
  useLayoutEffect(() => {
    if (!wrap) return
    const el = ref.current
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [wrap, text])

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

  // Enter on a single line is "done": save, then hand on to the next row if
  // there is one to make, or let go of focus
  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commit()
    if (onEnter && text.trim()) onEnter()
    else e.currentTarget.blur()
  }

  // A note is a paragraph: Enter inside it is a new line, and the only commit
  // is the blur. A single-line field treats Enter as "done".
  if (multiline) return <textarea {...common} rows={rows} />

  if (wrap) {
    return (
      <textarea
        {...common}
        rows={1}
        // A pasted line break would be invisible in a list item - it becomes a space
        onChange={(e) => setText(e.target.value.replace(/\r?\n/g, ' '))}
        onKeyDown={onKeyDown}
      />
    )
  }

  return <input type="text" {...common} onKeyDown={onKeyDown} />
}
