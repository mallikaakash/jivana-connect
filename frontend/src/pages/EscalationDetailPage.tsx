import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, APP_MODE, type Escalation } from '@/api'
import { staffDisplayName, useStaffRole } from '@/features/clinic/workspace'
import { PatientSummary } from '@/components/PatientSummary'
import { Timeline } from '@/components/Timeline'
import { Card, DemoBadge, DetailList, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { BackLink, LoadGate, Note, RefreshError, TextLink, VoiceModeBadge } from '@/features/secondary/common'
import { EscalationActions } from '@/features/secondary/EscalationActions'
import { Transcript } from '@/features/secondary/Transcript'
import { formatDateTime, label, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

export default function EscalationDetailPage() {
  const { escalationId = '' } = useParams()
  const [staffRole] = useStaffRole()
  const meta = useAsync(() => api.getMeta(), [])
  const isDoctorClinic = APP_MODE === 'clinic' && staffRole === 'doctor'
  const staffAuthor = staffDisplayName(meta.data?.clinical_lead_label)
  const { data, error, loading, reload } = useAsync(() => api.getEscalation(escalationId), [escalationId])
  // Escalation as returned by the latest PATCH response. It applies only to the detail payload it was made against,
  // so once the follow-up refetch (with fresh events) lands, that newer payload wins.
  const [fromAction, setFromAction] = useState<{ base: typeof data; escalation: Escalation }>()

  if (!data) {
    return (
      <div>
        <BackLink to="/escalations">{isDoctorClinic ? 'Clinical review' : 'Escalations'}</BackLink>
        <LoadGate
          data={data}
          error={error}
          loading={loading}
          reload={reload}
          notFound={{ what: 'Escalation', backTo: '/escalations', backLabel: 'Back to escalations' }}
        />
      </div>
    )
  }

  const { patient, call, task, events } = data
  const escalation = fromAction && fromAction.base === data ? fromAction.escalation : data.escalation
  const notes = [...escalation.notes].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div>
      <BackLink to="/escalations">{isDoctorClinic ? 'Clinical review' : 'Escalations'}</BackLink>
      <PageHeader
        title={escalation.reason}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Created {relativeTime(escalation.created_at)} · {formatDateTime(escalation.created_at)} {APP_MODE !== 'clinic' && <DemoBadge />}
          </span>
        }
        actions={
          <>
            <StatusBadge value={escalation.priority} text={`${label(escalation.priority)} priority`} />
            <StatusBadge value={escalation.status} />
          </>
        }
      />
      <RefreshError error={error} reload={reload} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={isDoctorClinic ? 'What the patient said' : 'Patient-reported concern'}>
            <blockquote className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-base leading-relaxed font-medium text-navy-900">
              {escalation.concern_summary}
            </blockquote>
            {call?.transcript && call.transcript.length > 0 && (
              <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-navy-800">Transcript</summary>
                <div className="mt-2 max-h-64 overflow-y-auto">
                  <Transcript turns={call.transcript.slice(-8)} />
                </div>
              </details>
            )}
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" />
              <span>Jiya does not diagnose or give treatment advice; this concern was routed for human review.</span>
            </div>
            <div className="mt-4">
              <DetailList
                items={[
                  { label: 'Reason', value: escalation.reason },
                  { label: 'Priority', value: <StatusBadge value={escalation.priority} /> },
                  ...(isDoctorClinic
                    ? []
                    : [{ label: 'Assigned clinic team', value: escalation.routing_destination }]),
                  { label: 'Assigned to', value: escalation.assigned_to ?? <span className="text-slate-400">Unassigned</span> },
                  { label: 'Status', value: <StatusBadge value={escalation.status} /> },
                  { label: 'Last updated', value: formatDateTime(escalation.updated_at) },
                ]}
              />
            </div>
          </Card>

          <Card title="Source call">
            {call ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <TextLink to={`/calls/${call.call_id}`}>{call.purpose}</TextLink>
                  {APP_MODE !== 'clinic' && <VoiceModeBadge isLive={call.is_live} />}
                  <StatusBadge value={call.status} />
                  {call.outcome && <StatusBadge value={call.outcome} />}
                </div>
                <Note className="mt-1">{formatDateTime(call.started_at ?? call.created_at)}</Note>
                {call.summary ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{call.summary}</p>
                ) : (
                  <Note className="mt-2">No call summary recorded.</Note>
                )}
              </div>
            ) : (
              <EmptyState title="No linked call" description="This escalation was not created from a Jiya call." />
            )}
          </Card>

          <Card title={`Notes (${notes.length})`}>
            {notes.length === 0 ? (
              <EmptyState title="No notes yet" />
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.note_id} className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-sm text-slate-800">{n.text}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {n.author} · {relativeTime(n.created_at)} · {formatDateTime(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Staff action history">
            <Timeline events={events} emptyTitle="No actions recorded yet" />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Actions">
            <EscalationActions
              escalation={escalation}
              author={APP_MODE === 'clinic' ? staffAuthor : undefined}
              requireResolutionNote={isDoctorClinic}
              requireResolutionType={APP_MODE === 'clinic'}
              onUpdated={(e) => {
                setFromAction({ base: data, escalation: e })
                void reload()
              }}
            />
          </Card>

          <Card title="Patient">
            <PatientSummary patient={patient} />
          </Card>

          <Card title="Linked task">
            {task ? (
              <div>
                <TextLink to={`/tasks/${task.task_id}`}>{task.title}</TextLink>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusBadge value={task.status} />
                </div>
                <Note className="mt-1.5">Next action: {task.next_action}</Note>
              </div>
            ) : (
              <EmptyState title="No linked task" />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
