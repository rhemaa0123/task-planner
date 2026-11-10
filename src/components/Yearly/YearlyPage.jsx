import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { InlineText } from '../InlineText'
import { PlusIcon, TrashIcon } from '../icons'
import { CATEGORIES, yearProgress } from '../../utils'

/* ============================================================
   Yearly planning — what the year is for, in seven boxes.

   Rebuilt Nov 2026. It was a theme line and a note per month; it is now the
   calendar year's days, counted, and one box per category (`CATEGORIES`)
   holding the year's values and objectives as plain lines. Lines, not tasks:
   nothing here is ticked.

   The monthly page's tasks point back at these lines, and that is the whole
   link between the two. This page reads nothing from the months, so deleting
   a month cannot touch a line written here.
   ============================================================ */

// Which year the page is on lives in the hash - `#/yearly` is this one,
// `#/yearly/2027` is 2027 - so a month can link at the year it belongs to
const YEAR_ROUTE = /^#\/yearly\/(\d{4})$/

function yearFromRoute(route, now) {
  const hit = YEAR_ROUTE.exec(route || '')
  return hit ? Number(hit[1]) : now.getFullYear()
}

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`

export function YearlyPage({ route = '#/yearly' }) {
  const { years, addYearLine, updateYearLine, deleteYearLine } = useApp()
  const now = useToday()
  const year = yearFromRoute(route, now)
  const thisYear = year === now.getFullYear()
  const data = years[String(year)] || {}
  const count = yearProgress(year, now)
  // The line just added by Enter or by Add, so the caret lands in it
  const [focusLine, setFocusLine] = useState(null)

  const goTo = (y) => { window.location.hash = `#/yearly/${y}` }

  // A line left empty goes when focus leaves its row, so a stray click on Add
  // cannot leave a blank bullet behind - the same rule a pop-up follows
  const dropIfEmpty = (e, cat, id) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    const field = e.currentTarget.querySelector('.goal-text')
    if (field && !field.value.trim()) deleteYearLine(year, cat, id)
  }

  const headline = count.state === 'ahead' ? `Starts in ${days(count.startsIn)}`
    : `Day ${count.day} of ${count.total}`
  const aside = count.state === 'ahead' ? days(count.total)
    : count.state === 'over' ? 'Over'
    : count.left === 0 ? 'The last day' : `${days(count.left)} left`

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">YEARLY</div>
          <div className="month-nav">
            <button className="icon-btn" onClick={() => goTo(year - 1)} aria-label="Previous year">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h1 className="month-title year">{year}</h1>
            <button className="icon-btn" onClick={() => goTo(year + 1)} aria-label="Next year">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            {!thisYear && (
              <span className="today-link" onClick={() => { window.location.hash = '#/yearly' }}>This year</span>
            )}
          </div>
        </div>
        <a className="page-head-link" href={thisYear ? '#/monthly' : `#/monthly/${year}-01`}>The month ↗</a>
      </div>

      {/* The year's days, counted - Jan 1 is day 1 */}
      <section className={`year-count ${count.state}`} aria-label={`${year}: ${headline}, ${aside}`}>
        <div className="year-count-head">
          <span className="year-count-day">{headline}</span>
          <span className="year-count-left">{aside}</span>
        </div>
        <div className="year-count-bar">
          <span className="year-count-track">
            <span className="year-count-fill" style={{ width: `${count.pct}%` }} />
          </span>
          <span className="year-count-pct">{count.pct}%</span>
        </div>
      </section>

      <div className="cat-grid">
        {CATEGORIES.map((c) => {
          const lines = data.categories?.[c.key] || []
          return (
            <section className="panel cat-box" key={c.key}>
              <div className="panel-head">
                <span className="eyebrow">{c.name}</span>
              </div>

              <ul className="goal-list">
                {lines.map((l) => (
                  <li key={l.id} className="goal-row cat-line" onBlur={(e) => dropIfEmpty(e, c.key, l.id)}>
                    <span className="cat-dot" aria-hidden="true" />
                    <InlineText
                      wrap
                      className="goal-text"
                      value={l.text}
                      autoFocus={focusLine === l.id}
                      placeholder="A value or an objective"
                      onSave={(text) => updateYearLine(year, c.key, l.id, text)}
                      onEnter={() => setFocusLine(addYearLine(year, c.key, { after: l.id }))}
                      aria-label={`${c.name}, ${year}`}
                    />
                    <button
                      type="button"
                      className="row-del"
                      onClick={() => deleteYearLine(year, c.key, l.id)}
                      aria-label="Remove"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>

              <button type="button" className="add-row" onClick={() => setFocusLine(addYearLine(year, c.key))}>
                <span className="add-row-plus"><PlusIcon /></span>
                Add
              </button>
            </section>
          )
        })}
      </div>
    </div>
  )
}
