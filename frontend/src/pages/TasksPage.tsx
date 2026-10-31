import clsx from 'clsx'
import { ChevronDown, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import {
  api,
  APP_MODE,
  PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type Priority,
  type Task,
  type TaskFilters,
  type TaskQueueFilter,
  type TaskStatus,
  type TaskType,
  type WithPatientName,
} from '@/api'
import { DataTable, type Column } from '@/components/DataTable'
import { Button, Card, DemoBadge, ErrorBanner, LoadingState, PageHeader, StatusBadge } from '@/components/ui'
import { ClinicTaskViewTabs } from '@/features/clinic/ClinicTaskViewTabs'
import {
  CLINIC_TASK_CHIP_STATUSES,
  clinicFiltersForView,
  clinicViewFromSearchParams,
  type ClinicTaskView,
} from '@/features/clinic/taskListFilters'
import { InfoHint } from '@/components/InfoHint'
import { CLINIC_HELP } from '@/features/clinic/helpCopy'
import { TaskNextAction } from '@/features/clinic/taskNextAction'
import { FilterSelect } from '@/features/core/FilterSelect'
import { isTaskOverdue, MAX_ATTEMPTS } from '@/features/core/helpers'
import { formatDateTime, label, outcomeLabel, relativeTime, taskStatusLabel } from '@/lib/format'
import { sortKeyPriority, sortKeyTaskStatus } from '@/lib/tableSort'
import { useAsync } from '@/lib/useAsync'

type Due = NonNullable<TaskFilters['due']>
const DUE_OPTIONS: { value: Due; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'upcoming', label: 'Upcoming' },
]

const DEMO_QUEUE_OPTIONS: { value: TaskQueueFilter; label: string }[] = [
  { value: 'operations', label: 'Operations queue' },
  { value: 'clinical', label: 'Clinical inbox' },
  { value: 'followups_due', label: 'Due by end of today' },
]

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

type Row = WithPatientName<Task>

const COLUMNS: Column<Row>[] = [
  {
    key: 'task',
    header: 'Task',
    sortValue: (t) => t.title,
    render: (t) => (
      <div className="min-w-[11rem]">
        <p className="font-medium text-navy-800">{t.title}</p>
        <p className="text-xs text-slate-500">
          {label(t.task_type)} · {t.department}
        </p>
      </div>
    ),
  },
  { key: 'patient', header: 'Patient', sortValue: (t) => t.patient_name, render: (t) => <span className="text-slate-700">{t.patient_name}</span> },
  {
    key: 'due',
    header: 'Due',
    sortValue: (t) => t.due_at,
    render: (t) => {
      const overdue = isTaskOverdue(t)
      return (
        <span title={formatDateTime(t.due_at)} className={clsx('whitespace-nowrap text-sm underline decoration-dotted decoration-slate-300 underline-offset-4', overdue ? 'font-medium text-red-600' : 'text-slate-700')}>
          {overdue ? `Overdue · ${relativeTime(t.due_at)}` : relativeTime(t.due_at)}
        </span>
      )
    },
  },
  {
    key: 'status',
    header: 'Status',
    sortValue: (t) => sortKeyTaskStatus(t.status),
    render: (t) => <StatusBadge value={t.status} text={taskStatusLabel(t.status)} />,
  },
  ...(APP_MODE === 'clinic'
    ? ([
        {
          key: 'outcome',
          header: 'Call result',
          sortValue: (t: Row) => t.latest_outcome ?? '',
          render: (t: Row) =>
            t.latest_outcome ? (
              <StatusBadge value={t.latest_outcome} text={outcomeLabel(t.latest_outcome, true)} />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            ),
        },
      ] as Column<Row>[])
    : []),
  { key: 'priority', header: 'Priority', sortValue: (t) => sortKeyPriority(t.priority), render: (t) => <StatusBadge value={t.priority} /> },
  {
    key: 'last',
    header: 'Last attempt',
    sortValue: (t) => t.last_attempt_at ?? '',
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
    sortValue: (t) => t.next_action,
    render: (t) => (APP_MODE === 'clinic' ? <TaskNextAction task={t} /> : <span className="text-sm text-slate-700">{t.next_action}</span>),
  },
]

