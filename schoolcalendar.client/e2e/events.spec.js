import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { openFixture } from '../../tests/acceptance-adapter.mjs'

const approver = {
  login: 'eventtester',
  password: 'Calendar2!',
  firstName: 'Robin',
  lastName: 'Lane',
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
})

const pendingRequests = (page) => page.getByRole('region', { name: 'Pending requests' })
const publishedEvents = (page) => page.getByRole('region', { name: 'Published events' })
const eventRow = (section, title) => section.getByRole('row').filter({
  has: section.page().getByRole('rowheader').getByText(title, { exact: true }),
})
const approveButton = (container) => container.getByRole('button', { name: /^Approve\b/ })
const saveAndApproveButton = (editor) => editor.getByRole('button', { name: 'Save and approve', exact: true })
const saveChangesButton = (editor) => editor.getByRole('button', { name: 'Save changes', exact: true })

async function signIn(page, { login, password } = approver) {
  await page.getByLabel('Login name').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByTestId('month-view')).toBeVisible()
}

async function openEvents(page) {
  await page.getByRole('button', { name: 'Events', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
}

async function listEvents(page, path) {
  const response = await page.request.get(new URL(path, fixture.address).href)
  await expect(response).toBeOK()
  return response.json()
}

test('shows pending requests before published events and approves a request from its row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Approval queue' })).toHaveCount(0)
  await openEvents(page)

  const sections = pendingRequests(page).or(publishedEvents(page))
  await expect(sections.getByRole('heading')).toHaveText(['Pending requests', 'Published events'])
  await expect(eventRow(publishedEvents(page), 'Author Visit')).toBeVisible()

  const title = 'Family Reading Night'
  const pending = eventRow(pendingRequests(page), title)
  const published = eventRow(publishedEvents(page), title)
  await expect(published).toHaveCount(0)
  await expect(approveButton(pending)).toBeInViewport()
  await approveButton(pending).click()
  await expect(pending).toHaveCount(0)
  await expect(published).toBeVisible()
  await expect(approveButton(published)).toHaveCount(0)

  await published.getByRole('button', { name: 'Edit ' + title }).click()
  const editor = page.getByRole('dialog', { name: 'Edit event' })
  await expect(saveChangesButton(editor)).toBeVisible()
  await expect(saveAndApproveButton(editor)).toHaveCount(0)
})

test('approves a request from its details and shows who approved it', async ({ page }) => {
  await signIn(page)
  await openEvents(page)

  const title = 'Seedling Exchange'
  const pending = eventRow(pendingRequests(page), title)
  const details = page.getByRole('dialog', { name: title })
  await pending.getByRole('button', { name: 'View ' + title }).click()
  await expect(details.getByText('Pending approval', { exact: true })).toBeVisible()
  await approveButton(details).click()
  await expect(details).toBeHidden()
  await expect(pending).toHaveCount(0)

  await eventRow(publishedEvents(page), title).getByRole('button', { name: 'View ' + title }).click()
  await expect(details.getByText('Published', { exact: true })).toBeVisible()
  await expect(details.getByTestId('event-approver')).toHaveText('Lane, Robin')
  await expect(approveButton(details)).toHaveCount(0)
})

