import React from 'react'
import { useApp } from '../../context/AppContext'
import { ProjectsSidebar } from './ProjectsSidebar'
import { WeekGrid } from './WeekGrid'
import { addDays, weekLabel, formatWeekRange } from '../../utils'

export function Board() {
  const { projects, weekStart, setWeekStart } = useApp()
  const weekText = weekLabel(weekStart)

  let done = 0
  let total = 0
  const startIso = weekStart.toISOString().split('T')[0]
  const endIso = addDays(weekStart, 6).toISOString().split('T')[0]

  projects.forEach(p => {
    (p.tasks || []).forEach(t => {
      if (t.day_date && t.day_date >= startIso && t.day_date <= endIso) {
        total++
        if (t.completed) done++
      }
    })
  })

  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          
          <div className="week-date-box">
            {weekText && (
              <span className="week-title" style={{
                color: weekText === 'This week' ? '#779d72' : 'var(--ink-faint)',
                fontWeight: '600',
                fontSize: '1.05rem'
              }}>
                {weekText}
              </span>
            )}
            <span className="week-dates" style={{fontFamily: 'var(--mono)', color: 'var(--ink-soft)', letterSpacing: '0.05em'}}>
              {formatWeekRange(weekStart)}
            </span>
          </div>

          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
          
          <span className="today-link" style={{fontSize: '1.05rem', color: 'var(--ink-faint)', marginLeft: '12px'}} onClick={() => {
            const d = new Date()
            d.setHours(0,0,0,0)
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1)
            setWeekStart(new Date(d.setDate(diff)))
          }}>Today</span>
        </div>
        <div className="toolbar-right">
          <button>Move work</button>
          <button>End week</button>
        </div>
      </div>

      <div className="progress-section">
        <div className="progress-track">
          <div className="progress-fill" style={{width: `${pct}%`}}></div>
        </div>
        <div className="progress-stats">
          <span className="days-left">5 days left - keep moving forward</span>
          <span className="pct">{done}/{total} • {pct}%</span>
        </div>
      </div>

      <div className="planning-board">
        <ProjectsSidebar />
        <WeekGrid />
      </div>
    </>
  )
}

