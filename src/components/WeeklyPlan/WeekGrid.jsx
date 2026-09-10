import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { toISODate, weekDayList, clampDifficulty, startOfWeek } from '../../utils'

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
              difficulty: clampDifficulty(s.difficulty),
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
          difficulty: 1,
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

// The count is a head-count, so "0 of 4 done" means four pieces of work.
// The bar stays weighted by difficulty.
const tally = (items) => {
  const done = items.filter(i => i.completed).length
  let wDone = 0
  let wTotal = 0
  for (const i of items) {
    wTotal += i.difficulty
    if (i.completed) wDone += i.difficulty
  }
  return { done, total: items.length, pct: wTotal === 0 ? 0 : Math.round((wDone / wTotal) * 100) }
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
  const { projects, weekStart, setWeekStart, toggleTask, toggleSubtask, moveScheduled } = useApp()

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
          <a href="#" onClick={focusToday}>Focus today</a> • or click any day to focus it
        </div>
      </div>

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
            {items.map(it => {
              const overdue = !it.completed && it.day_date < todayIso
              return (
                <div key={it.key} className={`day-row ${it.completed ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
                  <input
                    type="checkbox"
                    className="task-check"
                    checked={it.completed}
                    onChange={e => it.subtaskId
                      ? toggleSubtask(it.taskId, it.subtaskId, e.target.checked)
                      : toggleTask(it.taskId, e.target.checked)}
                  />
                  <div className="day-row-body">
                    <div className="day-row-project">{it.projectName}</div>
                    <div className="day-row-task">{it.taskTitle}</div>
                    {it.subtitle && <div className="day-row-sub">{it.subtitle}</div>}
                    {overdue && (
                      <div className="day-row-foot">
                        <span className="day-row-overdue">overdue · reschedule?</span>
                        <button type="button" className="day-row-move" onClick={() => setMoveItem(it)}>
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
            moveScheduled(moveItem.taskId, moveItem.subtaskId, toDate, markMissed)
            setMoveItem(null)
          }}
        />
      )}
    </main>
  )
}
