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

function EditableTitle({ initialName, onSave }) {
  const [name, setName] = useState(initialName || '')
  return (
    <input 
      type="text" 
      className="proj-title-input" 
      value={name} 
      onChange={e => setName(e.target.value)} 
      onBlur={() => onSave(name)}
      placeholder="Project name..."
      style={{flex: 1, minWidth: 0, paddingRight: 8}}
      autoFocus={!initialName}
    />
  )
}

export function ProjectsSidebar() {
  const { projects, weekStart, addProject, updateProjectName, deleteProject, reorderProjects, addTask, toggleTask, setProjectDeadline } = useApp()
  const [addingTaskTo, setAddingTaskTo] = useState(null)
  const [draggedIdx, setDraggedIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const handleSaveTask = (projectId, title, dayDate) => {
    addTask(projectId, title, dayDate)
    setAddingTaskTo(null)
  }

  const handleCreateProject = async () => {
    await addProject('')
  }

  const onDragStart = (e, index) => {
    setDraggedIdx(index)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e, index) => {
    e.preventDefault()
    setDragOverIdx(index)
  }
  const onDrop = (e, index) => {
    e.preventDefault()
    if (draggedIdx !== null && draggedIdx !== index) {
      reorderProjects(draggedIdx, index)
    }
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="eyebrow">PROJECTS</span>
        <div className="header-links">
          <a href="#">Copy plan</a><span className="sep">•</span><a href="#">Paste plan</a>
        </div>
      </div>

      {projects.map((p, index) => {
        const tasks = p.tasks || []
        const total = tasks.length
        const done = tasks.filter(t => t.completed).length
        const pct = total === 0 ? 0 : Math.round((done / total) * 100)

        const isDragging = draggedIdx === index
        const isDragOver = dragOverIdx === index

        return (
          <div
            key={p.id}
            className="project-card"
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragLeave={() => setDragOverIdx(null)}
            style={{
              opacity: isDragging ? 0.5 : 1,
              transform: isDragOver ? (draggedIdx < index ? 'translateY(-4px)' : 'translateY(4px)') : 'none',
              transition: 'transform 0.2s ease, opacity 0.2s'
            }}
          >
            <div className="project-card-head" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>

              <div style={{display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1}}>
                <div className="proj-hover-action" style={{cursor: 'grab', color: 'var(--ink-faint)', display: 'flex'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>
                <EditableTitle initialName={p.name} onSave={(newName) => updateProjectName(p.id, newName)} />
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  <div style={{width: 32, height: 4, background: 'var(--line)', borderRadius: 2}}>
                    <div style={{width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--accent)' : 'var(--good)', borderRadius: 2}}></div>
                  </div>
                </div>

                <div className="proj-hover-action" style={{display: 'flex', alignItems: 'center', gap: 8}}>
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
                  <button
                    className="icon-btn"
                    onClick={() => deleteProject(p.id)}
                    style={{width: 20, height: 20, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                    title="Delete Project"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
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

      <button className="add-project-dashed" onClick={handleCreateProject}>+ ADD PROJECT</button>
    </aside>
  )
}
