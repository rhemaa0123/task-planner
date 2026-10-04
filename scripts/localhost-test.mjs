import { chromium } from 'playwright-core'

/* ============================================================
   The smoke test, and the responsive gate.

   What it does: boots the dev server's page once per viewport, walks every
   route, and asserts three things that no amount of reading the source will
   tell you - nothing threw, nothing 404'd, and nothing overflows sideways.

   The first of those is the one that matters most. A module that throws
   while it is being *evaluated* - a bad import, a top-level call that fails -
   leaves an empty `#app` and a single pageerror, which is exactly what this
   catches and a unit test would not.

   The matrix includes the sidebar rail both collapsed and expanded on
   purpose. `--side-w` flips between 268px and 64px from a localStorage flag,
   so the board has two different widths at any one viewport and a viewport
   media query cannot see which. Checking one state checks half the app.

   Usage:  node scripts/localhost-test.mjs            full matrix
           node scripts/localhost-test.mjs --quick    one width, routes only
           node scripts/localhost-test.mjs --shots    also write screenshots
   ============================================================ */

const url = 'http://localhost:5173/'
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const quick = process.argv.includes('--quick')
const shots = process.argv.includes('--shots')

const ROUTES = [
  ['#/', 'home'],
  ['#/weekly', 'weekly'],
  ['#/monthly', 'monthly'],
  ['#/yearly', 'yearly'],
  ['#/weeks', 'weeks'],
  ['#/stats', 'stats'],
  ['#/academics', 'academics'],
  ['#/birthdays', 'birthdays'],
  ['#/contacts', 'contacts'],
  ['#/about', 'about'],
]

// The widths that matter, and why: 320 the floor, 360/390 the common phones,
// 414 the big ones, 600 the phone/tablet line, 744/820/834 iPad portrait,
// 900 the drawer switch, 1024 the squeeze, 1280/1400 desktop.
const WIDTHS = quick
  ? [1400]
  : [320, 360, 390, 414, 600, 744, 820, 834, 900, 1024, 1280, 1400]

const RAILS = quick ? ['open'] : ['open', 'collapsed']

/* ---- A plan worth rendering ----
   An empty app cannot overflow: every horizontal overflow this gate has ever
   missed was in a card that only exists once there is work in the week - an
   overdue foot, a long title, a crushed day block. So every run seeds a week
   with overdue units, subtasks on several days, an unscheduled task and a
   project deadline, plus a term of courses and assignments. Dates are relative
   to today, so "overdue" stays overdue whenever this runs. */
const mon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); const b = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - b); return d }
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const wk = (n) => { const d = mon(); d.setDate(d.getDate() + n); return isoOf(d) }
const rel = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoOf(d) }
const SEED = {
  'task-planner-guest': [
    { id: 'p1', name: 'Thesis chapter 2', deadline: wk(4), week_start: isoOf(mon()), tasks: [
      { id: 't1', title: 'Draft the introduction to the second chapter', completed: false, deadline: rel(2), subtasks: [
        { id: 's1', title: 'Outline', day_date: wk(0), completed: true },
        { id: 's2', title: 'First pass', day_date: wk(1), completed: false },
        { id: 's3', title: 'Edit', day_date: wk(3), completed: false }] },
      { id: 't2', title: 'Collect sources', day_date: wk(2), completed: true, subtasks: [] },
      { id: 't3', title: 'Meet supervisor', day_date: wk(4), completed: false, subtasks: [] }] },
    { id: 'p2', name: 'Systems A3', week_start: isoOf(mon()), tasks: [
      { id: 't4', title: 'Read the spec', day_date: wk(0), completed: true, subtasks: [] },
      { id: 't5', title: 'Write malloc', completed: false, subtasks: [
        { id: 's4', title: 'free list', day_date: wk(1), completed: false },
        { id: 's5', title: 'coalescing', day_date: wk(5), completed: false }] },
      { id: 't6', title: 'Unscheduled thing', completed: false, subtasks: [] }] },
    { id: 'p3', name: 'Life admin', week_start: isoOf(mon()), tasks: [
      { id: 't7', title: 'Groceries', day_date: wk(6), completed: false, subtasks: [] },
      { id: 't8', title: 'Laundry', day_date: wk(5), completed: false, subtasks: [] }] },
  ],
  'task-planner-academics': {
    activeTerm: 'Fall 2026',
    courses: [
      { id: 'c1', term: 'Fall 2026', code: 'COMP 2401', name: 'Systems Programming', instructor: 'Dr. Hale', room: 'TB 238', credits: 0.5, colour: 1 },
      { id: 'c2', term: 'Fall 2026', code: 'MATH 1052', name: 'Calculus II', credits: 0.5, colour: 3 },
    ],
    assignments: [
      { id: 'a1', courseId: 'c1', title: 'Assignment 3 - a memory allocator with a long title', type: 'assignment', due: rel(6), dueTime: '23:59', weight: 15, status: 'todo', note: '', checklist: [{ id: 'i1', text: 'read the spec', done: true }, { id: 'i2', text: 'write it', done: false }] },
      { id: 'a2', courseId: 'c2', title: 'Problem set 7', type: 'assignment', due: rel(1), dueTime: '', weight: 10, status: 'doing', note: '', checklist: [] },
      { id: 'a3', courseId: 'c1', title: 'Lab 4 writeup', type: 'lab', due: rel(-2), dueTime: '', weight: 5, status: 'todo', note: '', checklist: [] },
    ],
  },
  'task-planner-week-view': 'all',
}

