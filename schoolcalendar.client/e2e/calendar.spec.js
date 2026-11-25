import { test, expect } from '@playwright/test'
import { openFixture } from '../../tests/acceptance-adapter.mjs'

const approver = {
  login: 'uitester',
  password: 'Calendar2!',
  firstName: 'Robin',
  lastName: 'Lane',
  role: 'approver',
}
const teacher = { login: 'teacher', password: 'Calendar1!' }

let fixture
test.beforeAll(async () => {
  fixture = await openFixture({ approver })
})
test.afterAll(async () => {
  await fixture?.cleanup()
})
test.beforeEach(async ({ page }) => {
  await page.goto(fixture.address)
  await signIn(page, approver)
})

async function signIn(page, { login, password }) {
  await page.getByLabel('Login name').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
}

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

function monthOverflowGeometry(link) {
  const cell = link.closest('[data-testid="month-day"]').getBoundingClientRect()
  const tolerance = 0.5
  const fits = rect => rect.left >= cell.left - tolerance && rect.right <= cell.right + tolerance
    && rect.top >= cell.top - tolerance && rect.bottom <= cell.bottom + tolerance
  const text = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const textRects = []
  while (text.nextNode()) {
    const node = text.currentNode
    const content = node.textContent.trim()
    // Fully clipped text is kept in the accessible name at narrower widths.
    if (!content || getComputedStyle(node.parentElement).clipPath === 'inset(50%)') continue
    const start = node.textContent.length - node.textContent.trimStart().length
    range.setStart(node, start)
    range.setEnd(node, start + content.length)
    textRects.push(...range.getClientRects())
  }
  const visibleText = textRects.filter(rect => rect.width > 0 && rect.height > 0)
  return {
    linkFits: fits(link.getBoundingClientRect()),
    textFits: visibleText.length > 0 && visibleText.every(fits),
  }
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

test.describe('pending requests on the calendar', () => {
  const monthDate = '2027-04-15'
  const agendaDate = '2027-04-23'
  const fullDate = '2027-04-24'
  const agendaEvents = [
    ['approved', '13:00', 'Choir rehearsal'],
    ['pending', '09:30', 'Aerial photos'],
    ['approved', '09:30', 'Book discussion'],
    ['approved', '09:30', 'Art workshop'],
    ['approved', '08:45', 'Morning assembly'],
    ['pending', '08:00', 'Garden prep'],
    ['approved', '11:00', 'Science lab'],
    ['approved', '11:30', 'Volunteer lunch'],
    ['approved', '14:00', 'Drama practice'],
    ['pending', '10:00', 'Trail cleanup'],
    ['approved', '15:00', 'Soccer practice'],
  ]

  test.beforeAll(async () => {
    const approverSignIn = await fixture.driver.signIn(approver)
    const teacherSignIn = await fixture.driver.signIn(teacher)
    expect(approverSignIn.status).toBe('ok')
    expect(teacherSignIn.status).toBe('ok')
    const sessions = { approved: approverSignIn.value.session, pending: teacherSignIn.value.session }

    for (const [time, title] of [['07:30', 'Morning Cleanup'], ['11:30', 'Volunteer Check-in']]) {
      const event = await fixture.driver.createEvent(sessions.pending, { date: monthDate, time, title })
      expect(event.value?.status, title).toBe('pending')
    }

    for (const [status, time, title] of agendaEvents) {
      const event = await fixture.driver.createEvent(sessions[status], { date: agendaDate, time, title })
      expect(event.value?.status, title).toBe(status)
    }

    for (let number = 1; number <= 10; number += 1) {
      const title = `Published event ${number}`
      const event = await fixture.driver.createEvent(sessions.approved, { date: fullDate, time: '09:00', title })
      expect(event.value?.status, title).toBe('approved')
    }
  })

  test('reserves month slots for published events and lists both statuses in overflow', async ({ page }) => {
    const day = dayCell(page, monthDate)
    const previewTitles = ['Morning Cleanup', 'Stage Crew']
    await expect(day.getByTestId('event-title')).toHaveText(previewTitles)
    await expect(day.getByRole('button', { name: /Morning Cleanup.*Pending approval/i })).toBeVisible()

    const busyDay = dayCell(page, agendaDate)
    await expect(busyDay.getByTestId('event-title')).toHaveText(['Morning assembly', 'Art workshop'])
    const mixedOverflow = busyDay.getByTestId('month-more')
    for (const width of [1200, 900]) {
      await page.setViewportSize({ width, height: 950 })
      await expect(mixedOverflow).toHaveText('6 more published · 3 pending')
      await expect.poll(() => mixedOverflow.evaluate(monthOverflowGeometry), {
        message: `Mixed overflow fits inside the day cell at ${width}px`,
      }).toEqual({ linkFits: true, textFits: true })
      await mixedOverflow.click({ trial: true })
    }

    const more = day.getByTestId('month-more')
    await expect(more).toHaveText('+1 pending')
    await more.click()

    const list = page.getByRole('dialog', { name: /April 15/ })
    await expect(list.getByTestId('event-title')).toHaveText(['Morning Cleanup', 'Volunteer Check-in', 'Stage Crew'])
    await expect(list.getByText('Pending request', { exact: true })).toHaveCount(2)
    await list.getByRole('button', { name: 'Close event list' }).click()

    await page.setViewportSize({ width: 390, height: 900 })
    await expect(page.getByRole('region', { name: /Events for .*April 16/ })).toBeVisible()
    await day.getByTestId('open-day').click()
    const compact = page.getByRole('region', { name: /Events for .*April 15/ })
    await expect(compact.getByTestId('event-title')).toHaveText(previewTitles)
    await expect(compact.getByTestId('month-more')).toHaveText('+1 pending')
  })

  test('lists both statuses in time order and counts only published events toward capacity', async ({ page }) => {
    await dayCell(page, agendaDate).getByTestId('open-day').click()
    const agenda = page.getByTestId('day-view')
    await expect(agenda).toHaveAttribute('data-date', agendaDate)
    await expect(page.getByText('8 of 10 published · 3 pending', { exact: true })).toBeVisible()
    await expect(agenda.getByTestId('event-title')).toHaveText([
      'Garden prep', 'Morning assembly', 'Art workshop', 'Book discussion', 'Aerial photos',
      'Trail cleanup', 'Science lab', 'Volunteer lunch', 'Choir rehearsal', 'Drama practice', 'Soccer practice',
    ])

    const entries = agenda.getByTestId('calendar-event')
    await expect(entries.filter({ hasText: 'Pending request' }).getByTestId('event-title')).toHaveText([
      'Garden prep', 'Aerial photos', 'Trail cleanup',
    ])
    const sharedStart = agenda.locator(`time[datetime="${agendaDate}T09:30"]`)
    await expect(sharedStart).toHaveCount(3)
    await expect(sharedStart.and(agenda.locator('time:not(.school-agenda-time-repeated)'))).toHaveCount(1)
  })

  test('shows only published events after signing in as a teacher', async ({ page }) => {
    await expect(dayCell(page, monthDate).getByTestId('event-title')).toContainText(['Morning Cleanup'])
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await signIn(page, teacher)

    const monthDay = dayCell(page, monthDate)
    await expect(monthDay.getByTestId('event-title')).toHaveText(['Stage Crew'])
    await expect(monthDay.getByTestId('month-more')).toHaveCount(0)

    const busyDay = dayCell(page, agendaDate)
    await expect(busyDay.getByTestId('month-more')).toHaveText('+6 more')
    await busyDay.getByTestId('open-day').click()
    const agenda = page.getByTestId('day-view')
    await expect(page.getByText('8 scheduled events', { exact: true })).toBeVisible()
    await expect(agenda.getByTestId('event-title')).toHaveText([
      'Morning assembly', 'Art workshop', 'Book discussion', 'Science lab', 'Volunteer lunch',
      'Choir rehearsal', 'Drama practice', 'Soccer practice',
    ])
    await expect(agenda.getByText('Pending request', { exact: true })).toHaveCount(0)
  })

  test('updates the open agenda after approving a request from the calendar', async ({ page }) => {
    await dayCell(page, '2027-04-20').getByTestId('open-day').click()
    const agenda = page.getByTestId('day-view')
    const title = 'Family Reading Night'
    await expect(page.getByText('0 of 10 published · 1 pending', { exact: true })).toBeVisible()
    await expect(agenda.getByText('Pending request', { exact: true })).toBeVisible()

    await agenda.getByRole('button', { name: 'Edit ' + title }).click()
    const editor = page.getByRole('dialog', { name: 'Edit event' })
    await editor.getByRole('button', { name: 'Save and approve' }).click()

    await expect(editor).toBeHidden()
    await expect(page.getByText('1 of 10 published · 0 pending', { exact: true })).toBeVisible()
    await expect(agenda.getByTestId('event-title')).toHaveText([title])
    await expect(agenda.getByText('Pending request', { exact: true })).toHaveCount(0)
  })

  test('can move a pending request to a full published day and undo the move', async ({ page }) => {
    const title = 'Field Day Volunteers'
    const originalDate = '2027-04-27'
    const source = dayCell(page, originalDate)
    const destination = dayCell(page, fullDate)
    const handle = source.getByRole('button', { name: /Field Day Volunteers.*Pending approval/i })
    await expect(handle).toBeVisible()
    const start = await center(handle)
    await page.mouse.move(...start)
    await page.mouse.down()
    try {
      await page.mouse.move(start[0] + 12, start[1])
      await page.mouse.move(...(await center(destination)))
      await expect(destination).toHaveClass(/school-drop-ready/)
    } finally {
      await page.mouse.up()
    }

    await expect(destination.getByTestId('month-more')).toHaveText('8 more published · 1 pending')
    await destination.getByTestId('open-day').click()
    const agenda = page.getByTestId('day-view')
    const request = agenda.getByTestId('calendar-event').filter({ hasText: title })
    await expect(page.getByText('10 of 10 published · 1 pending', { exact: true })).toBeVisible()
    await expect(request.getByText('Pending request', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(agenda).toHaveAttribute('data-date', originalDate)
    await expect(request.getByText('Pending request', { exact: true })).toBeVisible()
    await page.getByTestId('show-month').click()
    await expect(handle).toBeVisible()
    await expect(destination.getByTestId('month-more')).toHaveText('+8 more')
  })
})
