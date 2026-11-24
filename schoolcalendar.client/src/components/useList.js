import { useEffect, useState } from 'react'
import { api } from '../api'

export function useList(path, revision = 0) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    api(path, { signal: controller.signal })
      .then((items) => setResult({ path, revision, items }))
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ path, revision, error: error.message, items: [] })
      })
    return () => controller.abort()
  }, [path, revision])
  return result?.path === path && result.revision === revision ? result : { items: [], loading: true }
}
