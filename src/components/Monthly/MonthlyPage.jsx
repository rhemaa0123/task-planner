import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { InlineText } from '../InlineText'
import { PlusIcon, TrashIcon } from '../icons'
import { CATEGORIES, monthKey, shiftMonth, formatMonthLabel } from '../../utils'

/* ============================================================
   Monthly planning — the month's tasks, under the year's seven headings.

   Rebuilt Nov 2026 around the yearly page's categories. It held a list of
   focuses, a note, a calendar of the month and its weeks; the calendar and
   the weeks only drew the weekly plan again, which the board and the weeks
   page already do, so the page is now the seven boxes and nothing else.

   A task here is ticked here, and each one may point at the line of its own
   category on its year's page that it serves - that pointer is the only tie
   between the two pages. The week is still not wired to any of it: the board
   neither reads these tasks nor counts them.
   ============================================================ */

// Which month the page is on lives in the hash - `#/monthly` is this one,
// `#/monthly/2026-03` is March - so the browser's own back button has
// something to walk through
const MONTH_ROUTE = /^#\/monthly\/(\d{4})-(\d{2})$/

function monthFromRoute(route, now) {
  const hit = MONTH_ROUTE.exec(route || '')
  if (hit) {
    const month = Number(hit[2])
    if (month >= 1 && month <= 12) return { year: Number(hit[1]), month }
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function MonthlyPage({ route = '#/monthly' }) {
  const { months, years, addMonthTask, updateMonthTask, deleteMonthTask } = useApp()
  const now = useToday()
  const at = monthFromRoute(route, now)
  // The task just added by Enter or by Add, so the caret lands in it
  const [focusTask, setFocusTask] = useState(null)

  const key = monthKey(at.year, at.month)
  const month = months[key] || {}
  // The lines this month's tasks can point at: its own year's, per category
  const yearLines = years[String(at.year)]?.categories || {}
  const thisMonth = at.year === now.getFullYear() && at.month === now.getMonth() + 1

  const goTo = ({ year, month }) => { window.location.hash = `#/monthly/${monthKey(year, month)}` }
  const step = (by) => goTo(shiftMonth(at.year, at.month, by))

  // A task left with no words, no tick and no link goes when focus leaves its
  // row - a stray click on Add cannot leave a blank, counted task behind
  const dropIfEmpty = (e, cat, t) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    const field = e.currentTarget.querySelector('.goal-text')
    if (field && !field.value.trim() && !t.done && !t.ref) deleteMonthTask(key, cat, t.id)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">MONTHLY</div>
          <div className="month-nav">
            <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous month">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h1 className="month-title">{formatMonthLabel(at.year, at.month)}</h1>
            <button className="icon-btn" onClick={() => step(1)} aria-label="Next month">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            {!thisMonth && (
              <span className="today-link" onClick={() => { window.location.hash = '#/monthly' }}>
                This month
              </span>
            )}
          </div>
        </div>
        <a className="page-head-link" href={`#/yearly/${at.year}`}>The year ↗</a>
      </div>

      <div className="cat-grid">
        {CATEGORIES.map((c) => {
          const tasks = month.categories?.[c.key] || []
          const lines = (yearLines[c.key] || []).filter((l) => (l.text || '').trim())
          const done = tasks.filter((t) => t.done).length
          return (
            <section className="panel cat-box" key={c.key}>
              <div className="panel-head">
                <span className="eyebrow">{c.name}</span>
                {tasks.length > 0 && (
                  <span className={`panel-count ${done === tasks.length ? 'full' : ''}`}>
                    {done}/{tasks.length}
                  </span>
                )}
              </div>

              <ul className="goal-list">
                {tasks.map((t) => {
                  // Looked up, never trusted: a line deleted from the year
                  // leaves this task simply unlinked
                  const linked = lines.find((l) => String(l.id) === String(t.ref))
                  return (
                    <li
                      key={t.id}
                      className={`goal-row cat-task ${t.done ? 'done' : ''}`}
                      onBlur={(e) => dropIfEmpty(e, c.key, t)}
                    >
                      <input
                        type="checkbox"
                        className="task-check"
                        checked={!!t.done}
                        onChange={(e) => updateMonthTask(key, c.key, t.id, { done: e.target.checked })}
                        aria-label={t.text || 'Task'}
                      />
                      <div className="cat-task-body">
                        <InlineText
                          wrap
                          className="goal-text"
                          value={t.text}
                          autoFocus={focusTask === t.id}
                          placeholder="A task for this month"
                          onSave={(text) => updateMonthTask(key, c.key, t.id, { text })}
                          onEnter={() => setFocusTask(addMonthTask(key, c.key, { after: t.id }))}
                          aria-label={`${c.name}, ${formatMonthLabel(at.year, at.month)}`}
                        />
                        {lines.length > 0 && (
                          <select
                            className={`cat-ref ${linked ? 'linked' : ''}`}
                            value={linked ? String(linked.id) : ''}
                            onChange={(e) => updateMonthTask(key, c.key, t.id, { ref: e.target.value || null })}
                            aria-label={`The ${c.name} line on the ${at.year} page this task serves`}
                          >
                            <option value="">{linked ? 'No link' : `Link to a ${at.year} line…`}</option>
                            {lines.map((l) => (
                              <option key={l.id} value={String(l.id)}>↳ {l.text}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <button
                        type="button"
                        className="row-del"
                        onClick={() => deleteMonthTask(key, c.key, t.id)}
                        aria-label="Remove"
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  )
                })}
              </ul>

              <button type="button" className="add-row" onClick={() => setFocusTask(addMonthTask(key, c.key))}>
                <span className="add-row-plus"><PlusIcon /></span>
                Add a task
              </button>

              {/* Nothing to link to yet: say where the lines are written */}
              {tasks.length > 0 && lines.length === 0 && (
                <a className="cat-empty-link" href={`#/yearly/${at.year}`}>
                  No {c.name} lines on the {at.year} page yet ↗
                </a>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
