import { chromium } from 'playwright-core'

const url = 'http://localhost:5173/'
const edge =
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const unique = `Localhost test ${Date.now()}`

const logs = []
const pageErrors = []
const failed = []

const browser = await chromium.launch({
  executablePath: edge,
  headless: true,
})
const page = await browser.newPage()
page.setDefaultTimeout(20000)
page.on('console', (msg) => logs.push(`${msg.type()}: ${msg.text()}`))
page.on('pageerror', (err) => pageErrors.push(err.message))
page.on('requestfailed', (req) =>
  failed.push(`${req.failure()?.errorText} ${req.url()}`),
)
page.on('response', (res) => {
  if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`)
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForFunction(
  () => !document.body.innerText.includes('Loading your week'),
)

const afterLoad = (await page.locator('#app').innerText()).slice(0, 500)
const loadError = afterLoad.includes('error') || /Failed|JWT|permission/i.test(afterLoad)

await page.screenshot({ path: 'scripts/shot-plans.png', fullPage: true })

await page.getByRole('button', { name: 'Week', exact: true }).click()
await page.screenshot({ path: 'scripts/shot-week.png', fullPage: true })

await page.getByRole('button', { name: 'Plans', exact: true }).click()
await page.getByRole('button', { name: 'Previous week' }).click()
const lastWeek = await page.locator('.week-label').innerText()
await page.getByRole('button', { name: 'Next week' }).click()
await page.getByRole('button', { name: 'Next week' }).click()

page.once('dialog', (dialog) => dialog.accept(unique))
await page.getByRole('button', { name: '+ Project' }).click()
await page.waitForTimeout(1500)
const hasProject = (await page.locator('#app').innerText()).includes(unique)

const testCard = page.locator('.project-card', { hasText: unique })
await testCard.locator('form[data-add="task"] input').fill('Read chapter 4')
await testCard.locator('form[data-add="task"] input').press('Enter')
await page.waitForTimeout(1200)
const hasTask = (await page.locator('#app').innerText()).includes('Read chapter 4')

const newRow = page.locator('.task-item', { hasText: 'Read chapter 4' }).first()
await newRow.locator('.task-check').check()
await page.waitForTimeout(800)
const checked = await newRow.locator('.task-check').isChecked()

await newRow.locator('.assign-days-btn').click()
await page.locator('#assign-dialog').waitFor({ state: 'visible' })
await page.locator('#assign-days [data-day]').first().click()
await page.locator('#assign-form button[value="save"]').click()
await page.waitForTimeout(1200)

await page.getByRole('button', { name: 'Week', exact: true }).click()
const weekText = await page.locator('#app').innerText()
const assignedOnWeek = /Read chapter 4/.test(weekText)

await page.screenshot({ path: 'scripts/shot-after-project.png', fullPage: true })

const cleanup = await page.evaluate(async () => {
  const { supabase } = await import('/src/supabase.js')
  const { data, error } = await supabase.from('projects').select('id, name')
  if (error) return error.message
  const junk = (data ?? []).filter((row) => String(row.name).startsWith('Localhost test'))
  for (const row of junk) {
    await supabase.from('projects').delete().eq('id', row.id)
  }
  return `deleted ${junk.length}`
})

const result = {
  url,
  afterLoad: afterLoad.replace(/\s+/g, ' ').trim(),
  loadError,
  lastWeek: lastWeek.replace(/\s+/g, ' ').trim(),
  hasProject,
  hasTask,
  checked,
  assignedOnWeek,
  cleanup,
  pageErrors,
  failedRequests: failed.slice(0, 10),
  console: logs.filter((l) => l.startsWith('error')).slice(0, 15),
}

console.log(JSON.stringify(result, null, 2))
await browser.close()

if (pageErrors.length || loadError) process.exitCode = 1
