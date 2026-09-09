import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { startOfWeek, toISODate } from '../utils'

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
    // Optimistic UI
    const updated = allProjects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId) ? { ...t, completed } : t)
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
      addProject, updateProjectName, deleteProject, reorderProjects,
      addTask, updateTaskTitle, setTaskDay, deleteTask, toggleTask, setProjectDeadline, loadData
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

