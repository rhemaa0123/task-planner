import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import {
  toISODate, fromISODate, addDays, startOfWeek, rollUp, dayLoad, encodePlan,
  formatWeekTitle, formatShortDate,
} from '../../utils'

function ConfirmDialog({ eyebrow, title, copy, action, onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" role="dialog" aria-label={title}>
        <div className="modal-eyebrow">{eyebrow}</div>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-divider" />
        <p className="modal-copy">{copy}</p>
        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-danger" onClick={onConfirm}>{action}</button>
        </div>
      </div>
    </div>
  )
}

// One weekday column: a bar sized by how much work landed that day, with the
// finished share filled solid. Nothing scheduled leaves a stub so the seven
// columns still read as a week.
function DayBar({ day, max, kind, isToday }) {
  const h = day.total === 0 ? 0 : Math.max(10, Math.round((day.total / max) * 48))
  const doneH = day.total === 0 ? 0 : Math.round((h * day.done) / day.total)
  return (
    <div className="wk-day">
      <div className="wk-bar-slot">
        {day.total === 0 ? (
          <div className={`wk-bar empty ${kind}`} />
        ) : (
          <div className={`wk-bar ${kind}`} style={{ height: h }} title={`${day.done} of ${day.total} done`}>
            {doneH > 0 && <div className="wk-bar-done" style={{ height: doneH }} />}
          </div>
        )}
      </div>
      <div className={`wk-day-letter ${isToday ? 'today' : ''}`}>{day.initial}</div>
    </div>
  )
}