/* ---- The board must never be crushed ----
   Overflow is not the only way a layout fails. Between 901 and 1200px the old
   board fitted - nothing scrolled sideways - with the week squeezed to 153px
   and titles breaking a letter per line. So on the weekly page this asserts
   what "fits" actually means: when both panes show, the week has room for a
   day block a title can be read in. */
const MIN_DAY_BLOCK = 100

const browser = await chromium.launch({ executablePath: edge, headless: true })

const pageErrors = []
const failedReq = []
const consoleErrors = []
const overflow = []
const emptyApp = []
const crushed = []

for (const rail of RAILS) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    page.setDefaultTimeout(15000)

    page.on('pageerror', (e) => pageErrors.push(`${width}/${rail}: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${width}/${rail}: ${m.text()}`)
    })
    page.on('requestfailed', (r) => {
      // A dev server does not serve favicons for every theme; ignore nothing else
      failedReq.push(`${width}/${rail}: ${r.failure()?.errorText} ${r.url()}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 400) failedReq.push(`${width}/${rail}: ${r.status()} ${r.url()}`)
    })

    // The rail flag and the seed have to be in place before the first render
    await page.addInitScript(({ state, seed }) => {
      try {
        localStorage.setItem('task-planner-sidebar', state)
        for (const [k, v] of Object.entries(seed)) {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
        }
      } catch { /* private mode */ }
    }, { state: rail, seed: SEED })

    for (const [hash, name] of ROUTES) {
      await page.goto(url + hash, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => {
        const el = document.getElementById('app')
        return el && el.children.length > 0
      }, null, { timeout: 15000 }).catch(() => {
        emptyApp.push(`${width}/${rail} ${hash}: #app never filled`)
      })

      const text = (await page.locator('#app').innerText().catch(() => '')).trim()
      if (!text) emptyApp.push(`${width}/${rail} ${hash}: #app rendered empty`)

      const over = await page.evaluate(() => {
        const d = document.documentElement
        return d.scrollWidth - d.clientWidth
      })
      if (over > 1) overflow.push(`${width}/${rail} ${hash}: +${over}px`)

      if (hash === '#/weekly') {
        const b = await page.evaluate(() => {
          const g = document.querySelector('.week-grid-container')
          const blk = document.querySelector('.day-block')
          const shown = g && getComputedStyle(g).display !== 'none'
          return {
            grid: shown ? Math.round(g.getBoundingClientRect().width) : null,
            block: shown && blk ? Math.round(blk.getBoundingClientRect().width) : null,
          }
        })
        if (b.block != null && b.block < MIN_DAY_BLOCK) {
          crushed.push(`${width}/${rail}: day block ${b.block}px (week ${b.grid}px)`)
        }
      }

      if (shots && rail === 'open' && (width === 390 || width === 820 || width === 1400)) {
        await page.screenshot({
          path: `scripts/shots/${width}-${name}.png`,
          fullPage: true,
        })
      }
    }

    await ctx.close()
  }
}

await browser.close()

const result = {
  widths: WIDTHS,
  rails: RAILS,
  routes: ROUTES.length,
  checks: WIDTHS.length * RAILS.length * ROUTES.length,
  pageErrors,
  emptyApp,
  overflow,
  crushed,
  failedRequests: failedReq.slice(0, 20),
  consoleErrors: consoleErrors.slice(0, 20),
}

console.log(JSON.stringify(result, null, 2))

const bad = pageErrors.length + emptyApp.length + overflow.length + crushed.length + failedReq.length
console.log(bad === 0 ? '\nPASS' : `\nFAIL - ${bad} problem(s)`)
if (bad) process.exitCode = 1
