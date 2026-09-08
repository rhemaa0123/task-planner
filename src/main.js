import { supabase } from './supabase.js'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const state = {
  projects: [],
  view: 'plans',
  weekStart: startOfWeek(new Date()),
  assigning: null,
  selectedDays: new Set(),
  loading: true,
  error: '',
}

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function flattenSubtasks() {
  const rows = []
  for (const project of state.projects) {
    for (const task of project.tasks ?? []) {
      for (const subtask of task.subtasks ?? []) {
        rows.push({ project, task, subtask })
      }
    }
  }
  return rows
}

function projectProgress(project) {
  const subtasks = (project.tasks ?? []).flatMap((t) => t.subtasks ?? [])
  const total = subtasks.length
  const done = subtasks.filter((s) => s.is_completed).length
  return { done, total }
}

async function load() {
  if (state.projects.length === 0) {
    state.loading = true
    render()
  }
  state.error = ''

  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      id,
      name,
      tasks (
        id,
        title,
        subtasks (
          id,
          title,
          assigned_date,
          is_completed
        )
      )
    `,
    )
    .order('id')

  if (error) {
    state.error = error.message
    state.projects = []
  } else {
    state.projects = (data ?? []).map((project) => ({
      ...project,
      tasks: (project.tasks ?? []).map((task) => ({
        ...task,
        subtasks: task.subtasks ?? [],
      })),
    }))
  }

  state.loading = false
  render()
}

function render() {
  const app = document.getElementById('app')
  const weekText = weekLabel(state.weekStart)

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">Task Planner</div>
      <div class="week-nav">
        <button class="icon-btn" data-week="-1" aria-label="Previous week">‹</button>
        <div class="week-label">
          <strong>${weekText}</strong>
          <span>${formatWeekRange(state.weekStart)}</span>
        </div>
        <button class="icon-btn" data-week="1" aria-label="Next week">›</button>
      </div>
      <div class="view-toggle">
        <button data-view="plans" class="${state.view === 'plans' ? 'active' : ''}">Plans</button>
        <button data-view="week" class="${state.view === 'week' ? 'active' : ''}">Week</button>
      </div>
      <button class="accent-btn" data-action="add-project">+ Project</button>
    </header>
    ${state.loading ? `<p class="status">Loading your week…</p>` : ''}
    ${state.error ? `<p class="status error">${escapeHtml(state.error)}</p>` : ''}
    ${!state.loading && !state.error ? (state.view === 'plans' ? renderPlans() : renderWeek()) : ''}
  `
}

function renderPlans() {
  if (!state.projects.length) {
    return `
      <p class="status">No projects yet. Add a class or project to start this week.</p>
    `
  }

  return `<section class="plans">${state.projects.map(renderProject).join('')}</section>`
}

function renderProject(project) {
  const { done, total } = projectProgress(project)
  const tasks = project.tasks ?? []

  return `
    <article class="project-card" data-project-id="${project.id}">
      <div class="project-head">
        <h2 class="project-title">${escapeHtml(project.name)}</h2>
        <div class="progress">${done}/${total} done</div>
      </div>
      ${tasks.map((task) => renderTask(project, task)).join('') || '<p class="status">No tasks yet.</p>'}
      <form class="add-row" data-add="task" data-project-id="${project.id}">
        <input name="title" placeholder="+ add task" autocomplete="off" />
      </form>
    </article>
  `
}

function renderTask(project, task) {
  const subtasks = task.subtasks ?? []
  return `
    <div class="task-block" data-task-id="${task.id}">
      <div class="task-label">${escapeHtml(task.title)}</div>
      ${subtasks.map((subtask) => renderSubtask(project, task, subtask)).join('')}
      <form class="add-row" data-add="subtask" data-task-id="${task.id}">
        <input name="title" placeholder="+ add subtask" autocomplete="off" />
      </form>
    </div>
  `
}

function assignedChip(subtask) {
  const date = parseISODate(subtask.assigned_date)
  if (!date) {
    return `ASSIGN DAYS <span class="calendar-icon">◳</span>`
  }
  const label = WEEKDAYS[(date.getDay() + 6) % 7]
  return `${label.toUpperCase()} <span class="calendar-icon">◳</span>`
}

