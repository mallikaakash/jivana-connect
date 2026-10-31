import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, APP_MODE, ESCALATION_STATUSES, type Escalation, type EscalationStatus, type WithPatientName } from '@/api'
import { useStaffRole } from '@/features/clinic/workspace'
import { DataTable, type Column } from '@/components/DataTable'
import { Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { FilterSelect, LoadGate, Note, RefreshError, TextLink } from '@/features/secondary/common'
import { comparePriority, formatDateTime, label, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type Row = WithPatientName<Escalation>
type StatusFilter = 'active' | 'all' | EscalationStatus

const columns: Column<Row>[] = [
  { key: 'priority', header: 'Priority', render: (e) => <StatusBadge value={e.priority} /> },
  {
    key: 'reason',
    header: 'Reason',
    render: (e) => (
      <div>
        <div className="font-medium text-navy-800">{e.reason}</div>
        <div className="text-xs text-slate-500">{e.routing_destination}</div>
      </div>
    ),
  },
  { key: 'patient', header: 'Patient', render: (e) => <TextLink to={`/patients/${e.patient_id}`}>{e.patient_name}</TextLink> },
  {
    key: 'source',
    header: 'Source',
    className: 'whitespace-nowrap',
    render: (e) => (
      <div className="flex flex-col gap-0.5 text-xs">
        {e.call_id ? <TextLink to={`/calls/${e.call_id}`}>Source call</TextLink> : <span className="text-slate-400">No call</span>}
        {e.task_id ? <TextLink to={`/tasks/${e.task_id}`}>Source task</TextLink> : <span className="text-slate-400">No task</span>}
      </div>
    ),
  },
  {
    key: 'created',
    header: 'Created',
    className: 'whitespace-nowrap',
    render: (e) => <span title={formatDateTime(e.created_at)}>{relativeTime(e.created_at)}</span>,
  },
  { key: 'status', header: 'Status', render: (e) => <StatusBadge value={e.status} /> },
  { key: 'assigned', header: 'Assigned to', render: (e) => e.assigned_to ?? <span className="text-slate-400">Unassigned</span> },
]

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active (not resolved)' },
  ...ESCALATION_STATUSES.map((s) => ({ value: s as StatusFilter, label: label(s) })),
  { value: 'all', label: 'All' },
]

export default function EscalationsPage() {
  const navigate = useNavigate()
  const [staffRole] = useStaffRole()
  const clinicalTitle = APP_MODE === 'clinic' && staffRole === 'doctor'
  const [filter, setFilter] = useState<StatusFilter>('active')

  const { data, error, loading, reload } = useAsync(
    () => api.listEscalations({ status: filter === 'active' || filter === 'all' ? undefined : filter }),
    [filter],
  )

  const rows = (data?.items ?? [])
    .filter((e) => (filter === 'active' ? e.status !== 'resolved' : true))
    .sort(
      (a, b) =>
        Number(a.status === 'resolved') - Number(b.status === 'resolved') ||
        comparePriority(a.priority, b.priority) ||
        b.created_at.localeCompare(a.created_at),
    )

  return (
    <div>
      <PageHeader
        title={clinicalTitle ? 'Clinical review' : 'Escalations'}
        subtitle={
          APP_MODE === 'clinic' ? (
            clinicalTitle
              ? 'Patient questions and concerns from Jiya follow-ups — for clinician judgment.'
              : 'Patient-reported concerns routed for human review.'
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Patient-reported concerns routed for human review. <DemoBadge />
            </span>
          )
        }
      />
      <Card title="Escalation queue">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterSelect label="Status" value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          <Note>Jiya does not diagnose or give treatment advice. Escalations stay here until staff record the next step.</Note>
        </div>
        <RefreshError error={data ? error : undefined} reload={reload} />
        <LoadGate data={data} error={error} loading={loading} reload={reload} />
        {data && (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(e) => e.escalation_id}
            onRowClick={(e) => navigate(`/escalations/${e.escalation_id}`)}
            rowClassName={(e) => (e.status === 'resolved' ? 'opacity-60' : undefined)}
            emptyTitle={filter === 'active' ? 'No escalations need attention' : 'No escalations match this filter'}
            emptyDescription={filter === 'active' ? 'Every routed concern has been resolved by staff.' : undefined}
          />
        )}
      </Card>
    </div>
  )
}
