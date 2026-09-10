import React, { createContext, useContext, useState } from 'react'
import { startOfWeek, toISODate, clampDifficulty, earliestDay } from '../utils'

const AppContext = createContext(null)

const STORE_KEY = 'task-planner-guest'

// Everything lives in this browser. No account, no network - opening the planner
// on any machine gives that machine its own plan, kept in its own localStorage.
const readStore = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY)) || []
    if (!Array.isArray(stored)) return []
    // Projects saved before weeks existed surface in the real current week
    const thisWeekIso = toISODate(startOfWeek())
    return stored.map(p => ({ ...p, week_start: p.week_start || thisWeekIso }))
  } catch {
    return []
  }
}

export function AppProvider({ children }) {
  const [allProjects, setAllProjects] = useState(readStore)
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const [toasts, setToasts] = useState([])
  // Set once if the browser refuses to persist, so the warning is not repeated
  // on every keystroke
  const [storageWarned, setStorageWarned] = useState(false)

  const weekStartIso = toISODate(weekStart)
  const projects = allProjects.filter(p => p.week_start === weekStartIso)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)

  const showToast = (message, type = 'info') => {
    const id = generateId()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  // The single write path. Private-browsing modes and full quotas throw here, so
  // the plan still updates on screen and the user is told once that it will not
  // outlive the tab.
  const save = (next) => {
    setAllProjects(next)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next))
    } catch {
      if (!storageWarned) {
        setStorageWarned(true)
        showToast('This browser is blocking storage — your plan will not be saved', 'error')
      }
    }
  }

  // Mutations
  const addProject = (name = '') => {
    const id = generateId()
    save([...allProjects, { id, name: name.trim(), week_start: weekStartIso, tasks: [] }])
    return id
  }

  const updateProjectName = (projectId, name) => {
    save(allProjects.map(p => String(p.id) === String(projectId) ? { ...p, name } : p))
  }

  const deleteProject = (projectId) => {
    save(allProjects.filter(p => String(p.id) !== String(projectId)))
  }

  const setProjectDeadline = (projectId, deadline) => {
    save(allProjects.map(p => String(p.id) === String(projectId) ? { ...p, deadline } : p))
  }

  const addTask = (projectId, title = '', dayDate = null) => {
    const id = generateId()
    save(allProjects.map(p => String(p.id) === String(projectId)
      ? { ...p, tasks: [...(p.tasks || []), { id, project_id: projectId, title, day_date: dayDate, completed: false, subtasks: [] }] }
      : p))
    return id
  }

  // Rewrites one task wherever it lives, leaving every other project untouched
  const patchTask = (taskId, fn) => {
    save(allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId) ? fn(t) : t),
    })))
  }

  const updateTaskTitle = (taskId, title) => patchTask(taskId, t => ({ ...t, title }))

  const setTaskDay = (taskId, dayDate) => patchTask(taskId, t => ({ ...t, day_date: dayDate }))

  const deleteTask = (taskId) => {
    save(allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).filter(t => String(t.id) !== String(taskId)),
    })))
  }

  // Ticking the parent carries its subtasks with it - otherwise the row would
  // read "done" while its badge still said 0/4
  const toggleTask = (taskId, completed) => patchTask(taskId, t => ({
    ...t,
    completed,
    subtasks: (t.subtasks || []).map(s => ({ ...s, completed })),
  }))

  // Writes back everything the schedule dialog owns: the task's deadline, its
  // note, and the subtasks spread across weekdays. The task's own day_date
  // follows the earliest subtask so the week grid still places it.
  const setTaskSchedule = (taskId, { subtasks = [], note = '', deadline = null, deadlineTime = null } = {}) => {
    const clean = subtasks
      .filter(s => s && s.day_date)
      .map(s => ({
        id: s.id || generateId(),
        title: s.title || '',
        day_date: s.day_date,
        completed: !!s.completed,
        difficulty: clampDifficulty(s.difficulty),
        missedDays: s.missedDays || [],
      }))

    patchTask(taskId, t => ({
      ...t,
      note,
      deadline: deadline || null,
      deadline_time: deadlineTime || null,
      subtasks: clean,
      day_date: earliestDay(clean) ?? (clean.length ? null : t.day_date),
      // An emptied schedule should not leave the task looking finished
      completed: clean.length ? clean.every(s => s.completed) : t.completed,
    }))
  }

  // Ticking a subtask rolls up: the parent task is done exactly when all of its
  // subtasks are, so the sidebar badge and the row's checkbox never disagree.
  const toggleSubtask = (taskId, subtaskId, completed) => patchTask(taskId, t => {
    const subs = (t.subtasks || []).map(s =>
      String(s.id) === String(subtaskId) ? { ...s, completed } : s
    )
    return { ...t, subtasks: subs, completed: subs.length > 0 && subs.every(s => s.completed) }
  })

  // Reschedules one scheduled item onto a later day. `subtaskId` is null when the
  // task carries its own day. The day left behind is kept in missedDays when the
  // dialog's "mark as missed" box is ticked, so the week still shows what slipped.
  const moveScheduled = (taskId, subtaskId, toDate, markMissed) => {
    const stamp = (item) => ({
      ...item,
      day_date: toDate,
      missedDays: markMissed && item.day_date && item.day_date !== toDate
        ? [...new Set([...(item.missedDays || []), item.day_date])]
        : (item.missedDays || []),
    })

    patchTask(taskId, t => {
      if (!subtaskId) return stamp(t)
      const subs = (t.subtasks || []).map(s =>
        String(s.id) === String(subtaskId) ? stamp(s) : s
      )
      return { ...t, subtasks: subs, day_date: earliestDay(subs) }
    })
  }

  const importPlan = (incoming) => {
    if (!incoming.length) return { projects: 0, tasks: 0 }

    const built = incoming.map(p => {
      const projectId = generateId()
      return {
        id: projectId,
        name: p.name || '',
        deadline: p.deadline || null,
        week_start: weekStartIso,
        tasks: (p.tasks || []).map(t => ({
          id: generateId(),
          project_id: projectId,
          title: t.title || '',
          note: t.note || '',
          day_date: t.day_date || null,
          completed: !!t.completed,
          subtasks: (t.subtasks || []).map(s => ({
            id: generateId(),
            title: s.title || '',
            day_date: s.day_date || null,
            completed: !!s.completed,
            difficulty: clampDifficulty(s.difficulty),
          })),
        })),
      }
    })

    save([...allProjects, ...built])
    return { projects: built.length, tasks: built.reduce((n, p) => n + p.tasks.length, 0) }
  }

  const reorderProjects = (fromIndex, toIndex) => {
    // Indices come from the visible week, so reorder that slice and lay it back
    // into the week's slots, leaving other weeks untouched
    const weekOrder = Array.from(projects)
    const [moved] = weekOrder.splice(fromIndex, 1)
    weekOrder.splice(toIndex, 0, moved)

    let slot = 0
    save(allProjects.map(p => p.week_start === weekStartIso ? weekOrder[slot++] : p))
  }

  return (
    <AppContext.Provider value={{
      projects, weekStart, setWeekStart, toasts, showToast,
      addProject, updateProjectName, deleteProject, setProjectDeadline, reorderProjects, importPlan,
      addTask, updateTaskTitle, setTaskDay, setTaskSchedule, toggleSubtask, moveScheduled,
      deleteTask, toggleTask,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
