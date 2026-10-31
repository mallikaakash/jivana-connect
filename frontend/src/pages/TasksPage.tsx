import clsx from 'clsx'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { api, APP_MODE, PRIORITIES, TASK_STATUSES, TASK_TYPES, type Priority, type Task, type TaskFilters, type TaskStatus, type TaskType, type WithPatientName } from '@/api'
import { DataTable, type Column } from '@/components/DataTable'
import { Button, Card, DemoBadge, ErrorBanner, LoadingState, PageHeader, StatusBadge } from '@/components/ui'
import { formatDateTime, label, outcomeLabel, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { FilterSelect } from '@/features/core/FilterSelect'
import { TaskNextAction } from '@/features/clinic/taskNextAction'
import { isTaskOverdue, MAX_ATTEMPTS } from '@/features/core/helpers'

type Due = NonNullable<TaskFilters['due']>
const DUE_OPTIONS: { value: Due; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'upcoming', label: 'Upcoming' },
]

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

type Row = WithPatientName<Task>

const COLUMNS: Column<Row>[] = [
  {
    key: 'task',
    header: 'Task',
    render: (t) => (
      <div className="min-w-[11rem]">
        <p className="font-medium text-navy-800">{t.title}</p>
        <p className="text-xs text-slate-500">
          {label(t.task_type)} · {t.department}
        </p>
      </div>
    ),
  },
  { key: 'patient', header: 'Patient', render: (t) => <span className="text-slate-700">{t.patient_name}</span> },
  {
    key: 'due',
    header: 'Due',
    render: (t) => {
      const overdue = isTaskOverdue(t)
      return (
        <span title={formatDateTime(t.due_at)} className={clsx('whitespace-nowrap text-sm underline decoration-dotted decoration-slate-300 underline-offset-4', overdue ? 'font-medium text-red-600' : 'text-slate-700')}>
          {overdue ? `Overdue · ${relativeTime(t.due_at)}` : relativeTime(t.due_at)}
        </span>
      )
    },
  },
  { key: 'status', header: 'Status', render: (t) => <StatusBadge value={t.status} /> },
  ...(APP_MODE === 'clinic'
    ? ([
        {
          key: 'outcome',
          header: 'Call result',
          render: (t: Row) =>
            t.latest_outcome ? (
              <StatusBadge value={t.latest_outcome} text={outcomeLabel(t.latest_outcome, true)} />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            ),
        },
      ] as Column<Row>[])
    : []),
  { key: 'priority', header: 'Priority', render: (t) => <StatusBadge value={t.priority} /> },
  {
    key: 'last',
    header: 'Last attempt',
    render: (t) =>
      t.last_attempt_at ? (
        <div className="whitespace-nowrap" title={formatDateTime(t.last_attempt_at)}>
          <p className="text-sm text-slate-700">{relativeTime(t.last_attempt_at)}</p>
          <p className="text-xs text-slate-400">
            Attempt {t.attempt_count} of {MAX_ATTEMPTS}
          </p>
        </div>
      ) : (
        <span className="text-xs text-slate-400">Not attempted</span>
      ),
  },
  {
    key: 'next',
    header: 'Next action',
    className: 'min-w-[11rem]',
    render: (t) => (APP_MODE === 'clinic' ? <TaskNextAction task={t} /> : <span className="text-sm text-slate-700">{t.next_action}</span>),
  },
]

export default function TasksPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const filters: TaskFilters = {
    status: pick<TaskStatus>(params.get('status'), TASK_STATUSES),
    task_type: pick<TaskType>(params.get('task_type'), TASK_TYPES),
    priority: pick<Priority>(params.get('priority'), PRIORITIES),
    due: pick<Due>(params.get('due'), ['overdue', 'today', 'upcoming']),
  }
  const key = JSON.stringify(filters)

  // Rows use every filter; chip counts use every filter except status.
  const list = useAsync(
    async () => {
      const { status: _status, ...rest } = filters
      const [rows, forCounts] = await Promise.all([api.listTasks(filters), api.listTasks(rest)])
      return { rows: rows.items, forCounts: forCounts.items, key: JSON.stringify(filters) }
    },
    [key],
    20_000,
  )

  function setFilter(name: keyof TaskFilters, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }

  const counts = new Map<TaskStatus, number>()
  for (const t of list.data?.forCounts ?? []) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
  const total = list.data?.forCounts.length ?? 0
  const anyFilter = Object.values(filters).some(Boolean)
  const stale = list.data && list.data.key !== key

  return (
    <div>
      <PageHeader
        title="Tasks & follow-ups"
        subtitle={
          APP_MODE === 'clinic' ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              Follow-ups to dial, outcomes, and next actions for front desk.
              <Link to="/batches" className="text-emerald-700 hover:underline">
                Batch follow-ups →
              </Link>
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Every follow-up, its status and the next action. <DemoBadge />
              <Link to="/batches" className="text-emerald-700 hover:underline">
                Batch follow-ups →
              </Link>
            </span>
          )
        }
      />
      <Card bodyClassName="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Task type" value={filters.task_type ?? ''} options={TASK_TYPES.map((v) => ({ value: v, label: label(v) }))} onChange={(v) => setFilter('task_type', v)} allLabel="All types" />
          <FilterSelect label="Status" value={filters.status ?? ''} options={TASK_STATUSES.map((v) => ({ value: v, label: label(v) }))} onChange={(v) => setFilter('status', v)} allLabel="All statuses" />
          <FilterSelect label="Priority" value={filters.priority ?? ''} options={PRIORITIES.map((v) => ({ value: v, label: label(v) }))} onChange={(v) => setFilter('priority', v)} allLabel="All priorities" />
          <FilterSelect label="Due" value={filters.due ?? ''} options={DUE_OPTIONS} onChange={(v) => setFilter('due', v)} allLabel="Any time" />
          {anyFilter && (
            <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </Button>
          )}
        </div>

        {list.data && (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!filters.status} onClick={() => setFilter('status', '')}>
              All <span className="text-slate-400">{total}</span>
            </Chip>
            {TASK_STATUSES.filter((s) => counts.get(s) || filters.status === s).map((s) => (
              <Chip key={s} active={filters.status === s} onClick={() => setFilter('status', filters.status === s ? '' : s)}>
                {label(s)} <span className="text-slate-400">{counts.get(s) ?? 0}</span>
              </Chip>
            ))}
          </div>
        )}

        {list.error && <ErrorBanner error={list.error} onRetry={() => void list.reload()} />}

        {!list.data && list.loading ? (
          <LoadingState text="Loading tasks…" />
        ) : list.data ? (
          <div className={clsx('transition-opacity', stale && 'opacity-50')}>
            <DataTable
              columns={COLUMNS}
              rows={list.data.rows}
              rowKey={(t) => t.task_id}
              onRowClick={(t) => navigate(`/tasks/${t.task_id}`)}
              emptyTitle={anyFilter ? 'No tasks match these filters' : 'No tasks yet'}
              emptyDescription={anyFilter ? 'Try clearing a filter.' : undefined}
              rowClassName={(t) => (isTaskOverdue(t) ? 'bg-red-50/40' : undefined)}
            />
          </div>
        ) : null}
      </Card>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
        active ? 'bg-navy-800 text-white ring-navy-800 [&>span]:text-navy-200' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}
