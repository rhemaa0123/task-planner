import React, { createContext, useContext, useState } from 'react'
import { startOfWeek, toISODate, addDays, fromISODate, earliestDay } from '../utils'

const AppContext = createContext(null)

const STORE_KEY = 'task-planner-guest'
const WEEKS_KEY = 'task-planner-weeks'

// Per-week state that is not a project: whether the week has been ended.
// Keyed by the week's Monday, e.g. { "2026-09-07": { ended: true, endedAt } }.
const readWeekMeta = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(WEEKS_KEY))
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    return {}
  }
}

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
  const [weekMeta, setWeekMeta] = useState(readWeekMeta)
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const [toasts, setToasts] = useState([])
  // Set once if the browser refuses to persist, so the warning is not repeated
  // on every keystroke
  const [storageWarned, setStorageWarned] = useState(false)

  const weekStartIso = toISODate(weekStart)
  const projects = allProjects.filter(p => p.week_start === weekStartIso)
  // An ended week is frozen: the board shows it but nothing in it can change
  // until it is reopened
  const weekEnded = !!weekMeta[weekStartIso]?.ended

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
  const persist = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      if (!storageWarned) {
        setStorageWarned(true)
        showToast('This browser is blocking storage — your plan will not be saved', 'error')
      }
    }
  }

  const save = (next) => {
    setAllProjects(next)
    persist(STORE_KEY, next)
  }

  const saveMeta = (next) => {
    setWeekMeta(next)
    persist(WEEKS_KEY, next)
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

  // One subtask id or several of the same task's - every mutation below takes
  // the set in one write, since a second call in the same tick would only see
  // the state from before the first
  const idSet = (ids) => new Set([].concat(ids).map(String))

  // Ticking subtasks rolls up: the parent task is done exactly when all of its
  // subtasks are, so the sidebar badge and the row's checkbox never disagree.
  const toggleSubtask = (taskId, subtaskIds, completed) => patchTask(taskId, t => {
    const ids = idSet(subtaskIds)
    const subs = (t.subtasks || []).map(s => ids.has(String(s.id)) ? { ...s, completed } : s)
    return { ...t, subtasks: subs, completed: subs.length > 0 && subs.every(s => s.completed) }
  })

  // Reschedules scheduled work onto a later day. `subtaskIds` is null when the
  // task carries its own day. The day left behind is kept in missedDays when the
  // dialog's "mark as missed" box is ticked, so the week still shows what slipped.
  const moveScheduled = (taskId, subtaskIds, toDate, markMissed) => {
    const stamp = (item) => ({
      ...item,
      day_date: toDate,
      missedDays: markMissed && item.day_date && item.day_date !== toDate
        ? [...new Set([...(item.missedDays || []), item.day_date])]
        : (item.missedDays || []),
    })

    patchTask(taskId, t => {
      if (subtaskIds == null) return stamp(t)
      const ids = idSet(subtaskIds)
      const subs = (t.subtasks || []).map(s => ids.has(String(s.id)) ? stamp(s) : s)
      return { ...t, subtasks: subs, day_date: earliestDay(subs) }
    })
  }

  // Forgives one slip: the day stops counting as missed for that unit
  const clearMissedDay = (taskId, subtaskId, iso) => {
    const strip = (item) => ({ ...item, missedDays: (item.missedDays || []).filter(d => d !== iso) })
    patchTask(taskId, t => {
      if (subtaskId == null) return strip(t)
      return { ...t, subtasks: (t.subtasks || []).map(s => String(s.id) === String(subtaskId) ? strip(s) : s) }
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
          })),
        })),
      }
    })

    save([...allProjects, ...built])
    return { projects: built.length, tasks: built.reduce((n, p) => n + p.tasks.length, 0) }
  }

  /* ---- Weeks ---- */

  const endWeek = (iso) => {
    saveMeta({ ...weekMeta, [iso]: { ...(weekMeta[iso] || {}), ended: true, endedAt: toISODate(new Date()) } })
  }

  const reopenWeek = (iso) => {
    const next = { ...weekMeta }
    delete next[iso]
    saveMeta(next)
  }

  // Moves every unfinished unit of work one week later - same weekday, same
  // project (created in the next week if it does not exist there yet) - then
  // ends the week. A task with some subtasks done stays behind with just those,
  // now complete, while its open subtasks travel on as a copy.
  const carryForward = (iso) => {
    const nextIso = toISODate(addDays(fromISODate(iso), 7))
    const shift = (d) => (d ? toISODate(addDays(fromISODate(d), 7)) : null)

    const thisWeek = allProjects.filter(p => p.week_start === iso)
    const nextWeek = allProjects.filter(p => p.week_start === nextIso)
    const others = allProjects.filter(p => p.week_start !== iso && p.week_start !== nextIso)

    const nextByName = new Map(nextWeek.map(p => [p.name, { ...p, tasks: [...(p.tasks || [])] }]))
    const stayed = []
    let moved = 0

    for (const p of thisWeek) {
      const keep = []
      const carried = []

      for (const t of p.tasks || []) {
        const subs = t.subtasks || []
        if (subs.length) {
          const open = subs.filter(s => !s.completed)
          const done = subs.filter(s => s.completed)
          if (!open.length) { keep.push(t); continue }
          if (done.length) keep.push({ ...t, subtasks: done, day_date: earliestDay(done), completed: true })
          const shifted = open.map(s => ({ ...s, id: generateId(), day_date: shift(s.day_date), missedDays: [] }))
          carried.push({ ...t, id: generateId(), subtasks: shifted, day_date: earliestDay(shifted), completed: false, missedDays: [] })
          moved += open.length
        } else if (t.completed) {
          keep.push(t)
        } else {
          carried.push({ ...t, id: generateId(), day_date: shift(t.day_date), missedDays: [] })
          moved++
        }
      }

      stayed.push({ ...p, tasks: keep })
      if (!carried.length) continue

      let target = nextByName.get(p.name)
      if (!target) {
        target = {
          id: generateId(),
          name: p.name,
          deadline: shift(p.deadline),
          week_start: nextIso,
          tasks: [],
        }
        nextByName.set(p.name, target)
      }
      target.tasks.push(...carried.map(t => ({ ...t, project_id: target.id })))
    }

    save([...others, ...stayed, ...nextByName.values()])
    saveMeta({ ...weekMeta, [iso]: { ...(weekMeta[iso] || {}), ended: true, endedAt: toISODate(new Date()) } })
    return moved
  }

  // Removes a week's plan outright, along with its ended flag
  const deleteWeek = (iso) => {
    save(allProjects.filter(p => p.week_start !== iso))
    if (weekMeta[iso]) {
      const next = { ...weekMeta }
      delete next[iso]
      saveMeta(next)
    }
  }

  const clearAll = () => {
    save([])
    saveMeta({})
  }

  // Indices are positions within one project's task list
  const reorderTasks = (projectId, fromIndex, toIndex) => {
    save(allProjects.map(p => {
      if (String(p.id) !== String(projectId)) return p
      const tasks = [...(p.tasks || [])]
      const [moved] = tasks.splice(fromIndex, 1)
      tasks.splice(toIndex, 0, moved)
      return { ...p, tasks }
    }))
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
      projects, allProjects, weekStart, setWeekStart, toasts, showToast,
      weekMeta, weekEnded, endWeek, reopenWeek, carryForward, deleteWeek, clearAll,
      addProject, updateProjectName, deleteProject, setProjectDeadline, reorderProjects, importPlan,
      addTask, updateTaskTitle, setTaskDay, setTaskSchedule, toggleSubtask, moveScheduled, clearMissedDay,
      deleteTask, toggleTask, reorderTasks,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
