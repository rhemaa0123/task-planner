import React from 'react'
import { useApp } from '../../context/AppContext'
import { addDays, toISODate, WEEKDAYS } from '../../utils'

export function WeekGrid() {
  const { projects, weekStart, toggleTask } = useApp()

  return (
    <main className="week-grid-container">
      <div className="grid-header">
        <span className="eyebrow">THIS WEEK</span>
        <div className="header-links" style={{color: 'var(--ink-faint)'}}>
          <a href="#">Focus today</a> • or click any day to focus it
        </div>
      </div>
      <div className="days-grid">
        {WEEKDAYS.map((name, i) => {
          const date = addDays(weekStart, i)
          const iso = toISODate(date)

          let dayTasks = []
          projects.forEach(p => {
            (p.tasks || []).forEach(t => {
              if (t.day_date === iso) dayTasks.push({ ...t, projectName: p.name })
            })
          })

          const completedDayTasks = dayTasks.filter(t => t.completed).length

          return (
            <div key={iso} className="day-box">
              <div className="day-box-head">
                <span className="day-name">{name}</span>
                {dayTasks.length > 0 && (
                  <span className="day-count">{completedDayTasks}/{dayTasks.length}</span>
                )}
              </div>
              <div className="day-tasks">
                {dayTasks.map(t => {
                  const isOverdue = !t.completed && t.day_date < toISODate(new Date())
                  return (
                    <div key={t.id} className="day-task-item">
                      <div className="day-task-top">
                        <input
                          type="checkbox"
                          className="task-check"
                          checked={t.completed}
                          onChange={(e) => toggleTask(t.id, e.target.checked)}
                        />
                        <span className="proj-badge">{t.projectName}</span>
                        {isOverdue && <span className="overdue-badge">OVERDUE</span>}
                      </div>
                      <div className={`task-name ${t.completed ? 'done' : ''}`}>{t.title}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}

