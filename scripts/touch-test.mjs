/* ============================================================
   Phone behaviour that only shows up with touch emulation on.

   - a dialog or the drawer holds the page still, and puts it back exactly
     where it was on close (dialogs used to throw the page to the top: their
     autofocus scrolls the document before anything can save the position);
   - the drag grips, which cannot work on touch, are hidden without moving
     the row they sit in;
   - the menu button is a 44px target.

   Needs the dev server:  npm run dev   then   node scripts/touch-test.mjs
   ============================================================ */

import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const c = await b.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true })
const p = await c.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
const say = (k, v) => console.log(`${v === true ? 'ok  ' : v === false ? 'FAIL' : '    '} ${k}${typeof v === 'boolean' ? '' : ': ' + v}`)
let bad = 0
const chk = (k, v) => { if (v === false) bad++; say(k, v) }

/* Web fonts land ~200ms after load and the page reflows - 40px shorter on the
   birthdays page - which moves the scroll position and can move a click
   target mid-click, so the driver re-scrolls to find it. Measuring before that
   tests the font loader, not the app. Wait for the fonts, then for two
   consecutive frames with the same document height. */
const settle = () => p.evaluate(async () => {
  await document.fonts.ready
  let last = -1
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const h = document.documentElement.scrollHeight
    if (h === last) return
    last = h
  }
})

// The contract is "the page comes back to where it was when you opened the
// dialog" - the position at the press, recorded here in the capture phase
const recordPress = () => p.evaluate(() => {
  window.__atPress = null
  window.addEventListener('pointerdown', () => { if (window.__atPress == null) window.__atPress = window.scrollY }, { capture: true, once: true })
})

await p.goto('http://localhost:5173/')
// enough birthdays to make the page scrollable
await p.evaluate(() => {
  localStorage.setItem('task-planner-birthdays', JSON.stringify(
    Array.from({ length: 40 }, (_, i) => ({ id: 'b' + i, name: 'Person ' + i, month: (i % 12) + 1, day: (i % 28) + 1, year: 1990, note: '' }))))
})
await p.goto('http://localhost:5173/#/birthdays')
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('.bday-row')
await settle()

await p.evaluate(() => window.scrollTo(0, 400))
await settle()
const before = await p.evaluate(() => window.scrollY)
chk('page scrolled before opening', before > 100)

// A trigger that is on screen at this scroll position - the realistic case,
// and one where the driver does not move the page itself before clicking
const visibleRow = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.bday-name')]
  return rows.findIndex((r) => { const t = r.getBoundingClientRect().top; return t > 80 && t < window.innerHeight - 80 })
})
await recordPress()
await p.locator('.bday-name').nth(visibleRow).click()
await p.waitForSelector('.modal-card')
const pressedAt = await p.evaluate(() => window.__atPress)
chk('a visible trigger is clicked without moving the page', pressedAt === before)
const locked = await p.evaluate(() => getComputedStyle(document.body).position)
chk('body is fixed while the dialog is open', locked === 'fixed')
chk('scroll position preserved visually',
  (await p.evaluate(() => Math.abs(parseInt(document.body.style.top || '0', 10)))) === pressedAt)

// try to scroll the page behind the dialog
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(100)
const during = await p.evaluate(() => window.scrollY)
chk('page cannot be scrolled behind the dialog', during === 0 || during === before)

await p.locator('.btn-ghost').first().click()
await p.waitForTimeout(250)
chk('body released', (await p.evaluate(() => getComputedStyle(document.body).position)) !== 'fixed')
chk('scroll position restored', Math.abs((await p.evaluate(() => window.scrollY)) - pressedAt) < 5)

// ---- an off-screen trigger ----
// Clicking it makes the driver scroll it into view first, in the same frame
// as the click. The page must come back to where it was at the press - not to
// where it was before the driver moved it, and not to the top.
await p.evaluate(() => window.scrollTo(0, 400))
await settle()
await recordPress()
await p.locator('.btn-primary').first().click()
await p.waitForSelector('.modal-card')
const atPress = await p.evaluate(() => window.__atPress)
chk('off-screen trigger: lock holds the position at the press',
  Math.abs(parseInt(await p.evaluate(() => document.body.style.top || '0'), 10)) === atPress)
await p.locator('.btn-ghost').first().click()
await p.waitForTimeout(250)
chk('off-screen trigger: restored to the position at the press',
  Math.abs((await p.evaluate(() => window.scrollY)) - atPress) < 5)

// ---- the drawer does the same ----
await p.evaluate(() => window.scrollTo(0, 300))
await p.waitForTimeout(100)
const b2 = await p.evaluate(() => window.scrollY)
await p.locator('.side-open').click()
await p.waitForTimeout(300)
chk('drawer locks the body', (await p.evaluate(() => getComputedStyle(document.body).position)) === 'fixed')
await p.locator('.side-scrim').click({ position: { x: 350, y: 400 } })
await p.waitForTimeout(300)
chk('drawer released', (await p.evaluate(() => getComputedStyle(document.body).position)) !== 'fixed')
chk('drawer restored scroll', Math.abs((await p.evaluate(() => window.scrollY)) - b2) < 5)

// ---- the grips are hidden on touch, and nothing moved ----
await p.goto('http://localhost:5173/#/weekly')
await p.evaluate(() => {
  const mon = () => { const d = new Date(); const b = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - b); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
  localStorage.setItem('task-planner-guest', JSON.stringify([{ id: 'p1', name: 'Proj', week_start: mon(), tasks: [{ id: 't1', title: 'A task', completed: false, subtasks: [] }] }]))
})
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('.task-grip', { state: 'attached' })
const gripVis = await p.locator('.task-grip').first().evaluate((el) => getComputedStyle(el).visibility)
chk('grip hidden on touch', gripVis === 'hidden')
const gripW = await p.locator('.task-grip').first().evaluate((el) => el.getBoundingClientRect().width)
chk('grip still occupies its 14px (layout unmoved)', Math.round(gripW) === 14)

// ---- tap targets ----
const sizes = await p.evaluate(() => {
  const out = {}
  const m = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }
  out['.side-open'] = m('.side-open')
  out['.task-check'] = m('.task-check')
  return out
})
say('measured', JSON.stringify(sizes))
chk('.side-open is 44px', sizes['.side-open'] && sizes['.side-open'][0] >= 44 && sizes['.side-open'][1] >= 44)

chk('no page errors', errs.length === 0 ? true : JSON.stringify(errs))
await b.close()
console.log(bad ? `\nFAIL - ${bad}` : '\nALL PASS')
process.exitCode = bad ? 1 : 0
