/* ============================================================
   The home page's Deadlines panel, in a real browser.

   Seeds all three sources at once - academic assignments, project deadlines
   and task deadlines - and checks they come back as ONE list in one order,
   that anything already answered (submitted, ticked, a finished project) is
   left out, that each row links to the page that owns it, and that a typed
   project name keeps the case it was typed in.

   Needs the dev server:  npm run dev   then   node scripts/deadlines-test.mjs
   ============================================================ */

import { chromium } from 'playwright-core'

const url = 'http://localhost:5173/'
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const out = []
const say = (k, v) => {
  out.push([k, v])
  const tag = v === true ? 'ok  ' : v === false ? 'FAIL' : '    '
  console.log(`${tag} ${k}${v === true || v === false ? '' : ': ' + v}`)
}

const browser = await chromium.launch({ executablePath: edge, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await ctx.newPage()
page.setDefaultTimeout(15000)
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

const iso = (offset) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const mondayIso = () => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - back)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

await page.goto(url, { waitUntil: 'domcontentloaded' })

// Seed all three stores directly. The point of this test is the *panel* -
// whether it reads three sources and sorts them as one - and driving three
// separate pages' dialogs to get there would be testing those dialogs again.
await page.evaluate(({ academics, projects }) => {
  localStorage.setItem('task-planner-academics', JSON.stringify(academics))
  localStorage.setItem('task-planner-guest', JSON.stringify(projects))
}, {
  academics: {
    activeTerm: 'Fall 2026',
    courses: [
      { id: 'c1', term: 'Fall 2026', code: 'COMP 2401', name: 'Systems', colour: 1 },
      { id: 'c2', term: 'Fall 2026', code: 'MATH 1052', name: 'Calculus', colour: 3 },
    ],
    assignments: [
      { id: 'a1', courseId: 'c1', title: 'Assignment 3', type: 'assignment', due: iso(6), dueTime: '23:59', weight: 15, status: 'todo', note: '', checklist: [{ id: 'i1', text: 'read', done: true }, { id: 'i2', text: 'write', done: false }] },
      { id: 'a2', courseId: 'c2', title: 'Problem set 7', type: 'assignment', due: iso(2), dueTime: '', weight: 10, status: 'todo', note: '', checklist: [] },
      { id: 'a3', courseId: 'c1', title: 'Old quiz', type: 'quiz', due: iso(-9), dueTime: '', weight: 5, status: 'submitted', note: '', checklist: [] },
      { id: 'a4', courseId: 'c2', title: 'Missed worksheet', type: 'assignment', due: iso(-2), dueTime: '', weight: 2, status: 'todo', note: '', checklist: [] },
    ],
  },
  projects: [
    {
      id: 'p1', name: 'Thesis chapter', deadline: iso(4), week_start: mondayIso(),
      tasks: [
        { id: 't1', title: 'Draft intro', completed: false, deadline: iso(1), deadline_time: '17:00', subtasks: [] },
        { id: 't2', title: 'Already done', completed: true, deadline: iso(3), subtasks: [] },
        { id: 't3', title: 'No deadline at all', completed: false, subtasks: [] },
      ],
    },
    {
      // every task done, so its own deadline is answered and must not appear
      id: 'p2', name: 'Finished project', deadline: iso(5), week_start: mondayIso(),
      tasks: [{ id: 't4', title: 'done', completed: true, subtasks: [] }],
    },
    {
      id: 'p3', name: 'No deadline project', week_start: mondayIso(),
      tasks: [{ id: 't5', title: 'whatever', completed: false, subtasks: [] }],
    },
  ],
})

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.home-dl-list')

// ---- the panel is general, not academics-only ----
say('panel head reads DEADLINES',
  (await page.locator('.panel', { has: page.locator('.home-dl-list') }).locator('.eyebrow').innerText()) === 'DEADLINES')

const titles = await page.locator('.home-dl-title').allInnerTexts()
say('rows', JSON.stringify(titles))

say('includes an assignment', titles.includes('Assignment 3'))
say('includes a project deadline', titles.includes('Thesis chapter'))
say('includes a task deadline', titles.includes('Draft intro'))
say('hides submitted assignment', !titles.includes('Old quiz'))
say('hides completed task', !titles.includes('Already done'))
say('hides fully-done project', !titles.includes('Finished project'))
say('hides project with no deadline', !titles.includes('No deadline project'))
say('hides task with no deadline', !titles.includes('No deadline at all'))

// ---- one merged sort across all three sources ----
say('order is soonest-first across sources',
  JSON.stringify(titles) === JSON.stringify([
    'Draft intro',      // +1
    'Problem set 7',    // +2
    'Thesis chapter',   // +4
    'Assignment 3',     // +6
    'Missed worksheet', // -2, sunk
  ]))

const whens = await page.locator('.home-dl-when').allInnerTexts()
say('day counts', JSON.stringify(whens))
say('overdue sunk to the bottom', whens[whens.length - 1] === '2 days ago')

// ---- chips distinguish the two worlds ----
const chips = await page.locator('.home-dl .course-chip').allInnerTexts()
say('chips', JSON.stringify(chips))
say('plan rows wear PLAN', chips.filter((c) => c === 'PLAN').length === 2)
say('course rows wear their code', chips.includes('COMP 2401') && chips.includes('MATH 1052'))
const planChipClass = await page.locator('.home-dl .course-chip.plan').first().getAttribute('class')
say('PLAN chip is neutral, not coloured', !/\bc[1-6]\b/.test(planChipClass))

// ---- rows link back to the page that owns them ----
const hrefs = await page.locator('.home-dl').evaluateAll(
  (els) => els.map((e) => e.getAttribute('href')))
say('hrefs', JSON.stringify(hrefs))
say('task row links to the week', hrefs[0] === '#/weekly')
say('assignment row links to academics', hrefs[1] === '#/academics')

// ---- progress, and the time ----
say('project shows its roll-up',
  (await page.locator('.home-dl:has(.home-dl-title:text-is("Thesis chapter"))' ).locator('.home-dl-count').innerText()) === '1/3')
say('assignment shows its checklist',
  (await page.locator('.home-dl:has(.home-dl-title:text-is("Assignment 3"))' ).locator('.home-dl-count').innerText()) === '1/2')
say('due time is shown when set',
  (await page.locator('.home-dl:has(.home-dl-title:text-is("Draft intro"))' ).locator('.home-dl-from').innerText()).includes('17:00'))
// the date either side is uppercased by CSS, the typed name is not - so this
// asserts the case is preserved, not merely that the name is present
say('task names its project, in the case it was typed',
  (await page.locator('.home-dl:has(.home-dl-title:text-is("Draft intro"))' ).locator('.home-dl-ctx').innerText()).trim() === 'Thesis chapter')

say('past-due note', (await page.locator('.home-missed').innerText()))
say('this-week marker', await page.locator('.panel-say').isVisible())

// ---- empty state ----
await page.evaluate(() => {
  localStorage.setItem('task-planner-academics', JSON.stringify({ activeTerm: '', courses: [], assignments: [] }))
  localStorage.setItem('task-planner-guest', JSON.stringify([]))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.page-title')
const empty = await page.locator('.panel', { hasText: 'DEADLINES' }).locator('.home-empty').innerText()
say('empty state mentions both sources',
  empty.includes('week') && empty.includes('course'))

say('no page errors', errs.length === 0 ? true : JSON.stringify(errs.slice(0, 5)))

await browser.close()
const failed = out.filter(([, v]) => v === false)
console.log(failed.length
  ? `\nFAIL - ${failed.length}: ` + failed.map(([k]) => k).join(', ')
  : '\nALL PASS')
process.exitCode = failed.length ? 1 : 0
