import clsx from 'clsx'
import { AlertTriangle, ChevronRight, ListChecks, PhoneCall, RotateCw, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type DashboardSummary, type NeedsAttentionItem } from '@/api'
import { Timeline } from '@/components/Timeline'
import { Button, Card, DemoBadge, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge, SummaryCard } from '@/components/ui'
import { formatDateTime, formatTime, label, relativeTime, type Tone } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { CallModeBadge } from '@/features/core/CallModeBadge'
import { isCallActive, isTaskOverdue } from '@/features/core/helpers'

const KIND: Record<NeedsAttentionItem['kind'], { text: string; tone: Tone }> = {
  patient_concern: { text: 'Patient concern', tone: 'red' },
  overdue_task: { text: 'Overdue', tone: 'red' },
  rescheduling_request: { text: 'Rescheduling requested', tone: 'amber' },
  callback_request: { text: 'Callback request', tone: 'amber' },
  awaiting_staff_action: { text: 'Awaiting staff action', tone: 'amber' },
}

export default function OverviewPage() {
  const [fast, setFast] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date>()
  const [refreshing, setRefreshing] = useState(false)
  // Refresh quickly while Jiya is on a call so counts and activity update as soon as it finishes.
  const summary = useAsync(
    async () => {
      const d = await api.getDashboardSummary()
      setFast(d.recent_calls.some((c) => isCallActive(c.status)))
      setUpdatedAt(new Date())
      return d
    },
    [],
    fast ? 5_000 : 20_000,
  )
  const data = summary.data

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            What needs attention today, what Jiya completed, and what needs a human. <DemoBadge>DEMO DATA</DemoBadge>
          </span>
        }
        actions={
          <>
            {updatedAt && <span className="hidden text-xs text-slate-400 sm:inline">Updated {formatTime(updatedAt.toISOString())}</span>}
            <Button variant="secondary" icon={<RotateCw className="h-4 w-4" />} loading={refreshing}
              onClick={() => {
                setRefreshing(true)
                void summary.reload().finally(() => setRefreshing(false))
              }}
            >
              Refresh
            </Button>
          </>
        }
      />

      {!data ? (
        summary.error ? (
          <ErrorBanner error={summary.error} onRetry={() => void summary.reload()} />
        ) : (
          <LoadingState text="Loading dashboard…" />
        )
      ) : (
        <Dashboard data={data} error={summary.error} onRetry={() => void summary.reload()} />
      )}
    </div>
  )
}

function Dashboard({ data, error, onRetry }: { data: DashboardSummary; error?: Error; onRetry: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-6">
      {error && <ErrorBanner error={`Could not refresh: ${error.message}`} onRetry={onRetry} />}

      {/* Row 1 — summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardLink to="/patients">
          <SummaryCard label="Patients" value={data.patients_count} hint="Synthetic demo patients" icon={<Users className="h-4 w-4" />} tone="blue" />
        </CardLink>
        <CardLink to="/tasks">
          <SummaryCard label="Follow-ups due" value={data.followups_due_count} hint="Pending or due by end of today" icon={<ListChecks className="h-4 w-4" />} tone="amber" />
        </CardLink>
        <CardLink to="/calls">
          <SummaryCard label="Calls completed (last 7 days)" value={data.calls_completed_count} hint="No-answer and failed attempts excluded" icon={<PhoneCall className="h-4 w-4" />} tone="green" />
        </CardLink>
        <CardLink to="/escalations">
          <SummaryCard label="Open escalations" value={data.open_escalations_count} hint="Awaiting staff review or action" icon={<AlertTriangle className="h-4 w-4" />} tone={data.open_escalations_count ? 'red' : 'grey'} />
        </CardLink>
      </div>

      {/* Row 2 — needs attention + recent calls */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={
            <span className="flex items-center gap-2">
              Needs attention
              {data.needs_attention.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{data.needs_attention.length}</span>}
            </span>
          }
          actions={
            <Link to="/tasks?status=awaiting_staff_action" className="text-xs font-medium text-teal-700 hover:underline">
              View tasks
            </Link>
          }
          bodyClassName="p-0"
        >
          {data.needs_attention.length === 0 ? (
            <EmptyState title="Nothing needs attention" description="All follow-ups are on track." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.needs_attention.map((item) => {
                const k = KIND[item.kind]
                const to = item.escalation_id ? `/escalations/${item.escalation_id}` : `/tasks/${item.task_id}`
                return (
                  <li key={`${item.kind}-${item.task_id}`}>
                    <Link to={to} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={item.kind} tone={k.tone} text={k.text} />
                          <span className="text-sm font-medium text-navy-800">{item.title}</span>
                          <span className="text-xs text-slate-500">· {item.patient_name}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.reason}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {(item.priority === 'high' || item.priority === 'urgent') && <StatusBadge value={item.priority} text={`${label(item.priority)} priority`} />}
                        <span className="whitespace-nowrap text-xs text-slate-400" title={formatDateTime(item.due_at)}>
                          Due {relativeTime(item.due_at)}
                        </span>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Recent calls"
          actions={
            <Link to="/calls" className="text-xs font-medium text-teal-700 hover:underline">
              All calls
            </Link>
          }
          bodyClassName="p-0"
        >
          {data.recent_calls.length === 0 ? (
            <EmptyState title="No calls yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent_calls.map((c) => (
                <li key={c.call_id}>
                  <Link to={`/calls/${c.call_id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-navy-800">{c.patient_name}</span>
                      <CallModeBadge isLive={c.is_live} />
                    </div>
                    <p className="truncate text-xs text-slate-500">{c.purpose}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.outcome ? <StatusBadge value={c.outcome} /> : <StatusBadge value={c.status} />}
                      {c.outcome && c.status !== 'completed' && <StatusBadge value={c.status} />}
                      <span className="ml-auto text-[11px] text-slate-400" title={formatDateTime(c.created_at)}>
                        {relativeTime(c.started_at ?? c.created_at)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Row 3 — follow-up queue + activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Follow-up queue"
          actions={
            <Link to="/tasks" className="text-xs font-medium text-teal-700 hover:underline">
              All tasks
            </Link>
          }
          bodyClassName="p-0"
        >
          {data.followup_queue.length === 0 ? (
            <EmptyState title="No follow-ups queued" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.followup_queue.map((t) => {
                const overdue = isTaskOverdue(t)
                return (
                  <li key={t.task_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-800">{t.title}</p>
                      <p className="text-xs text-slate-500">
                        {label(t.task_type)} · {t.patient_name}
                      </p>
                    </div>
                    <span className={clsx('whitespace-nowrap text-xs', overdue ? 'font-semibold text-red-600' : 'text-slate-500')} title={formatDateTime(t.due_at)}>
                      {overdue ? 'Overdue · ' : 'Due '}
                      {relativeTime(t.due_at)}
                    </span>
                    <StatusBadge value={t.status} />
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => navigate(`/tasks/${t.task_id}`)}>
                      Open
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent activity">
          <Timeline events={data.recent_activity} compact />
        </Card>
      </div>
    </div>
  )
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-teal-500">
      {children}
    </Link>
  )
}
