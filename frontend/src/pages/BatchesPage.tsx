import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_MODE, APP_MODE, type Batch, type BatchPreviewResult } from '@/api'
import { DailyConfirmationBatchPanel } from '@/features/clinic/DailyConfirmationBatchPanel'
import { CLINIC_HELP } from '@/features/clinic/helpCopy'
import { Button, Card, DemoBadge, ErrorBanner, LoadingState, PageHeader, StatusBadge } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

export default function BatchesPage() {
  const [taskIdsText, setTaskIdsText] = useState(APP_MODE === 'clinic' ? '' : 'task_demo_001\ntask_demo_005')
  const [preview, setPreview] = useState<BatchPreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const meta = useAsync(() => api.getMeta(), [])
  const batches = useAsync(() => api.listBatches(), [])
  const dailyBatch = meta.data?.daily_confirmation_batch

  const taskIds = useMemo(
    () =>
      taskIdsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [taskIdsText],
  )

  async function runPreview() {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      setPreview(await api.previewBatch(taskIds))
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed')
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function confirmCreate() {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await api.createBatch(taskIds, 'Staff batch from dashboard')
      setActiveBatch(res.batch)
      await batches.reload()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not create batch')
    } finally {
      setActionLoading(false)
    }
  }

  async function confirmSchedule() {
    if (!activeBatch || !scheduleAt) return
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await api.scheduleBatch(activeBatch.batch_id, new Date(scheduleAt).toISOString())
      setActiveBatch(res.batch)
      await batches.reload()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not schedule batch')
    } finally {
      setActionLoading(false)
    }
  }

  async function stopActive() {
    if (!activeBatch) return
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await api.stopBatch(activeBatch.batch_id)
      setActiveBatch(res.batch)
      await batches.reload()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not stop batch')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Batch follow-ups"
        info={APP_MODE === 'clinic' ? CLINIC_HELP.batchesPage : undefined}
        subtitle={APP_MODE === 'clinic' ? undefined : 'Place many follow-up calls at once — preview who will be called, then schedule or stop the batch.'}
        actions={
          <Link to="/tasks" className="text-sm text-emerald-700 hover:underline">
            ← Back to tasks
          </Link>
        }
      />

      {APP_MODE === 'clinic' && dailyBatch?.enabled && (
        <DailyConfirmationBatchPanel batchTimeIst={dailyBatch.batch_time_ist} />
      )}

      {API_MODE === 'mock' && APP_MODE !== 'clinic' && (
        <DemoBadge className="block w-fit">Preview works offline; create/schedule needs live backend</DemoBadge>
      )}

      {APP_MODE !== 'clinic' && (
        <>
          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-medium text-navy-800">1. Preview recipients</h2>
            <p className="text-sm text-slate-600">
              Enter task IDs (one per line). Opt-outs, wrong numbers, and ineligible tasks are skipped with reasons.
            </p>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              value={taskIdsText}
              onChange={(e) => setTaskIdsText(e.target.value)}
            />
            <Button type="button" onClick={runPreview} disabled={previewLoading || taskIds.length === 0}>
              {previewLoading ? 'Previewing…' : 'Preview batch'}
            </Button>
            {previewError && <ErrorBanner error={previewError} />}
            {preview && (
              <div className="space-y-3 text-sm">
                <p className="font-medium text-navy-800">{preview.recipient_count} recipient(s)</p>
                {preview.trial_note && <p className="text-amber-800">{preview.trial_note}</p>}
                <ul className="list-disc pl-5 text-slate-700">
                  {preview.included.map((row) => (
                    <li key={row.task_id}>
                      {row.patient_name} — {row.title} ({row.task_id})
                    </li>
                  ))}
                </ul>
                {preview.skipped.length > 0 && (
                  <div>
                    <p className="font-medium text-slate-600">Skipped</p>
                    <ul className="list-disc pl-5 text-slate-500">
                      {preview.skipped.map((s) => (
                        <li key={s.task_id}>
                          {s.task_id}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-medium text-navy-800">2. Create & schedule</h2>
            {actionError && <ErrorBanner error={actionError} />}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={confirmCreate} disabled={actionLoading || !preview?.recipient_count}>
                Create batch
              </Button>
              <input
                type="datetime-local"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={confirmSchedule} disabled={actionLoading || !activeBatch || !scheduleAt}>
                Schedule batch
              </Button>
              <Button type="button" variant="secondary" onClick={stopActive} disabled={actionLoading || !activeBatch}>
                Stop batch
              </Button>
            </div>
            {activeBatch && (
              <p className="text-sm text-slate-700">
                Active batch {activeBatch.batch_id} — <StatusBadge value={activeBatch.status} />
                {activeBatch.scheduled_at && <> · scheduled {formatDateTime(activeBatch.scheduled_at)}</>}
              </p>
            )}
          </Card>
        </>
      )}

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-medium text-navy-800">Recent batches</h2>
        {batches.loading && <LoadingState />}
        {batches.error && <ErrorBanner error={batches.error} />}
        {batches.data && batches.data.items.length === 0 && <p className="text-sm text-slate-500">No batches yet.</p>}
        {batches.data && batches.data.items.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {batches.data.items.map((b) => (
              <li key={b.batch_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-medium text-navy-800">{b.title}</span>
                <StatusBadge value={b.status} />
                <span className="text-slate-500">{b.recipient_count} recipients · {formatDateTime(b.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
