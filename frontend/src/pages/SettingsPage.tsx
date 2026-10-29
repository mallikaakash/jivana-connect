import { CheckCircle2, Info, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { api, API_MODE } from '@/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button, Card, DemoBadge, DetailList, EmptyState, ErrorBanner, PageHeader, StatusBadge } from '@/components/ui'
import { LoadGate, Note, RefreshError } from '@/features/secondary/common'
import { label } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

const INTEGRATION_TEXT: Record<'live' | 'simulated' | 'not_configured', string> = {
  live: 'Live',
  simulated: 'Simulated',
  not_configured: 'Not configured',
}

export default function SettingsPage() {
  const { data: meta, error, loading, reload } = useAsync(() => api.getMeta(), [])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<Error | null>(null)
  const [resetDoneAt, setResetDoneAt] = useState<Date | null>(null)

  async function doReset() {
    setResetting(true)
    setResetError(null)
    setResetDoneAt(null)
    try {
      await api.resetDemo()
      setResetDoneAt(new Date())
      setConfirmOpen(false)
      void reload()
    } catch (e) {
      setResetError(e instanceof Error ? e : new Error(String(e)))
      setConfirmOpen(false)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Read-only view of the demo configuration. <DemoBadge>Prototype</DemoBadge>
          </span>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This page only displays how the prototype is running. There are no editable configuration controls here; integrations marked “Not configured” are
          placeholders and are not operational.
        </p>
      </div>

      <RefreshError error={meta ? error : undefined} reload={reload} />
      <LoadGate data={meta} error={error} loading={loading} reload={reload} />

      {meta && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Environment">
            <DetailList
              items={[
                { label: 'Environment', value: <StatusBadge value={meta.environment} tone="blue" text={label(meta.environment)} /> },
                { label: 'Data mode', value: `${label(meta.data_mode)} — synthetic patients only` },
                {
                  label: 'Jiya voice mode',
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <StatusBadge value={meta.voice_mode} text={meta.voice_mode === 'live' ? 'Live (Bolna)' : 'Simulated'} />
                    </span>
                  ),
                },
                { label: 'Frontend API', value: API_MODE === 'mock' ? 'Offline in-browser mock' : 'FastAPI backend' },
              ]}
            />
            <Note className="mt-4">
              {meta.voice_mode === 'live'
                ? 'Calls started from a task place a real Jiya call through Bolna. Patient data is still synthetic.'
                : 'Bolna is not configured, so “Start Jiya call” runs a simulated call with a scripted outcome. No phone call is placed.'}
            </Note>
          </Card>

          <Card title="Configured workflows">
            {meta.workflows.length === 0 ? (
              <EmptyState title="No workflows configured" />
            ) : (
              <ul className="space-y-2">
                {meta.workflows.map((w) => (
                  <li key={w} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    {label(w)}
                  </li>
                ))}
              </ul>
            )}
            <Note className="mt-4">One voice agent (Jiya) handles every workflow; the backend passes the task-specific context to each call.</Note>
          </Card>

          <Card title="Integrations" className="lg:col-span-2">
            {meta.integrations.length === 0 ? (
              <EmptyState title="No integrations reported" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {meta.integrations.map((i) => (
                  <li key={i.name} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-navy-800">{i.name}</div>
                      <div className="text-xs text-slate-500">{i.detail}</div>
                    </div>
                    <StatusBadge value={i.status} text={INTEGRATION_TEXT[i.status]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card title="Demo data" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-slate-600">
            Restore the original seeded patients, tasks, calls and escalations. Any calls or staff actions recorded during the demo will be discarded.
          </p>
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={resetting} onClick={() => setConfirmOpen(true)}>
            Reset demo data
          </Button>
        </div>
        {resetError && (
          <div className="mt-4">
            <ErrorBanner error={`Reset failed: ${resetError.message}`} onRetry={() => setConfirmOpen(true)} />
          </div>
        )}
        {resetDoneAt && (
          <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Demo data was reset by the server at{' '}
            {resetDoneAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Other pages show the seeded data when reopened.
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset demo data?"
        confirmLabel="Reset data"
        danger
        loading={resetting}
        onConfirm={() => void doReset()}
        onCancel={() => {
          if (!resetting) setConfirmOpen(false)
        }}
      >
        All demo records return to their seeded state. Calls and staff actions made during this session will be lost.
      </ConfirmDialog>
    </div>
  )
}
