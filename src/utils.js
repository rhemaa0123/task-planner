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

const ordinal = (n) => {
  // 11th/12th/13th break the last-digit rule
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
}

// "2026-08-10" -> "Aug 10th '26"
export function formatDeadline(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return ''
  const month = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short' })
  return `${month} ${d}${ordinal(d)} '${String(y).slice(-2)}`
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
    name: DAY_NAMES[i],
    date: toISODate(addDays(start, i)),
  }))
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
          subtasks: [],
        })),
      })),
    },
    null,
    2,
  )
}

// A task carrying subtasks keeps its schedule on them, so those are read as
// tasks of their own - this app has no subtask level to put them in
const readTasks = (rawTasks) => {
  const out = []
  for (const t of Array.isArray(rawTasks) ? rawTasks : []) {
    if (!t || typeof t !== 'object') continue
    const name = typeof t.name === 'string' ? t.name : ''
    const ownDay = dayIndex(t.assignedDay)
    const subs = Array.isArray(t.subtasks) ? t.subtasks : []

    if (subs.length === 0) {
      out.push({ title: name, dayOffset: ownDay, completed: !!t.isDone })
      continue
    }

    if (name) out.push({ title: name, dayOffset: ownDay, completed: !!t.isDone })
    for (const s of subs) {
      if (!s || typeof s !== 'object') continue
      const label =
        typeof s.description === 'string' ? s.description
        : typeof s.name === 'string' ? s.name
        : ''
      out.push({
        title: label,
        dayOffset: dayIndex(s.assignedDay) ?? ownDay,
        completed: !!s.isDone,
      })
    }
  }
  return out
}

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

  return plan.projects.map((p) => ({
    name: p.name,
    deadline: p.deadline ? toISODate(addDays(fromISODate(p.deadline), weeks * 7)) : null,
    tasks: p.tasks.map((t) => ({
      title: t.title,
      day_date: t.dayOffset === null ? null : toISODate(addDays(target, t.dayOffset)),
      completed: t.completed,
    })),
  }))
}

