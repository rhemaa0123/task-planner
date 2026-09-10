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

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

