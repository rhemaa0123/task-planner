import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { ProjectsSidebar } from './ProjectsSidebar'
import { WeekGrid } from './WeekGrid'
import {
  addDays, weekLabel, formatWeekRange, formatWeekTitle, startOfWeek, rollUp, toISODate, fromISODate,
  formatShortDate, weekCountdown,
} from '../../utils'

function EndWeekDialog({ unfinished, onEnd, onCarry, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card wide" role="dialog" aria-label="End week">
        <div className="modal-eyebrow">END WEEK</div>
        <h2 className="modal-title">
          {unfinished > 0 ? "Some tasks aren't finished yet" : 'Everything is finished'}
        </h2>
        <div className="modal-divider" />

        <p className="modal-copy">
          {unfinished > 0
            ? 'This finalizes the week and updates your stats. Unfinished tasks can carry forward into next week, or be cleared along with everything else'
            : 'This finalizes the week and updates your stats.'}
        </p>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onEnd}>End week</button>
          {unfinished > 0 && (
            <button type="button" className="btn-strong" onClick={onCarry}>Carry forward</button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReopenDialog({ range, onReopen, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card wide" role="dialog" aria-label="Reopen week">
        <div className="modal-eyebrow">{range}</div>
        <h2 className="modal-title">Rewriting history?</h2>
        <div className="modal-divider" />

        <p className="modal-copy">
          Ended the week by mistake, or forgot to log something? Reopen it and update anything you missed
        </p>
        <div className="modal-divider" />

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onReopen}>Reopen week</button>
        </div>
      </div>
    </div>
  )
}

export function Board() {
  const {
    projects, allProjects, weekStart, setWeekStart, weekMeta, weekEnded, endWeek, reopenWeek, carryForward, showToast,
  } = useApp()
  const weekText = weekLabel(weekStart)
  const weekIso = toISODate(weekStart)
  const meta = weekMeta[weekIso]
  const ended = weekEnded
  const now = useToday()
  // A week that has not started cannot be ended
  const inFuture = weekStart > startOfWeek(now)

  // Looking ahead, the line under the bar points back instead of counting
  // down: every week up to the current one that holds a plan and was never
  // ended, newest first
  const thisWeekIso = toISODate(startOfWeek(now))
  const openEarlier = inFuture
    ? [...new Set(allProjects.map(p => p.week_start))]
        .filter(iso => iso && iso <= thisWeekIso && !weekMeta[iso]?.ended)
        .sort()
        .reverse()
    : []

  // Which of the two panes a phone shows. Ignored on wide screens, where the CSS
  // puts them side by side and both stay mounted.
  const [pane, setPane] = useState('projects')
  const [ending, setEnding] = useState(false)
  const [reopening, setReopening] = useState(false)

  // `projects` is already scoped to the visible week, so every task counts
  const { done, total, pct } = rollUp(projects.flatMap(p => p.tasks || []))

  return (
    <>
      {/* An ended week sits in two dotted enclosures - the week and its
          progress above, the plan below - so it reads as frozen, not finished */}
      <div className={`week-head ${ended ? 'frozen' : ''}`}>
        <div className="toolbar">
          <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>

            <div className="week-date-box">
              {weekText && (
                <span
                  className="week-title"
                  style={{ color: weekText === 'This week' ? 'var(--good)' : 'var(--ink-faint)' }}
                >
                  {weekText}
                </span>
              )}
              <span className="week-dates">{formatWeekRange(weekStart)}</span>
            </div>

            <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>

            <span className="today-link" onClick={() => setWeekStart(startOfWeek())}>Today</span>
          </div>
          <div className="toolbar-right">
            <button disabled={ended}>Move work</button>
            {ended ? (
              <button onClick={() => setReopening(true)}>Reopen...</button>
            ) : (
              <button
                onClick={() => setEnding(true)}
                disabled={inFuture}
                title={inFuture ? 'This week has not started yet' : undefined}
              >
                End week
              </button>
            )}
          </div>
        </div>

        <div className={`progress-section ${ended ? 'ended' : ''}`}>
          <div className="progress-row">
            <div className="progress-track">
              <div className="progress-fill" style={{width: `${pct}%`}}></div>
            </div>
            <span className="progress-pct">{done}/{total} • {pct}%</span>
          </div>
          <div className="progress-stats">
            {ended ? (
              <span className="ended-label">Ended {formatShortDate(meta.endedAt)}</span>
            ) : openEarlier.length > 0 ? (
              <span className="days-left">
                {openEarlier.slice(0, 3).map((iso, i) => (
                  <React.Fragment key={iso}>
                    {i > 0 && ', '}
                    <a
                      href="#"
                      className="open-week"
                      onClick={(e) => { e.preventDefault(); setWeekStart(fromISODate(iso)) }}
                    >
                      {formatWeekTitle(iso)}
                    </a>
                  </React.Fragment>
                ))}
                {openEarlier.length > 3 && ` and ${openEarlier.length - 3} more`}
                {openEarlier.length === 1 ? " is an earlier week that's still open" : " are earlier weeks that're still open"}
              </span>
            ) : (
              <span className="days-left">{weekCountdown(weekStart, now)}</span>
            )}
          </div>
        </div>
      </div>

      <div className={`week-body ${ended ? 'frozen' : ''}`}>
        {/* Phone only: the two panes are too tall to stack, so they take turns */}
        <div className="pane-switch" role="tablist">
          <button
            type="button"
            role="tab"
            className={`pane-tab ${pane === 'projects' ? 'selected' : ''}`}
            aria-selected={pane === 'projects'}
            onClick={() => setPane('projects')}
          >
            Projects
            <span className="pane-tab-count">{projects.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`pane-tab ${pane === 'week' ? 'selected' : ''}`}
            aria-selected={pane === 'week'}
            onClick={() => setPane('week')}
          >
            This week
            <span className="pane-tab-count">{done}/{total}</span>
          </button>
        </div>

        <div className={`planning-board pane-${pane} ${ended ? 'ended' : ''}`}>
          <ProjectsSidebar />
          <WeekGrid />
        </div>
      </div>

      {ending && (
        <EndWeekDialog
          unfinished={total - done}
          onClose={() => setEnding(false)}
          onEnd={() => {
            endWeek(weekIso)
            setEnding(false)
          }}
          onCarry={() => {
            const moved = carryForward(weekIso)
            setEnding(false)
            showToast(`Carried ${moved} ${moved === 1 ? 'item' : 'items'} into next week`)
          }}
        />
      )}

      {reopening && (
        <ReopenDialog
          range={formatWeekRange(weekStart)}
          onClose={() => setReopening(false)}
          onReopen={() => {
            reopenWeek(weekIso)
            setReopening(false)
          }}
        />
      )}
    </>
  )
}
