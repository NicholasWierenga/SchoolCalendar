import { expect, test } from '@playwright/test'
import { openFixture } from '../../tests/acceptance-adapter.mjs'

export const teacher = { login: 'teacher', password: 'Calendar1!' }

export function setupSuiteFixture(approver) {
  let fixture
  test.beforeAll(async () => {
    fixture = await openFixture({ approver })
  })
  test.afterAll(async () => {
    await fixture?.cleanup()
  })
  return () => fixture
}

export async function signIn(page, { login, password }) {
  await page.getByLabel('Login name').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
}

export function signOut(page) {
  return page.getByRole('button', { name: 'Sign out', exact: true }).click()
}

export function dispatchWindowFocus(page) {
  return page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

export function dayCell(page, date) {
  return page.locator(`[data-testid="month-day"][data-date="${date}"]`)
}
