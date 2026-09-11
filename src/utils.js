export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Local calendar date — toISOString() would shift a day in UTC-negative zones,
// which must match the YYYY-MM-DD values coming from <input type="date">
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

export function formatWeekRange(startDate) {
  const end = addDays(startDate, 6)
  const format = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${format(startDate)} - ${format(end)}`
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function weekLabel(startDate) {
  const current = startOfWeek()
  const target = startOfWeek(startDate)
  // rounded because a DST boundary makes the span an hour short or long
  const weeks = Math.round((target - current) / WEEK_MS)

  if (weeks === 0) return 'This week'
  if (weeks === -1) return 'Last week'
  if (weeks === 1) return 'Next week'
  if (weeks < 0) return `${-weeks} weeks ago`
  return `In ${weeks} weeks`
}

// The line under the progress bar. Mon and Sun have their own words; the days
// between count down to Sunday, today included. Read off the device's clock,
// so it turns over at local midnight. Other weeks say where they stand.
const DAY_MS = 24 * 60 * 60 * 1000
const COUNTDOWN_WORDS = [
  'Week starts! - Start fresh',
  'be calm and clear',
  'keep going',
  'stay strong',
  'thrusting all the way',
  'step on the gas pedal!!',
  'Last but not least - Sabbath btw...',
]
export function weekCountdown(weekStart, now = new Date()) {
  const start = startOfWeek(weekStart)
  const weeks = Math.round((start - startOfWeek(now)) / WEEK_MS)
  if (weeks > 0) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const days = Math.round((start - today) / DAY_MS)
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`
  }
  if (weeks < 0) return 'Week over - not ended yet'

  const i = (now.getDay() + 6) % 7 // Mon = 0 … Sun = 6
  if (i === 0 || i === 6) return COUNTDOWN_WORDS[i]
  return `${7 - i} days left - ${COUNTDOWN_WORDS[i]}`
}

// "2026-09-09" -> "Wed, Sep 09" - weekday first, so a deadline reads as a day
// you can picture rather than a number to look up
export function formatDeadline(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return ''
  const date = new Date(y, m - 1, d)
  const wd = date.toLocaleDateString('en-US', { weekday: 'short' })
  const mo = date.toLocaleDateString('en-US', { month: 'short' })
  return `${wd}, ${mo} ${String(d).padStart(2, '0')}`
}

// "2026-09-07" -> "Sep 07 – Sep 13", the shape the weeks list uses
export function formatWeekTitle(weekStartIso) {
  const start = fromISODate(weekStartIso)
  const end = addDays(start, 6)
  const f = (dt) =>
    `${dt.toLocaleDateString('en-US', { month: 'short' })} ${String(dt.getDate()).padStart(2, '0')}`
  return `${f(start)} – ${f(end)}`
}

