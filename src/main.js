import { supabase } from './supabase.js'

// ============================================================
// Constants
// ============================================================
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ============================================================
// State
// ============================================================
const state = {
  user: null,
  projects: [],
  weekStart: startOfWeek(new Date()),
  route: '#/',
  loading: true,
  authMode: 'login', // 'login' | 'signup'
  authError: '',
  error: '',
}

// ============================================================
// Date Utilities
// ============================================================
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(value) {
  if (!value) return null
  const raw = String(value).slice(0, 10)
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatWeekRange(start) {
  const end = addDays(start, 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}

function weekLabel(start) {
  const thisStart = startOfWeek(new Date()).getTime()
  const t = start.getTime()
  if (t === thisStart) return 'This week'
  if (t === addDays(new Date(thisStart), 7).getTime()) return 'Next week'
  if (t === addDays(new Date(thisStart), -7).getTime()) return 'Last week'
  return 'Week of'
}

function deadlineText(deadline) {
  if (!deadline) return null
  const d = parseISODate(deadline)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24))
  if (diff < 0) return { text: `Overdue by ${Math.abs(diff)}d`, cls: 'overdue' }
  if (diff === 0) return { text: 'Due today', cls: 'urgent' }
  if (diff <= 3) return { text: `Due in ${diff}d`, cls: 'urgent' }
  return { text: `Due in ${diff}d`, cls: 'upcoming' }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function getMonthName(m) {
  return ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][m]
}

// ============================================================
// Router
// ============================================================
function navigate(hash) {
  window.location.hash = hash
}

function parseRoute() {
  const hash = window.location.hash || '#/'
  state.route = hash
  const weekMatch = hash.match(/#\/plan\/week\/(\d{4}-\d{2}-\d{2})/)
  if (weekMatch) {
    const d = parseISODate(weekMatch[1])
    if (d) state.weekStart = startOfWeek(d)
  }
}

window.addEventListener('hashchange', () => {
  parseRoute()
  render()
  if (state.user && (state.route === '#/' || state.route.startsWith('#/plan/week'))) {
    load()
  }
})

// ============================================================
// Auth & Guest Mode
// ============================================================
function saveLocal() {
  localStorage.setItem('task-planner-guest', JSON.stringify(state.projects))
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
}

async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  state.user = session?.user ?? null

  supabase.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user ?? null
    if (state.user && (state.route === '#/login')) {
      navigate('#/')
    }
    load()
  })

  parseRoute()
  await load()
}

async function handleAuth(email, password) {
  state.authError = ''
  let result
  if (state.authMode === 'signup') {
    result = await supabase.auth.signUp({ email, password })
  } else {
    result = await supabase.auth.signInWithPassword({ email, password })
  }
  if (result.error) {
    state.authError = result.error.message
    render()
  }
}

async function handleLogout() {
  await supabase.auth.signOut()
  state.projects = []
  state.user = null
  navigate('#/')
  load()
}

function userInitials() {
  if (!state.user) return 'Guest'
  const email = state.user.email || ''
  return email.substring(0, 2).toUpperCase()
}

