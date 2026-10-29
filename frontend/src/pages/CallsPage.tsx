import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, CALL_STATUSES, type Call, type CallStatus, type WithPatientName } from '@/api'
import { DataTable, type Column } from '@/components/DataTable'
import { Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { isActiveCall } from '@/features/secondary/helpers'
import { FilterSelect, LoadGate, RefreshError, TextLink, VoiceModeBadge } from '@/features/secondary/common'
import { formatDateTime, label } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type Row = WithPatientName<Call>
type StatusFilter = CallStatus | 'all'

const columns: Column<Row>[] = [
  { key: 'id', header: 'Call ID', className: 'whitespace-nowrap', render: (c) => <span className="font-mono text-xs text-slate-600">{c.call_id}</span> },
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
  { key: 'outcome', header: 'Outcome', render: (c) => (c.outcome ? <StatusBadge value={c.outcome} /> : <span className="text-slate-400">—</span>) },
  { key: 'task', header: 'Task', className: 'whitespace-nowrap', render: (c) => <TextLink to={`/tasks/${c.task_id}`}>View task</TextLink> },
  { key: 'mode', header: 'Voice', render: (c) => <VoiceModeBadge isLive={c.is_live} /> },
]

export default function CallsPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [pollMs, setPollMs] = useState<number>()

  const { data, error, loading, reload } = useAsync(
    async () => {
      const res = await api.listCalls({ status: status === 'all' ? undefined : status })
      // Keep refreshing while any call is still being placed or in progress.
      setPollMs(res.items.some((c) => isActiveCall(c.status)) ? 5000 : undefined)
      return res
    },
    [status],
    pollMs,
  )

  const rows = [...(data?.items ?? [])].sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))

  return (
    <div>
      <PageHeader
        title="Calls"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Every Jiya call attempt. Call status is separate from the follow-up task's status. <DemoBadge />
          </span>
        }
      />
      <Card title="Call history" actions={pollMs ? <span className="text-xs text-amber-700">Call in progress · auto-refreshing</span> : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Call status"
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: 'All' }, ...CALL_STATUSES.map((s) => ({ value: s, label: label(s) }))]}
          />
        </div>
        <RefreshError error={data ? error : undefined} reload={reload} />
        <LoadGate data={data} error={error} loading={loading} reload={reload} />
        {data && (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(c) => c.call_id}
            onRowClick={(c) => navigate(`/calls/${c.call_id}`)}
            emptyTitle={status === 'all' ? 'No calls yet' : `No calls with status "${label(status)}"`}
            emptyDescription={status === 'all' ? 'Start a Jiya call from an eligible task to see it here.' : undefined}
          />
        )}
      </Card>
    </div>
  )
}