function renderSubtask(project, task, subtask) {
  return `
    <div class="task-item ${subtask.is_completed ? 'is-done' : ''}" data-subtask-id="${subtask.id}">
      <div class="task-left">
        <span class="drag-handle" title="Reorder coming soon">⋮⋮</span>
        <input type="checkbox" class="task-check" ${subtask.is_completed ? 'checked' : ''} />
        <span class="task-name">${escapeHtml(subtask.title)}</span>
      </div>
      <div class="task-right">
        <button type="button" class="assign-days-btn">${assignedChip(subtask)}</button>
        <button type="button" class="delete-btn" aria-label="Delete">&times;</button>
      </div>
    </div>
  `
}

function renderWeek() {
  const rows = flattenSubtasks()
  const start = state.weekStart
  const columns = WEEKDAYS.map((name, i) => {
    const date = addDays(start, i)
    const iso = toISODate(date)
    const items = rows.filter((row) => {
      const assigned = parseISODate(row.subtask.assigned_date)
      return assigned && toISODate(assigned) === iso
    })
    const isToday = iso === toISODate(new Date())
    return `
      <section class="day-col ${isToday ? 'is-today' : ''}">
        <h3>${name}${isToday ? ' · today' : ''}</h3>
        <div class="date-num">${date.getDate()}</div>
        ${
          items.length
            ? items
                .map(
                  ({ project, subtask }) => `
            <div class="day-chip-task ${subtask.is_completed ? 'done' : ''}" data-subtask-id="${subtask.id}">
              ${escapeHtml(subtask.title)}
              <small>${escapeHtml(project.name)}</small>
            </div>`,
                )
                .join('')
            : `<p class="status">Quiet day.</p>`
        }
      </section>
    `
  }).join('')

  const unassigned = rows.filter((row) => !row.subtask.assigned_date)

  return `
    <div class="week-board">${columns}</div>
    <section class="unassigned">
      <h2>Unassigned</h2>
      <div class="unassigned-list">
        ${
          unassigned.length
            ? unassigned
                .map(
                  ({ project, task, subtask }) => `
            <button type="button" data-open-assign="${subtask.id}" data-task-id="${task.id}" data-project-id="${project.id}">
              ${escapeHtml(subtask.title)} · ${escapeHtml(project.name)}
            </button>`,
                )
                .join('')
            : `<p class="status">Everything this week has a day.</p>`
        }
      </div>
    </section>
  `
}

function findSubtask(id) {
  for (const project of state.projects) {
    for (const task of project.tasks ?? []) {
      const subtask = (task.subtasks ?? []).find((s) => String(s.id) === String(id))
      if (subtask) return { project, task, subtask }
    }
  }
  return null
}

function weekDates() {
  return WEEKDAYS.map((_, i) => addDays(state.weekStart, i))
}

function openAssign(subtaskId) {
  const found = findSubtask(subtaskId)
  if (!found) return
  state.assigning = found
  const assigned = parseISODate(found.subtask.assigned_date)
  state.selectedDays = new Set()
  if (assigned) state.selectedDays.add(toISODate(assigned))

  const dialog = document.getElementById('assign-dialog')
  document.getElementById('assign-title').textContent = found.subtask.title
  const chips = document.getElementById('assign-days')
  chips.innerHTML = weekDates()
    .map((date) => {
      const iso = toISODate(date)
      const on = state.selectedDays.has(iso) ? 'on' : ''
      return `<button type="button" data-day="${iso}" class="${on}">
        <strong>${WEEKDAYS[(date.getDay() + 6) % 7]}</strong>
        ${date.getDate()}
      </button>`
    })
    .join('')
  dialog.showModal()
}

function paintAssignChips() {
  document.querySelectorAll('#assign-days [data-day]').forEach((btn) => {
    btn.classList.toggle('on', state.selectedDays.has(btn.dataset.day))
  })
}

async function saveAssign() {
  const found = state.assigning
  if (!found) return
  const days = [...state.selectedDays].sort()
  const { task, subtask } = found

  if (days.length === 0) {
    const { error } = await supabase
      .from('subtasks')
      .update({ assigned_date: null })
      .eq('id', subtask.id)
    if (error) throw error
  } else {
    const [first, ...rest] = days
    const { error } = await supabase
      .from('subtasks')
      .update({ assigned_date: first })
      .eq('id', subtask.id)
    if (error) throw error

    if (rest.length) {
      const { error: insertError } = await supabase.from('subtasks').insert(
        rest.map((day) => ({
          task_id: task.id,
          title: subtask.title,
          assigned_date: day,
          is_completed: false,
        })),
      )
      if (insertError) throw insertError
    }
  }
}

