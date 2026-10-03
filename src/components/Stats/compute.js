import { toISODate, fromISODate, addDays, startOfWeek, MONTH_SHORT } from '../../utils'

/* ============================================================
   What the stats page counts, and what it refuses to.

   Everything here is derived. Nothing is stored, nothing is stamped as the
   plan is used — the page is a reading of the plan as it stands, so deleting
   a week deletes its history too. That is the honest trade for a planner that
   keeps no log.

   The one thing this costs us is *when* a box was ticked. There is no
   `completed_at` anywhere in the store, so "activity" cannot mean "the day
   you did it"; it means the day the work was *planned for*, and the heatmap
   says so in as many words. A unit finished three days late lands on the day
   it was due. That is a real limitation, not a rounding error, and it is why
   the legend reads "finished, on the day it was planned for".
   ============================================================ */

// Consecutive weeks at or above this clear a streak. Half of what you set
// yourself is a low bar on purpose: a streak that only survives perfection
// is a streak nobody keeps.
export const STREAK_AT = 50

// Every unit of work in the store, flattened, each still carrying where it
// came from. A "unit" is what the rest of the app counts — a subtask, or a
// task that was never broken into subtasks — so these totals and `rollUp()`'s
// can never drift apart. The walk keeps the week, the day and the slips,
// which a tally alone cannot.
function* units(projects) {
  for (const p of projects || []) {
    for (const t of p.tasks || []) {
      const subs = t.subtasks || []
      if (subs.length) {
        for (const s of subs) {
          yield {
            week: p.week_start,
            day: s.day_date || null,
            done: !!s.completed,
            missed: s.missedDays || [],
          }
        }
        continue
      }
      yield {
        week: p.week_start,
        day: t.day_date || null,
        done: !!t.completed,
        missed: t.missedDays || [],
      }
    }
  }
}

const pctOf = (done, total) => (total === 0 ? 0 : Math.round((done / total) * 100))

const prevWeek = (iso) => toISODate(addDays(fromISODate(iso), -7))

/* Consecutive weeks that cleared the bar, walking back from this one.

   Two rules carry the meaning. The week in progress can only extend a
   streak, never break one — it is Tuesday, not a verdict — so it is counted
   when it has already cleared and skipped over when it has not. And a week
   with nothing planned in it ends the run: the habit being counted is weekly,
   so a week you never opened is a week you missed, not a week to step over. */
function streakOf(byWeek, thisWeekIso) {
  let count = 0
  const current = byWeek.get(thisWeekIso)
  if (current && current.pct >= STREAK_AT) count++

  for (let iso = prevWeek(thisWeekIso); ; iso = prevWeek(iso)) {
    const week = byWeek.get(iso)
    if (!week || week.total === 0 || week.pct < STREAK_AT) return count
    count++
  }
}

