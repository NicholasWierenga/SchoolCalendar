export function openEventFromRow(click) {
  if (click.target.closest('button')) return
  const title = click.currentTarget.querySelector('button[data-event-details]:enabled')
  if (!title) return
  title.focus({ preventScroll: true })
  title.click()
}
