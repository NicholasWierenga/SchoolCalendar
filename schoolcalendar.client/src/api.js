export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch('/api' + path, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const role = response.headers.get('X-Calendar-Role')
  if (role && path !== '/session' && !signal?.aborted) {
    window.dispatchEvent(new CustomEvent('session-role', { detail: role }))
  }
  if (response.status === 204) return null
  const data = await response.json().catch(error => {
    // Empty responses and HTML error pages have no JSON body.
    if (error instanceof SyntaxError) return null
    throw error
  })
  if (response.ok) return data

  if (response.status === 401 && path !== '/session' && !signal?.aborted) {
    window.dispatchEvent(new Event('session-expired'))
  }
  const error = new Error(data?.message || 'The request could not be completed. Please try again.')
  error.status = response.status
  error.code = data?.code
  throw error
}
