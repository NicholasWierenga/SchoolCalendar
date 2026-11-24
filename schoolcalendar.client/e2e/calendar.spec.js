import { test, expect } from '@playwright/test'
import { openFixture } from '../../tests/acceptance-adapter.mjs'

let fixture
test.beforeAll(async () => {
  fixture = await openFixture({
    approver: {
      login: 'uitester',
      password: 'Calendar2!',
      firstName: 'Robin',
      lastName: 'Lane',
      role: 'approver',
    },
  })
})
test.afterAll(async () => {
  await fixture?.cleanup()
})
test.beforeEach(async ({ page }) => {
  await page.goto(fixture.address)
  await page.getByLabel('Login name').fill('uitester')
  await page.getByLabel('Password', { exact: true }).fill('Calendar2!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
})

const dayCell = (page, date) => page.locator('[data-testid="month-day"][data-date="' + date + '"]')

test('month navigation keeps the selected date only when its cell is visible', async ({ page }) => {
  await dayCell(page, '2027-04-01').getByTestId('open-day').click()
  await page.getByTestId('show-month').click()
  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('month-view')).toHaveAttribute('data-month', '2027-05')
  await expect(page.locator('.school-month-selected')).toHaveCount(0)
  await page.getByTestId('month-previous').click()
  await expect(dayCell(page, '2027-04-01')).toHaveClass(/school-month-selected/)
  await dayCell(page, '2027-04-30').getByTestId('open-day').click()
  await page.getByTestId('show-month').click()
  await page.getByTestId('month-next').click()
  await expect(dayCell(page, '2027-04-30')).toHaveClass(/school-month-selected/)
})

async function center(locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('The drag target is not visible.')
  return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
}

test('move a hidden session across months, edit it, and undo only the edit', async ({ page }) => {
  const busyDay = dayCell(page, '2027-04-16')
  await busyDay.getByText('+8 more', { exact: true }).click()
  const list = page.getByRole('dialog')
  await expect(list.getByTestId('popover-event')).toHaveCount(10)
  const start = await center(list.getByRole('button', { name: /^Move Chess Club,/ }))
  const arrow = await center(page.getByTestId('month-next'))
  await page.mouse.move(...start)
  await page.mouse.down()
  try {
    await page.mouse.move(start[0] + 12, start[1])
    await expect(list).toBeHidden()
    await page.mouse.move(...arrow)
    await expect(page.getByTestId('month-view')).toHaveAttribute('data-month', '2027-05')
    await page.mouse.move(arrow[0], arrow[1] - 40)
    const destination = dayCell(page, '2027-05-12')
    await page.mouse.move(...(await center(destination)))
  } finally {
    await page.mouse.up()
  }

  const moved = dayCell(page, '2027-05-12')
  await expect(moved.getByTestId('event-title')).toHaveText('Chess Club')
  await moved.getByRole('button', { name: 'Edit Chess Club' }).click()
  await page.getByLabel('Start time').fill('14:45')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(moved.getByTestId('event-time')).toHaveText(/2:45\s*PM/i)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(moved.getByTestId('event-time')).toHaveText(/12:15\s*PM/i)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden()
})

test('Undo stays reachable below an open event list on a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByTestId('month-more').filter({ visible: true }).first().click()
  const list = page.getByRole('dialog', { name: /April 16/ })
  await list.getByRole('button', { name: 'Edit Mural Planning' }).click()
  await page.getByTestId('event-time-input').fill('12:35')
  await page.getByTestId('save-form').click()
  await expect(list).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden()
})
