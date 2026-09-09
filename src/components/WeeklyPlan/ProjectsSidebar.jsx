import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'

function EditableText({ value, onSave, placeholder, className, autoFocus }) {
  const [text, setText] = useState(value || '')

  useEffect(() => {
    setText(value || '')
  }, [value])

  return (
    <input
      type="text"
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        if ((text || '') !== (value || '')) onSave(text)
      }}
      autoFocus={autoFocus}
    />
  )
}

function TaskRow({ task, autoFocus, onRename, onToggle, onAssignDay, onDelete }) {
  return (
    <div className={`task-item ${task.day_date ? 'has-day' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={task.completed}
        onChange={e => onToggle(task.id, e.target.checked)}
      />
      <EditableText
        className={`task-name-input ${task.completed ? 'done' : ''}`}
        value={task.title}
        placeholder="To-do..."
        autoFocus={autoFocus}
        onSave={val => onRename(task.id, val)}
      />
      <div className="task-actions">
        <label className="assign-date" title="Assign date">
          <span>{task.day_date ? task.day_date.substring(5) : 'assign date'}</span>
          <svg className="arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          <span className="cal-box">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </span>
          <input
            type="date"
            className="hidden-date"
            value={task.day_date || ''}
            onChange={e => onAssignDay(task.id, e.target.value || null)}
          />
        </label>
        <button className="task-del" onClick={() => onDelete(task.id)} title="Delete task">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  )
}

export function ProjectsSidebar() {
  const {
    projects, addProject, updateProjectName, deleteProject, reorderProjects,
    addTask, updateTaskTitle, setTaskDay, deleteTask, toggleTask, setProjectDeadline,
  } = useApp()
  const [draggedIdx, setDraggedIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [focusTaskId, setFocusTaskId] = useState(null)

  const handleCreateProject = async () => {
    await addProject('')
  }

  const handleAddTask = async (projectId) => {
    const id = await addTask(projectId, '', null)
    if (id) setFocusTaskId(id)
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
            <div className="project-card-head" style={{display: 'flex', alignItems: 'center', gap: 12}}>

              <div style={{display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1}}>
                <div className="proj-hover-action" style={{cursor: 'grab', color: 'var(--ink-faint)', display: 'flex'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>
                <EditableText
                  className="proj-title-input"
                  value={p.name}
                  placeholder="Project name..."
                  autoFocus={!p.name}
                  onSave={(newName) => updateProjectName(p.id, newName)}
                />
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
                {total > 0 && (
                  <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                    <div style={{width: 32, height: 4, background: 'var(--line)', borderRadius: 2}}>
                      <div style={{width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--accent)' : 'var(--good)', borderRadius: 2}}></div>
                    </div>
                  </div>
                )}

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
                <TaskRow
                  key={t.id}
                  task={t}
                  autoFocus={focusTaskId === t.id}
                  onRename={updateTaskTitle}
                  onToggle={toggleTask}
                  onAssignDay={setTaskDay}
                  onDelete={deleteTask}
                />
              ))}
            </div>

            <button className="add-task-btn" onClick={() => handleAddTask(p.id)}>+ add task</button>
          </div>
        )
      })}

      <button className="add-project-dashed" onClick={handleCreateProject}>+ ADD PROJECT</button>
    </aside>
  )
}
