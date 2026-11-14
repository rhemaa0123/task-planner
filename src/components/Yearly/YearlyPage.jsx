import React, { useState, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { InlineText } from '../InlineText'
import { TrashIcon } from '../icons'
import { CATEGORIES, catVars, yearProgress } from '../../utils'
import { ObjectivesDialog } from './ObjectivesDialog'

/* ============================================================
   Yearly planning — what the year is for, in seven boxes.

   Rebuilt Nov 2026. It was a theme line and a note per month; it is now the
   calendar year's days, counted, and one row per category (`CATEGORIES`):
   the category's name in a narrow cell on the left, the year's values and
   objectives for it as plain lines in the wide cell on the right. Lines, not
   tasks: nothing here is ticked.

   Each category has its own colour (`catVars`): a stripe down the block's
   edge, a tint behind its name, and its lines' dots. Lines are added in the
   block's dialog (`ObjectivesDialog`), opened by clicking the name or any
   open ground in the block; a line already there is still edited in place by
   clicking its words, and removed with the × on hover.

   The monthly page's focuses point back at these lines, and that is the whole
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
  const { years, updateYearLine, deleteYearLine, setYearCategory } = useApp()
  const now = useToday()
  const year = yearFromRoute(route, now)
  const thisYear = year === now.getFullYear()
  const data = years[String(year)] || {}
  const count = yearProgress(year, now)
  // The block whose dialog is open, as { year, key } - the year is held with
  // it so the save lands on the year the dialog was opened on
  const [editing, setEditing] = useState(null)
  const editingCat = editing ? CATEGORIES.find((c) => c.key === editing.key) : null

  const goTo = (y) => { window.location.hash = `#/yearly/${y}` }

  const openBlock = (key) => setEditing({ year, key })

  // A click on a block's open ground - around its lines, or on the empty
  // hint - opens its dialog. A click on a line is for that line: its words
  // edit in place and its × removes it. A press that began on a line and was
  // let go on open ground is a text selection running long, not a click on
  // the block - the browser reports it as a click on the body all the same.
  const pressedOnLine = useRef(false)
  const notePress = (e) => { pressedOnLine.current = !!e.target.closest('.goal-row') }
  const openFromBody = (e, key) => {
    if (pressedOnLine.current || e.target.closest('.goal-row')) return
    openBlock(key)
  }

  // A line emptied in place goes when focus leaves its row, so no blank
  // bullet is left behind - the same rule a pop-up follows
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

      <div className="cat-rows">
        {CATEGORIES.map((c) => {
          const lines = data.categories?.[c.key] || []
          return (
            <section
              className="panel cat-row"
              key={c.key}
              style={catVars(c.key)}
              aria-label={`${c.name}, ${year}`}
            >
              <h2 className="cat-row-head">
                <button
                  type="button"
                  className="cat-row-open"
                  onClick={() => openBlock(c.key)}
                  aria-haspopup="dialog"
                  aria-label={`${c.name}: add or remove objectives for ${year}`}
                >
                  <span className="cat-row-name">{c.name}</span>
                  <span className="cat-row-hint" aria-hidden="true">Edit</span>
                </button>
              </h2>

              <div
                className="cat-row-body"
                onMouseDown={notePress}
                onClick={(e) => openFromBody(e, c.key)}
              >
                {lines.length > 0 ? (
                  <ul className="goal-list">
                    {lines.map((l) => (
                      <li key={l.id} className="goal-row cat-line" onBlur={(e) => dropIfEmpty(e, c.key, l.id)}>
                        <span className="cat-dot" aria-hidden="true" />
                        {/* No `onEnter`: Enter saves the line and lets go.
                            New lines are written in the block's dialog. */}
                        <InlineText
                          wrap
                          className="goal-text"
                          value={l.text}
                          placeholder="A value or an objective"
                          onSave={(text) => updateYearLine(year, c.key, l.id, text)}
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
                ) : (
                  <span className="cat-row-empty">Click to add objectives</span>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {editingCat && (
        <ObjectivesDialog
          key={`${editing.year}:${editing.key}`}
          year={editing.year}
          category={editingCat}
          lines={years[String(editing.year)]?.categories?.[editing.key] || []}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setYearCategory(editing.year, editing.key, next)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
