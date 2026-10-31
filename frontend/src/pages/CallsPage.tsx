import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, APP_MODE, CALL_STATUSES, type Call, type CallStatus, type WithPatientName } from '@/api'
import { useStaffRole } from '@/features/clinic/workspace'
import { DataTable, type Column } from '@/components/DataTable'
import { Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { isActiveCall } from '@/features/secondary/helpers'
import { FilterSelect, LoadGate, RefreshError, TextLink, VoiceModeBadge } from '@/features/secondary/common'
import { formatDateTime, label, outcomeLabel } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type Row = WithPatientName<Call>
type StatusFilter = CallStatus | 'all'
type ViewFilter = 'all' | 'clinical'

const columns = (clinic: boolean): Column<Row>[] => [
  ...(clinic
    ? []
    : [{ key: 'id', header: 'Call ID', className: 'whitespace-nowrap', render: (c: Row) => <span className="font-mono text-xs text-slate-600">{c.call_id}</span> }]),
  { key: 'patient', header: 'Patient', render: (c) => <TextLink to={`/patients/${c.patient_id}`}>{c.patient_name}</TextLink> },
  {
    key: 'purpose',
    header: 'Purpose / workflow',
    render: (c) => (
      <div>
        <div className="text-slate-800">{c.purpose}</div>
        <div className="text-xs text-slate-500">{label(c.workflow)}</div>
      </div>
    ),
  },
  {
    key: 'time',
    header: 'Started / completed',
    className: 'whitespace-nowrap',
    render: (c) => (
      <div className="text-xs">
        <div>
          <span className="text-slate-400">Started </span>
          {formatDateTime(c.started_at)}
        </div>
        <div>
          <span className="text-slate-400">Ended </span>
          {formatDateTime(c.completed_at)}
        </div>
      </div>
    ),
  },
  { key: 'status', header: 'Call status', render: (c) => <StatusBadge value={c.status} /> },
  {
    key: 'outcome',
    header: 'Outcome',
    render: (c) =>
      c.outcome ? <StatusBadge value={c.outcome} text={outcomeLabel(c.outcome, clinic)} /> : <span className="text-slate-400">—</span>,
  },
  { key: 'task', header: 'Task', className: 'whitespace-nowrap', render: (c) => <TextLink to={`/tasks/${c.task_id}`}>View task</TextLink> },
  ...(clinic ? [] : [{ key: 'mode', header: 'Voice', render: (c: Row) => <VoiceModeBadge isLive={c.is_live} /> }]),
]

export default function CallsPage() {
  const navigate = useNavigate()
  const [staffRole] = useStaffRole()
  const clinic = APP_MODE === 'clinic'
  const [status, setStatus] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewFilter>('all')
  const [pollMs, setPollMs] = useState<number>()

  const { data, error, loading, reload } = useAsync(
    async () => {
      const res = await api.listCalls({
        status: status === 'all' ? undefined : status,
        flagged: view === 'clinical' ? 'clinical' : undefined,
      })
      setPollMs(res.items.some((c) => isActiveCall(c.status)) ? 5000 : undefined)
      return res
    },
    [status, view],
    pollMs,
  )

  const rows = [...(data?.items ?? [])].sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))

  return (
    <div>
      <PageHeader
        title="Calls"
        subtitle={
          clinic ? (
            staffRole === 'doctor'
              ? 'Call history and transcripts. Filter to calls flagged for clinical review when a concern is open.'
              : 'Every Jiya call to a patient number. Call status is separate from the follow-up task.'
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Every Jiya call attempt. Call status is separate from the follow-up task's status. <DemoBadge />
            </span>
          )
        }
      />
      <Card title="Call history" actions={pollMs ? <span className="text-xs text-amber-700">Call in progress · auto-refreshing</span> : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {clinic && (
            <FilterSelect
              label="Show"
              value={view}
              onChange={(v) => setView(v as ViewFilter)}
              options={[
                { value: 'all', label: 'All calls' },
                { value: 'clinical', label: 'Needs clinical review' },
              ]}
            />
          )}
          <FilterSelect
            label="Call status"
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[{ value: 'all', label: 'All statuses' }, ...CALL_STATUSES.map((s) => ({ value: s, label: label(s) }))]}
          />
        </div>
        <RefreshError error={data ? error : undefined} reload={reload} />
        <LoadGate data={data} error={error} loading={loading} reload={reload} />
        {data && (
          <DataTable
            columns={columns(clinic)}
            rows={rows}
            rowKey={(c) => c.call_id}
            onRowClick={(c) => navigate(`/calls/${c.call_id}`)}
            emptyTitle={view === 'clinical' ? 'No calls flagged for clinical review' : 'No calls yet'}
            emptyDescription={
              view === 'clinical'
                ? 'No open clinical flags right now. Change Show to “All calls” to see recent call history.'
                : 'Start a follow-up from Tasks to place the first call.'
            }
          />
        )}
      </Card>
    </div>
  )
}
