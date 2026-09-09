import React from 'react'
import { useApp } from '../../context/AppContext'

export function ProjectsSidebar() {
  const { projects, addProject, addTask, toggleTask } = useApp()

  const handleAddTask = (projectId) => {
    const title = prompt('Task name')
    if (title?.trim()) {
      addTask(projectId, title.trim())
    }
  }

  const handleAddProject = () => {
    const name = prompt('Project name')
    if (name?.trim()) {
      addProject(name.trim())
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="eyebrow">PROJECTS</span>
        <div className="header-links">
          <a href="#">Copy plan</a><span className="sep">•</span><a href="#">Paste plan</a>
        </div>
      </div>

      {projects.map(p => (
        <div key={p.id} className="project-card">
          <div className="project-card-head">
            <div>
              <h3 className="proj-title">{p.name}</h3>
              {p.deadline && <div className="proj-meta">{new Date(p.deadline).toDateString()}</div>}
            </div>
          </div>
          <div className="proj-tasks">
            {(p.tasks || []).map(t => (
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
          <button className="add-task-btn" onClick={() => handleAddTask(p.id)}>+ add task</button>
        </div>
      ))}
      <button className="add-project-dashed" onClick={handleAddProject}>+ ADD PROJECT</button>
    </aside>
  )
}

