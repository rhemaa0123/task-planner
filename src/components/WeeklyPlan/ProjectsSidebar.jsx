import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { formatDeadline, toISODate, weekDayList, subtaskTally, rollUp } from '../../utils'
import { CopyPlanDialog, PastePlanDialog } from './PlanTransfer'

function EditableText({ value, onSave, placeholder, className, autoFocus, readOnly }) {
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
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        if ((text || '') !== (value || '')) onSave(text)
      }}
    />
  )
}

/* ---- Drag geometry, shared by the project list and each task list ----
   Everything is measured from untransformed offsets (offsetTop, not
   getBoundingClientRect). Asking which element the pointer is over would
   feed back on itself: shifting a row moves it out from under the cursor,
   cancelling the hover that caused it. */

// Index of the slot under the pointer. `originTop` is where offsetTop 0 sits
// in the viewport, so the two coordinate systems line up.
const slotAtPointer = (els, originTop, clientY) => {
  let last = null
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el) continue
    last = i
    if (clientY < originTop + el.offsetTop + el.offsetHeight / 2) return i
  }
  return last
}

// Measured rather than assumed: siblings vary in height with their content
const slotGap = (els) => {
  const live = els.filter(Boolean)
  if (live.length < 2) return 0
  return Math.max(0, live[1].offsetTop - (live[0].offsetTop + live[0].offsetHeight))
}

// Siblings slide by exactly the dragged element's footprint, so the space it
// vacates matches the slot its ghost moves into
const slideTransform = (els, from, over, index) => {
  if (from === null || over === null || from === over) return 'none'
  const dragged = els[from]
  const target = els[over]
  if (!dragged || !target) return 'none'

  if (index === from) {
    const delta = from < over
      ? (target.offsetTop + target.offsetHeight) - (dragged.offsetTop + dragged.offsetHeight)
      : target.offsetTop - dragged.offsetTop
    return `translateY(${delta}px)`
  }

  const footprint = dragged.offsetHeight + slotGap(els)
  if (from < over && index > from && index <= over) return `translateY(${-footprint}px)`
  if (from > over && index >= over && index < from) return `translateY(${footprint}px)`
  return 'none'
}

// Chromium nulls relatedTarget during a drag, so leaving is decided by coordinates
const pointerOutside = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
}

const GripIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
)

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

// The row only becomes draggable while the grip is held, so selecting text in
// the title or ticking the box never starts a drag by accident
function TaskRow({
  task, autoFocus, frozen, rowRef, armed, dragging, transform,
  onArm, onDragStart, onDragEnd, onRename, onToggle, onOpenSchedule, onDelete,
}) {
  const { done, total } = subtaskTally(task)
  return (
    <div
      ref={rowRef}
      className={`task-item ${task.day_date ? 'has-day' : ''} ${dragging ? 'dragging' : ''}`}
      draggable={armed}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ transform }}
    >
      <span
        className="task-grip"
        role="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onMouseDown={frozen ? undefined : onArm}
      >
        <GripIcon />
      </span>
      <input
        type="checkbox"
        className="task-check"
        checked={task.completed}
        disabled={frozen}
        onChange={e => onToggle(task.id, e.target.checked)}
      />
      <EditableText
        className={`task-name-input ${task.completed ? 'done' : ''}`}
        value={task.title}
        placeholder="To-do..."
        autoFocus={autoFocus}
        readOnly={frozen}
        onSave={val => onRename(task.id, val)}
      />
      {total > 0 && (
        <span
          className={`subtask-badge ${done === total ? 'full' : ''}`}
          title={`${done} of ${total} subtask${total > 1 ? 's' : ''} done`}
        >
          {done}/{total}
        </span>
      )}
      <div className="task-actions">
        <button type="button" className="assign-date" onClick={() => onOpenSchedule(task.id)} disabled={frozen} title="Schedule across days">
          {total > 0 ? (
            <span>edit days</span>
          ) : (
            <>
              <span>Assign days</span>
              <svg className="arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              <span className="cal-box">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </span>
            </>
          )}
        </button>
        <button className="task-del" onClick={() => onDelete(task.id)} disabled={frozen} title="Delete task">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  )
}

const rowId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const blankRow = () => ({ id: rowId(), title: '', completed: false })

