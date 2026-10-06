import React, { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { DashedOutline } from '../Dash'
import { buildStats, recentWeeks, heatGrid, heatLevel, heatPeak, STREAK_AT } from './compute'
import {
  formatWeekTitle, formatShortDate, fromISODate, DAY_NAMES, DAY_INITIALS,
} from '../../utils'

/* ============================================================
   Stats

   Four figures and three charts, and nothing that is only a number because a
   number was available. Every block here had to answer "what would you do
   differently having read this?":

     the cards        where you stand, and whether the run is alive
     week by week     whether it is getting better or worse
     activity         the rhythm — which stretches you kept and which you lost
     follow-through   which weekday you overcommit, which one you clear

   What was cut is as deliberate. A second weekday chart splitting *where
   completions land* says the same thing as follow-through with the axis
   relabelled, and a raw count of everything ever planned is volume, not a
   finding — it is a footnote here, under the chart it qualifies.

   The arithmetic lives in [[compute]]; this file only draws it.
   ============================================================ */

const WEEK_SPAN = 14
const HEAT_SPAN = 53

/* The one sentence worth putting above the weekday chart. It names the day
   you actually clear and, when the spread is wide enough to mean anything,
   the day you do not — a four-point gap between two weekdays is noise, and
   saying it out loud would make it sound like a finding. */
function weekdayHeadline(byWeekday) {
  const seen = byWeekday.filter((d) => d.planned > 0)
  if (seen.length < 2) return 'Plan across a few more weeks and the pattern shows up here'

  const best = seen.reduce((a, b) => (b.pct > a.pct ? b : a))
  const worst = seen.reduce((a, b) => (b.pct < a.pct ? b : a))
  if (best.pct === worst.pct) return `Every day you plan runs at ${best.pct}% — no weekday stands out yet`

  const lead = `${DAY_NAMES[best.i]} is your strongest day — ${best.pct}% of what you plan there gets done`
  if (best.pct - worst.pct < 20) return lead
  return `${lead}; ${DAY_NAMES[worst.i]} is where it slips, at ${worst.pct}%`
}

export function StatsPage() {
  const { allProjects, weekMeta, setWeekStart, popups } = useApp()
  const now = useToday()

  const stats = useMemo(
    () => buildStats(allProjects, weekMeta, now, popups),
    [allProjects, weekMeta, now, popups],
  )
  const bars = useMemo(() => recentWeeks(stats.byWeek, now, WEEK_SPAN), [stats.byWeek, now])
  const columns = useMemo(() => heatGrid(stats.byDate, now, HEAT_SPAN), [stats.byDate, now])
  const peak = useMemo(() => heatPeak(stats.byDate), [stats.byDate])

  const openWeek = (iso) => {
    setWeekStart(fromISODate(iso))
    window.location.hash = '#/weekly'
  }

  // The tallest bar sets the scale for the rest, so the chart is about the
  // shape of the run rather than about any one week's absolute size
  const heaviest = bars.reduce((m, b) => Math.max(m, b.total), 0)
  const heatDone = columns.reduce((n, c) => n + c.days.reduce((d, x) => d + x.done, 0), 0)

  if (stats.total === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-head-left">
            <div className="eyebrow">PLANNING</div>
            <h1 className="page-title">Stats</h1>
          </div>
        </div>
        <a className="empty-box" href="#/weekly">
          <DashedOutline r={12} />
          <b>Nothing to count yet</b>
          <span>Plan a week and tick something off — the charts build themselves from the plan</span>
        </a>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">PLANNING</div>
          <h1 className="page-title">Stats</h1>
        </div>
        <a className="page-head-link" href="#/weeks">All weeks ↗</a>
      </div>

      {/* ---- Where you stand ---- */}
      <ul className="stat-cards">
        <li className="stat-card">
          <span className="stat-fig">{stats.pct}%</span>
          <span className="stat-name">COMPLETION</span>
          <span className="stat-sub">{stats.done} of {stats.total} task units</span>
        </li>

        <li className="stat-card">
          <span className="stat-fig">{stats.best ? `${stats.best.pct}%` : '—'}</span>
          <span className="stat-name">BEST WEEK</span>
          {stats.best ? (
            <button type="button" className="stat-sub as-link" onClick={() => openWeek(stats.best.iso)}>
              {formatWeekTitle(stats.best.iso)}
            </button>
          ) : (
            <span className="stat-sub">nothing finished yet</span>
          )}
        </li>

        <li className="stat-card">
          <span className={`stat-fig ${stats.streak > 0 ? 'good' : ''}`}>{stats.streak}</span>
          <span className="stat-name">WEEK STREAK</span>
          <span className="stat-sub">
            {stats.streak > 0 ? `in a row at ${STREAK_AT}%+` : `no run at ${STREAK_AT}%+ yet`}
          </span>
        </li>

        <li className="stat-card">
          <span className="stat-fig">{stats.weeksPlanned}</span>
          <span className="stat-name">{stats.weeksPlanned === 1 ? 'WEEK PLANNED' : 'WEEKS PLANNED'}</span>
          <span className="stat-sub">
            {stats.weeksEnded > 0 ? `${stats.weeksEnded} ended` : 'none ended yet'}
          </span>
        </li>
      </ul>

      {/* ---- Week by week ---- */}
      <section className="chart">
        <div className="chart-head">
          <span className="eyebrow">WEEK BY WEEK</span>
          <span className="chart-note">last {WEEK_SPAN} weeks</span>
        </div>
        <p className="chart-say">Bar height is the week&rsquo;s workload; the fill is what you finished</p>

        <div className="sbar-scroll">
          <div className="sbar-row">
            {bars.map((b) => (
              <div key={b.iso} className={`sbar ${b.current ? 'now' : ''}`}>
                <div className="sbar-slot">
                  {b.total > 0 ? (
                    <button
                      type="button"
                      className="sbar-stack"
                      style={{ height: `${Math.max(10, Math.round((b.total / heaviest) * 100))}%` }}
                      onClick={() => openWeek(b.iso)}
                      title={`${formatWeekTitle(b.iso)} — ${b.done} of ${b.total} done`}
                    >
                      <span className="sbar-fill" style={{ height: `${b.pct}%` }} />
                    </button>
                  ) : (
                    <span className="sbar-ghost"><DashedOutline r={4} /></span>
                  )}
                </div>
                <span className="sbar-pct">{b.total > 0 ? `${b.pct}%` : ''}</span>
                <span className="sbar-when">{formatShortDate(b.iso)}</span>
              </div>
            ))}
          </div>
        </div>

        {stats.slipped > 0 && (
          <p className="chart-foot">
            {stats.slipped} {stats.slipped === 1 ? 'day of work' : 'days of work'} slipped and
            was moved on — the day it was left behind still counts against that week
          </p>
        )}
      </section>

      {/* ---- Activity ----
          Keyed to the day work was *planned for*, not the day it was ticked:
          nothing in this app records the second, and inventing it would be
          the one number on the page that was not true. */}
      <section className="chart">
        <div className="chart-head">
          <span className="eyebrow">ACTIVITY</span>
          <span className="heat-key">
            LESS
            {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`heat-cell lv${l}`} />)}
            MORE
          </span>
        </div>
        <p className="chart-say">
          {heatDone} task {heatDone === 1 ? 'unit' : 'units'} finished in the last year, on the day each was planned for
        </p>

        <div className="heat-scroll">
          <div className="heat-inner">
            <div className="heat-months">
              {columns.map((c) => (
                <span key={c.iso}>{c.label && <i>{c.label}</i>}</span>
              ))}
            </div>
            <div className="heat-body">
              <div className="heat-days">
                {DAY_INITIALS.map((d, i) => (
                  <span key={i}>{i % 2 === 0 ? d : ''}</span>
                ))}
              </div>
              <div className="heat-grid">
                {columns.map((col) => (
                  <div className="heat-col" key={col.iso}>
                    {col.days.map((d) => (
                      <i
                        key={d.iso}
                        className={[
                          'heat-cell',
                          `lv${heatLevel(d.done, peak)}`,
                          d.future ? 'future' : '',
                          d.today ? 'today' : '',
                          // Planned and cleared nothing: not an empty day, and
                          // the only thing a flat colour ramp would hide
                          d.total > 0 && d.done === 0 ? 'undone' : '',
                        ].filter(Boolean).join(' ')}
                        title={
                          d.future ? formatShortDate(d.iso)
                          : d.total === 0 ? `${formatShortDate(d.iso)} — nothing planned`
                          : `${formatShortDate(d.iso)} — ${d.done} of ${d.total} done`
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Follow-through ---- */}
      {stats.hasWeekdayShape && (
        <section className="chart">
          <div className="chart-head">
            <span className="eyebrow">FOLLOW-THROUGH</span>
            <span className="chart-note">all weeks</span>
          </div>
          <p className="chart-say">{weekdayHeadline(stats.byWeekday)}</p>

          <div className="wd-row">
            {stats.byWeekday.map((d) => (
              <div key={d.i} className="wd">
                <div className="wd-slot">
                  {d.planned > 0 ? (
                    <span
                      className={`wd-bar ${d.pct === 0 ? 'zero' : ''}`}
                      style={{ height: `${Math.max(3, d.pct)}%` }}
                      title={`${DAY_NAMES[d.i]} — ${d.done} of ${d.planned} done`}
                    />
                  ) : (
                    <span className="wd-ghost"><DashedOutline r={4} /></span>
                  )}
                </div>
                <span className="wd-day">{DAY_INITIALS[d.i]}</span>
                <span className="wd-pct">{d.planned > 0 ? `${d.pct}%` : '—'}</span>
              </div>
            ))}
          </div>

          {stats.unscheduled > 0 && (
            <p className="chart-foot">
              {stats.unscheduled} {stats.unscheduled === 1 ? 'unit has' : 'units have'} no day yet,
              so {stats.unscheduled === 1 ? 'it is' : 'they are'} not in this chart
            </p>
          )}
        </section>
      )}
    </div>
  )
}
