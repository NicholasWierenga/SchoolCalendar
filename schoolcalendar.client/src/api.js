export async function api(path, options = {}) {
  const { body, headers, ...settings } = options
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...settings,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const content = await response.text()
  let data
  try {
    data = content ? JSON.parse(content) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const error = new Error(data?.message || 'The request could not be completed. Please try again.')
    error.status = response.status
    error.code = data?.code
    if (response.status === 401 && path !== '/session') window.dispatchEvent(new Event('session-expired'))
    throw error
  }
  return data
}
