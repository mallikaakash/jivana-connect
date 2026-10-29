import { Info } from 'lucide-react'
import { api, type Appointment, type WithPatientName } from '@/api'
import { DataTable, type Column } from '@/components/DataTable'
import { Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { appointmentNextStep } from '@/features/secondary/appointmentNextStep'
import { LoadGate, RefreshError, TextLink } from '@/features/secondary/common'
import { formatTime, label } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type Row = WithPatientName<Appointment>

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
    render: (a) => <span className="font-medium text-navy-800">{formatTime(a.scheduled_at)}</span>,
  },
  { key: 'patient', header: 'Patient', render: (a) => <TextLink to={`/patients/${a.patient_id}`}>{a.patient_name}</TextLink> },
  {
    key: 'dept',
    header: 'Department / clinician',
    render: (a) => (
      <div>
        <div>{a.department}</div>
        <div className="text-xs text-slate-500">{a.clinician}</div>
      </div>
    ),
  },
  { key: 'booking', header: 'Booking status', render: (a) => <StatusBadge value={a.booking_status} /> },
  { key: 'confirmation', header: 'Confirmation', render: (a) => <StatusBadge value={a.confirmation_state} /> },
  {
    key: 'next',
    header: 'Next step',
    render: (a) => {
      const step = appointmentNextStep(a)
      return <span className={step === 'None' ? 'text-slate-400' : 'font-medium text-slate-700'}>{step}</span>
    },
  },
  {
    key: 'task',
    header: 'Related task',
    className: 'whitespace-nowrap',
    render: (a) => (a.task_id ? <TextLink to={`/tasks/${a.task_id}`}>View task</TextLink> : <span className="text-slate-400">—</span>),
  },
]

export default function AppointmentsPage() {
  const { data, error, loading, reload } = useAsync(() => api.listAppointments(), [])

  const groups = new Map<string, Row[]>()
  for (const a of [...(data?.items ?? [])].sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))) {
    const key = dayKey(a.scheduled_at)
    groups.set(key, [...(groups.get(key) ?? []), a])
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Booking status and Jiya confirmation state, shown separately. <DemoBadge />
          </span>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">{label('rescheduling_requested')}</span> means the patient asked for a different slot on a call. It does{' '}
          <span className="font-semibold">not</span> change the booking: date, time and booking status stay as they are until staff rebook and the booking
          system confirms the change.
        </p>
      </div>

      <RefreshError error={data ? error : undefined} reload={reload} />
      <LoadGate data={data} error={error} loading={loading} reload={reload} />

      {data && groups.size === 0 && (
        <Card>
          <DataTable
            columns={columns}
            rows={[]}
            rowKey={(a) => a.appointment_id}
            emptyTitle="No appointments"
            emptyDescription="There are no appointments in the demo dataset."
          />
        </Card>
      )}

      <div className="space-y-6">
        {[...groups.entries()].map(([key, rows]) => (
          <Card key={key} title={`${dayHeading(key)} (${rows.length})`}>
            <DataTable columns={columns} rows={rows} rowKey={(a) => a.appointment_id} />
          </Card>
        ))}
      </div>
    </div>
  )
}
