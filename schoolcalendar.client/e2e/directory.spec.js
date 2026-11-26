import { test, expect } from '@playwright/test'
import { openFixture } from '../../tests/acceptance-adapter.mjs'

const approver = {
  login: 'directorytester',
  password: 'Calendar2!',
  firstName: 'Robin',
  lastName: 'Lane',
}
const secondApprover = { login: 'approver', password: 'Calendar1!' }
let fixture

test.beforeAll(async () => {
  fixture = await openFixture({ approver })
})

test.afterAll(async () => {
  await fixture?.cleanup()
})

async function signIn(page, { login, password } = approver) {
  await page.goto(fixture.address)
  await page.getByLabel('Login name').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
}

function navigate(page, name) {
  return page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
}

const teacherRow = page => page.getByRole('row').filter({
  has: page.getByRole('cell', { name: 'teacher', exact: true }),
})
const locationRow = (page, name) => page.getByRole('row').filter({
  has: page.getByRole('rowheader', { name, exact: true }),
})

test('keeps a stale user draft and preserves the newer access level after retry', async ({ page, browser }) => {
  const other = await browser.newPage()
  try {
    await signIn(page)
    await signIn(other, secondApprover)
    await navigate(page, 'Users')
    await navigate(other, 'Users')

    const row = teacherRow(page)
    const edit = row.getByRole('button', { name: /^Edit / })
    const draft = page.getByRole('dialog', { name: 'Edit user', exact: true })
    const middleName = draft.getByLabel('Middle name')
    const approverAccess = draft.getByRole('checkbox', { name: 'Approver access' })
    const save = draft.getByRole('button', { name: 'Save user', exact: true })
    await edit.click()
    await expect(approverAccess).not.toBeChecked()
    await middleName.fill('Jo')

    const otherRow = teacherRow(other)
    const promotion = other.getByRole('dialog', { name: 'Edit user', exact: true })
    await otherRow.getByRole('button', { name: /^Edit / }).click()
    await promotion.getByRole('checkbox', { name: 'Approver access' }).check()
    await promotion.getByRole('button', { name: 'Save user', exact: true }).click()
    await expect(promotion).toBeHidden()
    await expect(otherRow.getByRole('cell', { name: 'Approver', exact: true })).toBeVisible()

    await save.click()
    await expect(draft.getByRole('alert')).toHaveText(/changed.*(?:reload|reopen)/i)
    const loadLatest = draft.getByRole('button', { name: 'Discard my edits and load latest', exact: true })
    await expect(loadLatest).toBeEnabled()
    await expect(middleName).toHaveValue('Jo')
    await expect(approverAccess).not.toBeChecked()

    await loadLatest.click()
    await expect(approverAccess).toBeChecked()
    await expect(middleName).toHaveValue('')
    await expect(draft.getByRole('alert')).toBeHidden()
    await middleName.fill('Jo')
    await save.click()
    await expect(draft).toBeHidden()
    await expect(row.getByRole('rowheader')).toHaveText('Reyes, Mira Jo')
    await expect(row.getByRole('cell', { name: 'Approver', exact: true })).toBeVisible()
  } finally {
    await other.close()
  }
})

test('shows a location rename on its existing event and blocks deletion while in use', async ({ page }) => {
  const originalName = 'Library'
  const newName = 'School Library'
  const eventLocation = page.getByTestId('month-view').getByTestId('calendar-event').filter({
    has: page.getByText('Author Visit', { exact: true }),
  }).getByTestId('event-location')
  await signIn(page)
  await expect(eventLocation).toHaveText(originalName)

  await navigate(page, 'Locations')
  await locationRow(page, originalName).getByRole('button', { name: 'Edit ' + originalName }).click()
  const editor = page.getByRole('dialog', { name: 'Edit location', exact: true })
  await editor.getByLabel('Location name').fill(newName)
  await editor.getByRole('button', { name: 'Save location', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(locationRow(page, newName)).toBeVisible()
  await navigate(page, 'Calendar')
  await expect(eventLocation).toHaveText(newName)

  await navigate(page, 'Locations')
  await locationRow(page, newName).getByRole('button', { name: 'Delete ' + newName }).click()
  const deletion = page.getByRole('dialog', { name: 'Delete location', exact: true })
  await deletion.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(deletion.getByRole('alert')).toContainText('Change those events before deleting it.')
  await deletion.getByRole('button', { name: 'Keep it', exact: true }).click()
  await expect(deletion).toBeHidden()

  await navigate(page, 'Calendar')
  await expect(eventLocation).toHaveText(newName)
  await navigate(page, 'Locations')
  await expect(locationRow(page, newName)).toBeVisible()
})