export default function TasksPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [refineOpen, setRefineOpen] = useState(false)
  const isClinic = APP_MODE === 'clinic'

  const clinicView = isClinic ? clinicViewFromSearchParams(params) : null

  const extraFilters = {
    status: pick<TaskStatus>(params.get('status'), TASK_STATUSES),
    task_type: pick<TaskType>(params.get('task_type'), TASK_TYPES),
    priority: pick<Priority>(params.get('priority'), PRIORITIES),
    due: pick<Due>(params.get('due'), ['overdue', 'today', 'upcoming']),
  }

  const filters: TaskFilters = isClinic
    ? clinicFiltersForView(clinicView!, extraFilters)
    : {
        ...extraFilters,
        queue: pick<TaskQueueFilter>(params.get('queue'), ['operations', 'clinical', 'followups_due', 'open', 'history']),
      }

  const key = JSON.stringify(filters)

  const tabCounts = useAsync(
    async () => {
      if (!isClinic) return undefined
      const [attention, calls, open, all] = await Promise.all([
        api.listTasks({ queue: 'operations' }),
        api.listTasks({ queue: 'followups_due' }),
        api.listTasks({ queue: 'open' }),
        api.listTasks({}),
      ])
      return {
        attention: attention.items.length,
        calls: calls.items.length,
        open: open.items.length,
        all: all.items.length,
      }
    },
    [isClinic],
    isClinic ? 30_000 : undefined,
  )

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
    if (isClinic) next.set('view', clinicView!)
    if (value) next.set(name, value)
    else next.delete(name)
    next.delete('queue')
    setParams(next, { replace: true })
  }

  function setClinicView(view: ClinicTaskView) {
    setParams(new URLSearchParams({ view }), { replace: true })
    setRefineOpen(view === 'open' || view === 'all')
  }

  const counts = new Map<TaskStatus, number>()
  for (const t of list.data?.forCounts ?? []) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
  const total = list.data?.forCounts.length ?? 0
  const refineActive = Boolean(extraFilters.status || extraFilters.task_type || extraFilters.priority || extraFilters.due)
  const anyFilter = refineActive || Boolean(!isClinic && filters.queue)
  const statusOptions = TASK_STATUSES.map((v) => ({
    value: v,
    label: isClinic ? taskStatusLabel(v) : label(v),
  }))
  const showStatusChips = !isClinic || clinicView === 'open' || clinicView === 'all'
  const chipStatuses = isClinic ? CLINIC_TASK_CHIP_STATUSES : TASK_STATUSES
  const stale = list.data && list.data.key !== key

  const emptyCopy = useMemo(() => {
    if (!isClinic) return { title: anyFilter ? 'No tasks match these filters' : 'No tasks yet', description: anyFilter ? 'Try clearing a filter.' : undefined }
    if (clinicView === 'attention') {
      return {
        title: 'Nothing needs front desk right now',
        description: 'Scheduled Jiya calls (confirmations, reminders) are under the Scheduled calls tab.',
      }
    }
    if (clinicView === 'calls') {
      return { title: 'No calls due today', description: 'New bookings create confirmation tasks automatically.' }
    }
    return { title: 'No tasks in this view', description: refineActive ? 'Try clearing a filter below.' : undefined }
  }, [isClinic, clinicView, anyFilter, refineActive])

  return (
    <div>
      <PageHeader
        title="Tasks & follow-ups"
        info={isClinic ? CLINIC_HELP.tasksPage : undefined}
        actions={
          isClinic ? (
            <Link to="/batches" className="text-sm font-medium text-teal-700 hover:underline">
              Batch follow-ups
            </Link>
          ) : undefined
        }
        subtitle={
          isClinic ? undefined : (
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
        {isClinic && clinicView && (
          <ClinicTaskViewTabs active={clinicView} counts={tabCounts.data ?? undefined} onChange={setClinicView} />
        )}

        {!isClinic && (
          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect
              label="Saved view"
              value={filters.queue ?? ''}
              options={DEMO_QUEUE_OPTIONS}
              onChange={(v) => setFilter('queue', v)}
              allLabel="All tasks"
            />
            <FilterSelect label="Due" value={filters.due ?? ''} options={DUE_OPTIONS} onChange={(v) => setFilter('due', v)} allLabel="Any time" />
            <FilterSelect label="Status" value={filters.status ?? ''} options={statusOptions} onChange={(v) => setFilter('status', v)} allLabel="Any status" />
            <FilterSelect label="Task type" value={filters.task_type ?? ''} options={TASK_TYPES.map((v) => ({ value: v, label: label(v) }))} onChange={(v) => setFilter('task_type', v)} allLabel="All types" />
            <FilterSelect label="Priority" value={filters.priority ?? ''} options={PRIORITIES.map((v) => ({ value: v, label: label(v) }))} onChange={(v) => setFilter('priority', v)} allLabel="All priorities" />
          </div>
        )}

        {isClinic && (clinicView === 'open' || clinicView === 'all') && (
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-slate-700"
              onClick={() => setRefineOpen((o) => !o)}
            >
              Refine list
              <ChevronDown className={clsx('h-4 w-4 transition-transform', refineOpen && 'rotate-180')} />
            </button>
            {refineOpen && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <FilterSelect label="Due" value={filters.due ?? ''} options={DUE_OPTIONS} onChange={(v) => setFilter('due', v)} allLabel="Any time" />
                <FilterSelect label="Status" value={filters.status ?? ''} options={statusOptions} onChange={(v) => setFilter('status', v)} allLabel="Any status" />
                <FilterSelect label="Task type" value={filters.task_type ?? ''} options={TASK_TYPES.map((v) => ({ value: v, label: label(v) }))} onChange={(v) => setFilter('task_type', v)} allLabel="All types" />
                {refineActive && (
                  <Button
                    variant="ghost"
                    icon={<X className="h-4 w-4" />}
                    onClick={() => setParams(new URLSearchParams({ view: clinicView! }), { replace: true })}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {showStatusChips && list.data && (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!filters.status} onClick={() => setFilter('status', '')}>
              All in view <span className="text-slate-400">{total}</span>
            </Chip>
            {chipStatuses.filter((s) => counts.get(s) || filters.status === s).map((s) => (
              <Chip key={s} active={filters.status === s} onClick={() => setFilter('status', filters.status === s ? '' : s)}>
                {isClinic ? taskStatusLabel(s) : label(s)} <span className="text-slate-400">{counts.get(s) ?? 0}</span>
              </Chip>
            ))}
          </div>
        )}

        {list.error && <ErrorBanner error={list.error} onRetry={() => void list.reload()} />}

        {!list.data && list.loading ? (
          <LoadingState text="Loading tasks…" />
        ) : list.data ? (
          <div className={clsx('space-y-4 transition-opacity', stale && 'opacity-50')}>
            <DataTable
              columns={COLUMNS}
              rows={list.data.rows}
              defaultSort={{ key: 'due', direction: 'asc' }}
              rowKey={(t) => t.task_id}
              onRowClick={(t) => navigate(`/tasks/${t.task_id}`)}
              emptyTitle={emptyCopy.title}
              emptyDescription={emptyCopy.description}
              rowClassName={(t) => (isTaskOverdue(t) ? 'bg-red-50/40' : undefined)}
            />
            {isClinic && clinicView && list.data.rows.length > 0 && tabCounts.data && clinicView !== 'all' && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
                <p className="inline-flex flex-wrap items-center gap-1">
                  Showing {list.data.rows.length} of {tabCounts.data[clinicView === 'open' ? 'open' : clinicView]} in this view
                  {clinicView === 'attention' || clinicView === 'calls'
                    ? ` · ${tabCounts.data.open} open overall`
                    : ''}
                  <InfoHint title="Task list views">{CLINIC_HELP.tasksListFooter}</InfoHint>
                </p>
                <Button type="button" variant="secondary" onClick={() => setClinicView(clinicView === 'open' ? 'all' : 'open')}>
                  {clinicView === 'open' ? `View full list (${tabCounts.data.all})` : `View all open (${tabCounts.data.open})`}
                </Button>
              </div>
            )}
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
