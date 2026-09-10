import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { formatDeadline, toISODate, weekDayList } from '../../utils'
import { CopyPlanDialog, PastePlanDialog } from './PlanTransfer'

function EditableText({ value, onSave, placeholder, className, autoFocus }) {
  const [text, setText] = useState(value || '')
  const ref = useRef(null)

  useEffect(() => {
    setText(value || '')
  }, [value])

  // Focusing before the webfont settles leaves the caret sized to the fallback
  // font until the first keystroke forces a relayout
  useEffect(() => {
    if (!autoFocus) return
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) ref.current?.focus()
    })
    return () => { cancelled = true }
  }, [autoFocus])

  return (
    <input
      ref={ref}
      type="text"
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        if ((text || '') !== (value || '')) onSave(text)
      }}
    />
  )
}

const isoToDisplay = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

const displayToIso = (text) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text || '').trim())
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  // rejects rolled-over dates like 31/02/2026
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function DeadlineDialog({ project, onSave, onClose }) {
  const [text, setText] = useState(isoToDisplay(project.deadline))
  const pickerRef = useRef(null)

  const iso = displayToIso(text)
  const invalid = text.trim() !== '' && iso === null

  const openCalendar = () => {
    const el = pickerRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.click()
  }

  const submit = (e) => {
    e.preventDefault()
    if (invalid) return
    onSave(text.trim() === '' ? null : iso)
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-eyebrow">PROJECT DEADLINE</div>
        <h2 className="modal-title">{project.name || 'Untitled project'}</h2>

        <div className="deadline-row">
          <input
            className={`deadline-input ${invalid ? 'invalid' : ''}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="DD/MM/YYYY"
            inputMode="numeric"
            autoFocus
          />
          <button type="button" className="deadline-cal" onClick={openCalendar} title="Pick from calendar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <input
              ref={pickerRef}
              type="date"
              className="deadline-native"
              value={iso || ''}
              onChange={(e) => setText(isoToDisplay(e.target.value))}
              tabIndex={-1}
            />
          </button>
        </div>
        <div className="deadline-hint">
          {invalid ? 'Enter a real date as DD/MM/YYYY' : 'Type a date, or pick one from the calendar'}
        </div>

        <div className="modal-actions">
          {project.deadline && (
            <button type="button" className="btn-ghost" onClick={() => onSave(null)}>Clear</button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={invalid}>Save</button>
        </div>
      </form>
    </div>
  )
}

function TaskRow({ task, autoFocus, onRename, onToggle, onOpenSchedule, onDelete }) {
  const dayCount = task.subtasks?.length || 0
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
      {dayCount > 0 && (
        <span className="subtask-badge" title={`Scheduled across ${dayCount} day${dayCount > 1 ? 's' : ''}`}>
          {dayCount}
        </span>
      )}
      <div className="task-actions">
        <button type="button" className="assign-date" onClick={() => onOpenSchedule(task.id)} title="Schedule across days">
          {dayCount > 0 ? (
            <span>edit days</span>
          ) : (
            <>
              <span>assign date</span>
              <svg className="arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              <span className="cal-box">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </span>
            </>
          )}
        </button>
        <button className="task-del" onClick={() => onDelete(task.id)} title="Delete task">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  )
}

function TaskScheduleDialog({ task, projectName, weekStartIso, onSave, onClose }) {
  const days = weekDayList(weekStartIso)
  const seed = task.subtasks?.length
    ? task.subtasks.map(s => s.day_date)
    : task.day_date
      ? [task.day_date]
      : []
  const [picked, setPicked] = useState(() => new Set(seed))
  const [note, setNote] = useState(task.note || '')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (date) => setPicked(prev => {
    const next = new Set(prev)
    next.has(date) ? next.delete(date) : next.add(date)
    return next
  })

  const pickedDays = days.filter(d => picked.has(d.date))

  const submit = (e) => {
    e.preventDefault()
    onSave([...picked], note.trim())
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card wide" onSubmit={submit}>
        <div className="modal-eyebrow">SCHEDULE TASK</div>
        <h2 className="modal-title">
          {projectName || 'Untitled project'}
          <span className="modal-title-dates">{task.title || 'Untitled task'}</span>
        </h2>
        <div className="modal-divider" />

        <div className="day-toggle-row">
          {days.map(d => (
            <button
              type="button"
              key={d.date}
              className={`day-toggle ${picked.has(d.date) ? 'selected' : ''}`}
              onClick={() => toggle(d.date)}
              aria-pressed={picked.has(d.date)}
              title={d.name}
            >
              {d.initial}
            </button>
          ))}
        </div>

        {pickedDays.length > 0 && (
          <div className="day-box-list">
            {pickedDays.map(d => (
              <div className="day-box-item" key={d.date}>{d.name}</div>
            ))}
          </div>
        )}

        <label className="schedule-note-label">
          Note
          <textarea
            className="schedule-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Anything to remember for this task…"
          />
        </label>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  )
}

export function ProjectsSidebar() {
  const {
    projects, addProject, updateProjectName, deleteProject, reorderProjects,
    addTask, updateTaskTitle, setTaskSchedule, deleteTask, toggleTask, setProjectDeadline,
    weekStart, importPlan, showToast,
  } = useApp()
  const [draggedIdx, setDraggedIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [focusTaskId, setFocusTaskId] = useState(null)
  const [deadlineFor, setDeadlineFor] = useState(null)
  const [scheduleFor, setScheduleFor] = useState(null)
  const [transfer, setTransfer] = useState(null)
  const cardRefs = useRef([])
  const sidebarRef = useRef(null)

  const deadlineProject = projects.find(p => String(p.id) === String(deadlineFor)) || null

  let scheduleTask = null
  let scheduleProject = null
  if (scheduleFor != null) {
    for (const p of projects) {
      const t = (p.tasks || []).find(t => String(t.id) === String(scheduleFor))
      if (t) { scheduleTask = t; scheduleProject = p; break }
    }
  }

  const handleCreateProject = async () => {
    await addProject('')
  }

  const handleAddTask = async (projectId) => {
    const id = await addTask(projectId, '', null)
    if (id) setFocusTaskId(id)
  }

  const resetDrag = () => {
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  const onDragStart = (e, index) => {
    setDraggedIdx(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  // Resolved from the pointer against untransformed layout positions. Asking
  // which element the event fired on would feed back on itself: shifting a card
  // moves it out from under the cursor, cancelling the hover that caused it.
  const indexAtPointer = (clientY) => {
    const sidebar = sidebarRef.current
    const els = cardRefs.current
    if (!sidebar || !els.length) return null
    const originTop = sidebar.getBoundingClientRect().top - sidebar.offsetTop
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (!el) continue
      if (clientY < originTop + el.offsetTop + el.offsetHeight / 2) return i
    }
    return els.length - 1
  }

  const onDragOver = (e) => {
    if (draggedIdx === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const idx = indexAtPointer(e.clientY)
    if (idx !== null && idx !== dragOverIdx) setDragOverIdx(idx)
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      reorderProjects(draggedIdx, dragOverIdx)
    }
    resetDrag()
  }

  // Measured rather than assumed: cards vary in height with their task count
  const slotGap = () => {
    const els = cardRefs.current.filter(Boolean)
    if (els.length < 2) return 0
    return Math.max(0, els[1].offsetTop - (els[0].offsetTop + els[0].offsetHeight))
  }

  // Siblings slide by exactly the dragged card's footprint, so the space it
  // vacates matches the slot its ghost moves into. offsetTop is used over
  // getBoundingClientRect because it ignores the transforms we're applying.
  const dragTransform = (index) => {
    if (draggedIdx === null || dragOverIdx === null || draggedIdx === dragOverIdx) return 'none'
    const dragged = cardRefs.current[draggedIdx]
    const target = cardRefs.current[dragOverIdx]
    if (!dragged || !target) return 'none'

    if (index === draggedIdx) {
      const delta = draggedIdx < dragOverIdx
        ? (target.offsetTop + target.offsetHeight) - (dragged.offsetTop + dragged.offsetHeight)
        : target.offsetTop - dragged.offsetTop
      return `translateY(${delta}px)`
    }

    const footprint = dragged.offsetHeight + slotGap()
    if (draggedIdx < dragOverIdx && index > draggedIdx && index <= dragOverIdx) {
      return `translateY(${-footprint}px)`
    }
    if (draggedIdx > dragOverIdx && index >= dragOverIdx && index < draggedIdx) {
      return `translateY(${footprint}px)`
    }
    return 'none'
  }

  return (
    <>
      <aside
      className="sidebar"
      ref={sidebarRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(e) => {
        // Chromium nulls relatedTarget during a drag, so leaving is decided by
        // coordinates. Only a real exit returns cards to their resting slots.
        const r = e.currentTarget.getBoundingClientRect()
        const outside =
          e.clientX < r.left || e.clientX > r.right ||
          e.clientY < r.top || e.clientY > r.bottom
        if (outside) setDragOverIdx(null)
      }}
    >
      <div className="sidebar-header">
        <span className="eyebrow">PROJECTS</span>
        <div className="header-links">
          <button
            type="button"
            className="link-btn"
            onClick={() => setTransfer('copy')}
            disabled={projects.length === 0}
            title={projects.length === 0 ? 'No projects in this week to copy' : 'Copy this week\'s plan'}
          >
            Copy plan
          </button>
          <span className="sep">•</span>
          <button
            type="button"
            className="link-btn always-on"
            onClick={() => setTransfer('paste')}
          >
            Paste plan
          </button>
        </div>
      </div>

      {projects.map((p, index) => {
        const tasks = p.tasks || []
        const total = tasks.length
        const done = tasks.filter(t => t.completed).length
        const pct = total === 0 ? 0 : Math.round((done / total) * 100)

        const isDragging = draggedIdx === index

        return (
          <div
            key={p.id}
            ref={el => { cardRefs.current[index] = el }}
            className={`project-card ${isDragging ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragEnd={resetDrag}
            style={{ transform: dragTransform(index) }}
          >
            <div className="project-card-head" style={{display: 'flex', alignItems: 'center', gap: 12}}>

              <div style={{display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1}}>
                <div className="proj-hover-action" style={{cursor: 'grab', color: 'var(--ink-faint)', display: 'flex'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>
                <div className="proj-title-wrap">
                  <EditableText
                    className="proj-title-input"
                    value={p.name}
                    placeholder="Project name..."
                    autoFocus={!p.name}
                    onSave={(newName) => updateProjectName(p.id, newName)}
                  />
                  {p.deadline && (
                    <span className="proj-deadline">{formatDeadline(p.deadline)}</span>
                  )}
                </div>
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
                {total > 0 && (
                  <div className="proj-progress-track">
                    <div
                      className={`proj-progress-fill ${pct === 100 ? 'complete' : ''}`}
                      style={{width: `${pct}%`}}
                    ></div>
                  </div>
                )}

                <div className="proj-hover-action" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <button
                    className="icon-btn"
                    onClick={() => setDeadlineFor(p.id)}
                    title={p.deadline ? `Deadline ${isoToDisplay(p.deadline)}` : 'Set deadline'}
                    style={{width: 20, height: 20, padding: 0, color: p.deadline ? 'var(--accent)' : 'var(--ink-faint)'}}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </button>
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
                  onOpenSchedule={setScheduleFor}
                  onDelete={deleteTask}
                />
              ))}

              <button className="add-task-btn" onClick={() => handleAddTask(p.id)}>
                <svg className="add-task-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>add task</span>
              </button>
            </div>
          </div>
        )
      })}

      <button className="add-project-dashed" onClick={handleCreateProject}>+ ADD PROJECT</button>
      </aside>

      {deadlineProject && (
        <DeadlineDialog
          key={deadlineProject.id}
          project={deadlineProject}
          onClose={() => setDeadlineFor(null)}
          onSave={(iso) => {
            setProjectDeadline(deadlineProject.id, iso)
            setDeadlineFor(null)
          }}
        />
      )}

      {scheduleTask && (
        <TaskScheduleDialog
          key={scheduleTask.id}
          task={scheduleTask}
          projectName={scheduleProject.name}
          weekStartIso={toISODate(weekStart)}
          onClose={() => setScheduleFor(null)}
          onSave={(days, note) => {
            setTaskSchedule(scheduleTask.id, days, note)
            setScheduleFor(null)
          }}
        />
      )}

      {transfer === 'copy' && (
        <CopyPlanDialog
          weekStart={weekStart}
          projects={projects}
          onClose={(result) => {
            setTransfer(null)
            if (result?.copied) {
              showToast(`Copied ${result.projects} project${result.projects === 1 ? '' : 's'} · ${result.tasks} task${result.tasks === 1 ? '' : 's'}`)
            }
          }}
        />
      )}

      {transfer === 'paste' && (
        <PastePlanDialog
          weekStart={weekStart}
          onClose={() => setTransfer(null)}
          onPaste={async (incoming) => {
            const result = await importPlan(incoming)
            setTransfer(null)
            if (result) {
              showToast(`Pasted ${result.projects} project${result.projects === 1 ? '' : 's'} · ${result.tasks} task${result.tasks === 1 ? '' : 's'}`)
            }
          }}
        />
      )}
    </>
  )
}