/* One pass over the plan, every figure on the page falling out of it. */
export function buildStats(allProjects, weekMeta = {}, now = new Date()) {
  const byWeek = new Map()
  const byDate = new Map()
  const byWeekday = Array.from({ length: 7 }, (_, i) => ({ i, planned: 0, done: 0, pct: 0 }))

  let total = 0
  let done = 0
  let slipped = 0
  let unscheduled = 0

  for (const u of units(allProjects)) {
    total++
    if (u.done) done++
    slipped += u.missed.length

    if (u.week) {
      const week = byWeek.get(u.week) || { iso: u.week, total: 0, done: 0, pct: 0 }
      week.total++
      if (u.done) week.done++
      byWeek.set(u.week, week)
    }

    if (!u.day) {
      unscheduled++
      continue
    }

    const day = byDate.get(u.day) || { total: 0, done: 0 }
    day.total++
    if (u.done) day.done++
    byDate.set(u.day, day)

    // Mon = 0, to match every other weekday list in the app
    const wd = (fromISODate(u.day).getDay() + 6) % 7
    byWeekday[wd].planned++
    if (u.done) byWeekday[wd].done++
  }

  for (const week of byWeek.values()) week.pct = pctOf(week.done, week.total)
  for (const day of byWeekday) day.pct = pctOf(day.done, day.planned)

  const weeks = [...byWeek.values()].sort((a, b) => a.iso.localeCompare(b.iso))

  // The best week is the highest share cleared; a tie goes to the week that
  // had more in it, since clearing 100% of eight things beats 100% of one
  const best = weeks.reduce((top, w) => {
    if (w.total === 0) return top
    if (!top) return w
    if (w.pct !== top.pct) return w.pct > top.pct ? w : top
    return w.total > top.total ? w : top
  }, null)

  const thisWeekIso = toISODate(startOfWeek(now))

  return {
    total,
    done,
    pct: pctOf(done, total),
    slipped,
    unscheduled,
    weeks,
    byWeek,
    byDate,
    byWeekday,
    best,
    streak: streakOf(byWeek, thisWeekIso),
    weeksPlanned: weeks.filter((w) => w.total > 0).length,
    weeksEnded: Object.values(weekMeta).filter((m) => m?.ended).length,
    // The weekday chart is only worth drawing once there is more than one
    // week in it — a single week's seven days is just that week again
    hasWeekdayShape: weeks.length > 1 && byWeekday.some((d) => d.planned > 0),
  }
}

/* The last `span` weeks as the bar chart draws them: calendar weeks, not
   just the ones with work in them, so a fortnight you skipped reads as a gap
   rather than closing up as if it never happened. */
export function recentWeeks(byWeek, now = new Date(), span = 14) {
  const end = startOfWeek(now)
  const out = []
  for (let i = span - 1; i >= 0; i--) {
    const iso = toISODate(addDays(end, -7 * i))
    const week = byWeek.get(iso)
    out.push({
      iso,
      total: week?.total || 0,
      done: week?.done || 0,
      pct: week?.pct || 0,
      current: i === 0,
    })
  }
  return out
}

/* The heatmap's grid: one column per week, Monday at the top, ending with
   the week we are in. */
export function heatGrid(byDate, now = new Date(), span = 53) {
  const today = toISODate(now)
  const end = startOfWeek(now)
  const first = addDays(end, -7 * (span - 1))

  const columns = []
  for (let w = 0; w < span; w++) {
    const monday = addDays(first, w * 7)
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d)
      const iso = toISODate(date)
      const cell = byDate.get(iso)
      days.push({
        iso,
        date,
        total: cell?.total || 0,
        done: cell?.done || 0,
        // A day that has not happened is not a day you got nothing done on
        future: iso > today,
        today: iso === today,
      })
    }
    columns.push({ iso: toISODate(monday), days, month: monday.getMonth(), label: '' })
  }

  /* A month is named at the first column that falls inside it — but only if
     it has room to be read. A label is three letters over an 11px column, so
     it overhangs the two columns after it; a month holding fewer than three
     columns would have the next month's name printed straight through its
     own. That is almost always the half month at the far left, which is the
     one nobody is reading anyway, so it loses the label rather than the
     full month beside it. */
  const starts = columns.reduce((out, c, i) => {
    if (i === 0 || c.month !== columns[i - 1].month) out.push(i)
    return out
  }, [])

  starts.forEach((at, i) => {
    const next = starts[i + 1]
    if (next === undefined || next - at >= 3) columns[at].label = MONTH_SHORT[columns[at].month]
  })

  return columns
}

/* How dark a heatmap cell is drawn, 0–4.

   The scale stretches to the busiest day rather than to fixed counts, since
   four finished things is a quiet week for one person and a full one for
   another — but it never divides by less than four, so a day with a single
   tick cannot colour itself in as a personal best. */
export function heatLevel(doneCount, peak) {
  if (doneCount <= 0) return 0
  return Math.min(4, Math.ceil((doneCount / Math.max(4, peak)) * 4))
}

export function heatPeak(byDate) {
  let peak = 0
  for (const cell of byDate.values()) if (cell.done > peak) peak = cell.done
  return peak
}
