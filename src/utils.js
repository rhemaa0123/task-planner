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

export function weekLabel(startDate) {
  const now = new Date()
  const todayIso = toISODate(now)
  const startIso = toISODate(startDate)
  const endIso = toISODate(addDays(startDate, 6))

  if (todayIso >= startIso && todayIso <= endIso) return 'This week'

  const lastWeek = addDays(now, -7)
  const lastWeekStart = toISODate(new Date(lastWeek.setDate(lastWeek.getDate() - lastWeek.getDay() + 1)))
  if (startIso === lastWeekStart) return 'Last week'

  const nextWeek = addDays(now, 7)
  const nextWeekStart = toISODate(new Date(nextWeek.setDate(nextWeek.getDate() - nextWeek.getDay() + 1)))
  if (startIso === nextWeekStart) return 'Next week'

  return ''
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

