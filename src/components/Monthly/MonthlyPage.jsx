import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { InlineText } from '../InlineText'
import { PlusIcon, TrashIcon } from '../icons'
import {
  monthKey, shiftMonth, formatMonthLabel, daysInMonth, monthWeekStarts,
  formatWeekTitle, fromISODate, toISODate, startOfWeek, addDays, rollUp,
  DAY_INITIALS,
} from '../../utils'

/* ============================================================
   Monthly planning

   The layer above the week, and deliberately not wired into it. Nothing here
   is a task: a month's focuses are never scheduled, never roll into a week's
   progress, and the weekly board does not read them. They are what you look
   at while you decide what next week is for — the reference, not the source.

   What the page does do is read the plan, one way only: the calendar and the
   week list show how much work already sits in each day and each week of this
   month, and a week clicks through to itself on the weekly page. So the two
   pages refer to each other without either owning the other's data.
   ============================================================ */

// Units of work per calendar date, across every week in the store. Built once
// per render over the whole plan rather than per day, so a month of 31 cells
// is one pass and not thirty-one.
function loadByDate(projects) {
  const map = new Map()
  const bump = (iso, completed) => {
    if (!iso) return
    const slot = map.get(iso) || { total: 0, done: 0 }
    slot.total++
    if (completed) slot.done++
    map.set(iso, slot)
  }
  for (const p of projects || []) {
    for (const t of p.tasks || []) {
      const subs = t.subtasks || []
      if (subs.length) subs.forEach((s) => bump(s.day_date, s.completed))
      else bump(t.day_date, t.completed)
    }
  }
  return map
}

/* ---- The month as a calendar ----
   Monday-first, with the days either side of the month drawn faint so the
   weeks stay whole - a week that straddles the turn of the month is still one
   week on the weekly page, and showing it cut in half would be a lie. */