// Every day of every upcoming week in one strip, labelled at each Monday, so
// the collapsed group still shows where the load sits
function Sparkline({ weeks }) {
  const ascending = [...weeks].sort((a, b) => (a.iso < b.iso ? -1 : 1))
  const days = ascending.flatMap(w => w.days)
  const max = Math.max(1, ...days.map(d => d.total))
  return (
    <div className="wk-spark" aria-hidden="true">
      <div className="wk-spark-bars">
        {days.map(d => (
          <div
            key={d.date}
            className={`wk-spark-bar ${d.total === 0 ? 'empty' : d.done > 0 ? 'done' : ''}`}
            style={{ height: d.total === 0 ? 0 : Math.max(3, Math.round((d.total / max) * 22)) }}
          />
        ))}
      </div>
      <div className="wk-spark-axis">
        {ascending.map((w, i) => (
          <span key={w.iso} style={{ left: `${(i * 7 * 100) / days.length}%` }}>
            {String(fromISODate(w.iso).getDate()).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  )
}

function Stat({ week }) {
  const { kind, ended, done, total, pct } = week
  if (kind === 'current' || (kind === 'future' && done > 0)) {
    return (
      <div className="wk-stat">
        <div className="wk-stat-big"><b>{done}</b>/{total}</div>
        <div className="wk-stat-label">DONE</div>
      </div>
    )
  }
  if (kind === 'future') {
    return (
      <div className="wk-stat">
        <div className="wk-stat-big"><b>{total}</b></div>
        <div className="wk-stat-label">PLANNED</div>
      </div>
    )
  }
  // past: an ended week is judged, an open one merely reported
  return (
    <div className="wk-stat">
      <div className={`wk-stat-big ${ended ? (pct === 100 ? 'good' : 'warn') : ''}`}><b>{pct}%</b></div>
      <div className="wk-stat-label">{ended ? 'COMPLETE' : 'DONE'}</div>
    </div>
  )
}

// The list's left edge sits under the WEEKS tab in the header, and the right
// edge mirrors it, so the column is centred. Measured, since the tab's place
// depends on the brand and the two tabs before it; re-measured on resize and
// once the webfont has settled the brand's width.
function useWeeksInset(ref) {
  const [inset, setInset] = useState(0)
  useLayoutEffect(() => {
    const measure = () => {
      const page = ref.current
      const tab = document.querySelector('.nav-tab[href="#/weeks"]')
      const parent = page?.parentElement
      if (!page || !tab || !parent) return
      const contentLeft = parent.getBoundingClientRect().left + parseFloat(getComputedStyle(parent).paddingLeft)
      setInset(Math.max(0, Math.round(tab.getBoundingClientRect().left - contentLeft)))
    }
    measure()
    let cancelled = false
    document.fonts?.ready.then(() => { if (!cancelled) measure() })
    window.addEventListener('resize', measure)
    return () => {
      cancelled = true
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return inset
}

const subtitleFor = (w) => {
  if (w.kind === 'current') return 'THIS WEEK'
  if (w.kind === 'future') return 'UPCOMING'
  return w.ended ? `${w.done}/${w.total} DONE` : 'NOT ENDED'
}

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)
const XIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

export function WeeksPage() {
  const { allProjects, weekMeta, setWeekStart, deleteWeek, clearAll, showToast } = useApp()
  const thisWeekIso = toISODate(startOfWeek())
  const todayIso = toISODate(new Date())
  const [futureOpen, setFutureOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const pageRef = useRef(null)
  const inset = useWeeksInset(pageRef)

  // Every week that holds a plan - the current one included only when it
  // does, so an empty week never sits in the list and removing this week's
  // plan takes its row with it
  const isos = new Set(allProjects.map(p => p.week_start).filter(Boolean))

  const weeks = [...isos].sort().reverse().map(iso => {
    const projects = allProjects.filter(p => p.week_start === iso)
    const { done, total, pct } = rollUp(projects.flatMap(p => p.tasks || []))
    return {
      iso,
      projects,
      done,
      total,
      pct,
      days: dayLoad(iso, projects),
      ended: !!weekMeta[iso]?.ended,
      kind: iso > thisWeekIso ? 'future' : iso === thisWeekIso ? 'current' : 'past',
    }
  })
  const future = weeks.filter(w => w.kind === 'future')
  const settled = weeks.filter(w => w.kind !== 'future')

  const futureTotals = future.reduce(
    (acc, w) => ({ done: acc.done + w.done, total: acc.total + w.total }),
    { done: 0, total: 0 },
  )
  const futureRange = future.length
    ? `${formatShortDate(future[future.length - 1].iso)} – ${formatShortDate(toISODate(addDays(fromISODate(future[0].iso), 6)))}`
    : ''

  const openWeek = (iso) => {
    setWeekStart(fromISODate(iso))
    window.location.hash = '#/'
  }

  const copyWeek = async (w) => {
    try {
      await navigator.clipboard.writeText(encodePlan(w.iso, w.projects))
      showToast(`Copied ${formatWeekTitle(w.iso)}`)
    } catch {
      showToast('Clipboard is blocked here - copy from the Plan tab instead', 'error')
    }
  }

  const row = (w) => {
    const max = Math.max(1, ...w.days.map(d => d.total))
    return (
      <div key={w.iso} className={`wk-row ${w.kind} ${w.ended ? 'ended' : ''}`}>
        <button type="button" className="wk-main" onClick={() => openWeek(w.iso)} title="Open this week">
          <div className="wk-title">{formatWeekTitle(w.iso)}</div>
          <div className="wk-sub">{subtitleFor(w)}</div>
        </button>
        <div className="wk-bars">
          {w.days.map(d => (
            <DayBar key={d.date} day={d} max={max} kind={w.kind} isToday={d.date === todayIso} />
          ))}
        </div>
        <Stat week={w} />
        <div className="wk-actions">
          <button type="button" className="wk-icon" onClick={() => copyWeek(w)} title="Copy this week's plan">
            <CopyIcon />
          </button>
          <button type="button" className="wk-icon" onClick={() => setConfirm({ kind: 'week', week: w })} title="Remove this week">
            <XIcon />
          </button>
        </div>
      </div>
    )
  }

  // Year dividers go in wherever the year changes walking down the list
  const yearOf = (iso) => iso.slice(0, 4)
  const rendered = []
  let lastYear = null
  const divider = (year) => (
    <div key={`y-${year}`} className="wk-year"><span>{year}</span><i /></div>
  )

  if (future.length) {
    const y = yearOf(future[0].iso)
    rendered.push(divider(y))
    lastYear = y
    rendered.push(
      <div key="future-group" className={`wk-row group ${futureOpen ? 'open' : ''}`}>
        <button type="button" className="wk-main" onClick={() => setFutureOpen(o => !o)} aria-expanded={futureOpen}>
          <div className="wk-title">{futureRange}</div>
          <div className="wk-sub">{future.length} UPCOMING {future.length === 1 ? 'WEEK' : 'WEEKS'}</div>
        </button>
        <Sparkline weeks={future} />
        <div className="wk-stat">
          {futureTotals.done > 0 ? (
            <>
              <div className="wk-stat-big"><b>{futureTotals.done}</b>/{futureTotals.total}</div>
              <div className="wk-stat-label">DONE</div>
            </>
          ) : (
            <>
              <div className="wk-stat-big"><b>{futureTotals.total}</b></div>
              <div className="wk-stat-label">PLANNED</div>
            </>
          )}
        </div>
        <div className="wk-actions">
          <button
            type="button"
            className="wk-icon chevron"
            onClick={() => setFutureOpen(o => !o)}
            aria-label={futureOpen ? 'Collapse upcoming weeks' : 'Expand upcoming weeks'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>
    )
    if (futureOpen) future.forEach(w => rendered.push(row(w)))
  }

  for (const w of settled) {
    const y = yearOf(w.iso)
    if (y !== lastYear) { rendered.push(divider(y)); lastYear = y }
    rendered.push(row(w))
  }

  return (
    <div className="weeks-page" ref={pageRef} style={{ '--weeks-inset': `${inset}px` }}>
      <div className="weeks-head">
        <span className="eyebrow">{weeks.length} {weeks.length === 1 ? 'WEEK' : 'WEEKS'}</span>
        <button
          type="button"
          className="clear-all-btn"
          onClick={() => setConfirm({ kind: 'all' })}
          disabled={weeks.length === 0}
        >
          <XIcon size={11} /> CLEAR ALL
        </button>
      </div>

      {weeks.length === 0 ? (
        <div className="weeks-empty">
          <b>Nothing planned yet</b>
          <span>Weeks show up here once they hold a project</span>
        </div>
      ) : (
        <div className="weeks-list">{rendered}</div>
      )}

      {confirm?.kind === 'week' && (
        <ConfirmDialog
          eyebrow="REMOVE WEEK"
          title={formatWeekTitle(confirm.week.iso)}
          copy={`This removes every project and task planned for this week.${confirm.week.total > 0 ? ` ${confirm.week.total} ${confirm.week.total === 1 ? 'item' : 'items'} will be gone.` : ''}`}
          action="Remove week"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            deleteWeek(confirm.week.iso)
            setConfirm(null)
          }}
        />
      )}

      {confirm?.kind === 'all' && (
        <ConfirmDialog
          eyebrow="CLEAR ALL"
          title="Start over?"
          copy="This removes every week you have planned and resets your stats. There is no undo."
          action="Clear all"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            clearAll()
            setConfirm(null)
          }}
        />
      )}
    </div>
  )
}
