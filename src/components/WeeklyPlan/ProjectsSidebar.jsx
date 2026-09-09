import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { addDays, toISODate, WEEKDAYS } from '../../utils'

function InlineTaskForm({ projectId, onCancel, onSave, weekStart }) {
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave(projectId, title.trim(), day || null)
  }

  // Generate options for the current week
  const dayOptions = WEEKDAYS.map((name, i) => {
    const d = addDays(weekStart, i)
    return { name, value: toISODate(d) }
  })

  return (
    <form className="inline-form" onSubmit={handleSubmit} style={{marginTop: 8}}>
      <input 
        autoFocus
        type="text" 
        placeholder="Task title..." 
        value={title} 
        onChange={e => setTitle(e.target.value)} 
        style={{width: '100%', marginBottom: 6}}
      />
      <div style={{display: 'flex', gap: 6}}>
        <select value={day} onChange={e => setDay(e.target.value)} style={{flex: 1, padding: 4}}>
          <option value="">No day (Backlog)</option>
          {dayOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.name}</option>)}
        </select>
        <button type="submit" className="accent-btn" style={{padding: '4px 10px'}}>Add</button>
        <button type="button" className="ghost-btn" onClick={onCancel} style={{padding: '4px 10px'}}>Cancel</button>
      </div>
    </form>
  )
}

function InlineProjectForm({ onCancel, onSave }) {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim())
  }

  return (
    <form className="project-card inline-form" onSubmit={handleSubmit}>
      <input 
        autoFocus
        type="text" 
        placeholder="Project name..." 
        value={name} 
        onChange={e => setName(e.target.value)}
        style={{width: '100%', marginBottom: 8}}
      />
      <div style={{display: 'flex', gap: 6, justifyContent: 'flex-end'}}>
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="accent-btn">Save</button>
      </div>
    </form>
  )
}

export function ProjectsSidebar() {
  const { projects, weekStart, addProject, addTask, toggleTask, setProjectDeadline } = useApp()
  const [addingTaskTo, setAddingTaskTo] = useState(null)
  const [addingProject, setAddingProject] = useState(false)

  const handleSaveTask = (projectId, title, dayDate) => {
    addTask(projectId, title, dayDate)
    setAddingTaskTo(null)
  }

  const handleSaveProject = (name) => {
    addProject(name)
    setAddingProject(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="eyebrow">PROJECTS</span>
        <div className="header-links">
          <a href="#">Copy plan</a><span className="sep">•</span><a href="#">Paste plan</a>
        </div>
      </div>
      
      {projects.map(p => {
        const tasks = p.tasks || []
        const total = tasks.length
        const done = tasks.filter(t => t.completed).length
        const pct = total === 0 ? 0 : Math.round((done / total) * 100)

        return (
          <div key={p.id} className="project-card">
            <div className="project-card-head" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 className="proj-title" style={{margin: 0, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1}}>
                {p.name}
              </h3>
              
              {/* Progress & Deadline Right Aligned */}
              <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <div style={{width: 32, height: 4, background: 'var(--line)', borderRadius: 2}}>
                    <div style={{width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--accent)' : 'var(--good)', borderRadius: 2}}></div>
                  </div>
                </div>

                <label style={{cursor: 'pointer', display: 'flex', alignItems: 'center', color: p.deadline ? 'var(--accent)' : 'var(--ink-faint)'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <input 
                    type="date" 
                    value={p.deadline || ''} 
                    onChange={e => setProjectDeadline(p.id, e.target.value)}
                    style={{position: 'absolute', opacity: 0, width: 14, height: 14, cursor: 'pointer', zIndex: 10}}
                  />
                </label>
              </div>
            </div>

            <div className="proj-tasks">
              {tasks.map(t => (
                <div key={t.id} className="task-item">
                  <input 
                    type="checkbox" 
                    className="task-check" 
                    checked={t.completed} 
                    onChange={(e) => toggleTask(t.id, e.target.checked)} 
                  />
                  <span className={`task-name ${t.completed ? 'done' : ''}`}>{t.title}</span>
                  <div className="task-meta-right">
                    {t.day_date ? (
                      <span className="day-count" style={{background: 'var(--line)', color: 'var(--ink-faint)'}}>
                        {t.day_date.substring(5)}
                      </span>
                    ) : (
                      <span className="day-count" style={{color: 'var(--accent)'}}>ASSIGN</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {addingTaskTo === p.id ? (
              <InlineTaskForm 
                projectId={p.id} 
                weekStart={weekStart}
                onCancel={() => setAddingTaskTo(null)} 
                onSave={handleSaveTask} 
              />
            ) : (
              <button className="add-task-btn" onClick={() => setAddingTaskTo(p.id)}>+ add task</button>
            )}
          </div>
        )
      })}

      {addingProject ? (
        <InlineProjectForm 
          onCancel={() => setAddingProject(false)} 
          onSave={handleSaveProject} 
        />
      ) : (
        <button className="add-project-dashed" onClick={() => setAddingProject(true)}>+ ADD PROJECT</button>
      )}
    </aside>
  )
}
