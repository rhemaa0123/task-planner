/* ============================================================
   Google sign-in and sync, end to end, against the Firebase emulators.

   Every browser context here is its own device - its own localStorage, its
   own IndexedDB. Sign-in uses the Auth emulator's fake Google credential
   (window.__testSignIn), so no real account and no popup are involved.

   Covers: a guest never loads Firebase; migration (device -> empty account);
   pull (empty device <- account); live sync both ways, including a week
   deleted on another device; offline edits; the merge dialog's four
   answers, with backups; no echo loop; sign-out clears the device and keeps
   per-device settings and the account.

   Needs the emulators (Java 11+):
     npx firebase-tools emulators:start --only auth,firestore --project demo-task-planner
   then:
     node scripts/sync-test.mjs
   It starts its own Vite on :5174 pointed at the emulators, and wipes the
   emulators' data first.
   ============================================================ */

import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const PROJECT = 'demo-task-planner'
const PORT = 5174
const url = `http://localhost:${PORT}/`
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`
const OWNER = { Authorization: 'Bearer owner' }

let failures = 0
const say = (k, v) => {
  if (v === false) failures += 1
  console.log(`${v === true ? 'ok  ' : v === false ? 'FAIL' : '    '} ${k}${v === true || v === false ? '' : ': ' + v}`)
}

// ---- emulator data ----
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })

const listDocs = async (path) => {
  const r = await fetch(`${FS}/${path}?pageSize=300`, { headers: OWNER })
  const j = await r.json()
  return j.documents || []
}
const docJson = (d) => JSON.parse(d.fields.json.stringValue)
const idOf = (d) => d.name.split('/').pop()

// ---- a Vite pointed at the emulators (process env outranks .env) ----
Object.assign(process.env, {
  VITE_FIREBASE_EMULATOR: '1',
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_APP_ID: '1:1:web:1',
})
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' })
await server.listen()

const browser = await chromium.launch({ executablePath: edge, headless: true })

// ---- seed data ----
const WEEK_A = '2026-11-02'
const WEEK_B = '2026-11-09'
const WEEK_C = '2026-11-16'
const project = (id, name, week) => ({
  id, name, week_start: week,
  tasks: [{ id: `${id}-t`, project_id: id, title: `Task of ${name}`, day_date: null, completed: false, subtasks: [] }],
})
const deviceA = {
  'task-planner-guest': [project('pa1', 'Thesis', WEEK_A), project('pa2', 'Gym', WEEK_B)],
  'task-planner-profile': { name: 'Noa' },
  'task-planner-birthdays': [{ id: 'b1', name: 'Mum', month: 3, day: 14, year: null, note: '' }],
  'task-planner-months': { '2026-11': { focus: [{ id: 'f1', text: 'Finish chapter 2', done: false, cat: null, ref: null }], notes: 'busy' } },
  'task-planner-popups': { days: { [WEEK_A]: [{ id: 'pp1', text: 'Water bottle', done: true }] }, daily: [] },
  'task-planner-academics': { activeTerm: 'Fall 2026', courses: [{ id: 'c1', term: 'Fall 2026', code: 'COMP 2401', name: 'Systems', colour: 1 }], assignments: [] },
  'task-planner-theme': 'dark',
}

const devices = []
const device = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  const errs = []
  const requests = []
  page.on('pageerror', (e) => errs.push(e.message))
  // A device taken offline on purpose logs its failed requests; those are
  // the test, not a fault
  const expected = /ERR_INTERNET_DISCONNECTED|Failed to load resource|Could not reach Cloud Firestore/
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected.test(m.text())) errs.push('console: ' + m.text())
  })
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.account-row')
  const d = { name, ctx, page, errs, requests }
  devices.push(d)
  return d
}
const seed = async (d, data) => {
  await d.page.evaluate((entries) => {
    for (const [k, v] of entries) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
  }, Object.entries(data))
  await d.page.reload({ waitUntil: 'domcontentloaded' })
  await d.page.waitForSelector('.account-row')
}
// Most keys hold JSON; a few (the theme) hold a bare word
const local = (d, key) => d.page.evaluate((k) => {
  const raw = localStorage.getItem(k)
  try { return JSON.parse(raw) } catch { return raw }
}, key)
const signIn = (d, email = 'noa@example.com') =>
  d.page.evaluate((e) => window.__testSignIn(e, 'Noa Tester'), email)
const synced = (d) => d.page.waitForSelector('.account-row.is-synced', { timeout: 20000 }).then(() => true, () => false)
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

try {
  // ============ 1. Guest: nothing loads, nothing is sent ============
  const A = await device('A')
  await seed(A, deviceA)
  await A.page.waitForTimeout(500)
  // src/firebase.js is the app's own small loader and is always there; the
  // SDK (deps/firebase_*, @firebase) and any call to the services must not be
  // (Google Fonts is fonts.googleapis.com and was there long before accounts)
  const sdk = A.requests.filter((u) =>
    /deps\/firebase_|@firebase|node_modules\/firebase|:9099|:8080|(identitytoolkit|securetoken|firestore)\.googleapis/.test(u))
  say('guest loads no Firebase SDK and calls nothing', sdk.length === 0)
  if (sdk.length) console.log('      ' + sdk.join('\n      '))
  say('row invites sign-in', (await A.page.locator('.account-row').innerText()).includes('Sign in with Google'))

  // ============ 2. Migration: device A -> empty account ============
  await signIn(A)
  say('A synced after first sign-in', await synced(A))
  const marker = await local(A, 'task-planner-account')
  const uid = marker?.uid
  say('device linked to the account', Boolean(uid) && marker.email === 'noa@example.com')
  const stores = await listDocs(`users/${uid}/stores`)
  say('all 9 stores uploaded', stores.length === 9)
  const byName = Object.fromEntries(stores.map((d) => [idOf(d), docJson(d)]))
  say('birthdays uploaded intact', JSON.stringify(byName.birthdays) === JSON.stringify(deviceA['task-planner-birthdays']))
  say('months uploaded intact', JSON.stringify(byName.months) === JSON.stringify(deviceA['task-planner-months']))
  let weeks = await listDocs(`users/${uid}/weeks`)
  say('plan uploaded one doc per week', JSON.stringify(weeks.map(idOf).sort()) === JSON.stringify([WEEK_A, WEEK_B]))
  say('theme is not uploaded', !stores.some((d) => idOf(d).includes('theme')))
  say('row shows the email', (await A.page.locator('.account-row').innerText()).includes('noa@example.com'))

  // ============ 3. Pull: a fresh device B <- the account ============
  const B = await device('B')
  await signIn(B)
  say('B synced', await synced(B))
  const bPlan = await local(B, 'task-planner-guest')
  say('B received both weeks of the plan', bPlan?.length === 2 && bPlan.some((p) => p.name === 'Thesis'))
  say('B received the birthdays', (await local(B, 'task-planner-birthdays'))?.[0]?.name === 'Mum')
  say('B received the name', (await B.page.locator('.side-name').inputValue()) === 'Noa')
  say('B did not receive A\'s theme', (await local(B, 'task-planner-theme')) !== 'dark')

  // ============ 4. Live: A -> B, a store ============
  await A.page.locator('.side-name').fill('Noa N.')
  await A.page.locator('.side-name').press('Enter')
  say('A rename reaches B live', await until(async () => (await B.page.locator('.side-name').inputValue()) === 'Noa N.'))

  // ============ 5. Live: B -> A, a new project in this week ============
  await B.page.goto(url + '#/weekly')
  await B.page.locator('.add-project-dashed').click()
  // The new name field takes the caret only once the web font has settled
  // (EditableText waits for document.fonts.ready) - type before that and the
  // keys go nowhere
  await B.page.waitForFunction(() => document.activeElement?.classList.contains('proj-title-input'))
  await B.page.keyboard.type('Synced project')
  await B.page.keyboard.press('Enter')
  const reached = await until(async () =>
    (await local(A, 'task-planner-guest')).some((p) => p.name === 'Synced project'))
  say('B new project reaches A live', reached)
  if (!reached) {
    const names = (plan) => (plan || []).map((p) => `${p.name || '(empty)'}@${p.week_start}`).join(', ')
    console.log('      B plan:', names(await local(B, 'task-planner-guest')))
    console.log('      B unsent:', JSON.stringify(await local(B, 'task-planner-sync-dirty')))
    console.log('      account weeks:', (await listDocs(`users/${uid}/weeks`)).map((d) => `${idOf(d)}=${names(docJson(d))}`).join(' | '))
    console.log('      A plan:', names(await local(A, 'task-planner-guest')))
  }

  // ============ 6. Offline edit on B, then back online ============
  await B.ctx.setOffline(true)
  await B.page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await B.page.locator('.side-name').fill('Offline name')
  await B.page.locator('.side-name').press('Enter')
  await B.page.waitForTimeout(400)
  say('offline: row says so', await B.page.locator('.account-row.is-offline').count() === 1)
  say('offline: write is remembered as unsent', ((await local(B, 'task-planner-sync-dirty')) || []).includes('store:profile'))
  await B.ctx.setOffline(false)
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')))
  say('back online: offline edit reaches A', await until(async () =>
    (await A.page.locator('.side-name').inputValue()) === 'Offline name', 20000))
  say('back online: nothing left unsent', await until(async () => (await local(B, 'task-planner-sync-dirty')) === null, 10000))

  // ============ 7. No echo loop ============
  await A.page.waitForTimeout(1500)
  const t1 = (await listDocs(`users/${uid}/stores`)).map((d) => d.updateTime).join()
  await A.page.waitForTimeout(3000)
  const t2 = (await listDocs(`users/${uid}/stores`)).map((d) => d.updateTime).join()
  say('idle devices write nothing (no echo loop)', t1 === t2)

  // ============ 8. Merge: Combine both ============
  const C = await device('C')
  await seed(C, {
    'task-planner-guest': [project('pc1', 'Side quest', WEEK_C)],
    'task-planner-birthdays': [{ id: 'b2', name: 'Dad', month: 7, day: 2, year: 1965, note: '' }],
  })
  await signIn(C)
  await C.page.waitForSelector('.merge-option', { timeout: 20000 })
  const sides = await C.page.locator('.merge-side').allInnerTexts()
  say('merge dialog summarises both sides', sides.length === 2 && /1 project/.test(sides[0]) && /3 projects/.test(sides[1]))
  await C.page.locator('.merge-option', { hasText: 'Combine both' }).click()
  say('C synced after combining', await synced(C))
  const cBirthdays = (await local(C, 'task-planner-birthdays')).map((b) => b.name).sort()
  say('combine kept birthdays from both', JSON.stringify(cBirthdays) === JSON.stringify(['Dad', 'Mum']))
  const cPlan = await local(C, 'task-planner-guest')
  say('combine kept projects from both', cPlan.length === 4)
  say('combine reaches A live', await until(async () =>
    (await local(A, 'task-planner-birthdays')).length === 2))
  let backups = await listDocs(`users/${uid}/backups`)
  say('combine backed up the account first', backups.length === 1 && backups[0].fields.from.stringValue === 'account')

  // ============ 9. Merge: Replace the account with this device's ============
  const D = await device('D')
  await seed(D, { 'task-planner-guest': [project('pd1', 'Only this', WEEK_A)] })
  await signIn(D)
  await D.page.waitForSelector('.merge-option')
  await D.page.locator('.merge-option', { hasText: 'Replace the account' }).click()
  say('D synced after replacing', await synced(D))
  weeks = await listDocs(`users/${uid}/weeks`)
  say('account now holds only D\'s week', JSON.stringify(weeks.map(idOf)) === JSON.stringify([WEEK_A]))
  say('replace reaches A live - other weeks removed', await until(async () => {
    const plan = await local(A, 'task-planner-guest')
    return plan.length === 1 && plan[0].name === 'Only this'
  }))
  say('replace reaches A live - birthdays emptied', await until(async () =>
    (await local(A, 'task-planner-birthdays')).length === 0))

  // ============ 10. Merge: Use the account's ============
  const E = await device('E')
  await seed(E, { 'task-planner-contacts': [{ id: 'x1', name: 'Local only', email: '', phone: '', from: '', note: '' }] })
  await signIn(E)
  await E.page.waitForSelector('.merge-option')
  await E.page.locator('.merge-option', { hasText: 'Use the account' }).click()
  say('E synced after using the account\'s', await synced(E))
  say('E\'s own contact replaced', (await local(E, 'task-planner-contacts')).length === 0)
  say('E has the account\'s plan', (await local(E, 'task-planner-guest'))[0]?.name === 'Only this')
  backups = await listDocs(`users/${uid}/backups`)
  say('device data backed up before replacing it', backups.some((b) => b.fields.from.stringValue === 'device'))

  // ============ 11. Merge: Cancel ============
  const F = await device('F')
  await seed(F, { 'task-planner-countdowns': [{ id: 'k1', name: 'Trip', date: '2027-01-01' }] })
  await signIn(F)
  await F.page.waitForSelector('.merge-option')
  await F.page.locator('button', { hasText: 'Cancel and sign out' }).click()
  await F.page.waitForSelector('.account-row.is-signed-out')
  say('cancel keeps the device\'s data', (await local(F, 'task-planner-countdowns'))?.length === 1)
  say('cancel leaves the device unlinked', (await local(F, 'task-planner-account')) === null)

  // ============ 11b. A sign-in left unfinished, then a different account ============
  // The tab is reloaded while the merge dialog waits. The half-finished
  // session must not resume by itself, and the next sign-in must use the
  // account chosen then - not race the old one.
  const G = await device('G')
  await seed(G, { 'task-planner-countdowns': [{ id: 'k2', name: 'Exam', date: '2027-02-01' }] })
  await signIn(G)
  await G.page.waitForSelector('.merge-option')
  const noaWeeks = (await listDocs(`users/${uid}/weeks`)).map(idOf).join()
  G.requests.length = 0
  await G.page.reload({ waitUntil: 'domcontentloaded' })
  await G.page.waitForSelector('.account-row')
  await G.page.waitForTimeout(800)
  say('unfinished sign-in: reload shows signed out', await G.page.locator('.account-row.is-signed-out').count() === 1)
  say('unfinished sign-in: nothing reconnects by itself',
    !G.requests.some((u) => /:9099|:8080|deps\/firebase_/.test(u)))
  await signIn(G, 'other@example.com')
  say('second account: synced without a merge dialog', await synced(G) && await G.page.locator('.merge-option').count() === 0)
  say('second account: device linked to it', (await local(G, 'task-planner-account'))?.email === 'other@example.com')
  say('first account untouched', (await listDocs(`users/${uid}/weeks`)).map(idOf).join() === noaWeeks)

  // ============ 12. Sign out clears the device, keeps the account ============
  await A.page.locator('.account-row').click()
  await A.page.locator('.account-card button', { hasText: 'Sign out' }).click()
  await A.page.locator('.account-card .btn-danger').click()
  await A.page.waitForLoadState('domcontentloaded')
  await A.page.waitForSelector('.account-row.is-signed-out')
  say('signed out: plan cleared from device', (await local(A, 'task-planner-guest')) === null)
  say('signed out: link cleared', (await local(A, 'task-planner-account')) === null)
  say('signed out: theme kept (per device)', (await local(A, 'task-planner-theme')) === 'dark')
  say('signed out: account still holds the plan', (await listDocs(`users/${uid}/weeks`)).length === 1)

  // ============ 13. Signing back in pulls everything down ============
  await signIn(A)
  say('A synced again', await synced(A))
  say('A has the plan back', (await local(A, 'task-planner-guest'))?.[0]?.name === 'Only this')

  for (const d of devices) {
    say(`device ${d.name}: no page errors`, d.errs.length === 0)
    if (d.errs.length) console.log('      ' + d.errs.join('\n      '))
  }
} catch (err) {
  failures += 1
  console.log('FAIL  threw:', err.message)
} finally {
  await browser.close()
  await server.close()
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
process.exit(failures ? 1 : 0)
