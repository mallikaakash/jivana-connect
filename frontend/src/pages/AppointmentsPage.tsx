import clsx from 'clsx'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, APP_MODE, ApiError, type Appointment, type WithPatientName } from '@/api'
import { CreateAppointmentDialog } from '@/features/clinic/CreateAppointmentDialog'
import { useStaffRole } from '@/features/clinic/workspace'
import { Button } from '@/components/ui'
import { DataTable, type Column } from '@/components/DataTable'
import { Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { appointmentNextStep } from '@/features/secondary/appointmentNextStep'
import { CLINIC_HELP } from '@/features/clinic/helpCopy'
import { LoadGate, RefreshError, TextLink } from '@/features/secondary/common'
import { bookingStatusLabel, confirmationStateLabel, formatTime, isReplacedVisit } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type Row = WithPatientName<Appointment>

function isMutedAppointment(a: Pick<Appointment, 'booking_status'>) {
  return a.booking_status === 'cancelled'
}

const TZ = 'Asia/Kolkata'

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

function dayHeading(key: string): string {
  const today = dayKey(new Date().toISOString())
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString())
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString())
  const pretty = new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
  const rel = key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : key === yesterday ? 'Yesterday' : null
  return rel ? `${rel} · ${pretty}` : pretty
}

const columns: Column<Row>[] = [
  {
    key: 'time',
    header: 'Time',
    className: 'whitespace-nowrap',
    sortValue: (a) => a.scheduled_at,
    render: (a) => (
      <span className={a.booking_status === 'cancelled' ? 'font-normal text-slate-400' : 'font-medium text-navy-800'}>
        {formatTime(a.scheduled_at)}
      </span>
    ),
  },
  {
    key: 'patient',
    header: 'Patient',
    sortValue: (a) => a.patient_name,
    render: (a) => (
      <TextLink
        to={`/patients/${a.patient_id}`}
        className={a.booking_status === 'cancelled' ? '!text-slate-400 hover:!text-slate-500' : undefined}
      >
        {a.patient_name}
      </TextLink>
    ),
  },
  {
    key: 'dept',
    header: 'Department / clinician',
    sortValue: (a) => `${a.department} ${a.clinician}`,
    render: (a) => {
      const muted = isMutedAppointment(a)
      return (
        <div className={muted ? 'text-slate-400' : undefined}>
          <div className={muted ? 'font-normal' : undefined}>{a.department}</div>
          <div className={clsx('text-xs', muted ? 'text-slate-400/90' : 'text-slate-500')}>{a.clinician}</div>
        </div>
      )
    },
  },
  {
    key: 'booking',
    header: 'Booking status',
    sortValue: (a) => a.booking_status,
    render: (a) => {
      const muted = isMutedAppointment(a)
      return (
        <StatusBadge
          value={a.booking_status}
          text={bookingStatusLabel(a.booking_status, a.confirmation_state)}
          tone={muted ? 'red' : undefined}
          className={muted ? 'opacity-90' : undefined}
        />
      )
    },
  },
  {
    key: 'confirmation',
    header: 'Confirmation',
    sortValue: (a) => a.confirmation_state,
    render: (a) =>
      isReplacedVisit(a) ? (
        <span className="text-xs text-slate-400">—</span>
      ) : (
        <StatusBadge
          value={a.confirmation_state}
          text={confirmationStateLabel(a.confirmation_state)}
          tone={a.booking_status === 'cancelled' ? 'grey' : undefined}
        />
      ),
  },
  {
    key: 'requested',
    header: 'Requested slot (not booked)',
    sortValue: (a) => a.requested_slot ?? '',
    render: (a) =>
      a.requested_slot ? (
        <div className="max-w-[12rem] text-xs">
          <span className="font-medium text-navy-800">{a.requested_slot}</span>
          {a.requested_slot_task_id && (
            <div className="mt-0.5">
              <TextLink to={`/tasks/${a.requested_slot_task_id}`}>Open follow-up task</TextLink>
            </div>
          )}
        </div>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    key: 'note',
    header: 'Call note',
    sortValue: (a) => a.confirmation_note ?? '',
    render: (a) =>
      a.confirmation_note ? (
        <span
          className={clsx(
            'max-w-[14rem] text-xs',
            a.booking_status === 'cancelled' ? 'text-slate-400' : 'text-slate-700',
          )}
        >
          {a.confirmation_note}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    key: 'next',
    header: 'Next step',
    sortValue: (a) => appointmentNextStep(a),
    render: (a) => {
      const step = appointmentNextStep(a)
      return (
        <span
          className={clsx(
            step === 'None' ? 'text-slate-400' : 'font-medium text-slate-700',
            a.booking_status === 'cancelled' && '!font-normal !text-slate-400',
          )}
        >
          {step}
        </span>
      )
    },
  },
  {
    key: 'task',
    header: 'Related task',
    className: 'whitespace-nowrap',
    render: (a) =>
      a.task_id ? (
        <TextLink to={`/tasks/${a.task_id}`} className={isMutedAppointment(a) ? '!text-slate-400 hover:!text-slate-500' : undefined}>
          View task
        </TextLink>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
]

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [staffRole] = useStaffRole()
  const [bookOpen, setBookOpen] = useState(false)
  const { data, error, loading, reload } = useAsync(() => api.listAppointments(), [])

  async function cancelAppointment(appointmentId: string) {
    if (!window.confirm('Cancel this appointment?')) return
    try {
      await api.updateAppointment(appointmentId, { booking_status: 'cancelled' })
      void reload()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Could not cancel')
    }
  }

  const tableColumns: Column<Row>[] =
    APP_MODE === 'clinic' && staffRole === 'desk'
      ? [
          ...columns,
          {
            key: 'actions',
            header: '',
            render: (a) =>
              a.booking_status === 'scheduled' ? (
                <Button variant="secondary" className="text-xs" onClick={() => void cancelAppointment(a.appointment_id)}>
                  Cancel
                </Button>
              ) : null,
          },
        ]
      : columns

  const groups = new Map<string, Row[]>()
  for (const a of [...(data?.items ?? [])].sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))) {
    const key = dayKey(a.scheduled_at)
    groups.set(key, [...(groups.get(key) ?? []), a])
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        info={APP_MODE === 'clinic' ? CLINIC_HELP.appointmentsPage : undefined}
        subtitle={
          APP_MODE === 'clinic' ? undefined : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Booking status and Jiya confirmation state, shown separately. <DemoBadge />
            </span>
          )
        }
        actions={
          APP_MODE === 'clinic' && staffRole === 'desk' ? (
            <Button onClick={() => setBookOpen(true)}>Book appointment</Button>
          ) : undefined
        }
      />
      <CreateAppointmentDialog
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        onCreated={(_apptId, taskId) => {
          void reload()
          if (taskId) navigate(`/tasks/${taskId}`)
        }}
      />

      <RefreshError error={data ? error : undefined} reload={reload} />
      <LoadGate data={data} error={error} loading={loading} reload={reload} />

      {data && groups.size === 0 && (
        <Card>
          <DataTable
            columns={tableColumns}
            rows={[]}
            rowKey={(a) => a.appointment_id}
            emptyTitle="No appointments"
            emptyDescription={APP_MODE === 'clinic' ? 'Book the first appointment from this page.' : 'There are no appointments in the demo dataset.'}
          />
        </Card>
      )}

      <div className="space-y-6">
        {[...groups.entries()].map(([key, rows]) => (
          <Card key={key} title={`${dayHeading(key)} (${rows.length})`}>
            <DataTable
              columns={tableColumns}
              rows={rows}
              defaultSort={{ key: 'time', direction: 'asc' }}
              rowKey={(a) => a.appointment_id}
              rowClassName={(a) =>
                isMutedAppointment(a) ? 'bg-slate-50/80 opacity-75 [&>td]:text-slate-400' : undefined
              }
            />
          </Card>
        ))}
      </div>
    </div>
  )
}