function MonthCalendar({ year, month, load, todayIso, onPickWeek }) {
  const first = new Date(year, month - 1, 1)
  const gridStart = startOfWeek(first)
  const total = daysInMonth(year, month)
  const last = new Date(year, month - 1, total)
  const weeks = []
  for (let d = gridStart; d <= last; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  }

  return (
    <div className="mcal">
      <div className="mcal-dow">
        {DAY_INITIALS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      {weeks.map((week) => {
        const weekIso = toISODate(week[0])
        return (
          <div className="mcal-week" key={weekIso}>
            <button
              type="button"
              className="mcal-week-grip"
              onClick={() => onPickWeek(weekIso)}
              title={`Open ${formatWeekTitle(weekIso)} in the weekly plan`}
              aria-label={`Open ${formatWeekTitle(weekIso)} in the weekly plan`}
            />
            {week.map((d) => {
              const iso = toISODate(d)
              const slot = load.get(iso)
              const outside = d.getMonth() !== month - 1
              return (
                <div
                  key={iso}
                  className={`mcal-day ${outside ? 'outside' : ''} ${iso === todayIso ? 'today' : ''}`}
                >
                  <span className="mcal-num">{d.getDate()}</span>
                  {slot && (
                    <span className={`mcal-load ${slot.done === slot.total ? 'full' : ''}`}>
                      {slot.total}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Which month the page is on lives in the hash - `#/monthly` is this one,
// `#/monthly/2026-03` is March. That is what lets the yearly page link
// straight at a month, and it gives the browser's own back button something
// to walk through.
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
  const {
    allProjects, months, addMonthGoal, updateMonthGoal, deleteMonthGoal, setMonthNote, setWeekStart,
  } = useApp()
  const now = useToday()
  const at = monthFromRoute(route, now)
  // The row that was just added by Enter, so the caret lands in it
  const [focusGoal, setFocusGoal] = useState(null)

  const key = monthKey(at.year, at.month)
  const month = months[key] || { goals: [], note: '' }
  const goals = month.goals || []
  const doneGoals = goals.filter((g) => g.done).length

  const todayIso = toISODate(now)
  const thisMonth = at.year === now.getFullYear() && at.month === now.getMonth() + 1
  const load = loadByDate(allProjects)

  // One row per week touching this month, with the work already planned in it
  const weeks = monthWeekStarts(at.year, at.month).map((iso) => {
    const inWeek = allProjects.filter((p) => p.week_start === iso)
    const { done, total, pct } = rollUp(inWeek.flatMap((p) => p.tasks || []))
    return { iso, projects: inWeek.length, done, total, pct }
  })

  // The one link out of this page: take the weekly board to that week and go
  const openWeek = (iso) => {
    setWeekStart(fromISODate(iso))
    window.location.hash = '#/'
  }

  const goTo = ({ year, month }) => { window.location.hash = `#/monthly/${monthKey(year, month)}` }
  const step = (by) => goTo(shiftMonth(at.year, at.month, by))

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
        <a className="page-head-link" href="#/yearly">The year ↗</a>
      </div>

      <div className="month-body">
        {/* ---- What the month is for ---- */}
        <section className="panel">
          <div className="panel-head">
            <span className="eyebrow">FOCUS</span>
            {goals.length > 0 && (
              <span className={`panel-count ${doneGoals === goals.length ? 'full' : ''}`}>
                {doneGoals}/{goals.length}
              </span>
            )}
          </div>

          <p className="panel-hint">
            A handful of things this month is for. Not tasks — nothing here is scheduled
            or counted in a week. Read them when you sit down to plan the week.
          </p>

          <ul className="goal-list">
            {goals.map((g) => (
              <li key={g.id} className={`goal-row ${g.done ? 'done' : ''}`}>
                <input
                  type="checkbox"
                  className="task-check"
                  checked={!!g.done}
                  onChange={(e) => updateMonthGoal(key, g.id, { done: e.target.checked })}
                  aria-label={g.text || 'Focus'}
                />
                <InlineText
                  className="goal-text"
                  value={g.text}
                  autoFocus={focusGoal === g.id}
                  placeholder="What matters this month"
                  onSave={(text) => updateMonthGoal(key, g.id, { text })}
                  onEnter={() => setFocusGoal(addMonthGoal(key, '', { after: g.id }))}
                />
                <button
                  type="button"
                  className="row-del"
                  onClick={() => deleteMonthGoal(key, g.id)}
                  aria-label="Remove"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="add-row"
            onClick={() => setFocusGoal(addMonthGoal(key))}
          >
            <span className="add-row-plus"><PlusIcon /></span>
            Add a focus
          </button>

          <div className="panel-divider" />

          <div className="eyebrow">NOTES</div>
          <InlineText
            multiline
            rows={5}
            className="panel-note"
            value={month.note}
            placeholder={`Anything ${formatMonthLabel(at.year, at.month)} should remember — trips, deadlines, people to see.`}
            onSave={(note) => setMonthNote(key, note)}
          />
        </section>

        {/* ---- What is already planned in it ---- */}
        <section className="panel">
          <div className="panel-head">
            <span className="eyebrow">THE MONTH</span>
            <span className="panel-sub">from the weekly plan</span>
          </div>

          <MonthCalendar
            year={at.year}
            month={at.month}
            load={load}
            todayIso={todayIso}
            onPickWeek={openWeek}
          />

          <div className="panel-divider" />

          <div className="eyebrow">ITS WEEKS</div>
          <ul className="month-weeks">
            {weeks.map((w) => (
              <li key={w.iso}>
                <button
                  type="button"
                  className={`mweek ${w.iso === toISODate(startOfWeek(now)) ? 'current' : ''}`}
                  onClick={() => openWeek(w.iso)}
                >
                  <span className="mweek-title">{formatWeekTitle(w.iso)}</span>
                  <span className="mweek-track">
                    <span className="mweek-fill" style={{ width: `${w.pct}%` }} />
                  </span>
                  <span className="mweek-stat">
                    {w.total ? `${w.done}/${w.total}` : 'empty'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="panel-hint">
            A week opens on the weekly page, where its plan is actually written.
          </p>
        </section>
      </div>
    </div>
  )
}