test('backdrop clicks dismiss event dialogs and discard unsaved edits', async ({ page }) => {
  await signIn(page)
  await openEvents(page)

  const title = 'Author Visit'
  const row = eventRow(publishedEvents(page), title)
  const path = '/api/events/manage'
  const original = (await listEvents(page, path)).find((event) => event.title === title)
  expect(original).toBeDefined()
  const viewButton = row.getByRole('button', { name: 'View ' + title })
  const deleteButton = row.getByRole('button', { name: 'Delete ' + title })
  await deleteButton.scrollIntoViewIfNeeded()
  const box = await deleteButton.boundingBox()
  // Click the backdrop over Delete to catch accidental clicks through to the row.
  const backdrop = [box.x + box.width / 2, box.y + box.height / 2]
  await viewButton.click()
  const details = page.getByRole('dialog', { name: title })
  const heading = details.getByRole('heading', { name: title })
  await heading.click()
  await expect(details).toBeVisible()

  await page.mouse.click(...backdrop)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(viewButton).toBeFocused()

  const editButton = row.getByRole('button', { name: 'Edit ' + title })
  const editor = page.getByRole('dialog', { name: 'Edit event' })
  const titleField = editor.getByLabel('Event title')
  await editButton.click()
  await titleField.fill('Unsaved title')
  await titleField.hover()
  await page.mouse.down()
  await page.mouse.move(...backdrop, { steps: 5 })
  await page.mouse.up()
  await expect(editor).toBeVisible()
  await page.mouse.click(...backdrop)
  await expect(editor).toBeHidden()
  await editButton.click()
  await expect(titleField).toHaveValue(title)
  await page.mouse.click(...backdrop)
  await expect(editor).toBeHidden()

  await deleteButton.click()
  const confirmation = page.getByRole('dialog', { name: 'Delete event' })
  await expect(confirmation).toBeVisible()
  await page.mouse.click(...backdrop)
  await expect(confirmation).toBeHidden()
  await expect(row).toBeVisible()
  const afterDismissals = (await listEvents(page, path)).find((event) => event.id === original.id)
  expect(afterDismissals).toEqual(original)
})

test('keeps edits open after a capacity error and publishes the edited request after retry', async ({ page }) => {
  await signIn(page)
  await openEvents(page)

  const originalTitle = 'Field Day Volunteers'
  const title = 'Field Day Sign-up'
  const date = '2027-04-28'
  const time = '15:45'
  const description = 'Choose a volunteer shift in the library.'
  const pending = eventRow(pendingRequests(page), originalTitle)
  await pending.getByRole('button', { name: 'Edit ' + originalTitle }).click()

  const pendingPath = '/api/events/pending'
  const original = (await listEvents(page, pendingPath)).find((event) => event.title === originalTitle)
  expect(original).toBeDefined()

  const editor = page.getByRole('dialog', { name: 'Edit event' })
  const titleField = editor.getByLabel('Event title')
  const dateField = editor.getByLabel('Date', { exact: true })
  const timeField = editor.getByLabel('Start time')
  const detailsField = editor.getByLabel('Description')
  await titleField.fill(title)
  await dateField.fill('2027-04-16')
  await timeField.fill(time)
  await detailsField.fill(description)
  await editor.getByRole('combobox', { name: 'Location', exact: true }).selectOption({ label: 'Library' })
  await editor.getByRole('combobox', { name: 'Event image', exact: true }).selectOption('football')
  await saveAndApproveButton(editor).click()

  await expect(editor.getByRole('alert')).toHaveText(/already has 10 approved events/)
  await expect(titleField).toHaveValue(title)
  await expect(dateField).toHaveValue('2027-04-16')
  await expect(timeField).toHaveValue(time)
  await expect(detailsField).toHaveValue(description)
  const afterRejection = (await listEvents(page, pendingPath)).find((event) => event.id === original.id)
  expect(afterRejection).toEqual(original)

  await dateField.fill(date)
  await saveAndApproveButton(editor).click()
  await expect(editor).toBeHidden()
  await expect(pending).toHaveCount(0)
  await expect(eventRow(pendingRequests(page), title)).toHaveCount(0)
  await expect(eventRow(publishedEvents(page), title)).toBeVisible()
  const calendar = await listEvents(page, '/api/events?from=' + date + '&to=' + date)
  expect(calendar).toContainEqual(expect.objectContaining({
    id: original.id,
    status: 'approved',
    approverName: 'Lane, Robin',
    title,
    date,
    time,
    description,
    location: 'Library',
    image: 'football',
  }))
})