async function addProject() {
  const name = window.prompt('Project name')
  if (!name?.trim()) return
  const { error } = await supabase.from('projects').insert({ name: name.trim() })
  if (error) {
    state.error = error.message
    render()
    return
  }
  await load()
}

async function addTask(projectId, title) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ project_id: projectId, title })
    .select('id')
    .single()
  if (error) throw error
  const { error: subError } = await supabase.from('subtasks').insert({
    task_id: data.id,
    title,
    is_completed: false,
  })
  if (subError) throw subError
}

async function addSubtask(taskId, title) {
  const { error } = await supabase.from('subtasks').insert({
    task_id: taskId,
    title,
    is_completed: false,
  })
  if (error) throw error
}

async function toggleComplete(subtaskId, isCompleted) {
  const { error } = await supabase
    .from('subtasks')
    .update({ is_completed: isCompleted })
    .eq('id', subtaskId)
  if (error) throw error
  const found = findSubtask(subtaskId)
  if (found) found.subtask.is_completed = isCompleted
}

async function deleteSubtask(subtaskId) {
  const { error } = await supabase.from('subtasks').delete().eq('id', subtaskId)
  if (error) throw error
}

function renderWithTransition() {
  if (document.startViewTransition) {
    document.startViewTransition(() => render())
  } else {
    render()
  }
}

document.getElementById('app').addEventListener('click', async (event) => {
  const weekBtn = event.target.closest('[data-week]')
  if (weekBtn) {
    state.weekStart = addDays(state.weekStart, Number(weekBtn.dataset.week) * 7)
    renderWithTransition()
    return
  }

  const viewBtn = event.target.closest('[data-view]')
  if (viewBtn) {
    state.view = viewBtn.dataset.view
    renderWithTransition()
    return
  }

  if (event.target.closest('[data-action="add-project"]')) {
    await addProject()
    return
  }

  const assignOpen = event.target.closest('[data-open-assign], .day-chip-task')
  if (assignOpen) {
    openAssign(assignOpen.dataset.openAssign || assignOpen.dataset.subtaskId)
    return
  }

  const item = event.target.closest('.task-item')
  if (!item) return
  const id = item.dataset.subtaskId

  if (event.target.closest('.assign-days-btn')) {
    openAssign(id)
    return
  }

  if (event.target.closest('.delete-btn')) {
    try {
      await deleteSubtask(id)
      await load()
    } catch (err) {
      state.error = err.message
      render()
    }
  }
})

document.getElementById('app').addEventListener('change', async (event) => {
  if (!event.target.classList.contains('task-check')) return
  const item = event.target.closest('.task-item')
  try {
    await toggleComplete(item.dataset.subtaskId, event.target.checked)
    render()
  } catch (err) {
    state.error = err.message
    render()
  }
})

document.getElementById('app').addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-add]')
  if (!form) return
  event.preventDefault()
  const title = new FormData(form).get('title')?.toString().trim()
  if (!title) return
  try {
    if (form.dataset.add === 'task') {
      await addTask(form.dataset.projectId, title)
    } else {
      await addSubtask(form.dataset.taskId, title)
    }
    await load()
  } catch (err) {
    state.error = err.message
    render()
  }
})

document.getElementById('assign-days').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-day]')
  if (!btn) return
  const day = btn.dataset.day
  if (state.selectedDays.has(day)) state.selectedDays.delete(day)
  else state.selectedDays.add(day)
  paintAssignChips()
})

document.querySelector('[data-assign="clear"]').addEventListener('click', () => {
  state.selectedDays = new Set()
  paintAssignChips()
})

document.getElementById('assign-form').addEventListener('submit', async (event) => {
  const submitter = event.submitter
  if (submitter?.value !== 'save') {
    state.assigning = null
    return
  }
  event.preventDefault()
  try {
    await saveAssign()
    document.getElementById('assign-dialog').close()
    state.assigning = null
    await load()
  } catch (err) {
    state.error = err.message
    document.getElementById('assign-dialog').close()
    render()
  }
})

load()
