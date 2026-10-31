import { CheckCircle2, Database } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { Button, ErrorBanner } from '@/components/ui'

export function ClinicDemoSeedPanel({
  compact,
  onLoaded,
}: {
  compact?: boolean
  onLoaded?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [doneAt, setDoneAt] = useState<Date | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    setDoneAt(null)
    try {
      await api.loadClinicDemoSeed()
      setDoneAt(new Date())
      onLoaded?.()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-4 text-sm text-teal-950">
        <p className="font-medium">Nothing here yet — load a sample day?</p>
        <p className="mt-1 text-teal-900/90">
          Adds fictitious patients, Jiya call outcomes, and escalations so you can explore Today, Tasks, and Clinical review without placing a live call.
        </p>
        {error && (
          <div className="mt-3">
            <ErrorBanner error={error} onRetry={() => void load()} />
          </div>
        )}
        {doneAt && (
          <p className="mt-3 flex items-center gap-1.5 font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Sample data loaded — refresh or open Patients / Tasks.
          </p>
        )}
        <Button type="button" className="mt-3" icon={<Database className="h-4 w-4" />} loading={loading} onClick={() => void load()}>
          Load demo data
        </Button>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Load fictitious patients, completed Jiya calls, and open escalations. Safe for hackathon reviewers — replaces all current clinic records in this database.
      </p>
      {error && (
        <div className="mt-4">
          <ErrorBanner error={error} onRetry={() => void load()} />
        </div>
      )}
      {doneAt && (
        <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Loaded at {doneAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        className="mt-4"
        icon={<Database className="h-4 w-4" />}
        loading={loading}
        onClick={() => void load()}
      >
        Load demo data
      </Button>
    </div>
  )
}