// ============================================================
// Data Loading
// ============================================================
async function load() {
  if (state.projects.length === 0) {
    state.loading = true
    render()
  }
  state.error = ''

  if (!state.user) {
    // Guest Mode - load from LocalStorage
    try {
      state.projects = JSON.parse(localStorage.getItem('task-planner-guest')) || []
    } catch {
      state.projects = []
    }
    state.loading = false
    render()
    return
  }

  // Authenticated Mode - load from Supabase
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, name, description, deadline, color_tag, created_at,
      tasks (
        id, title, day_date, completed, sort_order,
        subtasks (
          id, title, completed, sort_order,
          sub_subtasks (
            id, title, completed, sort_order
          )
        )
      )
    `)
    .order('id')

  if (error) {
    state.error = error.message
    state.projects = []
  } else {
    state.projects = (data ?? []).map((p) => ({
      ...p,
      tasks: (p.tasks ?? []).map((t) => ({
        ...t,
        subtasks: (t.subtasks ?? []).map((s) => ({
          ...s,
          sub_subtasks: s.sub_subtasks ?? [],
        })),
      })),
    }))
  }

  state.loading = false
  render()
}

// ============================================================
// Stats Helpers
// ============================================================
function projectProgress(project) {
  const tasks = project.tasks ?? []
  const total = tasks.length
  const done = tasks.filter((t) => t.completed).length
  return { done, total }
}

function weekProgress() {
  const weekEnd = addDays(state.weekStart, 6)
  const startISO = toISODate(state.weekStart)
  const endISO = toISODate(weekEnd)
  let total = 0, done = 0
  for (const project of state.projects) {
    for (const task of project.tasks ?? []) {
      if (task.day_date && task.day_date >= startISO && task.day_date <= endISO) {
        total++
        if (task.completed) done++
      }
    }
  }
  return { done, total }
}

// ============================================================
// Toast
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3500)
}

// ============================================================
// Render — Main Dispatcher
// ============================================================
function render() {
  const app = document.getElementById('app')
  if (!app) return

  if (state.route === '#/login') {
    app.innerHTML = renderLogin()
    return
  }

  let content = ''
  if (state.route === '#/plan/year') {
    content = renderYearlyPlan()
  } else if (state.route.startsWith('#/plan/month/')) {
    content = renderMonthlyPlan()
  } else if (state.route === '#/stats') {
    content = renderStats()
  } else {
    content = renderWeeklyPlan()
  }

  app.innerHTML = `
    ${renderHeader()}
    <main class="main-content">
      ${state.loading ? '<p class="status">Loading your week…</p>' : ''}
      ${state.error ? `<p class="status error">${escapeHtml(state.error)}</p>` : ''}
      ${!state.loading ? content : ''}
    </main>
  `
}

function renderHeader() {
  const isPlans = state.route === '#/' || state.route.startsWith('#/plan')
  const isStats = state.route === '#/stats'

  const authMenu = state.user 
    ? `
      <div class="user-avatar">${userInitials()}</div>
      <button class="logout-btn" data-action="logout">Log out</button>
    `
    : `
      <a href="#/login" class="nav-tab">Log in</a>
      <a href="#/login" class="add-project-btn" style="text-decoration: none; padding: 5px 12px; margin-left: 0;">Sign up</a>
    `

  return `
    <header class="header">
      <div class="brand">Task Planner</div>
      <nav class="nav-tabs">
        <button class="nav-tab ${isPlans ? 'active' : ''}" data-nav="plans">Plans</button>
        <button class="nav-tab ${isStats ? 'active' : ''}" data-nav="stats">Stats</button>
      </nav>
      <div class="header-spacer"></div>
      <div class="user-menu">
        ${authMenu}
      </div>
    </header>
  `
}

// ============================================================
// Login View
// ============================================================
function renderLogin() {
  return `
    <div class="auth-page">
      <div class="auth-card">
        <div class="brand">Task Planner</div>
        <h2 class="auth-title">${state.authMode === 'signup' ? 'Create an account' : 'Welcome back'}</h2>
        ${state.authError ? `<div class="auth-error">${escapeHtml(state.authError)}</div>` : ''}
        <form id="auth-form">
          <div class="auth-field">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" />
          </div>
          <div class="auth-field">
            <label for="auth-password">Password</label>
            <input id="auth-password" name="password" type="password" required autocomplete="${state.authMode === 'signup' ? 'new-password' : 'current-password'}" placeholder="••••••••" minlength="6" />
          </div>
          <button type="submit" class="auth-submit">${state.authMode === 'signup' ? 'Sign up' : 'Log in'}</button>
        </form>
        <div class="auth-toggle">
          ${state.authMode === 'signup'
      ? 'Already have an account? <button data-auth-toggle>Log in</button>'
      : "Don't have an account? <button data-auth-toggle>Sign up</button>"}
        </div>
      </div>
    </div>
  `
}

// ============================================================
// Weekly Plan View
// ============================================================
function renderWeeklyPlan() {
  const { done, total } = weekProgress()
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const weekText = weekLabel(state.weekStart)

  let projectCards = ''
  if (!state.projects.length) {
    projectCards = '<p class="status">No projects yet. Add a project to start planning your week.</p>'
  } else {
    projectCards = `<section class="plans">${state.projects.map((p) => renderProjectCard(p)).join('')}</section>`
  }

  return `
    <div class="breadcrumb">
      <a href="#/plan/year">${new Date().getFullYear()}</a>
      <span class="sep">›</span>
      <span class="current">Week</span>
    </div>
    <div class="week-nav-bar">
      <button class="icon-btn" data-week="-1" aria-label="Previous week">‹</button>
      <div class="week-label">
        <strong>${weekText}</strong>
        <span>${formatWeekRange(state.weekStart)}</span>
      </div>
      <button class="icon-btn" data-week="1" aria-label="Next week">›</button>
      <button class="add-project-btn" data-action="add-project">+ Add Project</button>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar-track">
        <div class="progress-bar-fill ${pct === 100 && total > 0 ? 'complete' : ''}" style="width: ${pct}%"></div>
      </div>
      <span class="progress-label">${total === 0 ? 'No tasks this week' : `${done}/${total} · ${pct}%`}</span>
    </div>
    ${projectCards}
  `
}

function renderProjectCard(project) {
  const { done, total } = projectProgress(project)
  const dl = deadlineText(project.deadline)
  const tasks = project.tasks ?? []
  const weekStart = state.weekStart

  const miniGrid = WEEKDAYS.map((name, i) => {
    const date = addDays(weekStart, i)
    const iso = toISODate(date)
    const isToday = iso === toISODate(new Date())
    const dayTasks = tasks.filter((t) => t.day_date === iso)

    return `
      <div class="day-mini-col ${isToday ? 'is-today' : ''}">
        <div class="day-header">
          <span>${name.charAt(0)}</span>
          <span class="date-num ${isToday ? 'today' : ''}">${date.getDate()}</span>
        </div>
        ${dayTasks.map((t) => `
          <div class="day-chip-task ${t.completed ? 'done' : ''}" data-toggle-task="${t.id}">
            ${escapeHtml(t.title)}
          </div>
        `).join('')}
        <button class="day-add-btn" data-add-task-day="${iso}" data-project-id="${project.id}" title="Add task">+</button>
      </div>
    `
  }).join('')

  // Tasks without a day assigned
  const unassigned = tasks.filter((t) => !t.day_date)

  return `
    <article class="project-card" data-project-id="${project.id}">
      <div class="project-head">
        <div>
          <h2 class="project-title">${escapeHtml(project.name)}</h2>
          ${dl ? `<span class="deadline-chip ${dl.cls}">${dl.text}</span>` : ''}
        </div>
        <div class="project-meta">
          <span class="progress-chip">${done}/${total}</span>
          <div class="project-actions">
            <button class="project-action-btn" data-delete-project="${project.id}" title="Delete project">×</button>
          </div>
        </div>
      </div>
      <div class="day-mini-grid">${miniGrid}</div>
      ${unassigned.length ? `
        <div style="margin-top: 6px;">
          ${unassigned.map((t) => `
            <div class="task-item" data-task-id="${t.id}">
              <div class="task-left">
                <input type="checkbox" class="task-check" ${t.completed ? 'checked' : ''} data-toggle-task="${t.id}" />
                <span class="task-name">${escapeHtml(t.title)}</span>
              </div>
              <div class="task-right">
                <button class="delete-btn" data-delete-task="${t.id}" aria-label="Delete">×</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <form class="add-row" data-add="task" data-project-id="${project.id}">
        <input name="title" placeholder="+ add task" autocomplete="off" />
      </form>
    </article>
  `
}

// ============================================================
// Yearly Plan View
// ============================================================
function renderYearlyPlan() {
  const year = new Date().getFullYear()
  const months = Array.from({ length: 12 }, (_, i) => {
    const monthStart = new Date(year, i, 1)
    const monthEnd = new Date(year, i + 1, 0)
    let total = 0, done = 0
    for (const project of state.projects) {
      for (const task of project.tasks ?? []) {
        if (task.day_date) {
          const d = parseISODate(task.day_date)
          if (d && d >= monthStart && d <= monthEnd) {
            total++
            if (task.completed) done++
          }
        }
      }
    }
    const pct = total === 0 ? 0 : Math.round((done / total) * 100)
    return { month: i, name: getMonthName(i), total, done, pct }
  })

  return `
    <div class="breadcrumb">
      <span class="current">${year} Overview</span>
    </div>
    <div class="year-grid">
      ${months.map((m) => `
        <div class="month-tile" data-nav-month="${m.month}">
          <h3>${m.name}</h3>
          <div class="tile-bar"><div class="tile-bar-fill" style="width: ${m.pct}%"></div></div>
          <div class="tile-stat">${m.total === 0 ? 'No tasks' : `${m.done}/${m.total} done`}</div>
        </div>
      `).join('')}
    </div>
  `
}

// ============================================================
// Monthly Plan View
// ============================================================
function renderMonthlyPlan() {
  const monthMatch = state.route.match(/#\/plan\/month\/(\d+)/)
  const monthIndex = monthMatch ? parseInt(monthMatch[1]) : new Date().getMonth()
  const year = new Date().getFullYear()
  const monthName = getMonthName(monthIndex)

  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const weeks = []
  let ws = startOfWeek(firstDay)

  while (ws <= lastDay) {
    const we = addDays(ws, 6)
    const startISO = toISODate(ws)
    const endISO = toISODate(we)
    let total = 0, done = 0
    for (const project of state.projects) {
      for (const task of project.tasks ?? []) {
        if (task.day_date && task.day_date >= startISO && task.day_date <= endISO) {
          total++
          if (task.completed) done++
        }
      }
    }
    const pct = total === 0 ? 0 : Math.round((done / total) * 100)
    weeks.push({ start: ws, startISO, range: formatWeekRange(ws), total, done, pct })
    ws = addDays(ws, 7)
  }

  return `
    <div class="breadcrumb">
      <a href="#/plan/year">${year}</a>
      <span class="sep">›</span>
      <span class="current">${monthName}</span>
    </div>
    <div class="month-grid">
      ${weeks.map((w) => `
        <div class="week-tile" data-nav-week="${w.startISO}">
          <div>
            <h3>${w.range}</h3>
            <div class="tile-stat">${w.total === 0 ? 'No tasks' : `${w.done}/${w.total} done`}</div>
          </div>
          <div class="tile-bar"><div class="tile-bar-fill" style="width: ${w.pct}%"></div></div>
        </div>
      `).join('')}
    </div>
  `
}

// ============================================================
// Stats View
// ============================================================
function renderStats() {
  let totalTasks = 0, completedTasks = 0
  const projectStats = []

  for (const project of state.projects) {
    const tasks = project.tasks ?? []
    const pDone = tasks.filter((t) => t.completed).length
    totalTasks += tasks.length
    completedTasks += pDone
    projectStats.push({ name: project.name, total: tasks.length, done: pDone })
  }

  const overallPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  // Last 8 weeks
  const weeklyData = []
  const thisWeekStart = startOfWeek(new Date())
  for (let i = 7; i >= 0; i--) {
    const ws = addDays(thisWeekStart, -i * 7)
    const we = addDays(ws, 6)
    const startISO = toISODate(ws)
    const endISO = toISODate(we)
    let done = 0, total = 0
    for (const project of state.projects) {
      for (const task of project.tasks ?? []) {
        if (task.day_date && task.day_date >= startISO && task.day_date <= endISO) {
          total++
          if (task.completed) done++
        }
      }
    }
    weeklyData.push({ label: ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), done, total })
  }

  const maxVal = Math.max(1, ...weeklyData.map((w) => w.total))

  return `
    <div class="breadcrumb">
      <span class="current">Stats</span>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Overall Completion</h3>
        <div class="stat-big">${overallPct}%</div>
        <div class="stat-label">${completedTasks} of ${totalTasks} tasks completed</div>
      </div>
      <div class="stat-card">
        <h3>Tasks Completed per Week</h3>
        <div class="bar-chart">
          ${weeklyData.map((w) => `
            <div class="bar-chart-col">
              <div class="bar-chart-bar" style="height: ${(w.done / maxVal) * 100}%"></div>
              <div class="bar-chart-label">${w.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="stat-card">
        <h3>Per Project</h3>
        ${projectStats.map((ps) => {
    const pPct = ps.total === 0 ? 0 : Math.round((ps.done / ps.total) * 100)
    return `
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--ink); margin-bottom: 3px;">
                <span>${escapeHtml(ps.name)}</span>
                <span style="color: var(--ink-faint); font-family: var(--mono); font-size: 0.72rem;">${ps.done}/${ps.total}</span>
              </div>
              <div class="tile-bar"><div class="tile-bar-fill" style="width: ${pPct}%"></div></div>
            </div>
          `
  }).join('')}
      </div>
    </div>
  `
}

// ============================================================
// Data Mutations
// ============================================================
async function addProject() {
  const dialog = document.getElementById('project-dialog')
  if (dialog) {
    document.getElementById('project-form-inner')?.reset()
    dialog.showModal()
    return
  }
  // Fallback: prompt
  const name = prompt('Project name')
  if (!name?.trim()) return
  if (!state.user) {
    state.projects.push({ id: generateId(), name: name.trim(), tasks: [] })
    saveLocal()
    render()
    return
  }
  const { error } = await supabase.from('projects').insert({ name: name.trim() })
  if (error) { showToast(error.message, 'error'); return }
  await load()
}

async function saveProject(formData) {
  const name = formData.get('name')?.toString().trim()
  if (!name) return
  const description = formData.get('description')?.toString().trim() || null
  const deadline = formData.get('deadline')?.toString() || null
  const color_tag = formData.get('color_tag')?.toString().trim() || null

  if (!state.user) {
    state.projects.push({ id: generateId(), name, description, deadline, color_tag, tasks: [] })
    saveLocal()
    render()
    return
  }
  const { error } = await supabase.from('projects').insert({ name, description, deadline, color_tag })
  if (error) { showToast(error.message, 'error'); return }
  await load()
}

async function deleteProject(projectId) {
  if (!confirm('Delete this project and all its tasks?')) return
  if (!state.user) {
    state.projects = state.projects.filter(p => String(p.id) !== String(projectId))
    saveLocal()
    render()
    return
  }
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) { showToast(error.message, 'error'); return }
  await load()
}

async function addTask(projectId, title, dayDate = null) {
  if (!state.user) {
    const p = state.projects.find(p => String(p.id) === String(projectId))
    if (p) {
      if (!p.tasks) p.tasks = []
      p.tasks.push({ id: generateId(), project_id: projectId, title, day_date: dayDate, completed: false })
      saveLocal()
      render()
    }
    return
  }
  const { error } = await supabase.from('tasks').insert({ project_id: projectId, title, day_date: dayDate, completed: false })
  if (error) throw error
}

async function addTaskForDay(projectId, dayDate) {
  const title = prompt('Task name')
  if (!title?.trim()) return
  try {
    await addTask(projectId, title.trim(), dayDate)
    if (state.user) await load()
  } catch (err) { showToast(err.message, 'error') }
}

async function toggleTask(taskId, completed) {
  for (const p of state.projects) {
    const task = (p.tasks ?? []).find((t) => String(t.id) === String(taskId))
    if (task) { task.completed = completed; break }
  }
  
  if (!state.user) {
    saveLocal()
    render()
    return
  }
  
  render() // Optimistic UI
  const { error } = await supabase.from('tasks').update({ completed }).eq('id', taskId)
  if (error) { showToast(error.message, 'error'); await load() }
}

async function deleteTask(taskId) {
  if (!state.user) {
    for (const p of state.projects) {
      if (p.tasks) p.tasks = p.tasks.filter(t => String(t.id) !== String(taskId))
    }
    saveLocal()
    render()
    return
  }
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) { showToast(error.message, 'error'); return }
  await load()
}

