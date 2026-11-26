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

function collectBrowserErrors(page) {
  const browserErrors = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`[console] ${message.text()}`)
  })
  page.on('pageerror', error => browserErrors.push(error.stack ?? error.message))
  return browserErrors
}

test('opens the daily agenda without browser errors from a month date cell', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  const date = '2027-04-02'
  try {
    await dayCell(page, date).getByTestId('open-day').click()

    const agenda = page.getByTestId('day-view')
    await expect(agenda).toBeVisible()
    await expect(agenda).toHaveAttribute('data-date', date)
    await expect(agenda.getByTestId('event-title')).toHaveText(['Author Visit'])
    await expect(page.getByTestId('event-detail')).toHaveCount(0)
  } finally {
    expect.soft(browserErrors).toEqual([])
  }
})

test('a teacher can open read-only published event details from every calendar view', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await signIn(page, teacher)
  const browserErrors = collectBrowserErrors(page)

  async function expectPublishedDetails({ title, description, location, creator, when }) {
    const details = page.getByRole('dialog', { name: title, exact: true })
    await expect(details).toBeVisible()
    await expect(details.getByText(description, { exact: true })).toBeVisible()
    await expect(details.getByText(location, { exact: true })).toBeVisible()
    await expect(details.getByText('Published', { exact: true })).toBeVisible()
    await expect(details.getByTestId('event-creator')).toHaveText(creator)
    await expect(details.getByText(when)).toBeVisible()
    await expect(details.getByRole('button', { name: /^(Approve|Delete|Edit)\b/ })).toHaveCount(0)
    return details
  }

  const authorDate = '2027-04-02'
  const authorDay = dayCell(page, authorDate)
  const authorEvent = /Author Visit.*Published/
  const authorDetails = () => expectPublishedDetails({
    title: 'Author Visit',
    description: 'Meet a local writer and hear how a picture book takes shape.',
    location: 'Library',
    creator: 'Bell, Jonah',
    when: /Apr 2, 2027.*10:00\s*AM/,
  })
  const closeDetails = async details => {
    await details.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(details).toBeHidden()
  }

  const monthEntry = authorDay.getByRole('button', { name: authorEvent })
  await monthEntry.click()
  await closeDetails(await authorDetails())
  await expect(monthEntry).toBeFocused()
  await expect(page.getByTestId('month-view')).toBeVisible()

  await authorDay.getByTestId('open-day').click()
  const agenda = page.getByTestId('day-view')
  await expect(agenda).toHaveAttribute('data-date', authorDate)
  await agenda.getByTestId('event-time').click()
  await closeDetails(await authorDetails())
  await expect(agenda.getByRole('button', { name: 'Author Visit', exact: true })).toBeFocused()
  await expect(agenda).toHaveAttribute('data-date', authorDate)

  await page.getByTestId('show-month').click()
  await dayCell(page, '2027-04-16').getByTestId('month-more').click()
  const overflow = page.getByRole('dialog', { name: /April 16/ })
  const overflowEntry = overflow.getByRole('button', { name: /^Chess Club,/ })
  await overflowEntry.click()
  const chessDetails = await expectPublishedDetails({
    title: 'Chess Club',
    description: 'Pair up for ten-minute lunch games. Spare boards are available.',
    location: 'Room 108',
    creator: 'Park, Elliot',
    when: /Apr 16, 2027.*12:15\s*PM/,
  })
  await page.keyboard.press('Escape')
  await expect(chessDetails).toBeHidden()
  await expect(overflow).toBeVisible()
  await expect(overflowEntry).toBeFocused()
  await overflow.getByRole('button', { name: 'Close event list' }).click()

  await page.setViewportSize({ width: 390, height: 900 })
  await authorDay.getByTestId('open-day').click()
  const compact = page.getByRole('region', { name: /Events for .*April 2$/ })
  await compact.getByRole('button', { name: authorEvent }).press('Space')
  await closeDetails(await authorDetails())
  await expect(compact).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('an approver can edit and confirm deletion from calendar event details', async ({ page }) => {
  const date = '2027-04-06'
  const title = 'Calendar open house'
  const updatedTitle = 'Evening open house'
  const manager = await fixture.driver.signIn(approver)
  expect(manager.status).toBe('ok')
  const event = await fixture.driver.createEvent(manager.value.session, { date, time: '15:00', title })
  expect(event.value?.status).toBe('approved')
  await page.reload()

  const day = dayCell(page, date)
  const details = page.getByRole('dialog', { name: title, exact: true })
  await day.getByRole('button', { name: /Calendar open house.*Published/ }).press('Enter')
  await expect(details.getByText('Published', { exact: true })).toBeVisible()
  await expect(details.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
  await details.getByRole('button', { name: 'Edit', exact: true }).click()

  const editor = page.getByRole('dialog', { name: 'Edit event' })
  await expect(details).toBeHidden()
  await expect(editor.getByLabel('Event title')).toHaveValue(title)
  await editor.getByLabel('Event title').fill(updatedTitle)
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(day.getByTestId('event-title')).toHaveText([updatedTitle])

  const updatedDetails = page.getByRole('dialog', { name: updatedTitle, exact: true })
  const entry = day.getByRole('button', { name: /Evening open house.*Published/ })
  const confirmation = page.getByRole('dialog', { name: 'Delete event' })
  await entry.click()
  await updatedDetails.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(updatedDetails).toBeHidden()
  await expect(confirmation.getByText(`Delete ${updatedTitle}?`, { exact: true })).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep it', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(entry).toBeVisible()

  await entry.click()
  await updatedDetails.getByRole('button', { name: 'Delete', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(day.getByTestId('calendar-event')).toHaveCount(0)
})

test('deleting an event from overflow returns to the date when all remaining events fit', async ({ page }) => {
  const date = '2027-04-22'
  const title = 'After-school rehearsal'
  const manager = await fixture.driver.signIn(approver)
  const created = await fixture.driver.createEvent(manager.value.session, { title, date, time: '16:00' })
  expect(created.status).toBe('ok')
  await page.reload()
  const day = dayCell(page, date)
  await day.getByTestId('month-more').click()
  const list = page.getByRole('dialog', { name: /April 22/ })
  await list.getByRole('button', { name: /^After-school rehearsal,/ }).click()
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByTestId('confirm-delete').click()
  await expect(list).toBeHidden()
  await expect(day.getByTestId('month-more')).toHaveCount(0)
  await expect(day.getByTestId('open-day')).toBeFocused()
})

async function overflowDismissPoint(target, list) {
  await expect(target).toBeInViewport({ ratio: 1 })
  const point = await center(target)
  expect(await list.evaluate((panel, [x, y]) => {
    const { left, right, top, bottom } = panel.getBoundingClientRect()
    return x < left || x >= right || y < top || y >= bottom
  }, point), 'The click point is outside the event list').toBe(true)
  return point
}

test('the wheel input that reaches the event list bottom also scrolls the page', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 640 })
  await dayCell(page, '2027-04-16').getByTestId('month-more').click()
  const list = page.getByRole('dialog', { name: /April 16/ })
  const events = list.locator('.school-popover-events')
  await expect(events).toBeInViewport()

  const maxListScroll = await events.evaluate(element => element.scrollHeight - element.clientHeight)
  const listScroll = () => events.evaluate(element => element.scrollTop)
  const pageScroll = () => page.evaluate(() => window.scrollY)
  const initialPageScroll = await pageScroll()
  const maxPageScroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight)
  const pageStep = Math.min(30, Math.floor((maxPageScroll - initialPageScroll) / 4))
  expect(maxListScroll).toBeGreaterThan(4)
  expect(pageStep).toBeGreaterThan(4)

  const pointer = await center(events)
  await page.mouse.move(...pointer)
  const partialListScroll = Math.floor(maxListScroll / 2)
  await page.mouse.wheel(0, partialListScroll)
  await expect.poll(listScroll).toBe(partialListScroll)
  expect(await pageScroll()).toBe(initialPageScroll)

  await page.mouse.wheel(0, maxListScroll - partialListScroll + pageStep)
  await expect.poll(listScroll).toBeGreaterThanOrEqual(maxListScroll - 1)
  await expect.poll(pageScroll).toBe(initialPageScroll + pageStep)

  await page.mouse.wheel(0, pageStep)
  await page.mouse.wheel(0, pageStep)
  await expect.poll(pageScroll).toBe(initialPageScroll + 3 * pageStep)
  expect(await events.evaluate((element, [x, y]) => element.contains(document.elementFromPoint(x, y)), pointer))
    .toBe(true)
})

