import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { toISODate, weekDayList, startOfWeek } from '../../utils'

// One row per subtask landing on this day, each stating its own lineage:
// project name, task name, then the subtask's own name. A task never broken
// into subtasks becomes a row with the third line absent.
function collectDay(projects, iso) {
  const items = []
  const missed = []

  for (const p of projects) {
    for (const t of p.tasks || []) {
      const subs = t.subtasks || []
      const base = {
        taskId: t.id,
        projectName: p.name || 'Untitled project',
        taskTitle: t.title || 'Untitled task',
      }

      if (subs.length) {
        for (const s of subs) {
          if (s.day_date === iso) {
            items.push({
              ...base,
              key: `s-${s.id}`,
              subtaskId: s.id,
              subtitle: s.title || '',
              completed: !!s.completed,
              day_date: s.day_date,
            })
          }
          if ((s.missedDays || []).includes(iso)) {
            missed.push({ ...base, key: `m-${s.id}`, subtitle: s.title || '' })
          }
        }
        continue
      }

      if (t.day_date === iso) {
        items.push({
          ...base,
          key: `t-${t.id}`,
          subtaskId: null,
          subtitle: '',
          completed: !!t.completed,
          day_date: t.day_date,
        })
      }
      if ((t.missedDays || []).includes(iso)) {
        missed.push({ ...base, key: `m-${t.id}`, subtitle: '' })
      }
    }
  }
  return { items, missed }
}

// Project deadlines landing in this week, grouped by day. One source for both
// the tab flag and the "Due ·" line, so the two can never disagree. Task
// deadlines are deliberately left out - due is a project-level idea for now.
function dueByDay(projects) {
  const map = new Map()
  for (const p of projects) {
    if (!p.deadline) continue
    const names = map.get(p.deadline) || []
    names.push(p.name || 'Untitled project')
    map.set(p.deadline, names)
  }
  return map
}

const tally = (items) => {
  const done = items.filter(i => i.completed).length
  const total = items.length
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

// Whether the week opens on one focused day or on all seven at once. A viewing
// preference, so it lives beside the theme rather than in the plan.
const VIEW_KEY = 'task-planner-week-view'
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'all' ? 'all' : 'focus'
  } catch {
    return 'focus'
  }
}

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
    <line x1="12" y1="14" x2="12" y2="18"></line>
    <line x1="10" y1="16" x2="14" y2="16"></line>
  </svg>
)

// A task spread over several units on one day gets one box, not one per
// unit: the project and task are written once, then each unit keeps its own
// line, checkbox and state. Order follows first appearance.
function groupByTask(items) {
  const groups = []
  const byTask = new Map()
  for (const it of items) {
    let g = byTask.get(it.taskId)
    if (!g) {
      g = { key: `g-${it.taskId}`, taskId: it.taskId, projectName: it.projectName, taskTitle: it.taskTitle, units: [] }
      byTask.set(it.taskId, g)
      groups.push(g)
    }
    g.units.push(it)
  }
  return groups
}

