import { useState, type ReactNode } from 'react'

interface LoadingState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>(
  fetchFn: () => Promise<T>,
  deps: any[] = [],
  fallback: T | null = null
): LoadingState<T> & { refetch: () => void } {
  const [state, setState] = useState<LoadingState<T>>({
    data: fallback,
    loading: true,
    error: null,
  })
  const [refreshKey, setRefreshKey] = useState(0)

  useState(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchFn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: fallback, loading: false, error: err.message || '加载失败' })
        }
      })
    return () => { cancelled = true }
  })

  // Re-fetch when deps or refreshKey change
  useState(() => {
    if (refreshKey > 0 || deps.length > 0) {
      let cancelled = false
      setState((s) => ({ ...s, loading: true, error: null }))
      fetchFn()
        .then((data) => {
          if (!cancelled) setState({ data, loading: false, error: null })
        })
        .catch((err) => {
          if (!cancelled) {
            setState({ data: fallback, loading: false, error: err.message || '加载失败' })
          }
        })
      return () => { cancelled = true }
    }
  })

  const refetch = () => setRefreshKey((k) => k + 1)

  return { ...state, refetch }
}

// Simple async action hook for mutations (submit, grade, etc.)
export function useAsyncAction() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setLoading(true)
    setError(null)
    try {
      const result = await fn()
      setLoading(false)
      return result
    } catch (err: any) {
      setError(err.message || '操作失败')
      setLoading(false)
      return null
    }
  }

  return { loading, error, run, setError }
}
