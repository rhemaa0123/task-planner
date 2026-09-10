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

/* ---- Plan codes (copy / paste a week's plan) ---- */

const PLAN_PREFIX = 'PLAN1.'

// Parses a YYYY-MM-DD as local midnight; `new Date(iso)` alone reads as UTC and
// lands on the previous day west of Greenwich
export function fromISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const toB64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)))
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))

// Day-of-week is stored as an offset from the source week, not an absolute date,
// so a Tuesday task lands on Tuesday whichever week it is pasted into
export function encodePlan(weekStartIso, projects) {
  const start = fromISODate(weekStartIso)
  const payload = {
    v: 1,
    w: weekStartIso,
    p: projects.map((p) => ({
      n: p.name || '',
      d: p.deadline || null,
      t: (p.tasks || []).map((t) => ({
        n: t.title || '',
        o: t.day_date ? Math.round((fromISODate(t.day_date) - start) / 86400000) : null,
        c: t.completed ? 1 : 0,
      })),
    })),
  }
  return PLAN_PREFIX + toB64(JSON.stringify(payload))
}

export function decodePlan(code) {
  const trimmed = String(code || '').trim()
  if (!trimmed.startsWith(PLAN_PREFIX)) return null
  let payload
  try {
    payload = JSON.parse(fromB64(trimmed.slice(PLAN_PREFIX.length)))
  } catch {
    return null
  }
  if (!payload || payload.v !== 1 || !Array.isArray(payload.p) || !payload.w) return null

  const projects = payload.p.map((p) => ({
    name: typeof p.n === 'string' ? p.n : '',
    deadline: p.d || null,
    tasks: Array.isArray(p.t)
      ? p.t.map((t) => ({
          title: typeof t.n === 'string' ? t.n : '',
          dayOffset: Number.isInteger(t.o) ? t.o : null,
          completed: !!t.c,
        }))
      : [],
  }))

  return {
    weekStart: payload.w,
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

