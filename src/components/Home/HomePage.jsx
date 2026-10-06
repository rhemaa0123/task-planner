import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import {
  TodayPanel, TomorrowPanel, WeatherPanel, CountdownPanel, BirthdayPanel, DeadlinePanel,
} from './Overview'
import {
  toISODate, startOfWeek, rollUp, weekCountdown, formatWeekRange,
  DAY_NAMES, MONTH_NAMES, addTally, popupTally, popupHorizon, weekDates,
} from '../../utils'

// Whether Tomorrow is open beside Today. A way of looking at the page, not
// part of the plan, so it lives beside the theme and the week view - per
// browser - rather than in the store.
const PLAN_KEY = 'task-planner-home-tomorrow'
const readPlanning = () => {
  try {
    return localStorage.getItem(PLAN_KEY) === 'open'
  } catch {
    return false
  }
}

/* ============================================================
   Home — the overview, and what the app opens on.

   Until Oct 2026 this was four widgets wedged into the top of the sidebar.
   They are a page now: `#/` is Home and the weekly board moved to `#/weekly`.
   The sidebar is navigation and nothing else, which is also what made it short
   enough to read at a glance.

   Nothing here owns any data. Every panel reads a store that some other page
   writes, and every panel says where that page is — so Home is a way in, not a
   fourth place to keep things.
   ============================================================ */

export function HomePage() {
  const { profile, allProjects, popups } = useApp()
  const now = useToday()

  const weekIso = toISODate(startOfWeek(now))
  const thisWeek = allProjects.filter((p) => p.week_start === weekIso)
  // The week's pop-ups count beside its work, as they do on the board
  const { done, total, pct } = addTally(
    rollUp(thisWeek.flatMap((p) => p.tasks || [])),
    popupTally(popups, weekDates(weekIso), popupHorizon(now)),
  )

  const [planning, setPlanningState] = useState(readPlanning)
  const togglePlanning = () => {
    const next = !planning
    setPlanningState(next)
    try { localStorage.setItem(PLAN_KEY, next ? 'open' : 'closed') } catch { /* private mode - holds for the visit */ }
  }
  // The row being dragged out of Today, if any - Tomorrow lights up for it
  const [dragKey, setDragKey] = useState(null)

  const day = DAY_NAMES[(now.getDay() + 6) % 7]
  const name = (profile.name || '').trim()

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">{name ? `${name.toUpperCase()}'S DAY` : 'TODAY'}</div>
          <h1 className="page-title home-day">{day}</h1>
          <div className="home-date">
            {String(now.getDate()).padStart(2, '0')} {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
          </div>
        </div>
      </div>

      {/* The week, in one line. Not a panel - it is the strip the rest of the
          page sits under, and the one thing here that is about more than today. */}
      <a className="home-week" href="#/weekly">
        <span className="home-week-label">
          This week
          <b>{formatWeekRange(startOfWeek(now))}</b>
        </span>
        <span className="home-week-track">
          <span className="home-week-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="home-week-stat">
          {total ? `${done}/${total} · ${pct}%` : 'nothing planned'}
        </span>
        <span className="home-week-say">{weekCountdown(startOfWeek(now), now)}</span>
      </a>

      {/* `wide` / `narrow`, not `main` / `side`: the app shell's sidebar is
          `.side`, and a bare `side` here inherited its `grid-column: 1` and its
          268px width, which dropped this column underneath the other one. */}
      <div className="home-grid">
        {/* Planning tomorrow takes the whole width, the two days side by side
            so a row only has to travel across; below ~700px they stack,
            Today first */}
        {planning && (
          <div className="home-plan">
            <TodayPanel planning onPlanning={togglePlanning} dragKey={dragKey} onDragKey={setDragKey} />
            <TomorrowPanel armed={dragKey != null} onDropped={() => setDragKey(null)} />
          </div>
        )}
        <div className="home-col wide">
          {!planning && <TodayPanel onPlanning={togglePlanning} />}
          <DeadlinePanel />
        </div>
        <div className="home-col narrow">
          <WeatherPanel />
          <CountdownPanel />
          <BirthdayPanel />
        </div>
      </div>
    </div>
  )
}
