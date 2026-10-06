import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { InlineText } from './InlineText'
import { PlusIcon, TrashIcon, RepeatIcon } from './icons'
import { sinkCompleted, fromISODate, formatShortDate, DAY_NAMES } from '../utils'
import { useScrollLock } from '../hooks/useScrollLock'

/* ============================================================
   Pop-ups - the day's small things, outside any project.

   Brush your teeth, fill the water bottle, bring the coffee: things worth
   writing down only so they can leave your head. So adding one is a line you
   type into, the way a month's focuses are typed, and never a dialog. They
   are written on the weekly page's focused day and on the home page's Today
   and Tomorrow; the rows themselves come from `popupsOn()` in utils.js.
   ============================================================ */

const dayName = (iso) => DAY_NAMES[(fromISODate(iso).getDay() + 6) % 7]

/* A daily is one record standing on every day, so taking it off a day asks
   which you meant: only this one, or this one and all that follow. */
export function DailyRemoveDialog({ row, onClose }) {
  // Holds the page still underneath; on touch a drag on the backdrop
  // would otherwise scroll the page away behind the dialog
  useScrollLock()
  const { skipDaily, stopDaily } = useApp()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const day = `${dayName(row.iso)} ${formatShortDate(row.iso)}`

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card wide" role="dialog" aria-label="Remove a daily pop-up">
        <div className="modal-eyebrow">DAILY POP-UP</div>
        <h2 className="modal-title">{row.text || 'Untitled'}</h2>
        <div className="modal-divider" />

        <p className="modal-copy">
          This one comes round every day. Take it off {day} only, or stop it from {day} on?
          The days before keep their ticks either way.
        </p>
        <div className="modal-divider" />

        <div className="modal-actions wrap">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { skipDaily(row.id, row.iso); onClose() }}
          >
            Just this day
          </button>
          <button
            type="button"
            className="btn-strong"
            onClick={() => { stopDaily(row.id, row.iso); onClose() }}
          >
            This day onward
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---- The focused day's list, on the weekly page ----
   Rows typed in place like a month's focuses: Enter saves and opens the next
   row under it, a row left empty goes when you move away from it, and a
   ticked one sinks. A written row can be made daily from its hover; a daily
   wears the repeat mark, and its × asks which days it leaves. An ended week
   shows its pop-ups as they were left and takes no edits. */
export function PopupList({ iso, rows, frozen = false, track }) {
  const { addPopup, deletePopup, makeDaily, tickPopup, renamePopup } = useApp()
  // The row Enter or "Add a pop-up" just made, so the caret lands in it
  const [focusId, setFocusId] = useState(null)
  const [removing, setRemoving] = useState(null)

  if (frozen && rows.length === 0) return null

  const add = (opts) => setFocusId(addPopup(iso, '', opts))

  // Moving away from a written row with nothing in it removes the row - a
  // pop-up with no words is not a thing to do, and an empty row left behind
  // by a stray click would sit there for good
  const dropIfEmpty = (e, r) => {
    if (r.daily || frozen) return
    if (e.currentTarget.contains(e.relatedTarget)) return
    const input = e.currentTarget.querySelector('input[type="text"]')
    if (input && !input.value.trim()) deletePopup(iso, r.id)
  }

  return (
    <div className="popups">
      <div className="popups-label">Pop-ups</div>

      {rows.length > 0 && (
        <ul className="goal-list popup-list">
          {sinkCompleted(rows).map((r) => (
            <li
              key={r.key}
              ref={track ? (el) => track(`${iso}:${r.key}`, el) : undefined}
              className={`goal-row popup-row ${r.completed ? 'done' : ''} ${r.daily ? 'daily' : ''}`}
              onBlur={(e) => dropIfEmpty(e, r)}
            >
              <input
                type="checkbox"
                className="task-check"
                checked={r.completed}
                disabled={frozen}
                onChange={(e) => tickPopup(r, e.target.checked)}
                aria-label={r.text || 'Pop-up'}
              />
              <InlineText
                className="goal-text"
                value={r.text}
                autoFocus={!r.daily && focusId === r.id}
                placeholder="A small thing to do"
                readOnly={frozen}
                onSave={(text) => renamePopup(r, text)}
                onEnter={() => add(r.daily ? { first: true } : { after: r.id })}
              />
              {r.daily ? (
                <span className="popup-daily" title="Repeats every day" aria-label="Repeats every day">
                  <RepeatIcon />
                </span>
              ) : !frozen && (
                <button
                  type="button"
                  className="row-del row-repeat"
                  onClick={() => makeDaily(iso, r.id)}
                  title="Repeat every day"
                  aria-label={`Repeat ${r.text || 'this pop-up'} every day`}
                >
                  <RepeatIcon />
                </button>
              )}
              {!frozen && (
                <button
                  type="button"
                  className="row-del"
                  onClick={() => (r.daily ? setRemoving(r) : deletePopup(iso, r.id))}
                  title={r.daily ? 'Remove…' : 'Remove'}
                  aria-label={`Remove ${r.text || 'pop-up'}`}
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!frozen && (
        <button type="button" className="add-row" onClick={() => add()}>
          <span className="add-row-plus"><PlusIcon /></span>
          Add a pop-up
        </button>
      )}

      {removing && <DailyRemoveDialog row={removing} onClose={() => setRemoving(null)} />}
    </div>
  )
}

/* ---- One line to jot a pop-up down, on the home page ----
   Always open, so writing one is type and Enter. The line clears and keeps
   the caret, because these come in twos and threes. */
export function PopupQuickAdd({ iso, placeholder = 'Add a pop-up' }) {
  const { addPopup } = useApp()
  const [text, setText] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    addPopup(iso, t)
    setText('')
  }

  return (
    <form className="popup-add" onSubmit={submit}>
      <span className="add-row-plus" aria-hidden="true"><PlusIcon /></span>
      <input
        type="text"
        className="popup-add-input"
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          setText('')
          e.currentTarget.blur()
        }}
      />
    </form>
  )
}
