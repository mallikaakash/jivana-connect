import { CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { api, type DailyConfirmationBatchPreview } from '@/api'
import { Button, ErrorBanner } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'

export function DailyConfirmationBatchPanel({ batchTimeIst }: { batchTimeIst: string }) {
  const preview = useAsync(() => api.previewDailyConfirmationBatch(), [])
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<Error | null>(null)
  const [runOk, setRunOk] = useState<string | null>(null)

  async function runNow() {
    setRunning(true)
    setRunError(null)
    setRunOk(null)
    try {
      const res = await api.runDailyConfirmationBatch()
      setRunOk(`Scheduled ${res.recipient_count} confirmation call(s) for patients visiting on ${res.appointment_date}.`)
      await preview.reload()
    } catch (e) {
      setRunError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setRunning(false)
    }
  }

  const data = preview.data as DailyConfirmationBatchPreview | undefined

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-5 text-sm text-teal-950">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Tomorrow&apos;s appointment confirmations</p>
          <p className="mt-1 text-teal-900/90">
            Each day around <strong>{batchTimeIst} IST</strong>, Jiya calls everyone with an appointment the next day. New
            bookings are queued automatically — no need to click call for each patient.
          </p>
          {preview.error && (
            <div className="mt-3">
              <ErrorBanner error={preview.error} onRetry={() => void preview.reload()} />
            </div>
          )}
          {data && (
            <p className="mt-3 text-teal-900">
              <strong>{data.recipient_count}</strong> patient(s) ready for tomorrow ({data.appointment_date}
              ).{' '}
              {data.already_scheduled_today
                ? 'Today’s batch was already created.'
                : 'Not scheduled yet for today.'}
            </p>
          )}
          {runError && (
            <div className="mt-3">
              <ErrorBanner error={runError} onRetry={() => void runNow()} />
            </div>
          )}
          {runOk && <p className="mt-3 font-medium text-emerald-800">{runOk}</p>}
          <Button
            type="button"
            className="mt-4"
            loading={running}
            disabled={!!data?.already_scheduled_today || (data?.recipient_count ?? 0) === 0}
            onClick={() => void runNow()}
          >
            Run today&apos;s confirmation batch now
          </Button>
          <p className="mt-2 text-xs text-teal-800/80">
            Other follow-ups (check-ins, reminders) — use Tasks → Start Jiya call or the manual batch section below.
          </p>
        </div>
      </div>
    </div>
  )
}