// "2026-09-06" -> "Sep 06"
export function formatShortDate(iso) {
  if (!iso) return ''
  const dt = fromISODate(iso)
  return `${dt.toLocaleDateString('en-US', { month: 'short' })} ${String(dt.getDate()).padStart(2, '0')}`
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Capital initials, Mon-first. Tue/Thu and Sat/Sun share a letter by convention.
export const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// The seven dates of a given week, each tagged with its initial and full name
export function weekDayList(weekStartIso) {
  const start = fromISODate(weekStartIso)
  return DAY_INITIALS.map((initial, i) => ({
    i,
    initial,
    short: WEEKDAYS[i],
    name: DAY_NAMES[i],
    date: toISODate(addDays(start, i)),
  }))
}

/* ---- Progress ---- */

// A task with subtasks is as done as its subtasks are; one without is a single
// unit. Every unit weighs the same.
export function taskProgress(task) {
  const subs = task?.subtasks || []
  if (!subs.length) return { done: task?.completed ? 1 : 0, total: 1 }
  return { done: subs.filter((s) => s.completed).length, total: subs.length }
}

// The row badge: "2/4" subtasks
export function subtaskTally(task) {
  const subs = task?.subtasks || []
  return { done: subs.filter((s) => s.completed).length, total: subs.length }
}

export function rollUp(tasks) {
  let done = 0
  let total = 0
  for (const t of tasks || []) {
    const p = taskProgress(t)
    done += p.done
    total += p.total
  }
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

// Units of work per weekday for one week's projects - a subtask lands on its own
// day, a task with no subtasks on its day_date, and unscheduled work on none
export function dayLoad(weekStartIso, projects) {
  const days = weekDayList(weekStartIso).map((d) => ({ ...d, total: 0, done: 0 }))
  const byDate = new Map(days.map((d) => [d.date, d]))
  const bump = (iso, completed) => {
    const slot = byDate.get(iso)
    if (!slot) return
    slot.total++
    if (completed) slot.done++
  }
  for (const p of projects || []) {
    for (const t of p.tasks || []) {
      const subs = t.subtasks || []
      if (subs.length) subs.forEach((s) => bump(s.day_date, s.completed))
      else bump(t.day_date, t.completed)
    }
  }
  return days
}

// Earliest scheduled day, so a task's own day_date keeps following its subtasks
export function earliestDay(subtasks) {
  const days = (subtasks || []).map((s) => s.day_date).filter(Boolean).sort()
  return days[0] ?? null
}

/* ---- Plan codes (copy / paste a week's plan) ---- */

const PLAN_FORMAT = 'taskplanner.week.v1'
const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Parses a YYYY-MM-DD as local midnight; `new Date(iso)` alone reads as UTC and
// lands on the previous day west of Greenwich
export function fromISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

const dayIndex = (code) => {
  const i = DAY_CODES.indexOf(String(code || '').toLowerCase())
  return i === -1 ? null : i
}

// The schedule travels as a weekday name, not a date, so a Tuesday task lands
// on Tuesday whichever week it is pasted into
const dayCodeFor = (iso, weekStart) => {
  if (!iso) return null
  const offset = Math.round((fromISODate(iso) - weekStart) / 86400000)
  return offset >= 0 && offset <= 6 ? DAY_CODES[offset] : null
}

export function encodePlan(weekStartIso, projects) {
  const start = fromISODate(weekStartIso)
  return JSON.stringify(
    {
      format: PLAN_FORMAT,
      weekStart: weekStartIso,
      projects: projects.map((p) => ({
        id: p.id ? String(p.id) : newId(),
        name: p.name || '',
        deadline: p.deadline || null,
        tasks: (p.tasks || []).map((t) => ({
          id: t.id ? String(t.id) : newId(),
          name: t.title || '',
          isDone: !!t.completed,
          assignedDay: dayCodeFor(t.day_date, start),
          note: t.note || '',
          subtasks: (t.subtasks || []).map((s) => ({
            id: s.id ? String(s.id) : newId(),
            description: s.title || '',
            isDone: !!s.completed,
            assignedDay: dayCodeFor(s.day_date, start),
          })),
        })),
      })),
    },
    null,
    2,
  )
}

// Subtasks stay nested. Each carries its own weekday, so a task spread over
// Mon/Wed/Fri lands on Mon/Wed/Fri of whichever week it is pasted into. A
// subtask with no day of its own falls back to the task's.
const readTasks = (rawTasks) =>
  (Array.isArray(rawTasks) ? rawTasks : [])
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const ownDay = dayIndex(t.assignedDay)
      return {
        title: typeof t.name === 'string' ? t.name : '',
        dayOffset: ownDay,
        completed: !!t.isDone,
        note: typeof t.note === 'string' ? t.note : '',
        subtasks: (Array.isArray(t.subtasks) ? t.subtasks : [])
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({
            title:
              typeof s.description === 'string' ? s.description
              : typeof s.name === 'string' ? s.name
              : '',
            dayOffset: dayIndex(s.assignedDay) ?? ownDay,
            completed: !!s.isDone,
          })),
      }
    })

export function decodePlan(code) {
  const text = String(code || '').trim()
  if (!text) return null

  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  if (!data || typeof data !== 'object') return null
  if (!String(data.format || '').startsWith('taskplanner.week.')) return null
  if (!ISO_DATE.test(String(data.weekStart))) return null
  if (!Array.isArray(data.projects)) return null

  const projects = data.projects
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      name: typeof p.name === 'string' ? p.name : '',
      deadline: ISO_DATE.test(String(p.deadline)) ? p.deadline : null,
      tasks: readTasks(p.tasks),
    }))

  return {
    weekStart: data.weekStart,
    projects,
    projectCount: projects.length,
    taskCount: projects.reduce((n, p) => n + p.tasks.length, 0),
  }
}

// Re-anchors a decoded plan onto a target week: task days follow the week, and
// deadlines shift by the same number of weeks so they keep their lead time
export function materializePlan(plan, targetWeekIso) {
  const target = fromISODate(targetWeekIso)
  const weeks = Math.round((target - fromISODate(plan.weekStart)) / WEEK_MS)

  const dateAt = (offset) => (offset === null || offset === undefined ? null : toISODate(addDays(target, offset)))

  return plan.projects.map((p) => ({
    name: p.name,
    deadline: p.deadline ? toISODate(addDays(fromISODate(p.deadline), weeks * 7)) : null,
    tasks: p.tasks.map((t) => {
      const subtasks = t.subtasks.map((s) => ({
        title: s.title,
        day_date: dateAt(s.dayOffset),
        completed: s.completed,
      }))
      return {
        title: t.title,
        note: t.note,
        // Subtasks own the schedule once there are any
        day_date: earliestDay(subtasks) ?? dateAt(t.dayOffset),
        completed: t.completed,
        subtasks,
      }
    }),
  }))
}

