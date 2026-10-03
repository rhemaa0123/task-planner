import React, { createContext, useContext, useState, useRef } from 'react'
import { startOfWeek, toISODate, addDays, fromISODate, earliestDay, weeksBetween, sinkCompleted } from '../utils'

const AppContext = createContext(null)

const STORE_KEY = 'task-planner-guest'
const WEEKS_KEY = 'task-planner-weeks'
// The pages that are not the weekly plan each own one key. They are separate
// stores on purpose: a birthday list and a year's themes have nothing to say
// to the week's projects, and keeping them apart means a plan written before
// any of this existed still reads back whole.
const PROFILE_KEY = 'task-planner-profile'
const BIRTHDAYS_KEY = 'task-planner-birthdays'
const CONTACTS_KEY = 'task-planner-contacts'
const MONTHS_KEY = 'task-planner-months'
const YEARS_KEY = 'task-planner-years'
const COUNTDOWNS_KEY = 'task-planner-countdowns'

// Reads one of those keys, falling back to `empty` on anything unexpected -
// a missing key, a half-written value, a browser refusing to hand it over
const readKey = (key, empty) => {
  try {
    const stored = JSON.parse(localStorage.getItem(key))
    if (stored == null) return empty
    if (Array.isArray(empty)) return Array.isArray(stored) ? stored : empty
    return typeof stored === 'object' && !Array.isArray(stored) ? stored : empty
  } catch {
    return empty
  }
}

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
  // The plan as last written, readable in the same tick as the write. Every
  // mutation builds on this rather than on the rendered state, so two calls
  // back to back - rename a project, then add a task under it - see each
  // other instead of the state from before both.
  const latest = useRef(allProjects)
  const [weekMeta, setWeekMeta] = useState(readWeekMeta)
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const [profile, setProfile] = useState(() => readKey(PROFILE_KEY, { name: '' }))
  const [birthdays, setBirthdays] = useState(() => readKey(BIRTHDAYS_KEY, []))
  const [contacts, setContacts] = useState(() => readKey(CONTACTS_KEY, []))
  const [months, setMonths] = useState(() => readKey(MONTHS_KEY, {}))
  const [years, setYears] = useState(() => readKey(YEARS_KEY, {}))
  const [countdowns, setCountdowns] = useState(() => readKey(COUNTDOWNS_KEY, []))
  // The same trick `latest` plays for the plan, once per store: a mutation
  // reads the value as last written rather than as last rendered, so Enter on
  // a goal (save it, then add the next one) sees its own first write.
  const sideRefs = useRef({
    [PROFILE_KEY]: profile,
    [BIRTHDAYS_KEY]: birthdays,
    [CONTACTS_KEY]: contacts,
    [MONTHS_KEY]: months,
    [YEARS_KEY]: years,
    [COUNTDOWNS_KEY]: countdowns,
  })
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
    latest.current = next
    setAllProjects(next)
    persist(STORE_KEY, next)
  }
  const current = () => latest.current

  const saveMeta = (next) => {
    setWeekMeta(next)
    persist(WEEKS_KEY, next)
  }

  // Mutations
  const addProject = (name = '') => {
    const id = generateId()
    save([...current(), { id, name: name.trim(), week_start: weekStartIso, tasks: [] }])
    return id
  }

  const updateProjectName = (projectId, name) => {
    save(current().map(p => String(p.id) === String(projectId) ? { ...p, name } : p))
  }

  const deleteProject = (projectId) => {
    save(current().filter(p => String(p.id) !== String(projectId)))
  }

  const setProjectDeadline = (projectId, deadline) => {
    save(current().map(p => String(p.id) === String(projectId) ? { ...p, deadline } : p))
  }

  // Lands at the end of the project's list, or straight after `after` when
  // given - Enter on a task row puts the new one under it, not at the bottom
  const addTask = (projectId, title = '', dayDate = null, { after = null } = {}) => {
    const id = generateId()
    const task = { id, project_id: projectId, title, day_date: dayDate, completed: false, subtasks: [] }
    save(current().map(p => {
      if (String(p.id) !== String(projectId)) return p
      const tasks = [...(p.tasks || [])]
      const at = after == null ? -1 : tasks.findIndex(t => String(t.id) === String(after))
      tasks.splice(at === -1 ? tasks.length : at + 1, 0, task)
      return { ...p, tasks }
    }))
    return id
  }

  // Rewrites one task wherever it lives, leaving every other project untouched
  const patchTask = (taskId, fn) => {
    save(current().map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => String(t.id) === String(taskId) ? fn(t) : t),
    })))
  }

  const updateTaskTitle = (taskId, title) => patchTask(taskId, t => ({ ...t, title }))

  const setTaskDay = (taskId, dayDate) => patchTask(taskId, t => ({ ...t, day_date: dayDate }))

  const deleteTask = (taskId) => {
    save(current().map(p => ({
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
  // note, and the subtasks spread across weekdays.
  // The task's own day_date follows the earliest subtask so the week grid
  // still places it.
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

    save([...current(), ...built])
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

    const all = current()
    const thisWeek = all.filter(p => p.week_start === iso)
    const nextWeek = all.filter(p => p.week_start === nextIso)
    const others = all.filter(p => p.week_start !== iso && p.week_start !== nextIso)

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

  // Cut and paste for a whole week: every project in `fromIso` lands in
  // `toIso` with its deadline and every task's, subtask's and missed day
  // shifted by the same number of weeks, so Tuesday's work is still on
  // Tuesday and nothing else about it changes. Work already planned in the
  // destination stays put; the moved projects join the list below it.
  const moveWeek = (fromIso, toIso) => {
    const weeks = weeksBetween(fromIso, toIso)
    if (!weeks) return 0
    const shift = (d) => (d ? toISODate(addDays(fromISODate(d), weeks * 7)) : d)
    const shiftAll = (days) => (days || []).map(shift)

    const all = current()
    const moved = all
      .filter(p => p.week_start === fromIso)
      .map(p => ({
        ...p,
        week_start: toIso,
        deadline: shift(p.deadline),
        tasks: (p.tasks || []).map(t => ({
          ...t,
          day_date: shift(t.day_date),
          deadline: shift(t.deadline),
          missedDays: shiftAll(t.missedDays),
          subtasks: (t.subtasks || []).map(s => ({
            ...s,
            day_date: shift(s.day_date),
            missedDays: shiftAll(s.missedDays),
          })),
        })),
      }))
    if (!moved.length) return 0

    save([...all.filter(p => p.week_start !== fromIso), ...moved])
    return moved.length
  }

  // Removes a week's plan outright, along with its ended flag
  const deleteWeek = (iso) => {
    save(current().filter(p => p.week_start !== iso))
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

  // Indices are positions in the list as the sidebar draws it, which sinks
  // finished tasks to the bottom - so the drag is applied to that order and
  // that order is what is stored, and a row dropped among its own kind lands
  // exactly where it was aimed. Crossing the line between the open work and
  // the finished is the one thing a drag cannot do: an open row dragged in
  // among the done settles at the foot of the open ones, since that is as far
  // down as the list will draw it.
  const reorderTasks = (projectId, fromIndex, toIndex) => {
    save(current().map(p => {
      if (String(p.id) !== String(projectId)) return p
      const tasks = sinkCompleted(p.tasks)
      const [moved] = tasks.splice(fromIndex, 1)
      tasks.splice(toIndex, 0, moved)
      return { ...p, tasks }
    }))
  }

  /* ---- The other pages ----
     Birthdays, contacts and the month / year notes never touch the plan, so
     they are written through their own small path: `setStore` mirrors the
     value into `sideRefs` (read back in the same tick), pushes it to React,
     and persists it, exactly as `save()` does for projects. */

  const setStore = (key, setter, next) => {
    const value = typeof next === 'function' ? next(sideRefs.current[key]) : next
    sideRefs.current[key] = value
    setter(value)
    persist(key, value)
  }

  // The name in the sidebar's title box - the one thing the app knows about
  // whoever is using it
  const setProfileName = (name) =>
    setStore(PROFILE_KEY, setProfile, (p) => ({ ...p, name }))

  /* Birthdays. Stored as calendar parts, never an ISO date: the year is
     optional, and a placeholder year inside a date string is a lie the
     countdown would have to work around. Nothing about a row changes when the
     day comes round - `nextBirthday()` recomputes the countdown from the
     clock, so the ring "resets" by arithmetic rather than by a write. */
  const addBirthday = (entry) => {
    const id = generateId()
    setStore(BIRTHDAYS_KEY, setBirthdays, (list) => [...list, {
      id,
      name: (entry.name || '').trim(),
      month: Number(entry.month) || null,
      day: Number(entry.day) || null,
      year: entry.year ? Number(entry.year) : null,
      note: entry.note || '',
    }])
    return id
  }

  const updateBirthday = (id, patch) =>
    setStore(BIRTHDAYS_KEY, setBirthdays, (list) =>
      list.map((b) => String(b.id) === String(id) ? { ...b, ...patch } : b))

  const deleteBirthday = (id) =>
    setStore(BIRTHDAYS_KEY, setBirthdays, (list) => list.filter((b) => String(b.id) !== String(id)))

  /* Contacts. `from` is the general field that stands in for an employer:
     where someone works, where they study, or simply where you met them. */
  const addContact = (entry = {}) => {
    const id = generateId()
    setStore(CONTACTS_KEY, setContacts, (list) => [...list, {
      id,
      name: (entry.name || '').trim(),
      email: (entry.email || '').trim(),
      phone: (entry.phone || '').trim(),
      from: (entry.from || '').trim(),
      note: entry.note || '',
      added: toISODate(new Date()),
    }])
    return id
  }

  const updateContact = (id, patch) =>
    setStore(CONTACTS_KEY, setContacts, (list) =>
      list.map((c) => String(c.id) === String(id) ? { ...c, ...patch } : c))

  const deleteContact = (id) =>
    setStore(CONTACTS_KEY, setContacts, (list) => list.filter((c) => String(c.id) !== String(id)))

  /* One month's intentions, keyed "YYYY-MM". Goals here are not tasks: they
     are never scheduled, never roll up into a week's progress, and nothing in
     the weekly plan reads them. They are what you look at while planning a
     week, which is the only link between the two pages. */
  const patchMonth = (key, fn) =>
    setStore(MONTHS_KEY, setMonths, (all) => {
      const month = all[key] || { goals: [], note: '' }
      return { ...all, [key]: fn(month) }
    })

  const addMonthGoal = (key, text = '', { after = null } = {}) => {
    const id = generateId()
    patchMonth(key, (m) => {
      const goals = [...(m.goals || [])]
      const at = after == null ? -1 : goals.findIndex((g) => String(g.id) === String(after))
      goals.splice(at === -1 ? goals.length : at + 1, 0, { id, text, done: false })
      return { ...m, goals }
    })
    return id
  }

  const updateMonthGoal = (key, id, patch) =>
    patchMonth(key, (m) => ({
      ...m,
      goals: (m.goals || []).map((g) => String(g.id) === String(id) ? { ...g, ...patch } : g),
    }))

  const deleteMonthGoal = (key, id) =>
    patchMonth(key, (m) => ({ ...m, goals: (m.goals || []).filter((g) => String(g.id) !== String(id)) }))

  const setMonthNote = (key, note) => patchMonth(key, (m) => ({ ...m, note }))

  /* Countdowns. A name and a day you are waiting for, stored as an ISO date
     because it happens once - the mirror image of a birthday, which is kept
     as calendar parts precisely because it comes round again. Nothing here
     expires on its own either: the day passes, the row says so, and removing
     it stays a decision rather than a cleanup. */
  const addCountdown = (entry = {}) => {
    const id = generateId()
    setStore(COUNTDOWNS_KEY, setCountdowns, (list) => [...list, {
      id,
      name: (entry.name || '').trim(),
      date: entry.date || null,
    }])
    return id
  }

  const updateCountdown = (id, patch) =>
    setStore(COUNTDOWNS_KEY, setCountdowns, (list) =>
      list.map((c) => String(c.id) === String(id) ? { ...c, ...patch } : c))

  const deleteCountdown = (id) =>
    setStore(COUNTDOWNS_KEY, setCountdowns, (list) => list.filter((c) => String(c.id) !== String(id)))

  /* One year, keyed by the number. A theme for the whole year and a line of
     intent per month - the coarsest layer, read when a month is being set up. */
  const patchYear = (year, fn) =>
    setStore(YEARS_KEY, setYears, (all) => {
      const key = String(year)
      return { ...all, [key]: fn(all[key] || { theme: '', months: {} }) }
    })

  const setYearTheme = (year, theme) => patchYear(year, (y) => ({ ...y, theme }))

  const setYearMonthNote = (year, month, text) =>
    patchYear(year, (y) => ({ ...y, months: { ...(y.months || {}), [month]: text } }))

  const reorderProjects = (fromIndex, toIndex) => {
    // Indices come from the visible week, so reorder that slice and lay it back
    // into the week's slots, leaving other weeks untouched
    const all = current()
    const weekOrder = all.filter(p => p.week_start === weekStartIso)
    const [moved] = weekOrder.splice(fromIndex, 1)
    weekOrder.splice(toIndex, 0, moved)

    let slot = 0
    save(all.map(p => p.week_start === weekStartIso ? weekOrder[slot++] : p))
  }

  return (
    <AppContext.Provider value={{
      projects, allProjects, weekStart, setWeekStart, toasts, showToast,
      weekMeta, weekEnded, endWeek, reopenWeek, carryForward, moveWeek, deleteWeek, clearAll,
      addProject, updateProjectName, deleteProject, setProjectDeadline, reorderProjects, importPlan,
      addTask, updateTaskTitle, setTaskDay, setTaskSchedule, toggleSubtask, moveScheduled, clearMissedDay,
      deleteTask, toggleTask, reorderTasks,
      profile, setProfileName,
      birthdays, addBirthday, updateBirthday, deleteBirthday,
      contacts, addContact, updateContact, deleteContact,
      months, addMonthGoal, updateMonthGoal, deleteMonthGoal, setMonthNote,
      years, setYearTheme, setYearMonthNote,
      countdowns, addCountdown, updateCountdown, deleteCountdown,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
