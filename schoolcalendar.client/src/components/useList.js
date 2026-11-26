import { useEffect, useState } from 'react'
import { api } from '../api'

const loadingList = { items: [], loading: true }

export function useList(path, revision = 0, { refreshOnFocus = false, keepItemsOnRefresh = false } = {}) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    let controller
    function load() {
      controller?.abort()
      const request = new AbortController()
      controller = request
      api(path, { signal: request.signal })
        .then((items) => {
          if (!request.signal.aborted) setResult({ path, revision, items })
        })
        .catch((error) => {
          if (!request.signal.aborted) setResult({ path, revision, error: error.message, items: [] })
        })
    }

    load()
    if (refreshOnFocus) window.addEventListener('focus', load)
    return () => {
      if (refreshOnFocus) window.removeEventListener('focus', load)
      controller.abort()
    }
  }, [path, revision, refreshOnFocus])
  if (result?.path === path && (keepItemsOnRefresh || result.revision === revision)) return result
  return loadingList
}
