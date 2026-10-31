import { useEffect, useState, type ReactNode } from 'react'
import { api, getClinicAccessToken, resolveClinicAccessKey, setClinicAccessToken } from '@/api'
import { ErrorBanner, LoadingState } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'

/** Ensures API auth token is set when required — no sign-in page. */
export function ClinicAuthGate({ children }: { children: ReactNode }) {
  const meta = useAsync(() => api.getMeta(), [])
  const [authed, setAuthed] = useState(() => !!getClinicAccessToken())

  useEffect(() => {
    if (!meta.data || authed) return
    if (!meta.data.auth_required) {
      setAuthed(true)
      return
    }
    const key = resolveClinicAccessKey(meta.data)
    if (!key) return
    setClinicAccessToken(key)
    void api
      .getDashboardSummary()
      .then(() => setAuthed(true))
      .catch(() => setClinicAccessToken(null))
  }, [meta.data, authed])

  if (meta.error) {
    return <ErrorBanner error={meta.error} onRetry={() => void meta.reload()} />
  }

  if (!meta.data) {
    return <LoadingState text="Connecting to clinic server…" />
  }

  if (!meta.data.auth_required || authed || getClinicAccessToken()) {
    return <div className="min-h-dvh">{children}</div>
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <ErrorBanner
          error="This workspace needs a clinic access key, but none is published for this site. Open the home page or contact your admin."
        />
      </div>
    </div>
  )
}
