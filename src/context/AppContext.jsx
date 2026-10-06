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
/* Academics is one key holding three things, where every store above it is
   one key holding one. That is deliberate and it is the only place in this
   app where a record points at another record: an assignment names a course.
   Across two keys a cascading delete would be two writes, and `persist`
   swallows a failed one - so a course could vanish and leave its assignments
   behind, pointing at nothing. One key makes that impossible: the cascade is
   a single write that either lands or does not.
   Terms are not records. They are the distinct `term` strings on the courses,
   derived where they are needed; `activeTerm` is only which one the pages
   open on. */
const ACADEMICS_KEY = 'task-planner-academics'
const EMPTY_ACADEMICS = { activeTerm: '', courses: [], assignments: [] }
/* Pop-ups: the day's small things, outside any project. One key holding the
   two kinds - written for one day, and daily - so turning one into the other
   is a single write rather than a delete in one store and an add in another.
   See the note above `popupHorizon()` in utils.js for the shape. */
const POPUPS_KEY = 'task-planner-popups'
const EMPTY_POPUPS = { days: {}, daily: [] }
const readPopups = () => {
  const stored = readKey(POPUPS_KEY, EMPTY_POPUPS)
  const days = stored.days && typeof stored.days === 'object' && !Array.isArray(stored.days) ? stored.days : {}
  return { days, daily: Array.isArray(stored.daily) ? stored.daily : [] }
}

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
  const [academics, setAcademics] = useState(() => ({
    ...EMPTY_ACADEMICS,
    ...readKey(ACADEMICS_KEY, EMPTY_ACADEMICS),
  }))
  const [popups, setPopups] = useState(readPopups)
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
    [ACADEMICS_KEY]: academics,
    [POPUPS_KEY]: popups,
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

  // Reschedules scheduled work onto another day - later from the board's move
  // dialog, either way from Home's Today and Tomorrow. `subtaskIds` is null
  // when the task carries its own day. The day left behind is kept in
  // missedDays when `markMissed`, so the week still shows what slipped; the day
  // it lands on never is - work on a day is not missed on it, so moving it
  // back onto a day it slipped from takes that slip away.
  const unitOnDay = (item, toDate, markMissed) => {
    const kept = markMissed && item.day_date && item.day_date !== toDate
      ? [...new Set([...(item.missedDays || []), item.day_date])]
      : (item.missedDays || [])
    return { ...item, day_date: toDate, missedDays: kept.filter(d => d !== toDate) }
  }

  const moveScheduled = (taskId, subtaskIds, toDate, markMissed) => {
    const stamp = (item) => unitOnDay(item, toDate, markMissed)

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

  /* Moves one unit onto a day in another week than the one its project is
     filed under - in practice Sunday's work sent on to Monday, and back. Each
     week keeps its own projects, so changing the unit's day alone would put it
     on a day the other week's board never draws. It is filed the way Carry
     forward files a week's leftovers instead, one unit rather than a week's
     worth: into the same-named project in that week, made if it is not there
     yet (`carriedFrom` on it names the project it was made for).
     A subtask joins its own task there when it came from that week in the
     first place (the copy's `carriedFrom`), or the copy already made there for
     its task, or else a new copy naming the original in `carriedFrom` - so
     subtasks sent across one at a time gather in one task, and sent back they
     go home. A task left with no subtasks goes, and so does a project that a
     refile made and has now emptied, so there and back leaves no debris.
     Missed days as `moveScheduled` keeps them. One write. */
  const refileUnit = (taskId, subtaskId, toIso, markMissed = true) => {
    const all = current()
    const toWeek = toISODate(startOfWeek(fromISODate(toIso)))
    const src = all.find(p => (p.tasks || []).some(t => String(t.id) === String(taskId)))
    if (!src) return false
    if (src.week_start === toWeek) {
      moveScheduled(taskId, subtaskId == null ? null : [subtaskId], toIso, markMissed)
      return true
    }
    const task = src.tasks.find(t => String(t.id) === String(taskId))

    // The project's namesake in the destination week, or a new one carrying
    // the deadline over by the same number of weeks, as Carry forward does
    const weeks = weeksBetween(src.week_start, toWeek)
    const shift = (d) => (d ? toISODate(addDays(fromISODate(d), weeks * 7)) : null)
    const existing = all.find(p => p.week_start === toWeek && p.name === src.name)
    const target = existing
      ? { ...existing, tasks: [...(existing.tasks || [])] }
      : { id: generateId(), name: src.name, deadline: shift(src.deadline), week_start: toWeek, tasks: [], carriedFrom: src.id }

    let srcTasks
    if (subtaskId == null) {
      // A task that is its own unit travels whole
      srcTasks = src.tasks.filter(t => String(t.id) !== String(taskId))
      target.tasks.push({ ...unitOnDay(task, toIso, markMissed), project_id: target.id })
    } else {
      const sub = (task.subtasks || []).find(s => String(s.id) === String(subtaskId))
      if (!sub) return false
      const moved = unitOnDay(sub, toIso, markMissed)
      const left = task.subtasks.filter(s => String(s.id) !== String(subtaskId))
      srcTasks = left.length
        ? src.tasks.map(t => String(t.id) === String(taskId)
          ? { ...t, subtasks: left, day_date: earliestDay(left), completed: left.every(s => s.completed) }
          : t)
        : src.tasks.filter(t => String(t.id) !== String(taskId))

      const at = target.tasks.findIndex(t =>
        (task.carriedFrom != null && String(t.id) === String(task.carriedFrom))
        || (t.carriedFrom != null && String(t.carriedFrom) === String(taskId)))
      if (at === -1) {
        target.tasks.push({
          ...task,
          id: generateId(),
          project_id: target.id,
          carriedFrom: task.id,
          subtasks: [moved],
          day_date: toIso,
          completed: false,
          missedDays: [],
        })
      } else {
        const home = target.tasks[at]
        const subs = [...(home.subtasks || []), moved]
        target.tasks[at] = { ...home, subtasks: subs, day_date: earliestDay(subs), completed: subs.every(s => s.completed) }
      }
    }

    // A project a refile made, now with nothing left in it, goes with the last unit
    const emptied = !srcTasks.length && src.carriedFrom != null
    const next = all.flatMap(p => {
      if (p === src) return emptied ? [] : [{ ...src, tasks: srcTasks }]
      return [p === existing ? target : p]
    })
    save(existing ? next : [...next, target])
    return true
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

  /* ---- Academics ----
     One store, three lists, and the app's only foreign key: an assignment
     names a course. Everything here goes through `patchAcademics`, so a
     cascade is one write.

     Status is `todo | doing | submitted` and it is kept, not derived. Ticking
     the last box on a checklist means the work is done, which is not the same
     as having handed it in - so the last tick advances `todo` to `doing` and
     stops there. Submitting stays something you say. */
  const patchAcademics = (fn) =>
    setStore(ACADEMICS_KEY, setAcademics, (all) => {
      const base = { ...EMPTY_ACADEMICS, ...all }
      return { ...base, ...fn(base) }
    })

  const setActiveTerm = (term) => patchAcademics(() => ({ activeTerm: term || '' }))

  /* Adding a course moves the page to that course's term, which is the only
     behaviour that cannot lose it. The term selector is a filter, the terms
     are derived from the courses themselves, and their order is a guess off
     the string - so a course added to a term you are not looking at would
     otherwise be written, filtered out, and gone from the screen. */
  const addCourse = (entry = {}) => {
    const id = generateId()
    patchAcademics((a) => {
      const term = (entry.term || a.activeTerm || '').trim()
      return {
        activeTerm: term,
        courses: [...a.courses, {
          id,
          term,
          code: (entry.code || '').trim(),
          name: (entry.name || '').trim(),
          instructor: (entry.instructor || '').trim(),
          credits: entry.credits === '' || entry.credits == null ? null : Number(entry.credits),
          colour: entry.colour || 1,
          room: (entry.room || '').trim(),
          note: (entry.note || '').trim(),
        }],
      }
    })
    return id
  }

  const updateCourse = (id, patch) =>
    patchAcademics((a) => ({
      courses: a.courses.map((c) => String(c.id) === String(id) ? { ...c, ...patch } : c),
    }))

  // The cascade. Both lists change in the one write, so there is no window in
  // which the course is gone and its assignments are not
  const deleteCourse = (id) =>
    patchAcademics((a) => ({
      courses: a.courses.filter((c) => String(c.id) !== String(id)),
      assignments: a.assignments.filter((x) => String(x.courseId) !== String(id)),
    }))

  const addAssignment = (entry = {}) => {
    const id = generateId()
    patchAcademics((a) => ({
      assignments: [...a.assignments, {
        id,
        courseId: entry.courseId == null ? null : String(entry.courseId),
        title: (entry.title || '').trim(),
        type: entry.type || 'assignment',
        due: entry.due || null,
        dueTime: entry.dueTime || '',
        weight: entry.weight === '' || entry.weight == null ? null : Number(entry.weight),
        status: entry.status || 'todo',
        note: (entry.note || '').trim(),
        checklist: Array.isArray(entry.checklist) ? entry.checklist : [],
      }],
    }))
    return id
  }

  const updateAssignment = (id, patch) =>
    patchAcademics((a) => ({
      assignments: a.assignments.map((x) => String(x.id) === String(id) ? { ...x, ...patch } : x),
    }))

  const deleteAssignment = (id) =>
    patchAcademics((a) => ({
      assignments: a.assignments.filter((x) => String(x.id) !== String(id)),
    }))

  const addChecklistItem = (assignmentId, text) => {
    const id = generateId()
    patchAcademics((a) => ({
      assignments: a.assignments.map((x) => String(x.id) === String(assignmentId)
        ? { ...x, checklist: [...(x.checklist || []), { id, text: (text || '').trim(), done: false }] }
        : x),
    }))
    return id
  }

  // Ticking the last one moves a `todo` on to `doing` - see the note above on
  // why it stops there and never reaches `submitted`
  const toggleChecklistItem = (assignmentId, itemId, done) =>
    patchAcademics((a) => ({
      assignments: a.assignments.map((x) => {
        if (String(x.id) !== String(assignmentId)) return x
        const checklist = (x.checklist || []).map((i) =>
          String(i.id) === String(itemId) ? { ...i, done: !!done } : i)
        const anyDone = checklist.some((i) => i.done)
        const status = x.status === 'todo' && anyDone ? 'doing' : x.status
        return { ...x, checklist, status }
      }),
    }))

  const deleteChecklistItem = (assignmentId, itemId) =>
    patchAcademics((a) => ({
      assignments: a.assignments.map((x) => String(x.id) === String(assignmentId)
        ? { ...x, checklist: (x.checklist || []).filter((i) => String(i.id) !== String(itemId)) }
        : x),
    }))

  /* ---- Pop-ups ----
     The day's small things, outside any project. Everything goes through
     `patchPopups`, so turning a written pop-up into a daily - out of `days`,
     into `daily` - is one write. */
  const patchPopups = (fn) =>
    setStore(POPUPS_KEY, setPopups, (all) => {
      const base = { ...EMPTY_POPUPS, ...all }
      return { ...base, ...fn(base) }
    })

  const sameId = (a, b) => String(a) === String(b)
  const dayBefore = (iso) => toISODate(addDays(fromISODate(iso), -1))

  // Takes a pop-up out of one day's list; a day left with none drops its key,
  // so the store does not fill up with empty dates
  const withoutPopup = (days, iso, id) => {
    const next = { ...days }
    const left = (days[iso] || []).filter((p) => !sameId(p.id, id))
    if (left.length) next[iso] = left
    else delete next[iso]
    return next
  }

  // Lands at the end of the day's list, straight after `after` when given, or
  // first with `first` - the dailies are drawn above the written ones, so
  // Enter on a daily puts the new row directly under them
  const addPopup = (iso, text = '', { after = null, first = false } = {}) => {
    const id = generateId()
    patchPopups((s) => {
      const list = [...(s.days[iso] || [])]
      const at = after == null ? -1 : list.findIndex((p) => sameId(p.id, after))
      list.splice(first ? 0 : at === -1 ? list.length : at + 1, 0, { id, text, done: false })
      return { days: { ...s.days, [iso]: list } }
    })
    return id
  }

  const updatePopup = (iso, id, patch) =>
    patchPopups((s) => (s.days[iso]
      ? { days: { ...s.days, [iso]: s.days[iso].map((p) => sameId(p.id, id) ? { ...p, ...patch } : p) } }
      : {}))

  const deletePopup = (iso, id) => patchPopups((s) => ({ days: withoutPopup(s.days, iso, id) }))

  // Onto another day, at the end of that day's list
  const movePopup = (fromIso, id, toIso) =>
    patchPopups((s) => {
      const item = (s.days[fromIso] || []).find((p) => sameId(p.id, id))
      if (!item || fromIso === toIso) return {}
      const days = withoutPopup(s.days, fromIso, id)
      days[toIso] = [...(days[toIso] || []), item]
      return { days }
    })

  // Repeat switched on: a written pop-up becomes a daily from its own day on,
  // keeping its tick. A row whose repeat was switched off on this very day
  // (`fromDaily`, the daily it came out of, ending the day before) picks that
  // daily up again rather than starting a second one - so off and straight
  // back on leaves things exactly as they were
  const makeDaily = (iso, id) =>
    patchPopups((s) => {
      const item = (s.days[iso] || []).find((p) => sameId(p.id, id))
      if (!item) return {}
      const days = withoutPopup(s.days, iso, id)
      const prev = item.fromDaily == null
        ? null
        : s.daily.find((d) => sameId(d.id, item.fromDaily) && d.until === dayBefore(iso))
      if (prev) {
        return {
          days,
          daily: s.daily.map((d) => (d !== prev ? d : {
            ...d,
            // One record across every day: a rename made meanwhile carries
            text: item.text || '',
            until: null,
            done: item.done
              ? [...new Set([...(d.done || []), iso])].sort()
              : (d.done || []).filter((x) => x !== iso),
            skip: (d.skip || []).filter((x) => x !== iso),
          })),
        }
      }
      return {
        days,
        daily: [...s.daily, {
          id: item.id,
          text: item.text || '',
          from: iso,
          until: null,
          done: item.done ? [iso] : [],
          skip: [],
        }],
      }
    })

  // Repeat switched off on one day. A switch turns the repeat off - it does
  // not take the row away - so that day keeps it as a written pop-up, tick
  // and all, first of the written ones (the dailies are drawn above them, so
  // it stays where it was on screen). The daily ends the day before: earlier
  // days keep their ticks, and its later ticks and skips are left in place
  // for `makeDaily` to find if it is switched straight back on. A daily that
  // began on this day has nothing before it to keep, and goes.
  const stopRepeating = (iso, id) =>
    patchPopups((s) => {
      const d = s.daily.find((x) => sameId(x.id, id))
      if (!d) return {}
      const until = dayBefore(iso)
      const row = { id: generateId(), text: d.text || '', done: (d.done || []).includes(iso), fromDaily: d.id }
      return {
        days: { ...s.days, [iso]: [row, ...(s.days[iso] || [])] },
        daily: until < d.from
          ? s.daily.filter((x) => x !== d)
          : s.daily.map((x) => (x !== d ? x : { ...x, until: x.until && x.until < until ? x.until : until })),
      }
    })

  // The repeat switch on a row, as `popupsOn()` draws it: on for a written
  // one, off for a daily
  const toggleRepeat = (row) => (row.daily
    ? stopRepeating(row.iso, row.id)
    : makeDaily(row.iso, row.id))

  // `fn` returns the daily's replacement - an empty list removes it
  const patchDaily = (id, fn) =>
    patchPopups((s) => ({ daily: s.daily.flatMap((d) => (sameId(d.id, id) ? fn(d) : [d])) }))

  const toggleDaily = (id, iso, done) =>
    patchDaily(id, (d) => {
      const ticked = new Set(d.done || [])
      if (done) ticked.add(iso)
      else ticked.delete(iso)
      return [{ ...d, done: [...ticked].sort() }]
    })

  const renameDaily = (id, text) => patchDaily(id, (d) => [{ ...d, text }])

  // Just this day - the daily still stands on every other
  const skipDaily = (id, iso) =>
    patchDaily(id, (d) => [{
      ...d,
      skip: [...new Set([...(d.skip || []), iso])].sort(),
      done: (d.done || []).filter((x) => x !== iso),
    }])

  // This day and every one after it. The days before keep their ticks; a
  // daily stopped on its very first day is gone altogether
  const stopDaily = (id, iso) =>
    patchDaily(id, (d) => {
      const until = dayBefore(iso)
      if (until < d.from) return []
      const end = d.until && d.until < until ? d.until : until
      return [{
        ...d,
        until: end,
        done: (d.done || []).filter((x) => x <= end),
        skip: (d.skip || []).filter((x) => x <= end),
      }]
    })

  // A row as `popupsOn()` draws it, whichever kind it is
  const tickPopup = (row, done) => (row.daily
    ? toggleDaily(row.id, row.iso, done)
    : updatePopup(row.iso, row.id, { done }))

  const renamePopup = (row, text) => (row.daily
    ? renameDaily(row.id, text)
    : updatePopup(row.iso, row.id, { text }))

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
      deleteTask, toggleTask, reorderTasks, refileUnit,
      popups, addPopup, updatePopup, deletePopup, movePopup, makeDaily, stopRepeating, toggleRepeat,
      toggleDaily, renameDaily, skipDaily, stopDaily, tickPopup, renamePopup,
      profile, setProfileName,
      birthdays, addBirthday, updateBirthday, deleteBirthday,
      contacts, addContact, updateContact, deleteContact,
      months, addMonthGoal, updateMonthGoal, deleteMonthGoal, setMonthNote,
      years, setYearTheme, setYearMonthNote,
      countdowns, addCountdown, updateCountdown, deleteCountdown,
      academics, setActiveTerm,
      addCourse, updateCourse, deleteCourse,
      addAssignment, updateAssignment, deleteAssignment,
      addChecklistItem, toggleChecklistItem, deleteChecklistItem,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