// One task on one day. The same box serves the all-days grid and the focused
// day's list - the list just lays it flat. Overdue units carry a calendar
// button that opens the move dialog; a frozen week keeps the label and drops
// the button.
function TaskGroup({ group, todayIso, frozen, onToggle, onMove }) {
  const isOverdue = (u) => !u.completed && u.day_date < todayIso
  const allDone = group.units.every(u => u.completed)
  const anyOverdue = group.units.some(isOverdue)
  return (
    <div className={`day-card ${allDone ? 'done' : ''} ${anyOverdue ? 'overdue' : ''}`}>
      {group.units.map((u, i) => {
        const overdue = isOverdue(u)
        return (
          <div key={u.key} className={`day-card-line ${u.completed ? 'done' : ''}`}>
            <input
              type="checkbox"
              className="task-check"
              checked={u.completed}
              disabled={frozen}
              onChange={e => onToggle(u, e.target.checked)}
            />
            <div className="day-card-body">
              {i === 0 && (
                <>
                  <div className="day-card-project">{group.projectName}</div>
                  <div className="day-card-task">{group.taskTitle}</div>
                </>
              )}
              {u.subtitle && <div className="day-card-sub">{u.subtitle}</div>}
              {overdue && (
                <div className="day-card-foot">
                  <span className="day-card-overdue">overdue</span>
                  {!frozen && (
                    <button type="button" className="day-card-move" onClick={() => onMove(u)} title="Move to a later day">
                      <CalendarIcon />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// A day this work was moved off - kept visible so the week still shows the slip
function MissedCard({ item }) {
  return (
    <div className="day-card missed">
      <div className="day-card-line">
        <span className="missed-mark" aria-hidden="true" />
        <div className="day-card-body">
          <div className="day-card-project">{item.projectName}</div>
          <div className="day-card-task">{item.taskTitle}</div>
          {item.subtitle && <div className="day-card-sub">{item.subtitle}</div>}
          <div className="day-card-foot">
            <span className="day-card-missed">missed · moved to another day</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WeekGrid() {
  const { projects, weekStart, setWeekStart, weekEnded, toggleTask, toggleSubtask, moveScheduled } = useApp()
  const frozen = weekEnded

  const weekStartIso = toISODate(weekStart)
  const days = weekDayList(weekStartIso)
  const todayIso = toISODate(new Date())
  const todayIdx = days.findIndex(d => d.date === todayIso)

  // A week you are not living in opens on its Monday
  const [dayIdx, setDayIdx] = useState(() => (todayIdx === -1 ? 0 : todayIdx))
  useEffect(() => { setDayIdx(todayIdx === -1 ? 0 : todayIdx) }, [weekStartIso])
  const [moveItem, setMoveItem] = useState(null)

  const [view, setViewState] = useState(readView)
  const showAll = view === 'all'
  const setView = (next) => {
    setViewState(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* private mode - holds for the session */ }
  }
  // Picking a day out of the grid narrows the week back down to that day
  const focusDay = (i) => {
    setDayIdx(i)
    setView('focus')
  }

  const toggleItem = (it, completed) => (it.subtaskId
    ? toggleSubtask(it.taskId, it.subtaskId, completed)
    : toggleTask(it.taskId, completed))

  // A flag marks a project landing, not which day it happens to be today
  const due = dueByDay(projects)

  const perDay = days.map(d => collectDay(projects, d.date))
  const selected = days[dayIdx] || days[0]
  const { items, missed } = perDay[dayIdx] || perDay[0]
  const counts = tally(items)
  const dueNames = due.get(selected.date) || []

  // From another week this jumps back first; the effect above then lands on today
  const focusToday = (e) => {
    e.preventDefault()
    if (todayIdx === -1) setWeekStart(startOfWeek())
    else setDayIdx(todayIdx)
  }

  return (
    <main className="week-grid-container">
      <div className="grid-header">
        <span className="eyebrow">THIS WEEK</span>
        <div className="header-links" style={{color: 'var(--ink-faint)'}}>
          {showAll ? (
            <span>click any day to focus it</span>
          ) : (
            <>
              Focusing <b className="focus-day">{selected.short}</b>
              {selected.date === todayIso && ' (today)'}
              {selected.date !== todayIso && <> · <a href="#" onClick={focusToday}>focus today</a></>}
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); setView('all') }}>show all days</a>
            </>
          )}
        </div>
      </div>

      {showAll ? (
        <div className="day-grid">
          {days.map((d, i) => {
            const { items: dayItems, missed: dayMissed } = perDay[i]
            const c = tally(dayItems)
            const flagged = due.get(d.date)
            return (
              <section
                key={d.date}
                className={`day-block ${d.date === todayIso ? 'today' : ''}`}
                // The whole block is a target; its own controls keep their clicks
                onClick={(e) => { if (!e.target.closest('button, input, a')) focusDay(i) }}
                title={flagged ? `${d.name} — ${flagged.join(', ')} due` : `Focus ${d.name}`}
              >
                <div className="day-block-head">
                  <span className="day-block-name">{d.short}</span>
                  {c.total > 0 && (
                    <span className={`day-block-count ${c.done === c.total ? 'full' : ''}`}>
                      {c.done}/{c.total}
                    </span>
                  )}
                </div>
                {flagged && <div className="day-block-due">Due · {flagged.join(', ')}</div>}

                {(dayItems.length > 0 || dayMissed.length > 0) && (
                  <div className="day-block-list">
                    {groupByTask(dayItems).map(g => (
                      <TaskGroup
                        key={g.key}
                        group={g}
                        todayIso={todayIso}
                        frozen={frozen}
                        onToggle={toggleItem}
                        onMove={setMoveItem}
                      />
                    ))}
                    {dayMissed.map(m => <MissedCard key={m.key} item={m} />)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <>
          <div className="day-tabs">
            {days.map((d, i) => {
              const c = tally(perDay[i].items)
              const flagged = due.get(d.date)
              return (
                <button
                  type="button"
                  key={d.date}
                  className={`day-tab ${i === dayIdx ? 'selected' : ''}`}
                  onClick={() => setDayIdx(i)}
                  title={flagged ? `${d.name} — ${flagged.join(', ')} due` : d.name}
                >
                  <span className="day-tab-label">
                    {d.initial}
                    {flagged && (
                      <svg className="day-tab-flag" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                        <line x1="4" y1="22" x2="4" y2="15"></line>
                      </svg>
                    )}
                  </span>
                  {c.total > 0 && (
                    <span className="day-tab-track">
                      <span className="day-tab-fill" style={{ width: `${c.pct}%` }} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="day-panel">
            <div className="day-panel-head">
              <div className="day-panel-name">{selected.name}</div>
              <div className="day-panel-count">{counts.done} of {counts.total} done</div>
              {dueNames.length > 0 && (
                <div className="day-panel-due">Due · {dueNames.join(', ')}</div>
              )}
            </div>

            {items.length === 0 && missed.length === 0 ? (
              <div className="day-panel-empty">Nothing scheduled for {selected.name}.</div>
            ) : (
              <div className="day-panel-list">
                {groupByTask(items).map(g => (
                  <TaskGroup
                    key={g.key}
                    group={g}
                    todayIso={todayIso}
                    frozen={frozen}
                    onToggle={toggleItem}
                    onMove={setMoveItem}
                  />
                ))}
                {missed.map(m => <MissedCard key={m.key} item={m} />)}
              </div>
            )}
          </div>
        </>
      )}

      {moveItem && (
        <MoveDialog
          key={moveItem.key}
          item={moveItem}
          days={days}
          todayIso={todayIso}
          onClose={() => setMoveItem(null)}
          onMove={(toDate, markMissed) => {
            moveScheduled(moveItem.taskId, moveItem.subtaskId, toDate, markMissed)
            setMoveItem(null)
          }}
        />
      )}
    </main>
  )
}
