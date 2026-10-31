import clsx from 'clsx'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, APP_MODE, type Appointment, type Call, type Escalation, type Task } from '@/api'
import { useStaffRole } from '@/features/clinic/workspace'
import { CreateAppointmentDialog } from '@/features/clinic/CreateAppointmentDialog'
import { CreateFollowUpDialog } from '@/features/clinic/CreateFollowUpDialog'
import { EditPatientDialog } from '@/features/clinic/EditPatientDialog'
import { PatientSummary } from '@/components/PatientSummary'
import { Timeline } from '@/components/Timeline'
import { Button, Card, DemoBadge, DetailList, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { appointmentNextStep } from '@/features/secondary/appointmentNextStep'
import { BackLink, LoadGate, RefreshError, TextLink, VoiceModeBadge } from '@/features/secondary/common'
import {
  bookingStatusLabel,
  comparePriority,
  confirmationStateLabel,
  formatDateTime,
  isReplacedVisit,
  label,
  outcomeLabel,
  relativeTime,
  taskStatusLabel,
} from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

const CLOSED_TASK_STATUSES = ['completed', 'cancelled']

function AppointmentItem({ appt }: { appt: Appointment }) {
  const cancelled = appt.booking_status === 'cancelled'
  const replaced = isReplacedVisit(appt)
  return (
    <li
      className={clsx(
        'py-3 first:pt-0 last:pb-0',
        cancelled && 'rounded-lg bg-slate-50/80 px-3 -mx-1 text-slate-400 opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className={clsx('text-sm', cancelled ? 'font-normal text-slate-400' : 'font-medium text-navy-800')}>
            {appt.department} · {appt.clinician}
          </div>
          <div className={clsx('text-xs', cancelled ? 'text-slate-400/90' : 'text-slate-500')}>
            {formatDateTime(appt.scheduled_at)} ({relativeTime(appt.scheduled_at)})
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {replaced ? (
            <StatusBadge
              value={appt.booking_status}
              text={bookingStatusLabel(appt.booking_status, appt.confirmation_state)}
              tone="red"
              className="opacity-90"
            />
          ) : (
            <>
              <StatusBadge
                value={appt.booking_status}
                text={`Booking: ${bookingStatusLabel(appt.booking_status, appt.confirmation_state)}`}
                tone={cancelled ? 'red' : undefined}
                className={cancelled ? 'opacity-90' : undefined}
              />
              <StatusBadge
                value={appt.confirmation_state}
                text={`Confirmation: ${confirmationStateLabel(appt.confirmation_state)}`}
                tone={cancelled ? 'grey' : undefined}
                className={cancelled ? 'opacity-70' : undefined}
              />
            </>
          )}
        </div>
      </div>
      {appt.confirmation_note && (
        <p className={clsx('mt-1 text-xs', cancelled ? 'text-slate-400/90' : 'text-slate-500')}>{appt.confirmation_note}</p>
      )}
      <div className={clsx('mt-1 text-xs', cancelled ? 'text-slate-400/90' : 'text-slate-600')}>
        Next step: <span className={cancelled ? 'font-normal' : 'font-medium'}>{appointmentNextStep(appt)}</span>
        {appt.task_id && (
          <>
            {' · '}
            <TextLink to={`/tasks/${appt.task_id}`} className={cancelled ? '!text-slate-400' : undefined}>
              Related task
            </TextLink>
          </>
        )}
      </div>
    </li>
  )
}

function TaskItem({ task }: { task: Task }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <TextLink to={`/tasks/${task.task_id}`}>{task.title}</TextLink>
          <div className="text-xs text-slate-500">
            {label(task.task_type)} · due {formatDateTime(task.due_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(task.priority === 'high' || task.priority === 'urgent') && <StatusBadge value={task.priority} />}
          <StatusBadge value={task.status} text={taskStatusLabel(task.status)} />
          {task.latest_outcome && APP_MODE === 'clinic' && (
            <StatusBadge value={task.latest_outcome} text={outcomeLabel(task.latest_outcome, true)} />
          )}
        </div>
      </div>
      <div className="mt-1 text-xs text-slate-600">
        Next action: <span className="font-medium">{task.next_action}</span>
      </div>
    </li>
  )
}

function CallItem({ call, clinic }: { call: Call; clinic: boolean }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <TextLink to={`/calls/${call.call_id}`}>{call.purpose}</TextLink>
          <div className="text-xs text-slate-500">
            {formatDateTime(call.started_at ?? call.created_at)} · {label(call.workflow)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!clinic && <VoiceModeBadge isLive={call.is_live} />}
          <StatusBadge value={call.status} />
          {call.outcome && <StatusBadge value={call.outcome} text={outcomeLabel(call.outcome, clinic)} />}
        </div>
      </div>
      {call.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{call.summary}</p>}
    </li>
  )
}

function EscalationItem({ esc }: { esc: Escalation }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <TextLink to={`/escalations/${esc.escalation_id}`}>{esc.reason}</TextLink>
          <div className="text-xs text-slate-500">
            {esc.routing_destination} · created {relativeTime(esc.created_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge value={esc.priority} />
          <StatusBadge value={esc.status} />
        </div>
      </div>
    </li>
  )
}

export default function PatientDetailPage() {
  const { patientId = '' } = useParams()
  const navigate = useNavigate()
  const [staffRole] = useStaffRole()
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [apptOpen, setApptOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const { data, error, loading, reload } = useAsync(() => api.getPatient(patientId), [patientId])

  const gate = (
    <LoadGate data={data} error={error} loading={loading} reload={reload} notFound={{ what: 'Patient', backTo: '/patients', backLabel: 'Back to patients' }} />
  )
  if (!data) {
    return (
      <div>
        <BackLink to="/patients">Patients</BackLink>
        {gate}
      </div>
    )
  }

  const { patient, appointments, tasks, calls, escalations, events } = data
  const sortedAppts = [...appointments].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const openTasks = tasks
    .filter((t) => !CLOSED_TASK_STATUSES.includes(t.status))
    .sort((a, b) => comparePriority(a.priority, b.priority) || a.due_at.localeCompare(b.due_at))
  const recentCalls = [...calls].sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))
  const openEscalations = escalations.filter((e) => e.status !== 'resolved')
  const resolvedEscalations = escalations.filter((e) => e.status === 'resolved')
  const sortEsc = (list: Escalation[]) =>
    [...list].sort(
      (a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || b.created_at.localeCompare(a.created_at),
    )

  return (
    <div>
      <BackLink to="/patients">Patients</BackLink>
      <PageHeader
        title={patient.display_name}
        subtitle={
          APP_MODE === 'clinic' ? (
            patient.demo_id ? `Chart ${patient.demo_id}` : 'Registered patient'
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              {patient.demo_id} <DemoBadge>Synthetic patient</DemoBadge>
            </span>
          )
        }
        actions={
          APP_MODE === 'clinic' && staffRole === 'desk' ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                Edit patient
              </Button>
              <Button variant="secondary" onClick={() => setApptOpen(true)}>
                Book appointment
              </Button>
              <Button onClick={() => setFollowUpOpen(true)}>Schedule follow-up call</Button>
            </div>
          ) : undefined
        }
      />
      <EditPatientDialog open={editOpen} patient={patient} onClose={() => setEditOpen(false)} onSaved={() => void reload()} />
      <CreateAppointmentDialog
        open={apptOpen}
        defaultPatientId={patient.patient_id}
        onClose={() => setApptOpen(false)}
        onCreated={(_id, taskId) => {
          void reload()
          if (taskId) navigate(`/tasks/${taskId}`)
        }}
      />
      <CreateFollowUpDialog
        open={followUpOpen}
        patientId={patient.patient_id}
        patientName={patient.display_name}
        onClose={() => setFollowUpOpen(false)}
        onCreated={(taskId) => {
          void reload()
          navigate(`/tasks/${taskId}`)
        }}
      />
      <RefreshError error={error} reload={reload} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Summary">
            <PatientSummary patient={patient} />
            <div className="mt-4 border-t border-slate-100 pt-4">
              <DetailList
                items={[
                  { label: 'Call consent', value: patient.contact_permitted ? 'Permitted' : 'Not permitted' },
                  { label: 'Contact', value: `${patient.phone_masked} (masked)` },
                  { label: 'Preferred language', value: label(patient.language) },
                  { label: 'Open follow-ups', value: openTasks.length },
                ]}
              />
            </div>
          </Card>

          <Card title={`Appointments (${appointments.length})`}>
            {sortedAppts.length === 0 ? (
              <EmptyState title="No appointments on record" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {sortedAppts.map((a) => (
                  <AppointmentItem key={a.appointment_id} appt={a} />
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Open tasks (${openTasks.length})`}>
            {openTasks.length === 0 ? (
              <EmptyState title="No open follow-ups" description="All tasks for this patient are completed or cancelled." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {openTasks.map((t) => (
                  <TaskItem key={t.task_id} task={t} />
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Recent calls (${calls.length})`}>
            {recentCalls.length === 0 ? (
              <EmptyState title="No calls yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentCalls.map((c) => (
                  <CallItem key={c.call_id} call={c} clinic={APP_MODE === 'clinic'} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title={
              openEscalations.length > 0
                ? `Clinical reviews needing action (${openEscalations.length})`
                : resolvedEscalations.length > 0
                  ? 'Clinical review history'
                  : 'Clinical reviews'
            }
          >
            {openEscalations.length === 0 && resolvedEscalations.length === 0 ? (
              <EmptyState title="No clinical reviews on file" description="Concerns from Jiya calls will appear here when routed for staff." />
            ) : (
              <div className="space-y-4">
                {openEscalations.length === 0 ? (
                  <EmptyState
                    title="No open clinical reviews"
                    description={`${resolvedEscalations.length} past concern${resolvedEscalations.length === 1 ? '' : 's'} already resolved by staff.`}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {sortEsc(openEscalations).map((e) => (
                      <EscalationItem key={e.escalation_id} esc={e} />
                    ))}
                  </ul>
                )}
                {resolvedEscalations.length > 0 && (
                  <div className={openEscalations.length > 0 ? 'border-t border-slate-100 pt-4' : ''}>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Resolved ({resolvedEscalations.length})
                    </p>
                    <ul className="divide-y divide-slate-100 opacity-80">
                      {sortEsc(resolvedEscalations).map((e) => (
                        <EscalationItem key={e.escalation_id} esc={e} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card title="Activity">
            <Timeline events={events} />
          </Card>
        </div>
      </div>
    </div>
  )
}