test('the first click on another date dismisses overflow and the second opens its agenda', async ({ page }) => {
  const selected = dayCell(page, '2027-04-16')
  const destinationDate = '2027-04-03'
  const destination = dayCell(page, destinationDate).getByTestId('open-day')
  const list = page.getByRole('dialog', { name: /April 16/ })
  await selected.getByTestId('month-more').click()
  await expect(list).toBeVisible()

  const point = await overflowDismissPoint(destination, list)
  await page.mouse.click(...point)
  await expect(list).toBeHidden()
  await expect(page.getByTestId('month-view')).toHaveAttribute('data-month', '2027-04')
  await expect(selected).toHaveClass(/school-month-selected/)
  await expect(page.getByTestId('day-view')).toHaveCount(0)

  await page.mouse.click(...point)
  await expect(page.getByTestId('day-view')).toHaveAttribute('data-date', destinationDate)
})

test('clicking a month event or its edit button behind overflow only dismisses the list', async ({ page }) => {
  const more = dayCell(page, '2027-04-16').getByTestId('month-more')
  const list = page.getByRole('dialog', { name: /April 16/ })
  const otherDay = dayCell(page, '2027-04-05')

  for (const [target, title] of [
    [otherDay.getByRole('button', { name: /Art Club.*Published/ }), 'Art Club'],
    [otherDay.getByRole('button', { name: 'Edit Art Club', exact: true }), 'Edit event'],
  ]) {
    await test.step(`Dismiss the list before opening ${title}`, async () => {
      await more.click()
      await expect(list).toBeVisible()

      const point = await overflowDismissPoint(target, list)
      await page.mouse.click(...point)
      await expect(list).toBeHidden()
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await page.mouse.click(...point)
      const dialog = page.getByRole('dialog', { name: title, exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Close dialog' }).click()
    })
  }
})

test.describe('compact calendar with touch', () => {
  test.use({ viewport: { width: 540, height: 900 }, hasTouch: true })

  test('the first tap dismisses overflow and the second selects the date', async ({ page }) => {
    const selected = page.getByRole('region', { name: /Events for .*April 16/ })
    const destination = dayCell(page, '2027-04-03')
    const list = page.getByRole('dialog', { name: /April 16/ })
    await selected.getByTestId('month-more').tap()
    await expect(list).toBeVisible()

    const point = await overflowDismissPoint(destination.getByTestId('open-day'), list)
    await page.touchscreen.tap(...point)
    await expect(list).toBeHidden()
    await expect(selected).toBeVisible()
    await expect(dayCell(page, '2027-04-16')).toHaveClass(/school-month-selected/)

    await page.touchscreen.tap(...point)
    await expect(destination).toHaveClass(/school-month-selected/)
    await expect(page.getByRole('region', { name: /Events for .*April 3$/ })).toBeVisible()
  })
})

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

for (const [size, width] of [['desktop', 1200], ['compact', 390]]) {
  test(`school navigation stays usable while scrolling on ${size} screens`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    await page.getByTestId('show-day').click()
    await expect(page.getByTestId('day-view').getByTestId('calendar-event')).toHaveCount(10)

    const masthead = page.getByRole('banner')
    const nav = page.getByRole('navigation', { name: 'School calendar navigation' })
    const navTop = () => nav.evaluate(element => element.getBoundingClientRect().top)
    const navButton = name => nav.getByRole('button', { name, exact: true })
    const scrollY = () => page.evaluate(() => window.scrollY)
    await expect(masthead).toBeInViewport({ ratio: 1 })
    expect(await navTop()).toBeGreaterThan(0)

    await page.evaluate(() => window.scrollTo(0, 300))
    await expect.poll(scrollY).toBe(300)
    await expect(masthead).not.toBeInViewport()
    await expect.poll(navTop).toBeCloseTo(0)

    for (const name of ['Calendar', 'Events', 'Users', 'Locations', 'New event']) {
      const button = navButton(name)
      await expect(button).toBeInViewport({ ratio: 1 })
      expect(await button.evaluate(el => {
        const box = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
      }), name).toBe(true)
    }

    // Click where the controls are painted. Locator clicks can scroll them into view first.
    await page.mouse.click(...await center(navButton('New event')))
    const dialog = page.getByRole('dialog', { name: 'New event' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
    await expect.poll(scrollY).toBe(300)

    await page.mouse.click(...await center(navButton('Events')))
    await expect(navButton('Events')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
  })
}

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
    const navHeight = await page.getByRole('navigation', { name: 'School calendar navigation' })
      .evaluate(nav => nav.getBoundingClientRect().height)
    await monthButton.evaluate((button, navHeight) => {
      window.scrollTo(0, window.scrollY + button.getBoundingClientRect().top - navHeight - 8)
    }, navHeight)
    await expect(monthButton).toBeInViewport({ ratio: 1 })
    await monthButton.click({ trial: true })
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

test('Space starts a keyboard move from the event list without opening details', async ({ page }) => {
  await dayCell(page, '2027-04-16').getByTestId('month-more').click()
  const list = page.getByRole('dialog', { name: /April 16/ })
  const entry = list.getByRole('button', { name: /^Chess Club,/ })
  await entry.press('Space')

  const cancel = page.getByRole('button', { name: 'Cancel move', exact: true })
  await expect(cancel).toBeVisible()
  await expect(list).toBeHidden()
  await expect(page.getByTestId('event-detail')).toHaveCount(0)
  await cancel.click()
  await expect(list).toBeVisible()
  await expect(entry).toBeFocused()
})

test('move a hidden session across months, edit it, and undo only the edit', async ({ page }) => {
  const busyDay = dayCell(page, '2027-04-16')
  await busyDay.getByText('+8 more', { exact: true }).click()
  const list = page.getByRole('dialog', { name: /April 16/ })
  await expect(list.getByTestId('popover-event')).toHaveCount(10)
  const start = await center(list.getByRole('button', { name: /^Chess Club,/ }))
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
  await expect(page.getByTestId('event-detail')).toHaveCount(0)
  await moved.getByRole('button', { name: 'Edit Chess Club' }).click()
  await page.getByLabel('Start time').fill('14:45')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(moved.getByTestId('event-time')).toHaveText(/2:45\s*PM/i)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(moved.getByTestId('event-time')).toHaveText(/12:15\s*PM/i)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden()
})

for (const method of ['keyboard', 'pointer']) {
  test(`ends a ${method} calendar move when the approver loses access`, async ({ page }) => {
    const manager = await fixture.driver.signIn(approver)
    expect(manager.status).toBe('ok')
    const session = manager.value.session
    const account = { ...approver, login: `${method}mover` }
    const created = await fixture.driver.createUser(session, account)
    expect(created.status).toBe('ok')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await signIn(page, account)

    const writes = []
    page.on('request', request => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname.startsWith('/api/events/')) {
        writes.push(request.url())
      }
    })
    const refreshRole = async () => {
      expect((await fixture.driver.updateUser(session, created.value.id, { role: 'normal' })).status).toBe('ok')
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(page.getByTestId('nav-new-event')).toHaveText('Propose event')
    }

    const handle = dayCell(page, '2027-04-02').getByRole('button', { name: /Author Visit.*Published/ })
    const monthView = page.getByTestId('month-view')
    const nextMonth = page.getByTestId('month-next')
    const destination = dayCell(page, '2027-05-12')

    if (method === 'keyboard') {
      await handle.press('Space')
      const cancel = page.getByRole('button', { name: 'Cancel move', exact: true })
      await expect(cancel).toBeVisible()
      await nextMonth.click()
      await refreshRole()
      await expect(cancel).toBeHidden()
    } else {
      await expect(handle).toBeVisible()
      const start = await center(handle)
      await page.mouse.move(...start)
      await page.mouse.down()
      try {
        await page.mouse.move(start[0] + 12, start[1])
        await page.mouse.move(...(await center(nextMonth)))
        await expect(monthView).toHaveAttribute('data-month', '2027-05')
        await page.mouse.move(...(await center(destination)))
        const preview = page.getByText('Author Visit · Wed, May 12', { exact: true })
        await expect(preview).toBeVisible()
        await refreshRole()
        await expect(preview).toBeHidden()
      } finally {
        await page.mouse.up()
      }
    }

    await expect(monthView).toHaveAttribute('data-month', '2027-05')
    await destination.getByTestId('open-day').click()
    await expect(page.getByTestId('day-view')).toHaveAttribute('data-date', '2027-05-12')
    expect(writes).toEqual([])
  })
}

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

function eventPaint(row) {
  return row.evaluate(element => {
    const { backgroundColor, borderLeftColor, borderLeftWidth } = getComputedStyle(element)
    return { backgroundColor, borderLeftColor, borderLeftWidth: parseFloat(borderLeftWidth) }
  })
}

async function expectOwnershipHighlight(own, other) {
  await expect(own).toBeVisible()
  await expect(other).toBeVisible()
  const highlighted = await eventPaint(own)
  const standard = await eventPaint(other)
  expect(highlighted.backgroundColor).not.toBe(standard.backgroundColor)
  expect(highlighted.borderLeftColor).not.toBe(standard.borderLeftColor)
  expect(highlighted.borderLeftWidth).toBeGreaterThan(standard.borderLeftWidth)
}

test('highlights a teacher’s own published events across calendar views in time order', async ({ page }) => {
  const date = '2027-04-22'
  const own = 'Earth Day Walk'
  const direct = 'Community Meetup'
  const manager = await fixture.driver.signIn(approver)
  expect(manager.status).toBe('ok')
  const created = await fixture.driver.createEvent(manager.value.session, { date, time: '08:30', title: direct })
  expect(created.value?.status).toBe('approved')

  const byTitle = (scope, title, testId = 'calendar-event') => scope.getByTestId(testId).filter({ hasText: title })
  const signOut = () => page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const expectMonthSummary = async scope => {
    await expect(scope.getByTestId('event-title')).toHaveText([direct, own])
    await expect(scope.getByRole('button', { name: /Earth Day Walk.*Submitted by you$/ })).toBeVisible()
    await expect(scope.getByRole('button', { name: /Submitted by you$/ })).toHaveCount(1)
    await expectOwnershipHighlight(byTitle(scope, own), byTitle(scope, direct))
  }

  await signOut()
  await signIn(page, teacher)
  const preview = dayCell(page, date)
  await expectMonthSummary(preview)

  const busyDay = dayCell(page, '2027-04-16')
  await expect(busyDay.getByTestId('event-title')).toHaveText(['Jazz Lab', 'Book Swap'])
  await busyDay.getByTestId('month-more').click()
  const overflow = page.getByRole('dialog', { name: /April 16/ })
  await expect(overflow.getByTestId('event-title').nth(2)).toHaveText('Science Expo')
  await expect(overflow.getByRole('button', { name: /Science Expo.*Submitted by you$/ })).toBeVisible()
  await expect(overflow.getByRole('button', { name: /Submitted by you$/ })).toHaveCount(1)
  await expectOwnershipHighlight(byTitle(overflow, 'Science Expo', 'popover-event'), byTitle(overflow, 'Jazz Lab', 'popover-event'))

  await overflow.getByRole('button', { name: 'Open day agenda' }).click()
  const agenda = page.getByTestId('day-view')
  await expect(agenda).toHaveAttribute('data-date', '2027-04-16')
  await expect(agenda.getByTestId('event-title').nth(2)).toHaveText('Science Expo')
  await expect(byTitle(agenda, 'Science Expo').getByText('Submitted by you', { exact: true })).toHaveCount(1)
  await expect(agenda.getByText('Submitted by you', { exact: true })).toHaveCount(1)
  await expectOwnershipHighlight(
    byTitle(agenda, 'Science Expo').locator('.school-agenda-card'),
    byTitle(agenda, 'Jazz Lab').locator('.school-agenda-card'),
  )

  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByTestId('show-month').click()
  await preview.getByTestId('open-day').click()
  await expectMonthSummary(page.getByRole('region', { name: /Events for .*April 22/ }))

  await signOut()
  await page.setViewportSize({ width: 1200, height: 950 })
  await signIn(page, approver)
  await expect(preview.getByTestId('event-title')).toHaveText([direct, own])
  await expect(preview.getByRole('button', { name: /Submitted by you$/ })).toHaveCount(0)
  expect(await eventPaint(byTitle(preview, direct))).toEqual(await eventPaint(byTitle(preview, own)))
})

test.describe('pending requests on the calendar', () => {
  const monthDate = '2027-04-15'
  const agendaDate = '2027-04-23'
  const fullDate = '2027-04-24'
  const fullDayTitles = Array.from({ length: 10 }, (_, index) => `Published event ${index + 1}`)
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

    for (const title of fullDayTitles) {
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

  test('updates the open agenda after approving a request from its details', async ({ page }) => {
    await dayCell(page, '2027-04-20').getByTestId('open-day').click()
    const agenda = page.getByTestId('day-view')
    const title = 'Family Reading Night'
    const entry = agenda.getByRole('button', { name: title, exact: true })
    await expect(page.getByText('0 of 10 published · 1 pending', { exact: true })).toBeVisible()
    await expect(agenda.getByText('Pending request', { exact: true })).toBeVisible()

    const details = page.getByRole('dialog', { name: title, exact: true })
    await entry.click()
    await expect(details.getByText('Pending approval', { exact: true })).toBeVisible()
    await details.getByRole('button', { name: 'Approve', exact: true }).click()

    await expect(details).toBeHidden()
    await expect(page.getByText('1 of 10 published · 0 pending', { exact: true })).toBeVisible()
    await expect(agenda.getByTestId('event-title')).toHaveText([title])
    await expect(agenda.getByText('Pending request', { exact: true })).toHaveCount(0)

    await entry.click()
    await expect(details.getByText('Published', { exact: true })).toBeVisible()
    await expect(details.getByTestId('event-approver')).toHaveText('Lane, Robin')
    await expect(details.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
  })

  test('rejects a published event drop onto a full day and preserves both dates', async ({ page }) => {
    const source = dayCell(page, '2027-04-02')
    const destination = dayCell(page, fullDate)
    const handle = source.getByRole('button', { name: /Author Visit.*Published/ })
    const overflow = destination.getByTestId('month-more')
    await expect(handle).toBeVisible()
    await expect(overflow).toHaveText('+8 more')

    const start = await center(handle)
    await page.mouse.move(...start)
    await page.mouse.down()
    try {
      await page.mouse.move(start[0] + 12, start[1])
      await page.mouse.move(...(await center(destination)))
      await expect(page.getByText('Author Visit · Day full', { exact: true })).toBeVisible()
    } finally {
      await page.mouse.up()
    }

    const feedback = page.getByTestId('calendar-feedback')
    await expect(feedback).toBeVisible()
    await expect(feedback).toHaveText('Apr 24, 2027 already has 10 approved events.')
    await expect(handle).toBeVisible()
    await expect(overflow).toHaveText('+8 more')

    await page.reload()
    await expect(handle).toBeVisible()
    await expect(overflow).toHaveText('+8 more')
    await destination.getByTestId('open-day').click()
    const agenda = page.getByTestId('day-view')
    await expect(agenda).toHaveAttribute('data-date', fullDate)
    await expect(agenda.getByText('10 of 10 published · 0 pending', { exact: true })).toBeVisible()
    await expect(agenda.getByTestId('event-title')).toHaveText([...fullDayTitles].sort())
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