// ============================================================
// Event Listeners
// ============================================================
document.addEventListener('click', async (event) => {
  const target = event.target

  // Nav tabs
  const navTab = target.closest('[data-nav]')
  if (navTab) {
    const dest = navTab.dataset.nav
    if (dest === 'plans') navigate('#/')
    else if (dest === 'stats') navigate('#/stats')
    return
  }

  // Logout
  if (target.closest('[data-action="logout"]')) { await handleLogout(); return }

  // Auth toggle
  if (target.closest('[data-auth-toggle]')) {
    state.authMode = state.authMode === 'login' ? 'signup' : 'login'
    state.authError = ''
    render()
    return
  }

  // Week nav
  const weekBtn = target.closest('[data-week]')
  if (weekBtn) {
    state.weekStart = addDays(state.weekStart, Number(weekBtn.dataset.week) * 7)
    navigate(`#/plan/week/${toISODate(state.weekStart)}`)
    return
  }

  // Add project
  if (target.closest('[data-action="add-project"]')) { await addProject(); return }

  // Delete project
  const delProject = target.closest('[data-delete-project]')
  if (delProject) { await deleteProject(delProject.dataset.deleteProject); return }

  // Add task for day
  const addDayBtn = target.closest('[data-add-task-day]')
  if (addDayBtn) { await addTaskForDay(addDayBtn.dataset.projectId, addDayBtn.dataset.addTaskDay); return }

  // Toggle task via chip click
  const toggleChip = target.closest('[data-toggle-task]')
  if (toggleChip && !target.classList.contains('task-check')) {
    const taskId = toggleChip.dataset.toggleTask
    // Find current state
    for (const p of state.projects) {
      const task = (p.tasks ?? []).find((t) => String(t.id) === String(taskId))
      if (task) { await toggleTask(taskId, !task.completed); break }
    }
    return
  }

  // Delete task
  const delTask = target.closest('[data-delete-task]')
  if (delTask) { await deleteTask(delTask.dataset.deleteTask); return }

  // Month tile nav
  const monthTile = target.closest('[data-nav-month]')
  if (monthTile) { navigate(`#/plan/month/${monthTile.dataset.navMonth}`); return }

  // Week tile nav
  const weekTile = target.closest('[data-nav-week]')
  if (weekTile) { navigate(`#/plan/week/${weekTile.dataset.navWeek}`); return }
})

document.addEventListener('change', async (event) => {
  const target = event.target
  if (target.classList.contains('task-check')) {
    const toggleAttr = target.dataset.toggleTask || target.closest('[data-toggle-task]')?.dataset.toggleTask
    if (toggleAttr) { await toggleTask(toggleAttr, target.checked) }
  }
})

document.addEventListener('submit', async (event) => {
  // Auth form
  if (event.target.id === 'auth-form') {
    event.preventDefault()
    const fd = new FormData(event.target)
    await handleAuth(fd.get('email')?.toString(), fd.get('password')?.toString())
    return
  }

  // Project dialog
  if (event.target.id === 'project-form-inner') {
    event.preventDefault()
    await saveProject(new FormData(event.target))
    document.getElementById('project-dialog')?.close()
    return
  }

  // Add task inline
  const form = event.target.closest('[data-add]')
  if (!form) return
  event.preventDefault()
  const title = new FormData(form).get('title')?.toString().trim()
  if (!title) return
  try {
    await addTask(form.dataset.projectId, title)
    await load()
  } catch (err) { showToast(err.message, 'error') }
})

// ============================================================
// Init
// ============================================================
parseRoute()
initAuth()
