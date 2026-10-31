import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  /** Re-run the loader. Keeps showing the previous data while refreshing. */
  reload: () => Promise<void>
}

/**
 * Loads data on mount and whenever `deps` change. Optional `pollMs` re-fetches on an interval
 * (used while a call is in progress so the task/dashboard reflect the webhook result).
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], pollMs?: number): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await loaderRef.current())
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!pollMs) return
    const id = setInterval(() => void reload(), pollMs)
    return () => clearInterval(id)
  }, [pollMs, reload])

  return { data, error, loading, reload }
}
