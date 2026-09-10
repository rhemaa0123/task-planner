import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { toISODate, weekDayList, clampDifficulty, startOfWeek } from '../../utils'

// One block per task landing on this day, carrying every subtask it has that
// day. Grouping keeps the project and task name stated once instead of once per
// subtask. A task never broken into subtasks becomes a block with no children.
function collectDay(projects, iso) {
  const groups = []
  const missed = []

  for (const p of projects) {
    for (const t of p.tasks || []) {
      const subs = t.subtasks || []
      const base = {
        key: `t-${t.id}`,
        taskId: t.id,
        projectName: p.name || 'Untitled project',
        taskTitle: t.title || 'Untitled task',
        day_date: iso,
      }

      if (subs.length) {
        const onDay = subs.filter(s => s.day_date === iso)
        if (onDay.length) {
          groups.push({
            ...base,
            subtasks: onDay.map(s => ({
              id: s.id,
              title: s.title || '',
              completed: !!s.completed,
              difficulty: clampDifficulty(s.difficulty),
            })),
            completed: onDay.every(s => s.completed),
            someDone: onDay.some(s => s.completed),
          })
        }
        for (const s of subs) {
          if ((s.missedDays || []).includes(iso)) {
            missed.push({ ...base, key: `m-${s.id}`, subtitle: s.title || '' })
          }
        }
        continue
      }

      if (t.day_date === iso) {
        groups.push({ ...base, subtasks: [], completed: !!t.completed, someDone: !!t.completed })
      }
      if ((t.missedDays || []).includes(iso)) {
        missed.push({ ...base, key: `m-${t.id}`, subtitle: '' })
      }
    }
  }
  return { groups, missed }
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

// Counts subtasks, not blocks, so "0 of 4 done" still means four pieces of work.
// The bar stays weighted by difficulty; the count stays a head-count.
const tally = (groups) => {
  let done = 0
  let total = 0
  let wDone = 0
  let wTotal = 0
  for (const g of groups) {
    const units = g.subtasks.length
      ? g.subtasks
      : [{ completed: g.completed, difficulty: 1 }]
    for (const u of units) {
      total++
      wTotal += u.difficulty
      if (u.completed) { done++; wDone += u.difficulty }
    }
  }
  return { done, total, pct: wTotal === 0 ? 0 : Math.round((wDone / wTotal) * 100) }
}

// Mixed state needs a property, not an attribute - React has no prop for it
function TriCheck({ checked, indeterminate, onChange, className }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" className={className} checked={checked} onChange={onChange} />
  )
}

function MoveDialog({ item, days, todayIso, onMove, onClose }) {
  const fromDay = days.find(d => d.date === item.day_date)
  const [target, setTarget] = useState(null)
  const [markMissed, setMarkMissed] = useState(true)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Work only moves forward: past the day it sits on, and never into a day
  // that has already gone by
  const locked = (d) => d.date <= item.day_date || d.date < todayIso

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form
        className="modal-card wide"
        onSubmit={e => { e.preventDefault(); if (target) onMove(target, markMissed) }}
      >
        <div className="modal-eyebrow">{item.projectName}</div>
        <h2 className="modal-title">{item.taskTitle}</h2>
        <div className="modal-divider" />

        <div className="field-label">MOVE TO</div>
        <div className="day-toggle-row">
          {days.map(d => (
            <button
              type="button"
              key={d.date}
              className={`day-toggle wide-label ${target === d.date ? 'selected' : ''}`}
              disabled={locked(d)}
              onClick={() => setTarget(d.date)}
              aria-pressed={target === d.date}
            >
              {d.short}
            </button>
          ))}
        </div>

        <label className="missed-check">
          <input
            type="checkbox"
            className="task-check"
            checked={markMissed}
            onChange={e => setMarkMissed(e.target.checked)}
          />
          <span>Mark {fromDay ? fromDay.short : 'this day'} as missed</span>
        </label>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!target}>Move</button>
        </div>
      </form>
    </div>
  )
}

export function WeekGrid() {
  const { projects, weekStart, setWeekStart, toggleTask, toggleSubtask, setDayCompletion, moveScheduled } = useApp()

  const weekStartIso = toISODate(weekStart)
  const days = weekDayList(weekStartIso)
  const todayIso = toISODate(new Date())
  const todayIdx = days.findIndex(d => d.date === todayIso)

  // A week you are not living in opens on its Monday
  const [dayIdx, setDayIdx] = useState(() => (todayIdx === -1 ? 0 : todayIdx))
  useEffect(() => { setDayIdx(todayIdx === -1 ? 0 : todayIdx) }, [weekStartIso])
  const [moveItem, setMoveItem] = useState(null)

  // A flag marks a project landing, not which day it happens to be today
  const due = dueByDay(projects)

  const perDay = days.map(d => collectDay(projects, d.date))
  const selected = days[dayIdx] || days[0]
  const { groups, missed } = perDay[dayIdx] || perDay[0]
  const counts = tally(groups)
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
          <a href="#" onClick={focusToday}>Focus today</a> • or click any day to focus it
        </div>
      </div>

      <div className="day-tabs">
        {days.map((d, i) => {
          const c = tally(perDay[i].groups)
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

        {groups.length === 0 && missed.length === 0 ? (
          <div className="day-panel-empty">Nothing scheduled for {selected.name}.</div>
        ) : (
          <div className="day-panel-list">
            {groups.map(g => {
              const overdue = !g.completed && g.day_date < todayIso
              return (
                <div key={g.key} className={`day-row ${g.completed ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
                  <TriCheck
                    className="task-check"
                    checked={g.completed}
                    indeterminate={g.someDone && !g.completed}
                    onChange={e => g.subtasks.length
                      ? setDayCompletion(g.taskId, g.day_date, e.target.checked)
                      : toggleTask(g.taskId, e.target.checked)}
                  />
                  <div className="day-row-body">
                    <div className="day-row-project">{g.projectName}</div>
                    <div className="day-row-task">{g.taskTitle}</div>

                    {g.subtasks.length > 0 && (
                      <ul className="day-sub-list">
                        {g.subtasks.map(s => (
                          <li key={s.id} className={`day-sub ${s.completed ? 'done' : ''}`}>
                            <input
                              type="checkbox"
                              className="task-check sm"
                              checked={s.completed}
                              onChange={e => toggleSubtask(g.taskId, s.id, e.target.checked)}
                            />
                            <span className={`day-sub-title ${s.title ? '' : 'untitled'}`}>
                              {s.title || '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {overdue && (
                      <div className="day-row-foot">
                        <span className="day-row-overdue">overdue · reschedule?</span>
                        <button type="button" className="day-row-move" onClick={() => setMoveItem(g)}>
                          move
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {missed.map(m => (
              <div key={m.key} className="day-row missed">
                <span className="missed-mark" aria-hidden="true" />
                <div className="day-row-body">
                  <div className="day-row-project">{m.projectName}</div>
                  <div className="day-row-task">{m.taskTitle}</div>
                  {m.subtitle && <div className="day-row-sub">{m.subtitle}</div>}
                  <div className="day-row-foot">
                    <span className="day-row-missed">missed · moved to another day</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {moveItem && (
        <MoveDialog
          key={moveItem.key}
          item={moveItem}
          days={days}
          todayIso={todayIso}
          onClose={() => setMoveItem(null)}
          onMove={(toDate, markMissed) => {
            // The whole day's work for that task travels together
            moveScheduled(moveItem.taskId, moveItem.day_date, toDate, markMissed)
            setMoveItem(null)
          }}
        />
      )}
    </main>
  )
}
