import React from 'react'
import { useApp } from '../context/AppContext'
import { DashedOutline } from './Dash'
import { rollUp } from '../utils'

/* ============================================================
   Stats — still a placeholder.

   It was one before the sidebar (`#/stats`, a bare div reading "Stats coming
   soon in React") and it is one now; what changed is that it looks like the
   rest of the app instead of like a note to self, and it says what it is
   waiting for.

   The one honest thing it can show today is how much there is to count, read
   straight off the plan. That is not a statistic — it is the raw material —
   but it is true, and it means the page is not lying about being empty.
   ============================================================ */

export function StatsPage() {
  const { allProjects, weekMeta } = useApp()

  const weeks = new Set(allProjects.map((p) => p.week_start))
  const ended = Object.values(weekMeta).filter((m) => m?.ended).length
  const { done, total } = rollUp(allProjects.flatMap((p) => p.tasks || []))

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">PLANNING</div>
          <h1 className="page-title">Stats</h1>
        </div>
        <a className="page-head-link" href="#/weeks">All weeks ↗</a>
      </div>

      <div className="empty-box static">
        <DashedOutline r={12} />
        <b>Coming soon</b>
        <span>Completion over time, the weeks you finished, what slips and when</span>
      </div>

      {total > 0 && (
        <div className="stats-sofar">
          <div className="eyebrow">WHAT THERE IS TO COUNT</div>
          <ul className="stats-tally">
            <li>
              <span className="stats-num">{weeks.size}</span>
              <span className="stats-label">{weeks.size === 1 ? 'week planned' : 'weeks planned'}</span>
            </li>
            <li>
              <span className="stats-num">{ended}</span>
              <span className="stats-label">{ended === 1 ? 'week ended' : 'weeks ended'}</span>
            </li>
            <li>
              <span className="stats-num">{total}</span>
              <span className="stats-label">units of work</span>
            </li>
            <li>
              <span className="stats-num good">{done}</span>
              <span className="stats-label">finished</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
