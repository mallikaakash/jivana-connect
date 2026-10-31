import { AlertTriangle, ClipboardList, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, APP_MODE, ApiError } from '@/api'
import { useStaffRole } from '@/features/clinic/workspace'
import { PatientSummary } from '@/components/PatientSummary'
import { Button, Card, DemoBadge, DetailList, EmptyState, ExtractedFields, PageHeader, StatusBadge } from '@/components/ui'
import { isActiveCall } from '@/features/secondary/helpers'
import { BackLink, LoadGate, Note, RefreshError, TextLink } from '@/features/secondary/common'
import { Transcript } from '@/features/secondary/Transcript'
import { formatDateTime, label, outcomeLabel, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

export default function CallDetailPage() {
  const { callId = '' } = useParams()
  const [staffRole] = useStaffRole()
  const [pollMs, setPollMs] = useState<number>()
  const [staffNote, setStaffNote] = useState('')
  const [staffBusy, setStaffBusy] = useState(false)
  const [staffErr, setStaffErr] = useState<string | null>(null)

  const { data, error, loading, reload } = useAsync(
    async () => {
      const res = await api.getCall(callId)
      // Poll while the call is still running so the outcome appears once the webhook/simulator finishes.
      setPollMs(isActiveCall(res.call.status) ? 3000 : undefined)
      return res
    },
    [callId],
    pollMs,
  )

  if (!data) {
    return (
      <div>
        <BackLink to="/calls">Calls</BackLink>
        <LoadGate data={data} error={error} loading={loading} reload={reload} notFound={{ what: 'Call', backTo: '/calls', backLabel: 'Back to calls' }} />
      </div>
    )
  }

  const { call, patient, task, escalation } = data
  const active = isActiveCall(call.status)

  return (
    <div>
      <BackLink to="/calls">Calls</BackLink>
      <PageHeader
        title={call.purpose}
        subtitle={
          APP_MODE === 'clinic' ? (
            label(call.workflow)
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{call.call_id}</span> · {label(call.workflow)}
              {!call.is_live && <DemoBadge>Simulated call</DemoBadge>}
            </span>
          )
        }
      />
      <RefreshError error={error} reload={reload} />

      {active && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 className="h-4 w-4 animate-spin" />
          Call is {label(call.status).toLowerCase()}. This page refreshes automatically until the result is processed.
        </div>
      )}

      {APP_MODE === 'clinic' && staffRole === 'desk' && ['initiating', 'in_progress', 'queued', 'no_answer', 'failed'].includes(call.status) && (
        <Card title="Staff override" className="mb-6">
          <p className="text-sm text-slate-600">Mark this call complete if you reached the patient by phone or handled it outside the automated call.</p>
          {staffErr && <p className="mt-2 text-sm text-red-600">{staffErr}</p>}
          <textarea
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            rows={2}
            placeholder="Brief note for the record"
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
          />
          <Button
            className="mt-3"
            loading={staffBusy}
            onClick={async () => {
              setStaffBusy(true)
              setStaffErr(null)
              try {
                await api.staffCompleteCall(callId, { action: 'staff_complete', summary: staffNote || 'Completed by staff', author: 'Front desk' })
                setPollMs(undefined)
                void reload()
              } catch (e) {
                setStaffErr(e instanceof ApiError ? e.message : 'Could not update call')
              } finally {
                setStaffBusy(false)
              }
            }}
          >
            Mark complete
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Status">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Call status</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge value={call.status} />
                  {call.outcome && (
                    <StatusBadge value={call.outcome} text={`Outcome: ${outcomeLabel(call.outcome, APP_MODE === 'clinic')}`} />
                  )}
                </div>
                <Note className="mt-2">Whether the conversation itself happened and finished.</Note>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Task status</div>
                <div className="mt-1.5">
                  <StatusBadge value={task.status} />
                </div>
                <Note className="mt-2">
                  Next action: <span className="font-medium text-slate-700">{task.next_action}</span>
                </Note>
              </div>
            </div>
          </Card>

          <Card title="Summary">
            {call.summary ? (
              <p className="text-sm leading-relaxed text-slate-700">{call.summary}</p>
            ) : (
              <EmptyState title={active ? 'Summary will appear when the call ends' : 'No summary available'} />
            )}
          </Card>

          <Card
            title="Transcript"
            actions={
              call.transcript && call.transcript_is_example && APP_MODE !== 'clinic' ? <DemoBadge>Prototype example</DemoBadge> : undefined
            }
          >
            {call.transcript && call.transcript.length > 0 ? (
              <>
                {call.transcript_is_example && <Note className="mb-3">Illustrative transcript for the demo, not a recording of a real conversation.</Note>}
                <Transcript turns={call.transcript} />
              </>
            ) : (
              <EmptyState
                title="No transcript available"
                description={active ? 'The transcript is available after the call completes.' : 'The provider did not return a transcript for this call.'}
              />
            )}
          </Card>

          <Card title="Extracted fields">
            <ExtractedFields fields={call.extracted_fields} />
          </Card>

          {APP_MODE !== 'clinic' && (
            <Card title="Backend processing result">
              {call.processing_result ? (
                <p className="text-sm leading-relaxed text-slate-700">{call.processing_result}</p>
              ) : (
                <EmptyState title={active ? 'Not processed yet' : 'No processing result recorded'} />
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Patient">
            <PatientSummary patient={patient} />
          </Card>

          <Card title="Linked task">
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <TextLink to={`/tasks/${task.task_id}`}>{task.title}</TextLink>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusBadge value={task.status} />
                  <StatusBadge value={task.priority} />
                </div>
                <Note className="mt-1.5">
                  {label(task.task_type)} · due {formatDateTime(task.due_at)} · attempts {task.attempt_count}
                </Note>
              </div>
            </div>
          </Card>

          {escalation && (
            <Card title="Escalation">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <TextLink to={`/escalations/${escalation.escalation_id}`}>{escalation.reason}</TextLink>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusBadge value={escalation.status} />
                    <StatusBadge value={escalation.priority} />
                  </div>
                  <Note className="mt-1.5">Routed to {escalation.routing_destination}</Note>
                </div>
              </div>
            </Card>
          )}

          <Card title="Details">
            <DetailList
              items={[
                { label: 'Created', value: formatDateTime(call.created_at) },
                { label: 'Started', value: formatDateTime(call.started_at) },
                { label: 'Completed', value: call.completed_at ? `${formatDateTime(call.completed_at)} (${relativeTime(call.completed_at)})` : '—' },
                ...(APP_MODE !== 'clinic'
                  ? [
                      { label: 'Voice', value: call.is_live ? 'Live Jiya call (Bolna)' : 'Simulated — no real phone call' },
                      ...(call.provider_call_id
                        ? [{ label: 'Provider call ID', value: <span className="break-all font-mono text-xs">{call.provider_call_id}</span> }]
                        : []),
                    ]
                  : []),
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
