import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { InlineText } from '../InlineText'
import {
  MONTH_NAMES, monthKey, rollUp, monthWeekStarts, addTally, popupTally, popupHorizon, weekDates,
} from '../../utils'

/* ============================================================
   Yearly planning — the coarsest layer, and on purpose the thinnest.

   A line for the year, and a line for each of its twelve months. That is the
   whole page. It is not a calendar and not a task list: it is the thing you
   write in January and read in March, and the only reason it exists is so the
   monthly page has something above it to answer to.

   A month card carries two more things it does not own: how many focuses the
   monthly page has for it, and how much work the weekly plans in it hold. Both
   are read, never written — click the card and the monthly page takes over.
   ============================================================ */

export function YearlyPage() {
  const { years, setYearTheme, setYearMonthNote, months, allProjects, popups } = useApp()
  const now = useToday()
  const [year, setYear] = useState(() => now.getFullYear())

  const data = years[String(year)] || { theme: '', months: {} }
  const thisYear = year === now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // Work planned inside a month, counted off the weeks that touch it. A week
  // on the turn of the month is counted in both, which is the honest answer -
  // it is one week and it belongs to both of them. Those weeks' pop-ups count
  // beside it, a daily only as far as the horizon - so a month ahead holds
  // what was written into it and no more.
  const horizon = popupHorizon(now)
  const planned = (month) => {
    const weekStarts = monthWeekStarts(year, month)
    const starts = new Set(weekStarts)
    const tasks = allProjects.filter((p) => starts.has(p.week_start)).flatMap((p) => p.tasks || [])
    return addTally(rollUp(tasks), popupTally(popups, weekStarts.flatMap(weekDates), horizon))
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">YEARLY</div>
          <div className="month-nav">
            <button className="icon-btn" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h1 className="month-title year">{year}</h1>
            <button className="icon-btn" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            {!thisYear && (
              <span className="today-link" onClick={() => setYear(now.getFullYear())}>This year</span>
            )}
          </div>
        </div>
        <a className="page-head-link" href="#/monthly">The month ↗</a>
      </div>

      <section className="year-theme">
        <div className="eyebrow">THE YEAR IN ONE LINE</div>
        <InlineText
          className="year-theme-input"
          value={data.theme}
          placeholder={`What is ${year} for?`}
          onSave={(theme) => setYearTheme(year, theme)}
          aria-label={`Theme for ${year}`}
        />
      </section>

      <div className="year-grid">
        {MONTH_NAMES.map((name, i) => {
          const month = i + 1
          const focuses = (months[monthKey(year, month)]?.goals || [])
          const work = planned(month)
          const isNow = thisYear && month === currentMonth
          const isPast = thisYear ? month < currentMonth : year < now.getFullYear()

          return (
            <article className={`year-month ${isNow ? 'current' : ''} ${isPast ? 'past' : ''}`} key={month}>
              <div className="year-month-head">
                <h2 className="year-month-name">{name}</h2>
                <div className="year-month-marks">
                  {focuses.length > 0 && (
                    <span className="year-chip" title={`${focuses.length} focuses on the monthly page`}>
                      {focuses.filter((g) => g.done).length}/{focuses.length}
                    </span>
                  )}
                  {work.total > 0 && (
                    <span className="year-chip plain" title={`${work.total} units of work planned`}>
                      {work.total}
                    </span>
                  )}
                </div>
              </div>

              <InlineText
                multiline
                rows={3}
                className="year-month-note"
                value={data.months?.[month] || ''}
                placeholder="—"
                onSave={(text) => setYearMonthNote(year, month, text)}
                aria-label={`${name} ${year}`}
              />

              <a className="year-month-open" href={`#/monthly/${monthKey(year, month)}`}>Plan {name} ↗</a>
            </article>
          )
        })}
      </div>
    </div>
  )
}
