import React, { useState, useEffect } from 'react'
import { TrashIcon } from '../icons'
import { catVars } from '../../utils'
import { useScrollLock } from '../../hooks/useScrollLock'

/* ============================================================
   One category's objectives for a year, in a dialog.

   Opened by clicking a block on the yearly page (Nov 2026: it replaced the
   block's own "Add" button). The list here is a working copy - rows can be
   written, added and removed freely, and nothing reaches the year until
   Save, which hands the whole list back in one go (`setYearCategory`).
   Cancel, Escape or a click on the backdrop leaves the year as it was.

   Every line that was already there carries its id through, so a month's
   focus that points at it stays linked after the save.
   ============================================================ */

const newRowId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))

export function ObjectivesDialog({ year, category, lines, onSave, onClose }) {
  // Holds the page still underneath; on touch a drag on the backdrop would
  // otherwise scroll the year away behind the dialog
  useScrollLock()

  const [rows, setRows] = useState(() => {
    const kept = (lines || []).map((l) => ({ id: l.id, text: l.text || '' }))
    // An empty category was opened to be written in, so it opens on a line
    // ready for typing; one that has lines opens on just those
    return kept.length ? kept : [{ id: newRowId(), text: '' }]
  })
  // The row that takes the caret as it mounts: the blank one an empty
  // category opens on, or the one "+ add objective" or Enter just made
  const [focusId, setFocusId] = useState(() =>
    (rows.length === 1 && !rows[0].text ? rows[0].id : null))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const editRow = (id, text) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, text } : r)))
  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id))

  // A new line at the end, or straight under the one Enter was pressed in
  const addRow = (afterId = null) => {
    const row = { id: newRowId(), text: '' }
    setRows((prev) => {
      const at = afterId == null ? -1 : prev.findIndex((r) => r.id === afterId)
      const next = [...prev]
      next.splice(at === -1 ? next.length : at + 1, 0, row)
      return next
    })
    setFocusId(row.id)
  }

  // A line left blank was only room to type in - it is not saved
  const submit = (e) => {
    e.preventDefault()
    onSave(rows.map((r) => ({ id: r.id, text: r.text.trim() })).filter((r) => r.text))
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form
        className="modal-card wide scroll obj-dialog"
        style={catVars(category.key)}
        onSubmit={submit}
        role="dialog"
        aria-label={`${category.name} objectives for ${year}`}
      >
        <div className="modal-eyebrow">YEARLY · {year}</div>
        <h2 className="modal-title obj-title">{category.name}</h2>
        <div className="modal-divider" />

        <div className="field-label">VALUES &amp; OBJECTIVES</div>
        {rows.length > 0 ? (
          <ul className="obj-list">
            {rows.map((r, i) => (
              <li key={r.id} className="obj-row">
                <span className="obj-dot" aria-hidden="true" />
                <input
                  type="text"
                  className="obj-input"
                  value={r.text}
                  autoFocus={r.id === focusId}
                  placeholder="A value or an objective"
                  aria-label={`${category.name} objective ${i + 1}`}
                  onChange={(e) => editRow(r.id, e.target.value)}
                  // Enter finishes the line, not the dialog - the form would
                  // otherwise save and close on the first one typed. A written
                  // line hands on to a new one under it.
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (r.text.trim()) addRow(r.id)
                  }}
                />
                <button
                  type="button"
                  className="row-del"
                  onClick={() => removeRow(r.id)}
                  title="Remove"
                  aria-label={`Remove ${r.text.trim() || 'this objective'}`}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="obj-empty">Nothing for {category.name} yet.</p>
        )}

        <button type="button" className="sched-add obj-add" onClick={() => addRow()}>
          + add objective
        </button>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  )
}
