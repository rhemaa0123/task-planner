import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authInitialized, setAuthInitialized] = useState(false)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  })
  const [toasts, setToasts] = useState([])

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
      try {
        setProjects(JSON.parse(localStorage.getItem('task-planner-guest')) || [])
      } catch {
        setProjects([])
      }
      setLoading(false)
      return
    }

    const { data, error: err } = await supabase
      .from('projects')
      .select(`
        id, name, description, deadline, color_tag, created_at,
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
      setProjects([])
    } else {
      setProjects((data ?? []).map((p) => ({
        ...p,
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
    setProjects(newProjects)
  }

  // Mutations
  const addProject = async (name) => {
    if (!name?.trim()) return
    if (!user) {
      saveLocal([...projects, { id: generateId(), name: name.trim(), tasks: [] }])
      return
    }
    const { error: err } = await supabase.from('projects').insert({ name: name.trim() })
    if (err) { showToast(err.message, 'error'); return }
    await loadData()
  }

  const addTask = async (projectId, title, dayDate = null) => {
    if (!user) {
      const updated = projects.map(p => {
        if (String(p.id) === String(projectId)) {
          return {
            ...p,
            tasks: [...(p.tasks || []), { id: generateId(), project_id: projectId, title, day_date: dayDate, completed: false }]
          }
        }
        return p
      })
      saveLocal(updated)
      return
    }
    const { error: err } = await supabase.from('tasks').insert({ project_id: projectId, title, day_date: dayDate, completed: false })
    if (err) throw err
    await loadData()
  }

  const toggleTask = async (taskId, completed) => {
    // Optimistic UI
    const updated = projects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId) ? { ...t, completed } : t)
    }))

    if (!user) {
      saveLocal(updated)
      return
    }
    setProjects(updated)

    const { error: err } = await supabase.from('tasks').update({ completed }).eq('id', taskId)
    if (err) { showToast(err.message, 'error'); await loadData() }
  }

  return (
    <AppContext.Provider value={{
      user, authInitialized, projects, loading, error, weekStart, setWeekStart,
      toasts, showToast,
      addProject, addTask, toggleTask, loadData
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