function TaskScheduleDialog({ task, projectName, weekStartIso, onSave, onClose }) {
  const days = weekDayList(weekStartIso)

  // Subtasks are grouped by their day so a day box owns its own rows; the flat
  // list is rebuilt in week order on save.
  const [byDay, setByDay] = useState(() => {
    const seed = {}
    for (const s of task.subtasks || []) {
      if (!s.day_date) continue
      if (!seed[s.day_date]) seed[s.day_date] = []
      seed[s.day_date].push({
        id: s.id || rowId(),
        title: s.title || '',
        completed: !!s.completed,
      })
    }
    // A task scheduled before subtasks existed still opens on the day it had
    if (!Object.keys(seed).length && task.day_date) seed[task.day_date] = [blankRow()]
    return seed
  })
  const [note, setNote] = useState(task.note || '')
  const [deadline, setDeadline] = useState(task.deadline || '')
  const [time, setTime] = useState(task.deadline_time || '')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleDay = (date) => setByDay(prev => {
    const next = { ...prev }
    if (next[date]) delete next[date]
    else next[date] = [blankRow()]
    return next
  })

  const editRows = (date, fn) => setByDay(prev => ({ ...prev, [date]: fn(prev[date] || []) }))
  const addRow = (date) => editRows(date, rows => [...rows, blankRow()])
  const removeRow = (date, id) => editRows(date, rows => rows.filter(r => r.id !== id))
  const patchRow = (date, id, patch) =>
    editRows(date, rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)))

  const pickedDays = days.filter(d => byDay[d.date])

  const submit = (e) => {
    e.preventDefault()
    const subtasks = []
    for (const d of pickedDays) {
      for (const r of byDay[d.date]) {
        subtasks.push({
          id: r.id,
          title: r.title.trim(),
          day_date: d.date,
          completed: r.completed,
        })
      }
    }
    onSave({ subtasks, note: note.trim(), deadline: deadline || null, deadlineTime: time || null })
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card wide scroll" onSubmit={submit}>
        <div className="modal-eyebrow">{projectName || 'Untitled project'}</div>
        <h2 className="modal-title">{task.title || 'Untitled task'}</h2>
        <div className="modal-divider" />

        <div className="field-label">DEADLINE</div>
        <div className="sched-deadline-row">
          <input
            type="date"
            className="sched-date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
          />
          <input
            type="time"
            className="sched-time"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>

        <div className="field-label">DAYS</div>
        <div className="day-toggle-row">
          {days.map(d => (
            <button
              type="button"
              key={d.date}
              className={`day-toggle ${byDay[d.date] ? 'selected' : ''}`}
              onClick={() => toggleDay(d.date)}
              aria-pressed={!!byDay[d.date]}
              title={d.name}
            >
              {d.initial}
            </button>
          ))}
        </div>

        {pickedDays.map(d => (
          <div className="sched-day" key={d.date}>
            <div className="sched-day-name">{d.name}</div>
            {byDay[d.date].map(r => (
              <div className="sched-sub-row" key={r.id}>
                <input
                  type="text"
                  className="sched-sub-input"
                  value={r.title}
                  placeholder="add a note (optional)"
                  onChange={e => patchRow(d.date, r.id, { title: e.target.value })}
                />
                {byDay[d.date].length > 1 && (
                  <button
                    type="button"
                    className="sched-sub-del"
                    onClick={() => removeRow(d.date, r.id)}
                    title="Remove subtask"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="sched-add" onClick={() => addRow(d.date)}>
              + add subtask on {d.short}
            </button>
          </div>
        ))}

        <div className="field-label">NOTE</div>
        <textarea
          className="schedule-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="a note about the whole task (optional)"
        />

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
    projects, addProject, updateProjectName, deleteProject, reorderProjects, reorderTasks,
    addTask, updateTaskTitle, setTaskSchedule, deleteTask, toggleTask, setProjectDeadline,
    weekStart, weekEnded, importPlan, showToast,
  } = useApp()
  // An ended week is on display only: every control that would change the
  // plan is disabled until the week is reopened from the toolbar
  const frozen = weekEnded
  const [draggedIdx, setDraggedIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [focusTaskId, setFocusTaskId] = useState(null)
  const [deadlineFor, setDeadlineFor] = useState(null)
  const [scheduleFor, setScheduleFor] = useState(null)
  const [transfer, setTransfer] = useState(null)
  const cardRefs = useRef([])
  const sidebarRef = useRef(null)

  // Task reordering lives inside one project: which row is armed by its grip,
  // and the drag in flight as { projectId, from, over }
  const [armedTask, setArmedTask] = useState(null)
  const [taskDrag, setTaskDrag] = useState(null)
  const taskRefs = useRef({})

  // A grip pressed but never dragged disarms on release, wherever that lands
  useEffect(() => {
    if (armedTask === null) return
    const disarm = () => setArmedTask(null)
    window.addEventListener('mouseup', disarm)
    return () => window.removeEventListener('mouseup', disarm)
  }, [armedTask])

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

  const onDragOver = (e) => {
    if (draggedIdx === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const sidebar = sidebarRef.current
    if (!sidebar) return
    const idx = slotAtPointer(cardRefs.current, sidebar.getBoundingClientRect().top - sidebar.offsetTop, e.clientY)
    if (idx !== null && idx !== dragOverIdx) setDragOverIdx(idx)
  }

  const onDrop = (e) => {
    e.preventDefault()
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      reorderProjects(draggedIdx, dragOverIdx)
    }
    resetDrag()
  }

  const dragTransform = (index) => slideTransform(cardRefs.current, draggedIdx, dragOverIdx, index)

  /* ---- Task rows ---- */

  const taskRows = (projectId, count) => (taskRefs.current[projectId] || []).slice(0, count)

  const onTaskDragStart = (e, projectId, index) => {
    // The card around it is draggable too - without this it would start its
    // own drag from the same gesture
    e.stopPropagation()
    setTaskDrag({ projectId, from: index, over: null })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `task:${index}`)
  }

  const endTaskDrag = () => {
    setTaskDrag(null)
    setArmedTask(null)
  }

  const onTaskDragOver = (e, projectId, count) => {
    if (!taskDrag || taskDrag.projectId !== projectId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const list = e.currentTarget
    const idx = slotAtPointer(taskRows(projectId, count), list.getBoundingClientRect().top - list.offsetTop, e.clientY)
    if (idx !== null && idx !== taskDrag.over) setTaskDrag({ ...taskDrag, over: idx })
  }

  // Leaving the list returns the rows to their resting slots
  const onTaskDragLeave = (e, projectId) => {
    if (!taskDrag || taskDrag.projectId !== projectId) return
    if (pointerOutside(e) && taskDrag.over !== null) setTaskDrag({ ...taskDrag, over: null })
  }

  const onTaskDrop = (e, projectId) => {
    if (!taskDrag || taskDrag.projectId !== projectId) return
    e.preventDefault()
    e.stopPropagation()
    if (taskDrag.over !== null && taskDrag.from !== taskDrag.over) {
      reorderTasks(projectId, taskDrag.from, taskDrag.over)
    }
    endTaskDrag()
  }

  const taskTransform = (projectId, count, index) => {
    if (!taskDrag || taskDrag.projectId !== projectId) return 'none'
    return slideTransform(taskRows(projectId, count), taskDrag.from, taskDrag.over, index)
  }

  return (
    <>
      <aside
      className="sidebar"
      ref={sidebarRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(e) => {
        // Only a real exit returns cards to their resting slots
        if (pointerOutside(e)) setDragOverIdx(null)
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
            disabled={frozen}
            title={frozen ? 'This week has ended - reopen it to paste' : undefined}
          >
            Paste plan
          </button>
        </div>
      </div>

      {projects.map((p, index) => {
        const tasks = p.tasks || []
        const { total, pct } = rollUp(tasks)

        const isDragging = draggedIdx === index

        return (
          <div
            key={p.id}
            ref={el => { cardRefs.current[index] = el }}
            className={`project-card ${isDragging ? 'dragging' : ''}`}
            draggable={!frozen}
            onDragStart={(e) => onDragStart(e, index)}
            onDragEnd={resetDrag}
            style={{ transform: dragTransform(index) }}
          >
            <div className="project-card-head" style={{display: 'flex', alignItems: 'center', gap: 12}}>

              <div style={{display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1}}>
                <div className="proj-hover-action" style={{cursor: 'grab', color: 'var(--ink-faint)', display: 'flex'}}>
                  <GripIcon />
                </div>
                <div className="proj-title-wrap">
                  <EditableText
                    className="proj-title-input"
                    value={p.name}
                    placeholder="Project name..."
                    autoFocus={!p.name && !frozen}
                    readOnly={frozen}
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
                    <div className="proj-progress-fill" style={{width: `${pct}%`}}></div>
                  </div>
                )}

                <div className="proj-hover-action" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <button
                    className="icon-btn"
                    onClick={() => setDeadlineFor(p.id)}
                    disabled={frozen}
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
                    disabled={frozen}
                    style={{width: 20, height: 20, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}
                    title="Delete Project"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>
            </div>

            <div
              className="proj-tasks"
              onDragOver={(e) => onTaskDragOver(e, p.id, tasks.length)}
              onDragLeave={(e) => onTaskDragLeave(e, p.id)}
              onDrop={(e) => onTaskDrop(e, p.id)}
            >
              {tasks.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  rowRef={el => { (taskRefs.current[p.id] ||= [])[i] = el }}
                  autoFocus={focusTaskId === t.id}
                  frozen={frozen}
                  armed={armedTask === t.id}
                  dragging={taskDrag?.projectId === p.id && taskDrag.from === i}
                  transform={taskTransform(p.id, tasks.length, i)}
                  onArm={() => setArmedTask(t.id)}
                  onDragStart={(e) => onTaskDragStart(e, p.id, i)}
                  onDragEnd={endTaskDrag}
                  onRename={updateTaskTitle}
                  onToggle={toggleTask}
                  onOpenSchedule={setScheduleFor}
                  onDelete={deleteTask}
                />
              ))}

              <button className="add-task-btn" onClick={() => handleAddTask(p.id)} disabled={frozen}>
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

      <button className="add-project-dashed" onClick={handleCreateProject} disabled={frozen}>+ ADD PROJECT</button>
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
          onSave={(payload) => {
            setTaskSchedule(scheduleTask.id, payload)
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
