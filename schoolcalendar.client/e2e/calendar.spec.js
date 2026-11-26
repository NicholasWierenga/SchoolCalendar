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

for (const [source, openDay] of [
  ['date cell click', day => day.getByTestId('open-day').click()],
  ['event click', day => day.getByTestId('event-title').click()],
  ['event Enter key', day => day.getByRole('button', { name: /Author Visit.*Published/ }).press('Enter')],
]) {
  test(`opens the daily agenda without browser errors from a month ${source}`, async ({ page }) => {
    const browserErrors = []
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(`[console] ${message.text()}`)
    })
    page.on('pageerror', error => browserErrors.push(error.stack ?? error.message))

    const date = '2027-04-02'
    try {
      await openDay(dayCell(page, date))

      const agenda = page.getByTestId('day-view')
      await expect(agenda).toBeVisible()
      await expect(agenda).toHaveAttribute('data-date', date)
      await expect(agenda.getByTestId('event-title')).toHaveText(['Author Visit'])
    } finally {
      expect.soft(browserErrors).toEqual([])
    }
  })
}

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

async function expectMonthToEndWithContent(lastContent) {
  await expect(lastContent).toBeVisible()
  await expect.poll(() => lastContent.evaluate(element => {
    const contentBottom = element.getBoundingClientRect().bottom + window.scrollY
    const bottomPaddingAllowance = 48
    const expectedPageHeight = Math.max(window.innerHeight, contentBottom + bottomPaddingAllowance)
    return document.documentElement.scrollHeight - expectedPageHeight
  })).toBeLessThanOrEqual(1)
}

test('Month scroll ends at the last content on desktop and compact screens', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 950 })
  await expectMonthToEndWithContent(page.getByTestId('month-view'))

  await page.setViewportSize({ width: 390, height: 640 })
  await expectMonthToEndWithContent(page.getByRole('region', { name: /^Events for / }))
})

test('opening a short day agenda keeps the calendar heading in place', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 640 })
  const heading = page.getByRole('heading', { level: 1 })
  const headingTop = () => heading.evaluate(element => element.getBoundingClientRect().top)
  const agenda = page.getByTestId('day-view')

  for (const [date, titles] of [['2027-04-01', []], ['2027-04-02', ['Author Visit']]]) {
    for (const [source, trigger] of [
      ['date cell', dayCell(page, date).getByTestId('open-day')],
      ['Day button', page.getByTestId('show-day')],
    ]) {
      await test.step(`Open ${date} from the ${source}`, async () => {
        await page.evaluate(() => window.scrollTo(0, 110))
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(110)
        await expect(trigger).toBeInViewport({ ratio: 1 })
        const before = await headingTop()

        await trigger.click()
        await expect(agenda).toHaveAttribute('data-date', date)
        await expect(agenda.getByTestId('event-title')).toHaveText(titles)
        expect.soft(Math.abs((await headingTop()) - before)).toBeLessThanOrEqual(2)

        await page.getByTestId('show-month').click()
        await expectMonthToEndWithContent(page.getByTestId('month-view'))
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(110)
      })
    }
  }
})

async function center(locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('The drag target is not visible.')
  return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]
}

test('a busy month cell stays in place from the first visible frame after returning from Day', async ({ page }) => {
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 640 })
    await page.getByTestId('show-day').click()
    await expect(page.getByTestId('day-view').getByTestId('calendar-event')).toHaveCount(10)
    const monthButton = page.getByTestId('show-month')
    await monthButton.evaluate((button, width) => {
      const offset = width === 390 ? window.scrollY + button.getBoundingClientRect().top - 8 : 95
      window.scrollTo(0, offset)
    }, width)
    await expect(monthButton).toBeInViewport({ ratio: 1 })
    const before = await page.locator('#school-calendar-period').evaluate(el => el.getBoundingClientRect().top)

    const frames = await monthButton.evaluate(async button => {
      button.click()
      const frames = []
      for (let i = 0; i < 16; i++) {
        await new Promise(requestAnimationFrame)
        const cell = document.querySelector('[data-testid="month-day"][data-date="2027-04-16"]')
        const y = element => element && getComputedStyle(element).visibility === 'visible'
          ? element.getBoundingClientRect().top : null
        frames.push({
          heading: y(document.querySelector('#school-calendar-period')),
          date: y(cell?.querySelector('[data-testid="open-day"]')),
          event: y(cell?.querySelector('[data-testid="event-title"]')),
          more: y(cell?.querySelector('[data-testid="month-more"]')),
        })
      }
      return frames
    })
    expect(Math.abs(frames.at(-1).heading - before)).toBeLessThanOrEqual(1)
    for (const item of width === 390 ? ['heading', 'date'] : ['heading', 'date', 'event', 'more']) {
      const positions = frames.map(frame => frame[item]).filter(y => y !== null)
      expect(positions.length, item).toBeGreaterThan(1)
      expect(Math.max(...positions) - Math.min(...positions), item).toBeLessThanOrEqual(1)
    }
  }
})

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

async function expectMonthEventRow(scope, title, status, borderStyle) {
  const row = scope.getByTestId('calendar-event').filter({ hasText: title })
  const summary = row.getByRole('button', { name: new RegExp(`${title}.*${status}`, 'i') })
  const edit = row.getByRole('button', { name: `Edit ${title}`, exact: true })
  await expect(row).toHaveCSS('border-top-style', borderStyle)
  await expect(summary.locator('svg')).toHaveCount(status === 'Published' ? 0 : 1)
  await expect(edit).toBeVisible()
  await expect.poll(() => row.evaluate(element => {
    const rowBounds = element.getBoundingClientRect()
    const editBounds = element.querySelector('[data-testid="event-edit"]').getBoundingClientRect()
    const style = getComputedStyle(element)
    const tolerance = 0.5
    const summaryContent = element.querySelectorAll(
      '[data-testid="event-drag-handle"], [data-testid="event-time"], [data-testid="event-title"], [data-testid="event-location"]',
    )
    return {
      editInside: editBounds.left >= rowBounds.left + parseFloat(style.borderLeftWidth) - tolerance
        && editBounds.right <= rowBounds.right - parseFloat(style.borderRightWidth) + tolerance
        && editBounds.top >= rowBounds.top + parseFloat(style.borderTopWidth) - tolerance
        && editBounds.bottom <= rowBounds.bottom - parseFloat(style.borderBottomWidth) + tolerance,
      textClear: Array.from(summaryContent).every(part => part.getBoundingClientRect().right <= editBounds.left + tolerance),
    }
  }), { message: `Edit button fits beside the ${title} summary inside its row` }).toEqual({
    editInside: true,
    textClear: true,
  })
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

    const busyDay = dayCell(page, agendaDate)
    await expect(busyDay.getByTestId('event-title')).toHaveText(['Morning assembly', 'Art workshop'])
    const mixedOverflow = busyDay.getByTestId('month-more')
    for (const width of [1200, 900]) {
      await page.setViewportSize({ width, height: 950 })
      await expectMonthEventRow(day, 'Morning Cleanup', 'Pending approval', 'dashed')
      await expectMonthEventRow(day, 'Stage Crew', 'Published', 'solid')
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
    await expectMonthEventRow(compact, 'Morning Cleanup', 'Pending approval', 'dashed')
    await expectMonthEventRow(compact, 'Stage Crew', 'Published', 'solid')
    await compact.getByRole('button', { name: 'Edit Stage Crew', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit event' })
    await expect(editor.getByLabel('Event title')).toHaveValue('Stage Crew')
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(editor).toBeHidden()
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
