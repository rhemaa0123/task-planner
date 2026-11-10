import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { InlineText } from '../InlineText'
import { PlusIcon, TrashIcon } from '../icons'
import {
  CATEGORIES, monthKey, shiftMonth, formatMonthLabel, daysInMonth, startOfWeek, addDays,
  toISODate, formatShortDate, collectDeadlines, DAY_INITIALS,
} from '../../utils'

/* ============================================================
   Monthly planning — what the month is for, beside what it owes.

   Rebuilt again Nov 2026. First, under the head, the month's FOCUS list with
   its note beside it: each focus is ticked here, and may name one of the
   yearly page's seven categories and the line of that category it serves -
   that pointer is the only tie to the year. Under them, side by side, the
   month as a calendar of its deadlines (assignments, projects, tasks) and a
   short list of the same, as a reminder.

   The calendar is a read and only a read, through the same
   `collectDeadlines()` Home's Deadlines panel uses, so the two cannot
   disagree about what is due. The week is still not wired to any of it: the
   board neither reads these focuses nor counts them.
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

// How many deadlines a day's cell names before it says "+N"
const CELL_SHOWS = 2

const chipClass = (r) => (r.colour ? `course-chip c${r.colour}` : 'course-chip plan')

/* ---- The month as a calendar of what is due ----
   Monday-first, with the days either side of the month drawn faint so the
   weeks stay whole. A narrow calendar (a phone) turns its chips into dots;
   the list under it carries the words. */
