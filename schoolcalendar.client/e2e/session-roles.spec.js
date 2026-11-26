import { test, expect } from '@playwright/test'
import { openFixture } from '../../tests/acceptance-adapter.mjs'

const manager = { login: 'rolemanager', password: 'Calendar2!', firstName: 'Terry', lastName: 'Cole' }
const date = '2028-05-10'
let fixture
let managerSession

test.beforeAll(async () => {
  fixture = await openFixture({ approver: manager })
  const signIn = await fixture.driver.signIn(manager)
  expect(signIn.status).toBe('ok')
  managerSession = signIn.value.session
})

test.afterAll(async () => { await fixture?.cleanup() })

async function openAccount(page, login, role) {
  const account = { login, password: 'Calendar3!', firstName: 'Alex', lastName: 'Park', role }
  const created = await fixture.driver.createUser(managerSession, account)
  expect(created.status).toBe('ok')
  await page.goto(fixture.address)
  await page.getByLabel('Login name').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
  return created.value.id
}

async function changeRole(id, role) {
  const result = await fixture.driver.updateUser(managerSession, id, { role })
  expect(result.status).toBe('ok')
}

async function savedStatuses(title) {
  const published = await fixture.driver.listCalendar(managerSession, { date })
  const pending = await fixture.driver.listPending(managerSession)
  expect(published.status).toBe('ok')
  expect(pending.status).toBe('ok')
  return [...published.value, ...pending.value].filter(event => event.title === title).map(event => event.status)
}

test('toggles password visibility without submitting the sign-in form', async ({ page }) => {
  let signInRequests = 0
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/session') signInRequests++
  })

  await page.goto(fixture.address)
  const password = page.getByLabel('Password', { exact: true })
  const show = page.getByRole('button', { name: 'Show password', exact: true })
  const hide = page.getByRole('button', { name: 'Hide password', exact: true })
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByLabel('Login name').fill(manager.login)
  await password.fill(manager.password)

  await password.press('Tab')
  await expect(show).toBeFocused()
  await page.keyboard.press('Space')
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue(manager.password)
  await hide.click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue(manager.password)
  expect(signInRequests).toBe(0)

  await show.click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
  expect(signInRequests).toBe(1)

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('')
  await expect(show).toBeVisible()
})

for (const [before, after] of [['normal', 'approver'], ['approver', 'normal']]) {
  test(`keeps the draft for review when the author changes from ${before} to ${after}`, async ({ page }) => {
    const title = `Draft by ${before}`
    const id = await openAccount(page, `draft${before}`, before)
    await page.getByTestId('nav-new-event').click()
    const form = page.getByTestId('event-form')
    await form.getByLabel('Event title').fill(title)
    await form.getByLabel('Date', { exact: true }).fill(date)
    const buttonName = role => role === 'approver' ? 'Publish event' : 'Submit for approval'
    const originalAction = form.getByRole('button', { name: buttonName(before), exact: true })
    await expect(originalAction).toBeEnabled()

    await changeRole(id, after)
    await originalAction.click()
    const revisedAction = form.getByRole('button', { name: buttonName(after), exact: true })
    await expect(form.getByRole('alert')).toContainText('Your access changed')
    await expect(form.getByLabel('Event title')).toHaveValue(title)
    await expect(form.getByLabel('Date', { exact: true })).toHaveValue(date)
    await expect(revisedAction).toBeEnabled()
    expect(await savedStatuses(title)).toEqual([])

    await revisedAction.click()
    await expect(form).toBeHidden()
    expect(await savedStatuses(title)).toEqual([after === 'approver' ? 'approved' : 'pending'])
  })
}

test('updates the open calendar and management screens after another manager changes access', async ({ page }) => {
  const id = await openAccount(page, 'rolechanges', 'normal')
  const users = page.getByTestId('nav-user-management')
  await expect(users).toBeHidden()

  await changeRole(id, 'approver')
  await page.getByTestId('month-next').click()
  await expect(users).toBeVisible()
  await users.click()
  await expect(page.getByTestId('user-list')).toBeVisible()

  await changeRole(id, 'normal')
  await page.getByTestId('nav-location-management').click()
  await expect(users).toBeHidden()
  await expect(page.getByTestId('month-view')).toBeVisible()
  await expect(page.getByTestId('nav-new-event')).toHaveText('Propose event')
})

test('closes pending calendar details when an approver becomes a teacher', async ({ page }) => {
  const id = await openAccount(page, 'detailviewer', 'approver')
  const day = page.locator('[data-testid="month-day"][data-date="2027-04-22"]')
  await day.getByRole('button', { name: /Seedling Exchange.*Pending approval/ }).click()
  const details = page.getByRole('dialog', { name: 'Seedling Exchange' })
  await expect(details.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()

  await changeRole(id, 'normal')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(details).toBeHidden()
  await expect(day.getByTestId('event-title')).toHaveText(['Earth Day Walk'])
  await day.getByRole('button', { name: /Earth Day Walk.*Published/ }).click()
  const published = page.getByRole('dialog', { name: 'Earth Day Walk' })
  await expect(published.getByText('Published', { exact: true })).toBeVisible()
  await expect(published.getByRole('button', { name: /^(Approve|Edit|Delete)$/ })).toHaveCount(0)
})

test('returns from My Events to Calendar when a teacher becomes an approver', async ({ page }) => {
  const id = await openAccount(page, 'mypagepromotion', 'normal')
  const nav = page.getByRole('navigation')
  const myEvents = nav.getByRole('button', { name: 'My Events', exact: true })
  await myEvents.click()
  const heading = page.getByRole('heading', { name: 'My Events', exact: true })
  await expect(heading).toBeVisible()

  await changeRole(id, 'approver')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(myEvents).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Events', exact: true })).toBeVisible()
  await expect(heading).toHaveCount(0)
  await expect(page.getByTestId('month-view')).toBeVisible()
})

test('keeps the latest role when two session checks overlap', async ({ page }) => {
  const id = await openAccount(page, 'overlap', 'normal')
  const before = Promise.withResolvers()
  const after = Promise.withResolvers()
  const checks = [before, after]
  await page.route('**/api/session', async route => {
    const check = checks.shift()
    if (!check) return route.continue()
    const response = await route.fetch()
    check.resolve(() => route.fulfill({ response }))
  })

  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const releaseOldRole = await before.promise
  await changeRole(id, 'approver')
  await page.getByTestId('month-next').click()
  const releaseNewRole = await after.promise

  await releaseOldRole()
  // Let the browser process the older response while the newer one is still in flight.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await releaseNewRole()
  await expect(page.getByTestId('nav-user-management')).toBeVisible()
})
