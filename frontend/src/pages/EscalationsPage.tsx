import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, APP_MODE, ESCALATION_STATUSES, type Escalation, type EscalationStatus, type WithPatientName } from '@/api'
import { CLINIC_HELP } from '@/features/clinic/helpCopy'
import { useStaffRole } from '@/features/clinic/workspace'
import { DataTable, type Column } from '@/components/DataTable'
import { Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { FilterSelect, LoadGate, RefreshError, TextLink } from '@/features/secondary/common'
import { formatDateTime, label, relativeTime } from '@/lib/format'
import { sortKeyPriority } from '@/lib/tableSort'
import { useAsync } from '@/lib/useAsync'

type Row = WithPatientName<Escalation>
type StatusFilter = 'active' | 'all' | EscalationStatus

const columns: Column<Row>[] = [
  { key: 'priority', header: 'Priority', sortValue: (e) => sortKeyPriority(e.priority), render: (e) => <StatusBadge value={e.priority} /> },
  {
    key: 'reason',
    header: 'Reason',
    sortValue: (e) => e.reason,
    render: (e) => (
      <div>
        <div className="font-medium text-navy-800">{e.reason}</div>
        <div className="text-xs text-slate-500">{e.routing_destination}</div>
      </div>
    ),
  },
  { key: 'patient', header: 'Patient', sortValue: (e) => e.patient_name, render: (e) => <TextLink to={`/patients/${e.patient_id}`}>{e.patient_name}</TextLink> },
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
    sortValue: (e) => e.created_at,
    render: (e) => <span title={formatDateTime(e.created_at)}>{relativeTime(e.created_at)}</span>,
  },
  { key: 'status', header: 'Status', sortValue: (e) => e.status, render: (e) => <StatusBadge value={e.status} /> },
  {
    key: 'assigned',
    header: 'Assigned to',
    sortValue: (e) => e.assigned_to ?? '',
    render: (e) => e.assigned_to ?? <span className="text-slate-400">Unassigned</span>,
  },
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

  const allItems = data?.items ?? []
  const resolvedOnFile = allItems.filter((e) => e.status === 'resolved').length
  const rows = allItems.filter((e) => (filter === 'active' ? e.status !== 'resolved' : true))

  return (
    <div>
      <PageHeader
        title={clinicalTitle ? 'Clinical review' : 'Escalations'}
        info={APP_MODE === 'clinic' ? CLINIC_HELP.escalationsPage : undefined}
        subtitle={
          APP_MODE === 'clinic' ? undefined : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Patient-reported concerns routed for human review. <DemoBadge />
            </span>
          )
        }
      />
      <Card title="Escalation queue">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterSelect label="Status" value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
        </div>
        <RefreshError error={data ? error : undefined} reload={reload} />
        <LoadGate data={data} error={error} loading={loading} reload={reload} />
        {data && (
          <DataTable
            columns={columns}
            rows={rows}
            defaultSort={{ key: 'priority', direction: 'asc' }}
            rowKey={(e) => e.escalation_id}
            onRowClick={(e) => navigate(`/escalations/${e.escalation_id}`)}
            rowClassName={(e) => (e.status === 'resolved' ? 'opacity-60' : undefined)}
            emptyTitle={filter === 'active' ? 'No escalations need attention' : 'No escalations match this filter'}
            emptyDescription={
              filter === 'active'
                ? resolvedOnFile > 0
                  ? `Queue is clear. ${resolvedOnFile} resolved concern${resolvedOnFile === 1 ? '' : 's'} on file — set Status to All to view history.`
                  : 'Every routed concern has been resolved by staff.'
                : undefined
            }
          />
        )}
      </Card>
    </div>
  )
}
