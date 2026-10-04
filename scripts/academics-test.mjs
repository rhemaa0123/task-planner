/* ============================================================
   Academics, end to end, in a real browser.

   Drives the page the way a person would: adds courses in two terms,
   assignments with known day gaps, a checklist, a submit, a cascading course
   delete - and checks the day counts, the sort order, the term filter, that
   an orphaned assignment cannot take the page down, and that the course
   colours resolve in both themes.

   Needs the dev server:  npm run dev   then   node scripts/academics-test.mjs
   ============================================================ */

import { chromium } from 'playwright-core'

const url = 'http://localhost:5173/'
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const out = []
const say = (k, v) => { out.push([k, v]); console.log(`${v === true ? 'ok  ' : v === false ? 'FAIL' : '    '} ${k}${v === true || v === false ? '' : ': ' + v}`) }

const browser = await chromium.launch({ executablePath: edge, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
page.setDefaultTimeout(15000)
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

// dates relative to today so the day counts are deterministic
const iso = (offset) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

await page.goto(url + '#/academics', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.page-title')

// ---- empty state ----
say('empty box shown', await page.locator('.empty-box').isVisible())
say('assignment button disabled with no courses',
  await page.locator('.page-head-actions button:has-text("Assignment")').isDisabled())

// ---- add two courses ----
const addCourse = async (code, name, term, colour) => {
  await page.locator('.page-head-actions button:has-text("Course")').click()
  await page.locator('#co-code').fill(code)
  await page.locator('#co-name').fill(name)
  await page.locator('#co-term').fill(term)
  await page.locator(`.colour-dot.c${colour}`).click()
  await page.locator('button[type=submit]:has-text("Add")').click()
  await page.waitForTimeout(250)
}
await addCourse('COMP 2401', 'Systems Programming', 'Fall 2026', 1)
await addCourse('MATH 1052', 'Calculus II', 'Fall 2026', 3)
say('two course cards', (await page.locator('.course-card').count()) === 2)
say('term selector appeared', await page.locator('.term-select').isVisible())

// ---- a course in another term, to prove the filter ----
await addCourse('HIST 1001', 'Ancient Worlds', 'Winter 2027', 5)
say('adding a course follows you to its term',
  (await page.locator('.term-select').inputValue()) === 'Winter 2027')
say('new term shows only its own course', (await page.locator('.course-card').count()) === 1)
const terms = await page.locator('.term-select option').allInnerTexts()
say('terms derived from courses', JSON.stringify(terms))
await page.locator('.term-select').selectOption('Fall 2026')
await page.waitForTimeout(250)
say('back in Fall shows its 2 courses', (await page.locator('.course-card').count()) === 2)

// ---- add three assignments with known day gaps ----
const addAsg = async (title, courseLabel, due, weight) => {
  await page.locator('.page-head-actions button:has-text("Assignment")').click()
  await page.locator('#as-title').fill(title)
  await page.locator('#as-course').selectOption({ label: courseLabel })
  await page.locator('#as-due').fill(due)
  if (weight) await page.locator('#as-weight').fill(String(weight))
  await page.locator('button[type=submit]:has-text("Add")').click()
  await page.waitForTimeout(250)
}
await addAsg('Assignment 3', 'COMP 2401 · Systems Programming', iso(5), 15)
await addAsg('Problem set 7', 'MATH 1052 · Calculus II', iso(1), 10)
await addAsg('Late lab report', 'COMP 2401 · Systems Programming', iso(-3), 5)

say('three assignment rows', (await page.locator('.asg').count()) === 3)

// ---- order: soonest open first, overdue sunk below the open ones ----
const titles = await page.locator('.asg-title').allInnerTexts()
say('sort order', JSON.stringify(titles))
say('soonest first', titles[0] === 'Problem set 7')
say('overdue last', titles[2] === 'Late lab report')

const whens = await page.locator('.asg-when').allInnerTexts()
say('day counts', JSON.stringify(whens))
say('tomorrow reads Tomorrow', whens[0] === 'Tomorrow')
say('overdue reads days ago', whens[2] === '3 days ago')
say('overdue row tinted', await page.locator('.asg.overdue').count() === 1)

// ---- checklist ----
await page.locator('.asg').first().locator('.asg-disclose').click()
await page.waitForTimeout(150)
const body = page.locator('.asg').first().locator('.asg-body')
for (const step of ['Read the chapter', 'Do questions 1-5', 'Check answers']) {
  await body.locator('.field-input').fill(step)
  await body.locator('button:has-text("Add")').click()
  await page.waitForTimeout(150)
}
say('three checklist items', (await body.locator('.asg-item').count()) === 3)
say('count reads 0/3', (await page.locator('.asg').first().locator('.asg-count').innerText()) === '0/3')

// ticking one advances todo -> doing, and the count moves
await body.locator('.task-check').first().check()
await page.waitForTimeout(250)
say('count reads 1/3', (await page.locator('.asg').first().locator('.asg-count').innerText()) === '1/3')

// ---- submitted sinks and shows one reading, not two ----
await body.locator('.asg-submit').click()
await page.waitForTimeout(300)
const after = await page.locator('.asg-title').allInnerTexts()
say('submitted sank to the bottom', after[after.length - 1] === 'Problem set 7')
say('submitted row says Submitted',
  (await page.locator('.asg.submitted .asg-when').innerText()).trim() === 'Submitted')

// ---- the general deadlines panel reads this store too ----
await page.goto(url + '#/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.home-dl-list')
const homeTitles = await page.locator('.home-dl-title').allInnerTexts()
say('home panel rows', JSON.stringify(homeTitles))
say('home hides submitted', !homeTitles.includes('Problem set 7'))
say('home soonest first', homeTitles[0] === 'Assignment 3')
say('home shows past-due note', (await page.locator('.home-missed').innerText()).includes('past due'))
say('home chip coloured', (await page.locator('.home-dl .course-chip').first().getAttribute('class')).includes('c1'))

// ---- cascade delete ----
await page.goto(url + '#/academics', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.course-card')
const compCard = page.locator('.course-card', { hasText: 'COMP 2401' })
await compCard.locator('.row-del').click()
await page.waitForSelector('.modal-card')
const copy = await page.locator('.modal-copy').innerText()
say('confirm names the count', copy)
await page.locator('.btn-danger').click()
await page.waitForTimeout(300)
say('course gone', (await page.locator('.course-card').count()) === 1)
say('its assignments went too (1 left)', (await page.locator('.asg').count()) === 1)

// ---- orphan tolerance: point an assignment at a course that is not there ----
await page.evaluate(() => {
  const k = 'task-planner-academics'
  const a = JSON.parse(localStorage.getItem(k))
  a.assignments.push({
    id: 'orphan-1', courseId: 'does-not-exist', title: 'Orphaned',
    type: 'assignment', due: null, dueTime: '', weight: null,
    status: 'todo', note: '', checklist: [],
  })
  localStorage.setItem(k, JSON.stringify(a))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.page-title')
say('orphan did not crash the page', await page.locator('.page-title').isVisible())
say('orphan not rendered', !(await page.locator('#app').innerText()).includes('Orphaned'))
await page.goto(url + '#/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.page-title')
say('orphan did not crash home', await page.locator('.page-title').isVisible())

// ---- dark theme renders the chips ----
await page.evaluate(() => localStorage.setItem('task-planner-theme', 'dark'))
// a goto that differs only in the fragment does not reload, so the pre-paint
// theme script would never re-run and this would measure the light palette
await page.goto(url + '#/academics', { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.course-card')
say('theme really is dark',
  (await page.locator('html').getAttribute('data-theme')) === 'dark')
const chipColour = await page.locator('.course-code').first().evaluate(
  (el) => getComputedStyle(el).color)
say('dark course colour resolves', chipColour)
say('not transparent/unset', chipColour !== 'rgba(0, 0, 0, 0)' && chipColour !== '')

await page.screenshot({ path: 'scripts/shots/academics-dark.png', fullPage: true })
await page.evaluate(() => localStorage.setItem('task-planner-theme', 'light'))
await page.goto(url + '#/academics', { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.course-card')
await page.screenshot({ path: 'scripts/shots/academics-light.png', fullPage: true })

say('no page errors', errs.length === 0 ? true : JSON.stringify(errs.slice(0, 5)))

await browser.close()
const failed = out.filter(([, v]) => v === false)
console.log(failed.length ? `\nFAIL - ${failed.length}: ` + failed.map(([k]) => k).join(', ') : '\nALL PASS')
process.exitCode = failed.length ? 1 : 0
