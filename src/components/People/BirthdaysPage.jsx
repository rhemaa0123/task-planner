import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { PlusIcon, TrashIcon, SearchIcon } from '../icons'
import { DashedOutline } from '../Dash'
import {
  sortByNextBirthday, MONTH_NAMES, MONTH_SHORT, daysInMonth,
} from '../../utils'
import { useScrollLock } from '../../hooks/useScrollLock'

/* ============================================================
   Birthdays

   One ring, closest first, counting today as zero.

   Nothing on this page is ever reset or rewritten. A birthday is stored as a
   month and a day (and a year, when it is known) and the countdown is
   arithmetic over the clock — `nextBirthday()` in utils. So on the morning of
   someone's birthday their row reads "Today", takes the highlight and sits at
   the very top; the next morning the same row's next occurrence is a year
   away, and it falls to the bottom of its own accord. No timer, no flag, no
   migration — `useToday()` simply re-renders the page at local midnight.
   ============================================================ */

// What the dialog hands back: a date input gives "YYYY-MM-DD", which is split
// into parts on save. The year is dropped when "I don't know the year" is
// ticked, rather than stored as a guess that an age would then be computed off.
function AddDialog({ entry, onSave, onClose }) {
  // Holds the page still underneath; on touch a drag on the backdrop
  // would otherwise scroll the plan away behind the dialog
  useScrollLock()
  const [name, setName] = useState(entry?.name || '')
  const [month, setMonth] = useState(entry?.month || '')
  const [day, setDay] = useState(entry?.day || '')
  const [year, setYear] = useState(entry?.year || '')
  const [noYear, setNoYear] = useState(entry ? !entry.year : false)
  const [note, setNote] = useState(entry?.note || '')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const maxDay = month ? daysInMonth(Number(year) || 2024, Number(month)) : 31
  const valid = name.trim() && month && day >= 1 && day <= maxDay && (noYear || String(year).length === 4)

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSave({
      name: name.trim(),
      month: Number(month),
      day: Number(day),
      year: noYear ? null : Number(year),
      note,
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card" role="dialog" aria-label="Birthday" onSubmit={submit}>
        <div className="modal-eyebrow">{entry ? 'EDIT' : 'NEW'}</div>
        <h2 className="modal-title">{entry ? 'Edit birthday' : 'Add a birthday'}</h2>
        <div className="modal-divider" />

        <label className="field-label" htmlFor="bd-name">Name</label>
        <input
          id="bd-name"
          type="text"
          className="field-input"
          value={name}
          autoFocus
          placeholder="Who"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="bd-month">Month</label>
            <select
              id="bd-month"
              className="field-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="">—</option>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="field-col narrow">
            <label className="field-label" htmlFor="bd-day">Day</label>
            <input
              id="bd-day"
              type="number"
              min="1"
              max={maxDay}
              className="field-input"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <div className="field-col narrow">
            <label className="field-label" htmlFor="bd-year">Year</label>
            <input
              id="bd-year"
              type="number"
              min="1900"
              max="2100"
              className="field-input"
              value={noYear ? '' : year}
              disabled={noYear}
              placeholder="—"
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>

        <label className="field-check">
          <input
            type="checkbox"
            className="task-check"
            checked={noYear}
            onChange={(e) => setNoYear(e.target.checked)}
          />
          I don&rsquo;t know the year — just remind me of the day
        </label>

        <label className="field-label" htmlFor="bd-note">Note</label>
        <input
          id="bd-note"
          type="text"
          className="field-input"
          value={note}
          placeholder="Optional — what they like, what you owe them"
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            {entry ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

// "in 12 days" / "Tomorrow" / "Today" - the countdown in words, which is what
// the row is actually for
const whenWords = (days) => {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  if (days < 60) return `in ${days} days`
  return `in ${Math.round(days / 30.4)} months`
}

export function BirthdaysPage() {
  const { birthdays, addBirthday, updateBirthday, deleteBirthday } = useApp()
  const now = useToday()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')

  const ring = sortByNextBirthday(birthdays, now)
  const q = query.trim().toLowerCase()
  const shown = q
    ? ring.filter((b) => `${b.name} ${b.note || ''}`.toLowerCase().includes(q))
    : ring
  const todayCount = ring.filter((b) => b.next.days === 0).length

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">PEOPLE</div>
          <h1 className="page-title">Birthdays</h1>
        </div>
        <button type="button" className="btn-primary with-icon" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add birthday
        </button>
      </div>

      {ring.length > 0 && (
        <div className="list-tools">
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search birthdays"
            />
          </div>
          <span className="list-stat">
            {ring.length} {ring.length === 1 ? 'person' : 'people'}
            {todayCount > 0 && <b> · {todayCount} today</b>}
          </span>
        </div>
      )}

      {ring.length === 0 ? (
        <button type="button" className="empty-box" onClick={() => setAdding(true)}>
          <DashedOutline r={12} />
          <b>No birthdays yet</b>
          <span>Add one and it joins the countdown — closest first</span>
        </button>
      ) : (
        <ul className="bday-list">
          {shown.map((b) => (
            <li key={b.id} className={`bday-row ${b.next.days === 0 ? 'is-today' : ''}`}>
              <span className="bday-date">
                <span className="bday-day">{String(b.day).padStart(2, '0')}</span>
                <span className="bday-mon">{MONTH_SHORT[b.month - 1]}</span>
              </span>

              <span className="bday-main">
                <button
                  type="button"
                  className="bday-name"
                  onClick={() => setEditing(b)}
                  title="Edit"
                >
                  {b.name || 'Unnamed'}
                </button>
                {b.note && <span className="bday-note">{b.note}</span>}
              </span>

              <span className="bday-turning">
                {b.next.turning != null
                  ? <>turns <b>{b.next.turning}</b></>
                  : <span className="muted">year unknown</span>}
              </span>

              <span className={`bday-when ${b.next.days === 0 ? 'now' : ''}`}>
                {whenWords(b.next.days)}
              </span>

              <button
                type="button"
                className="row-del"
                onClick={() => deleteBirthday(b.id)}
                aria-label={`Remove ${b.name}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown.length === 0 && ring.length > 0 && (
        <p className="list-none">Nobody matches “{query}”.</p>
      )}

      {adding && (
        <AddDialog onSave={addBirthday} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <AddDialog
          entry={editing}
          onSave={(patch) => updateBirthday(editing.id, patch)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
