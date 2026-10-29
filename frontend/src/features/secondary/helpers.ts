import { useEffect, useState } from 'react'
import type { CallStatus } from '@/api'

/** True when an API call failed with HTTP 404 (works for ApiError and any error carrying `status`). */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status: unknown }).status === 404
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export const ACTIVE_CALL_STATUSES: CallStatus[] = ['queued', 'initiating', 'in_progress']

export function isActiveCall(status: CallStatus): boolean {
  return ACTIVE_CALL_STATUSES.includes(status)
}
