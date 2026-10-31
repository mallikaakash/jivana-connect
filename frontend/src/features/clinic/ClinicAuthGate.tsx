import { useEffect, useState, type ReactNode } from 'react'
import { api, getClinicAccessToken, setClinicAccessToken } from '@/api'
import { JivanaConnectLogo } from '@/components/branding/JivanaConnectLogo'
import { Button, ErrorBanner, LoadingState } from '@/components/ui'
import { completeGoogleRedirectSignIn, firebaseConfigured, signInWithGoogleRedirect } from '@/features/clinic/firebaseAuth'
import { useAsync } from '@/lib/useAsync'

function firebaseErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : ''
  if (code === 'auth/unauthorized-domain')
    return 'This site is not authorized in Firebase. Admin must add project-bf77a013-c0b3-413c-a75.web.app under Authentication → Authorized domains.'
  if (err instanceof Error) return err.message
  return 'Sign-in failed. Try again or ask for the clinic access key.'
}

export function ClinicAuthGate({ children }: { children: ReactNode }) {
  const meta = useAsync(() => api.getMeta(), [])
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [redirectPending, setRedirectPending] = useState(true)
  const [authed, setAuthed] = useState(() => !!getClinicAccessToken())

  useEffect(() => {
    if (!firebaseConfigured() || authed) {
      setRedirectPending(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const ok = await completeGoogleRedirectSignIn()
        if (ok && !cancelled) {
          await api.getDashboardSummary()
          setAuthed(true)
        }
      } catch {
        /* no redirect session yet */
      } finally {
        if (!cancelled) setRedirectPending(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authed])

  if (!meta.data || redirectPending) {
    return meta.error ? (
      <ErrorBanner error={meta.error} onRetry={() => void meta.reload()} />
    ) : (
      <LoadingState text="Connecting to clinic server…" />
    )
  }

  if (!meta.data.auth_required || authed) {
    return children
  }

  const metaData = meta.data
  const methods = metaData.auth_methods ?? []
  const useApiKey = methods.includes('api_key')
  const useGoogle = methods.includes('firebase') && firebaseConfigured()
  const reviewerSignIn = metaData.reviewer_sign_in

  async function verifyWithApi() {
    await api.getDashboardSummary()
    setAuthed(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const token = key.trim()
    if (!token) return
    setChecking(true)
    setError(null)
    setClinicAccessToken(token)
    try {
      await verifyWithApi()
    } catch {
      setClinicAccessToken(null)
      setError('Wrong access key. Ask your clinic admin.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <JivanaConnectLogo variant="onLight" showTagline className="mb-6" />
        <h1 className="text-xl font-medium text-navy-900">Staff sign-in</h1>
        <p className="mt-2 text-sm text-slate-600">
          For {metaData.clinic_name ?? 'your clinic'}. Staff can use Google if your clinic uses it; reviewers can use the
          demo access key when shown below.
        </p>
        {error && (
          <div className="mt-4">
            <ErrorBanner error={error} />
          </div>
        )}

        {reviewerSignIn && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">{reviewerSignIn.title}</p>
            <p className="mt-1 text-amber-900/90">{reviewerSignIn.detail}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-800">Access key (paste below)</p>
            <code className="mt-1 block break-all rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-navy-900">
              {reviewerSignIn.access_key}
            </code>
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => {
                setKey(reviewerSignIn.access_key)
                setError(null)
              }}
            >
              Fill access key for me
            </Button>
          </div>
        )}

        {useApiKey && (
          <form onSubmit={submit} className="mt-6">
            <label className="block text-sm font-medium text-slate-700">
              Access key
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the reviewer or clinic key"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <Button type="submit" className="mt-4 w-full" loading={checking}>
              Continue to dashboard
            </Button>
          </form>
        )}

        {useGoogle && (
          <>
            <p className={useApiKey ? 'mt-6 text-center text-xs text-slate-500' : 'mt-6 text-sm text-slate-600'}>
              {useApiKey ? 'Optional for clinic staff with Google' : 'Sign in with your Google account'}
            </p>
            <Button
              type="button"
              variant={useApiKey ? 'secondary' : 'primary'}
              className="mt-2 w-full"
              loading={checking}
              onClick={() => {
                setError(null)
                setChecking(true)
                try {
                  signInWithGoogleRedirect()
                } catch (e) {
                  setChecking(false)
                  setError(firebaseErrorMessage(e))
                }
              }}
            >
              Sign in with Google
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
