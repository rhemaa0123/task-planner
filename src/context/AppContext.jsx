import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { startOfWeek, toISODate, clampDifficulty, earliestDay } from '../utils'

const AppContext = createContext(null)

// Projects saved before weeks existed surface in the real current week
const readGuestProjects = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('task-planner-guest')) || []
    const thisWeekIso = toISODate(startOfWeek())
    return stored.map(p => ({ ...p, week_start: p.week_start || thisWeekIso }))
  } catch {
    return []
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authInitialized, setAuthInitialized] = useState(false)
  // Seeded from localStorage so guest planning renders without waiting on the session check
  const [allProjects, setAllProjects] = useState(readGuestProjects)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const [toasts, setToasts] = useState([])

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

  // Auth Init
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthInitialized(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Data Loading
  const loadData = async () => {
    setLoading(true)
    setError('')

    if (!user) {
      setAllProjects(readGuestProjects())
      setLoading(false)
      return
    }

    const thisWeekIso = toISODate(startOfWeek())

    const { data, error: err } = await supabase
      .from('projects')
      .select(`
        id, name, description, deadline, color_tag, created_at, week_start,
        tasks (
          id, title, day_date, completed, sort_order,
          subtasks (
            id, title, completed, sort_order,
            sub_subtasks (id, title, completed, sort_order)
          )
        )
      `)
      .order('id')

    if (err) {
      setError(err.message)
      setAllProjects([])
    } else {
      setAllProjects((data ?? []).map((p) => ({
        ...p,
        week_start: p.week_start || thisWeekIso,
        tasks: (p.tasks ?? []).map((t) => ({
          ...t,
          subtasks: (t.subtasks ?? []).map((s) => ({
            ...s,
            sub_subtasks: s.sub_subtasks ?? [],
          })),
        })),
      })))
    }
    setLoading(false)
  }

  useEffect(() => {
    if (authInitialized) {
      loadData()
    }
  }, [user, authInitialized])

  const saveLocal = (newProjects) => {
    localStorage.setItem('task-planner-guest', JSON.stringify(newProjects))
    setAllProjects(newProjects)
  }

  // Mutations
  const addProject = async (name = '') => {
    const newName = name.trim() || ''
    const tempId = generateId()
    if (!user) {
      saveLocal([...allProjects, { id: tempId, name: newName, week_start: weekStartIso, tasks: [] }])
      return tempId
    }
    const { data, error: err } = await supabase.from('projects').insert({ name: newName, week_start: weekStartIso }).select().single()
    if (err) { showToast(err.message, 'error'); return null }
    await loadData()
    return data.id
  }

  const updateProjectName = async (projectId, name) => {
    const updated = allProjects.map(p => String(p.id) === String(projectId) ? { ...p, name } : p)
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('projects').update({ name }).eq('id', projectId)
    if (err) { showToast(err.message, 'error') }
  }

  const deleteProject = async (projectId) => {
    const updated = allProjects.filter(p => String(p.id) !== String(projectId))
    if (!user) {
      saveLocal(updated)
      return
    }
    setAllProjects(updated)
    const { error: err } = await supabase.from('projects').delete().eq('id', projectId)
    if (err) { showToast(err.message, 'error'); await loadData() }
  }

  const addTask = async (projectId, title = '', dayDate = null) => {
    if (!user) {
      const newId = generateId()
      const updated = allProjects.map(p => {
        if (String(p.id) === String(projectId)) {
          return {
            ...p,
            tasks: [...(p.tasks || []), { id: newId, project_id: projectId, title, day_date: dayDate, completed: false }]
          }
        }
        return p
      })
      saveLocal(updated)
      return newId
    }
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({ project_id: projectId, title, day_date: dayDate, completed: false })
      .select()
      .single()
    if (err) { showToast(err.message, 'error'); return null }
    await loadData()
    return data?.id ?? null
  }

  const updateTaskTitle = async (taskId, title) => {
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId) ? { ...t, title } : t)
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').update({ title }).eq('id', taskId)
    if (err) { showToast(err.message, 'error') }
  }

  const setTaskDay = async (taskId, dayDate) => {
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId) ? { ...t, day_date: dayDate } : t)
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').update({ day_date: dayDate }).eq('id', taskId)
    if (err) { showToast(err.message, 'error'); await loadData() }
  }

  // Writes back everything the schedule dialog owns: the task's deadline, its
  // note, and the subtasks spread across weekdays. The task's own day_date
  // follows the earliest subtask so the week grid still places it.
  //
  // Subtask days, difficulty, the note and the task deadline are guest-only for
  // now - Supabase has no column for any of them, so a signed-in user keeps them
  // for the session and only day_date survives a reload.
  const setTaskSchedule = async (taskId, { subtasks = [], note = '', deadline = null, deadlineTime = null } = {}) => {
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

    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => {
        if (String(t.id) !== String(taskId)) return t
        return {
          ...t,
          note,
          deadline: deadline || null,
          deadline_time: deadlineTime || null,
          subtasks: clean,
          day_date: earliestDay(clean) ?? (clean.length ? null : t.day_date),
          // An emptied schedule should not leave the task looking finished
          completed: clean.length ? clean.every(s => s.completed) : t.completed,
        }
      }),
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').update({ day_date: earliestDay(clean) }).eq('id', taskId)
    if (err) { showToast(err.message, 'error') }
  }

  // Ticking a subtask rolls up: the parent task is done exactly when all of its
  // subtasks are, so the sidebar badge and the row's checkbox never disagree.
  const toggleSubtask = async (taskId, subtaskId, completed) => {
    let parentDone = null
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => {
        if (String(t.id) !== String(taskId)) return t
        const subs = (t.subtasks || []).map(s =>
          String(s.id) === String(subtaskId) ? { ...s, completed } : s
        )
        parentDone = subs.length > 0 && subs.every(s => s.completed)
        return { ...t, subtasks: subs, completed: parentDone }
      }),
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').update({ completed: !!parentDone }).eq('id', taskId)
    if (err) { showToast(err.message, 'error') }
  }

  // Ticks every subtask a task has on one day at once. Looping toggleSubtask
  // would not work: each call rebuilds from the same stale snapshot, so only the
  // last would survive.
  const setDayCompletion = async (taskId, dayDate, completed) => {
    let parentDone = null
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => {
        if (String(t.id) !== String(taskId)) return t
        const subs = (t.subtasks || []).map(s =>
          s.day_date === dayDate ? { ...s, completed } : s
        )
        parentDone = subs.length > 0 && subs.every(s => s.completed)
        return { ...t, subtasks: subs, completed: parentDone }
      }),
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').update({ completed: !!parentDone }).eq('id', taskId)
    if (err) { showToast(err.message, 'error') }
  }

  // Reschedules a task's whole day onto a later one - every subtask sitting on
  // `fromDate` travels together, or the task itself when it has none. The day
  // left behind is kept in missedDays when "mark as missed" is ticked, so the
  // week still shows what slipped.
  const moveScheduled = async (taskId, fromDate, toDate, markMissed) => {
    const stamp = (item) => ({
      ...item,
      day_date: toDate,
      missedDays: markMissed && item.day_date && item.day_date !== toDate
        ? [...new Set([...(item.missedDays || []), item.day_date])]
        : (item.missedDays || []),
    })

    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => {
        if (String(t.id) !== String(taskId)) return t
        const subs = t.subtasks || []
        if (!subs.length) return stamp(t)
        const next = subs.map(s => (s.day_date === fromDate ? stamp(s) : s))
        return { ...t, subtasks: next, day_date: earliestDay(next) }
      }),
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const moved = updated.flatMap(p => p.tasks || []).find(t => String(t.id) === String(taskId))
    const { error: err } = await supabase.from('tasks').update({ day_date: moved?.day_date ?? toDate }).eq('id', taskId)
    if (err) { showToast(err.message, 'error') }
  }

  const deleteTask = async (taskId) => {
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).filter(t => String(t.id) !== String(taskId))
    }))
    setAllProjects(updated)
    if (!user) {
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').delete().eq('id', taskId)
    if (err) { showToast(err.message, 'error'); await loadData() }
  }

  const toggleTask = async (taskId, completed) => {
    // Optimistic UI. Ticking the parent carries its subtasks with it - otherwise
    // the row would read "done" while its badge still said 0/4.
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId)
        ? { ...t, completed, subtasks: (t.subtasks || []).map(s => ({ ...s, completed })) }
        : t)
    }))

    if (!user) {
      saveLocal(updated)
      return
    }
    setAllProjects(updated)

    const { error: err } = await supabase.from('tasks').update({ completed }).eq('id', taskId)
    if (err) { showToast(err.message, 'error'); await loadData() }
  }

  const setProjectDeadline = async (projectId, deadline) => {
    const updated = allProjects.map(p => String(p.id) === String(projectId) ? { ...p, deadline } : p)
    if (!user) {
      saveLocal(updated)
      return
    }
    setAllProjects(updated)
    const { error: err } = await supabase.from('projects').update({ deadline }).eq('id', projectId)
    if (err) { showToast(err.message, 'error'); await loadData() }
  }

  // One write for the whole plan - looping addProject/addTask would reload the
  // entire dataset once per row
  const importPlan = async (incoming) => {
    if (!incoming.length) return { projects: 0, tasks: 0 }

    if (!user) {
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
      saveLocal([...allProjects, ...built])
      return { projects: built.length, tasks: built.reduce((n, p) => n + p.tasks.length, 0) }
    }

    const { data: rows, error: pErr } = await supabase
      .from('projects')
      .insert(incoming.map(p => ({
        name: p.name || '',
        deadline: p.deadline || null,
        week_start: weekStartIso,
      })))
      .select()
    if (pErr) { showToast(pErr.message, 'error'); return null }

    const taskRows = []
    rows.forEach((row, i) => {
      (incoming[i]?.tasks || []).forEach(t => {
        taskRows.push({
          project_id: row.id,
          title: t.title || '',
          day_date: t.day_date || null,
          completed: !!t.completed,
        })
      })
    })
    if (taskRows.length) {
      const { error: tErr } = await supabase.from('tasks').insert(taskRows)
      if (tErr) { showToast(tErr.message, 'error') }
    }

    await loadData()
    return { projects: rows.length, tasks: taskRows.length }
  }

  const reorderProjects = (fromIndex, toIndex) => {
    // Indices come from the visible week, so reorder that slice and lay it back
    // into the week's slots, leaving other weeks untouched
    const weekOrder = Array.from(projects)
    const [moved] = weekOrder.splice(fromIndex, 1)
    weekOrder.splice(toIndex, 0, moved)

    let slot = 0
    const reordered = allProjects.map(p => p.week_start === weekStartIso ? weekOrder[slot++] : p)
    setAllProjects(reordered)
    if (!user) {
      saveLocal(reordered)
    }
    // Note: Supabase persistence of project order would require a sort_order column
  }

  return (
    <AppContext.Provider value={{
      user, authInitialized, projects, loading, error, weekStart, setWeekStart,
      toasts, showToast,
      addProject, updateProjectName, deleteProject, reorderProjects, importPlan,
      addTask, updateTaskTitle, setTaskDay, setTaskSchedule, toggleSubtask, setDayCompletion, moveScheduled,
      deleteTask, toggleTask, setProjectDeadline, loadData
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

