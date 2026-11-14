/* ============================================================
   Two planners side by side: this device's and the account's. Each is
   `{ projects, stores: { [name]: value } }`.

   - `hasContent()` decides whether a side holds anything worth asking about.
   - `summarize()` is what the merge dialog prints for each side.
   - `combine()` is the dialog's "Combine both".

   Combining joins records by `id`. A record on both sides is the same record
   edited in two places, and the account's copy wins - it is the one every
   other device already agrees with. Nothing is ever dropped: anything only
   one side has is kept.
   ============================================================ */

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (isObj(v) ? v : {})

// Nothing in it: no rows, no words, no flags
const blank = (v) => {
  if (v == null) return true
  if (Array.isArray(v)) return v.every(blank)
  if (isObj(v)) return Object.values(v).every(blank)
  if (typeof v === 'string') return v.trim() === ''
  return false
}

/* The name in the sidebar is not counted - a device where only a name was
   typed has nothing that needs a dialog. Nor is academics' `activeTerm`,
   which is only which term the page opens on. */
export const hasContent = ({ projects, stores }) => {
  if (list(projects).length) return true
  return Object.entries(stores || {}).some(([name, value]) => {
    if (name === 'profile') return false
    if (name === 'academics') return !blank({ c: value?.courses, a: value?.assignments })
    return !blank(value)
  })
}

const byId = (account, device) => {
  const a = list(account)
  const seen = new Set(a.map((r) => String(r?.id)))
  return [...a, ...list(device).filter((r) => !seen.has(String(r?.id)))]
}

// Keys from both; where both have a key, `both` decides
const byKey = (account, device, both) => {
  const a = obj(account)
  const d = obj(device)
  const out = { ...d, ...a }
  for (const k of Object.keys(a)) if (k in d) out[k] = both(a[k], d[k])
  return out
}

const words = (a, d) => (typeof a === 'string' && a.trim() ? a : d ?? a)

export function combine(account, device) {
  const A = account.stores || {}
  const D = device.stores || {}
  return {
    projects: byId(account.projects, device.projects),
    stores: {
      'weeks-meta': { ...obj(D['weeks-meta']), ...obj(A['weeks-meta']) },
      profile: { ...obj(D.profile), ...obj(A.profile), name: words(A.profile?.name, D.profile?.name) || '' },
      birthdays: byId(A.birthdays, D.birthdays),
      contacts: byId(A.contacts, D.contacts),
      countdowns: byId(A.countdowns, D.countdowns),
      months: byKey(A.months, D.months, (a, d) => ({
        ...obj(d),
        ...obj(a),
        focus: byId(a?.focus, d?.focus),
        notes: words(a?.notes, d?.notes) ?? '',
      })),
      years: byKey(A.years, D.years, (a, d) => ({
        ...obj(d),
        ...obj(a),
        categories: byKey(a?.categories, d?.categories, byId),
      })),
      popups: {
        days: byKey(A.popups?.days, D.popups?.days, byId),
        daily: byId(A.popups?.daily, D.popups?.daily),
      },
      academics: {
        ...obj(D.academics),
        ...obj(A.academics),
        activeTerm: A.academics?.activeTerm || D.academics?.activeTerm || '',
        courses: byId(A.academics?.courses, D.academics?.courses),
        assignments: byId(A.academics?.assignments, D.academics?.assignments),
      },
    },
  }
}

const count = (n, one, many = `${one}s`) => (n > 0 ? `${n} ${n === 1 ? one : many}` : null)

export function summarize({ projects, stores }) {
  const p = list(projects)
  const s = stores || {}
  const weeks = new Set(p.map((x) => x.week_start)).size
  const tasks = p.reduce((n, x) => n + list(x.tasks).length, 0)
  const popups = Object.values(obj(s.popups?.days)).reduce((n, l) => n + list(l).length, 0)
    + list(s.popups?.daily).length
  const focus = Object.values(obj(s.months)).reduce((n, m) => n + list(m?.focus).length, 0)
  const lines = Object.values(obj(s.years)).reduce(
    (n, y) => n + Object.values(obj(y?.categories)).reduce((k, l) => k + list(l).length, 0), 0)
  return [
    count(p.length, 'project'),
    count(weeks, 'week'),
    count(tasks, 'task'),
    count(popups, 'pop-up'),
    count(focus, 'monthly focus', 'monthly focuses'),
    count(lines, 'yearly line'),
    count(list(s.academics?.courses).length, 'course'),
    count(list(s.academics?.assignments).length, 'assignment'),
    count(list(s.birthdays).length, 'birthday'),
    count(list(s.contacts).length, 'contact'),
    count(list(s.countdowns).length, 'countdown'),
  ].filter(Boolean)
}