test('a teacher can submit a request and ordinary Save changes leaves it pending', async ({ page }) => {
  await signIn(page, teacher)
  await expect(page.getByRole('button', { name: 'Events', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Propose event', exact: true }).click()
  const proposal = page.getByRole('dialog', { name: 'Propose an event' })
  const title = 'Peer Tutoring'
  const editedTitle = 'Peer Tutoring Sign-up'
  await proposal.getByLabel('Event title').fill(title)
  await proposal.getByLabel('Date', { exact: true }).fill('2027-04-29')
  await expect(saveAndApproveButton(proposal)).toHaveCount(0)
  await proposal.getByRole('button', { name: 'Submit for approval', exact: true }).click()
  await expect(proposal).toBeHidden()

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await signIn(page)
  await openEvents(page)
  const pending = eventRow(pendingRequests(page), title)
  await pending.getByRole('button', { name: 'Edit ' + title }).click()
  const editor = page.getByRole('dialog', { name: 'Edit event' })
  await expect(saveAndApproveButton(editor)).toBeVisible()
  await editor.getByLabel('Event title').fill(editedTitle)
  await saveChangesButton(editor).click()

  await expect(editor).toBeHidden()
  await expect(pending).toHaveCount(0)
  await expect(approveButton(eventRow(pendingRequests(page), editedTitle))).toBeVisible()
  await expect(eventRow(publishedEvents(page), editedTitle)).toHaveCount(0)
  const requests = await listEvents(page, '/api/events/pending')
  expect(requests).toContainEqual(expect.objectContaining({
    title: editedTitle,
    status: 'pending',
    creatorName: 'Reyes, Mira',
    approvedAt: null,
  }))
})

test('shows built-in event images inside the picker without a separate preview', async ({ page }) => {
  await signIn(page)
  await openEvents(page)
  const row = eventRow(publishedEvents(page), 'Author Visit')
  await row.getByRole('button', { name: 'Edit Author Visit' }).click()

  const editor = page.getByRole('dialog', { name: 'Edit event' })
  const imageChoice = editor.getByRole('combobox', { name: 'Event image', exact: true })
  const football = imageChoice.getByRole('option', { name: 'Football', exact: true })
  const trophy = imageChoice.getByRole('option', { name: 'Trophy', exact: true })
  await imageChoice.click()
  await expect(football).toHaveText('🏈 Football')
  await expect(trophy).toHaveText('🏆 Trophy')

  await football.click()
  await expect(imageChoice).toHaveValue('football')
  await expect(editor.getByTestId('event-image')).toHaveCount(0)
  await imageChoice.click()
  await trophy.click()
  await expect(imageChoice).toHaveValue('trophy')
  await expect(editor.getByTestId('event-image')).toHaveCount(0)
})

test('only Choose file opens the event image picker and cancelling it preserves the edit', async ({ page }) => {
  await signIn(page)
  await openEvents(page)
  const row = eventRow(publishedEvents(page), 'Author Visit')
  await row.getByRole('button', { name: 'Edit Author Visit' }).click()

  const editor = page.getByRole('dialog', { name: 'Edit event' })
  const title = editor.getByLabel('Event title')
  const imageChoice = editor.getByRole('combobox', { name: 'Event image', exact: true })
  const fileInput = editor.getByTestId('event-image-input')
  await title.fill('Unsaved author visit edits')
  await imageChoice.selectOption('trophy')

  const chooserSession = await page.context().newCDPSession(page)
  let chooserOpenings = 0
  chooserSession.on('Page.fileChooserOpened', () => { chooserOpenings += 1 })
  await chooserSession.send('Page.enable')
  // Let Chromium cancel the picker and dispatch its trusted DOM event.
  await chooserSession.send('Page.setInterceptFileChooserDialog', { enabled: true, cancel: true })
  await fileInput.evaluate((input) => {
    input.addEventListener('cancel', (event) => {
      if (event.isTrusted && event.bubbles) input.dataset.pickerCancelled = 'true'
    }, { once: true })
  })

  for (const text of ['Upload an image', 'PNG, JPG or WebP · 512 KB max', 'No file chosen']) {
    await editor.getByText(text, { exact: true }).click()
  }
  expect(chooserOpenings).toBe(0)

  await editor.getByRole('button', { name: 'Choose file', exact: true }).click()
  await expect.poll(() => chooserOpenings).toBe(1)
  await expect(fileInput).toHaveAttribute('data-picker-cancelled', 'true')
  await expect(editor).toBeVisible()
  await expect(title).toHaveValue('Unsaved author visit edits')
  await expect(imageChoice).toHaveValue('trophy')
  await expect(editor.getByText('No file chosen', { exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
})

test('shows the uploaded thumbnail in the event image picker before and after saving', async ({ page }) => {
  await signIn(page)
  await openEvents(page)
  const row = eventRow(publishedEvents(page), 'Author Visit')
  const edit = row.getByRole('button', { name: 'Edit Author Visit' })
  await edit.click()

  const editor = page.getByRole('dialog', { name: 'Edit event' })
  const imageChoice = editor.getByRole('combobox', { name: 'Event image', exact: true })
  const openImageChoice = imageChoice.and(page.locator('select:open'))
  const football = imageChoice.getByRole('option', { name: 'Football', exact: true })
  const trophy = imageChoice.getByRole('option', { name: 'Trophy', exact: true })
  const uploaded = imageChoice.getByRole('option', { name: 'Uploaded image', exact: true })
  const selectedThumbnail = imageChoice.locator('selectedcontent img')
  const uploadedThumbnail = uploaded.locator('img')
  const initialPng = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAIElEQVR4nGPwzplFFcQwatCoQaMGjRo0atCoQd4DbhAAkBb2X4cUMREAAAAASUVORK5CYII='
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGv0AAAAASUVORK5CYII='
  const imageSource = 'data:image/png;base64,' + png

  async function choosePng(name, contents) {
    const fileChooser = page.waitForEvent('filechooser')
    await editor.getByRole('button', { name: 'Choose file', exact: true }).click()
    const picker = await fileChooser
    await picker.setFiles({ name, mimeType: 'image/png', buffer: Buffer.from(contents, 'base64') })
    await expect(editor.getByText(name, { exact: true })).toBeVisible()
  }

  async function expectThumbnail(thumbnail) {
    await expect(thumbnail).toBeVisible()
    await expect(thumbnail).toHaveAttribute('src', imageSource)
    await expect(thumbnail).toHaveJSProperty('naturalWidth', 1)
  }

  await choosePng('author-visit-draft.png', initialPng)
  await expect(imageChoice).toHaveValue('upload')
  await expect(selectedThumbnail).toHaveAttribute('src', 'data:image/png;base64,' + initialPng)

  await choosePng('author-visit.png', png)
  await expect(imageChoice).toHaveValue('upload')
  await expect(openImageChoice).toHaveCount(0)
  await expectThumbnail(selectedThumbnail)
  await expect(editor.locator(`img[src="${imageSource}"]:not(select img)`)).toHaveCount(0)

  await imageChoice.click()
  await expect(openImageChoice).toBeVisible()
  await expect(football).toBeVisible()
  await expect(trophy).toBeVisible()
  await expectThumbnail(uploadedThumbnail)

  await football.click()
  await expect(imageChoice).toHaveValue('football')
  await expect(selectedThumbnail).toBeHidden()
  await imageChoice.click()
  await trophy.click()
  await expect(imageChoice).toHaveValue('trophy')
  await imageChoice.click()
  await expectThumbnail(uploadedThumbnail)
  await uploaded.click()
  await expect(imageChoice).toHaveValue('upload')
  await expectThumbnail(selectedThumbnail)

  await saveChangesButton(editor).click()
  await expect(editor).toBeHidden()

  await edit.click()
  await expect(imageChoice).toHaveValue('upload')
  await expect(openImageChoice).toHaveCount(0)
  await expectThumbnail(selectedThumbnail)
  await imageChoice.click()
  await expectThumbnail(uploadedThumbnail)
  await uploaded.click()
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()

  await row.getByRole('button', { name: 'View Author Visit' }).click()
  const details = page.getByRole('dialog', { name: 'Author Visit' })
  await expect(details.getByTestId('event-image')).toHaveAttribute('src', imageSource)
})