function MonthCalendar({ year, month, byDate, todayIso }) {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month - 1, daysInMonth(year, month))
  const weeks = []
  for (let d = startOfWeek(first); d <= last; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  }

  return (
    <div className="mcal">
      <div className="mcal-dow" aria-hidden="true">
        {DAY_INITIALS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      {weeks.map((week) => (
        <div className="mcal-week" key={toISODate(week[0])}>
          {week.map((d) => {
            const iso = toISODate(d)
            const outside = d.getMonth() !== month - 1
            const due = outside ? [] : byDate.get(iso) || []
            return (
              <div
                key={iso}
                className={`mcal-day ${outside ? 'outside' : ''} ${iso === todayIso ? 'today' : ''} ${due.length ? 'has-due' : ''}`}
              >
                <span className="mcal-num">{d.getDate()}</span>
                {due.length > 0 && (
                  <span className="mcal-due">
                    {due.slice(0, CELL_SHOWS).map((r) => (
                      <a key={r.key} className={`mcal-chip ${chipClass(r)}`} href={r.href} title={`${r.chip} · ${r.title}`}>
                        {r.title}
                      </a>
                    ))}
                    {due.length > CELL_SHOWS && (
                      <span className="mcal-more">+{due.length - CELL_SHOWS}</span>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function MonthlyPage({ route = '#/monthly' }) {
  const {
    allProjects, academics, months, years,
    addMonthFocus, updateMonthFocus, deleteMonthFocus, setMonthNotes,
  } = useApp()
  const now = useToday()
  const at = monthFromRoute(route, now)
  // The focus just added by Enter or by Add, so the caret lands in it
  const [focusRow, setFocusRow] = useState(null)

  const key = monthKey(at.year, at.month)
  const month = months[key] || {}
  const focus = month.focus || []
  // The lines a focus can point at: its own year's, per category
  const yearLines = years[String(at.year)]?.categories || {}
  const linesOf = (cat) => (yearLines[cat] || []).filter((l) => (l.text || '').trim())
  const thisMonth = at.year === now.getFullYear() && at.month === now.getMonth() + 1
  const label = formatMonthLabel(at.year, at.month)

  // Everything still owed that falls due in this month, in date order
  const due = collectDeadlines({ allProjects, academics }, now)
    .filter((r) => r.date && r.date.startsWith(`${key}-`))
    .sort((a, b) => (a.date === b.date ? String(a.title).localeCompare(String(b.title)) : a.date < b.date ? -1 : 1))
  const byDate = new Map()
  for (const r of due) byDate.set(r.date, [...(byDate.get(r.date) || []), r])

  const goTo = ({ year, month }) => { window.location.hash = `#/monthly/${monthKey(year, month)}` }
  const step = (by) => goTo(shiftMonth(at.year, at.month, by))

  // A focus left with no words, no tick and no category goes when focus
  // leaves its row - a stray click on Add cannot leave a blank row behind
  const dropIfEmpty = (e, f) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    const field = e.currentTarget.querySelector('.goal-text')
    if (field && !field.value.trim() && !f.done && !f.cat) deleteMonthFocus(key, f.id)
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
            <h1 className="month-title">{label}</h1>
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

      <div className="month-layout">
        {/* ---- What the month is for: the list, its note beside it ---- */}
        <section className="panel month-focus">
          <div className="month-focus-list">
            <div className="panel-head">
              <span className="eyebrow">FOCUS</span>
            </div>

            <ul className="goal-list">
              {focus.map((f) => {
                const lines = f.cat ? linesOf(f.cat) : []
                const cat = CATEGORIES.find((c) => c.key === f.cat)
                // Looked up, never trusted: a line deleted from the year
                // leaves this focus simply unlinked
                const linked = lines.find((l) => String(l.id) === String(f.ref))
                return (
                  <li
                    key={f.id}
                    className={`goal-row focus-row ${f.done ? 'done' : ''}`}
                    onBlur={(e) => dropIfEmpty(e, f)}
                  >
                    <input
                      type="checkbox"
                      className="task-check"
                      checked={!!f.done}
                      onChange={(e) => updateMonthFocus(key, f.id, { done: e.target.checked })}
                      aria-label={f.text || 'Focus'}
                    />
                    <div className="focus-body">
                      <InlineText
                        wrap
                        className="goal-text"
                        value={f.text}
                        autoFocus={focusRow === f.id}
                        placeholder="What matters this month"
                        onSave={(text) => updateMonthFocus(key, f.id, { text })}
                        onEnter={() => setFocusRow(addMonthFocus(key, { after: f.id }))}
                        aria-label={`Focus, ${label}`}
                      />
                      <div className="focus-picks">
                        <select
                          className={`cat-ref ${cat ? 'linked' : ''}`}
                          value={cat ? cat.key : ''}
                          // A new category means the old line no longer fits
                          onChange={(e) => updateMonthFocus(key, f.id, { cat: e.target.value || null, ref: null })}
                          aria-label="The yearly category this focus falls under"
                        >
                          <option value="">{cat ? 'No category' : 'Category…'}</option>
                          {CATEGORIES.map((c) => (
                            <option key={c.key} value={c.key}>{c.name}</option>
                          ))}
                        </select>

                        {cat && (lines.length > 0 ? (
                          <select
                            className={`cat-ref ${linked ? 'linked' : ''}`}
                            value={linked ? String(linked.id) : ''}
                            onChange={(e) => updateMonthFocus(key, f.id, { ref: e.target.value || null })}
                            aria-label={`The ${cat.name} line on the ${at.year} page this focus fulfils`}
                          >
                            <option value="">{linked ? 'No link' : `Link to a ${at.year} line…`}</option>
                            {lines.map((l) => (
                              <option key={l.id} value={String(l.id)}>↳ {l.text}</option>
                            ))}
                          </select>
                        ) : (
                          // Nothing to link to yet: say where the lines are written
                          <a className="cat-empty-link" href={`#/yearly/${at.year}`}>
                            No {cat.name} lines on the {at.year} page yet ↗
                          </a>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="row-del"
                      onClick={() => deleteMonthFocus(key, f.id)}
                      aria-label="Remove"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                )
              })}
            </ul>

            <button type="button" className="add-row" onClick={() => setFocusRow(addMonthFocus(key))}>
              <span className="add-row-plus"><PlusIcon /></span>
              Add a focus
            </button>
          </div>

          <div className="month-focus-notes">
            <div className="panel-head">
              <span className="eyebrow">NOTES</span>
            </div>
            <InlineText
              multiline
              rows={6}
              className="panel-note"
              value={month.notes}
              placeholder={`Anything ${label} should remember — trips, people to see, ideas.`}
              onSave={(notes) => setMonthNotes(key, notes)}
              aria-label={`Notes, ${label}`}
            />
          </div>
        </section>

        {/* ---- What it owes: the calendar and its list, side by side ---- */}
        <div className="month-below">
          <section className="panel">
            <div className="panel-head">
              <span className="eyebrow">THE MONTH</span>
            </div>
            <MonthCalendar year={at.year} month={at.month} byDate={byDate} todayIso={toISODate(now)} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="eyebrow">DUE THIS MONTH</span>
            </div>
            {due.length === 0 ? (
              <p className="month-due-none">Nothing due this month</p>
            ) : (
              <ul className="month-due">
                {due.map((r) => (
                  <li key={r.key}>
                    <a className="month-due-row" href={r.href}>
                      <span className="month-due-date">{formatShortDate(r.date)}</span>
                      <span className={`${chipClass(r)}`} title={r.kind}>{r.chip}</span>
                      <span className="month-due-title">{r.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
