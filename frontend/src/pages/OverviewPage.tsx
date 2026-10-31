import clsx from 'clsx'
import { AlertTriangle, ChevronRight, ListChecks, PhoneCall, RotateCw, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, APP_MODE, type DashboardSummary, type NeedsAttentionItem } from '@/api'
import { Timeline } from '@/components/Timeline'
import { Button, Card, DemoBadge, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge, SummaryCard } from '@/components/ui'
import { ClinicDemoSeedPanel } from '@/features/clinic/ClinicDemoSeedPanel'
import { useStaffRole } from '@/features/clinic/workspace'
import { formatDateTime, formatTime, label, outcomeLabel, relativeTime, taskStatusLabel, type Tone } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { CLINIC_HELP } from '@/features/clinic/helpCopy'
import { CallModeBadge } from '@/features/core/CallModeBadge'
import { isCallActive, isTaskOverdue } from '@/features/core/helpers'

const KIND: Record<NeedsAttentionItem['kind'], { text: string; tone: Tone }> = {
  patient_concern: { text: 'Patient concern', tone: 'red' },
  overdue_task: { text: 'Overdue', tone: 'red' },
  rescheduling_request: { text: 'Rescheduling requested', tone: 'amber' },
  callback_request: { text: 'Callback request', tone: 'amber' },
  awaiting_staff_action: { text: 'Awaiting staff action', tone: 'amber' },
}

function splitInboxes(data: DashboardSummary) {
  const clinical = data.clinical_inbox ?? data.needs_attention.filter((i) => i.audience === 'clinical')
  const operations = data.operations_inbox ?? data.needs_attention.filter((i) => i.audience === 'operations')
  return { clinical, operations }
}

export default function OverviewPage() {
  const [staffRole] = useStaffRole()
  const [fast, setFast] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date>()
  const [refreshing, setRefreshing] = useState(false)
  const meta = useAsync(() => api.getMeta(), [])
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
  const isClinic = APP_MODE === 'clinic'
  const showDemoSeed =
    isClinic && meta.data?.demo_seed_available && data !== undefined && data.patients_count === 0

  const subtitle = useMemo(() => {
    if (isClinic) return undefined
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        What needs attention today, what Jiya completed, and what needs a human. <DemoBadge>DEMO DATA</DemoBadge>
      </span>
    )
  }, [isClinic])

  return (
    <div>
      <PageHeader
        title={greeting()}
        accent={isClinic ? undefined : "Here's what needs you today."}
        info={isClinic ? CLINIC_HELP.todayPage : undefined}
        subtitle={subtitle}
        actions={
          <>
            {updatedAt && <span className="hidden text-xs text-slate-400 sm:inline">Updated {formatTime(updatedAt.toISOString())}</span>}
            <Button
              variant="secondary"
              icon={<RotateCw className="h-4 w-4" />}
              loading={refreshing}
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
        <>
          {showDemoSeed && (
            <div className="mb-6">
              <ClinicDemoSeedPanel compact onLoaded={() => void summary.reload()} />
            </div>
          )}
          <Dashboard data={data} error={summary.error} onRetry={() => void summary.reload()} staffRole={isClinic ? staffRole : 'desk'} isClinic={isClinic} />
        </>
      )}
    </div>
  )
}

function InboxList({ items, showTaskType }: { items: NeedsAttentionItem[]; showTaskType?: boolean }) {
  if (items.length === 0) {
    return <EmptyState title="Inbox clear" description="Nothing in this queue right now." />
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const k = KIND[item.kind]
        const to = item.escalation_id ? `/escalations/${item.escalation_id}` : `/tasks/${item.task_id}`
        const snippet = item.clinical_snippet ?? item.reason
        return (
          <li key={`${item.kind}-${item.task_id}`}>
            <Link to={to} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={item.kind} tone={k.tone} text={k.text} />
                  {showTaskType && item.task_type && (
                    <span className="rounded-full bg-navy-50 px-1.5 py-0.5 text-[10px] font-medium text-navy-700">{label(item.task_type)}</span>
                  )}
                  <span className="text-sm font-medium text-navy-800">{item.patient_name}</span>
                  <span className="text-xs text-slate-500">· {item.title}</span>
                </div>
                <p className={clsx('mt-1 line-clamp-3 text-sm', item.clinical_snippet ? 'font-medium text-navy-800' : 'text-slate-600')}>{snippet}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {(item.priority === 'high' || item.priority === 'urgent') && (
                  <StatusBadge value={item.priority} text={`${label(item.priority)} priority`} />
                )}
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
  )
}

function Dashboard({
  data,
  error,
  onRetry,
  staffRole,
  isClinic,
}: {
  data: DashboardSummary
  error?: Error
  onRetry: () => void
  staffRole: 'doctor' | 'desk'
  isClinic: boolean
}) {
  const navigate = useNavigate()
  const { clinical, operations } = splitInboxes(data)
  const deskKinds = new Set<NeedsAttentionItem['kind']>(['rescheduling_request', 'callback_request', 'overdue_task', 'awaiting_staff_action'])
  const doctorOpsFirst = operations.filter((i) => deskKinds.has(i.kind))
  const primaryInbox = isClinic
    ? staffRole === 'doctor'
      ? clinical
      : operations
    : staffRole === 'doctor'
      ? [...doctorOpsFirst, ...clinical]
      : operations
  const secondaryInbox = isClinic
    ? staffRole === 'doctor'
      ? operations
      : clinical
    : staffRole === 'doctor'
      ? operations.filter((i) => !deskKinds.has(i.kind))
      : clinical
  const primaryTitle = isClinic
    ? staffRole === 'doctor'
      ? 'Clinical inbox'
      : 'Need attention'
    : staffRole === 'doctor'
      ? 'Needs attention'
      : 'Operations inbox'
  const secondaryTitle = isClinic
    ? staffRole === 'doctor'
      ? 'Operations follow-ups'
      : 'For clinical review'
    : staffRole === 'doctor'
      ? 'Other operations'
      : 'For clinical review'
  const escLabel = isClinic && staffRole === 'doctor' ? 'Open clinical reviews' : 'Open escalations'
  const escHint = isClinic && staffRole === 'doctor' ? 'Questions and concerns awaiting clinician' : 'Awaiting staff review or action'
  const patientHint = isClinic ? 'Registered patients' : 'Synthetic demo patients'
  const primaryTitleInfo =
    isClinic && staffRole === 'doctor' ? CLINIC_HELP.clinicalInbox : isClinic ? CLINIC_HELP.needAttentionInbox : undefined

  return (
    <div className="space-y-6">
      {error && <ErrorBanner error={`Could not refresh: ${error.message}`} onRetry={onRetry} />}

      {!isClinic && data.system_alerts?.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">System alerts</p>
          <ul className="list-disc space-y-1 pl-5">
            {data.system_alerts.map((a) => (
              <li key={`${a.kind}-${a.entity_id}`}>
                {a.entity_type === 'call' ? (
                  <Link to={`/calls/${a.entity_id}`} className="font-medium text-teal-800 hover:underline">
                    {a.message}
                  </Link>
                ) : (
                  a.message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardLink to="/patients">
          <SummaryCard label="Patients" value={data.patients_count} hint={patientHint} icon={<Users className="h-4 w-4" />} tone="blue" />
        </CardLink>
        <CardLink
          to={
            isClinic && staffRole === 'doctor'
              ? '/escalations'
              : isClinic
                ? '/tasks?view=attention'
                : '/tasks?queue=followups_due'
          }
        >
          <SummaryCard
            label={staffRole === 'doctor' && isClinic ? 'Clinical items' : 'Need attention'}
            value={staffRole === 'doctor' && isClinic ? clinical.length : isClinic ? operations.length : data.followups_due_count}
            hint={
              staffRole === 'doctor' && isClinic
                ? 'Needs doctor review'
                : isClinic
                  ? 'Callbacks & staff follow-ups (same tab on Tasks)'
                  : 'Pending or due by end of today'
            }
            icon={<ListChecks className="h-4 w-4" />}
            tone="amber"
          />
        </CardLink>
        <CardLink to="/calls">
          <SummaryCard label="Calls completed" value={data.calls_completed_count} hint="Last 7 days" icon={<PhoneCall className="h-4 w-4" />} tone="green" />
        </CardLink>
        <CardLink to="/escalations">
          <SummaryCard label={escLabel} value={data.open_escalations_count} hint={escHint} icon={<AlertTriangle className="h-4 w-4" />} tone={data.open_escalations_count ? 'red' : 'grey'} />
        </CardLink>
      </div>

      <div className="stagger grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={
            <span className="flex items-center gap-2">
              {primaryTitle}
              {primaryInbox.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{primaryInbox.length}</span>
              )}
            </span>
          }
          titleInfo={primaryTitleInfo}
          actions={
            isClinic && staffRole === 'doctor' ? (
              <Link to="/escalations" className="text-xs font-medium text-teal-700 hover:underline">
                Clinical review
              </Link>
            ) : (
              <Link to="/tasks?view=attention" className="text-xs font-medium text-teal-700 hover:underline">
                View on Tasks
              </Link>
            )
          }
          bodyClassName="p-0"
        >
          <InboxList items={primaryInbox} showTaskType={isClinic} />
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
                      {!isClinic && <CallModeBadge isLive={c.is_live} />}
                    </div>
                    <p className="truncate text-xs text-slate-500">{c.purpose}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.outcome ? (
                        <StatusBadge value={c.outcome} text={isClinic ? outcomeLabel(c.outcome, true) : undefined} />
                      ) : (
                        <StatusBadge value={c.status} />
                      )}
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

      {isClinic && secondaryInbox.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              {secondaryTitle}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{secondaryInbox.length}</span>
            </span>
          }
          bodyClassName="p-0"
        >
          <InboxList items={secondaryInbox} />
        </Card>
      )}

      {!isClinic && (
        <div className="stagger grid gap-6 lg:grid-cols-3">
          <Card
            className="lg:col-span-2"
            title={
              <span className="flex items-center gap-2">
                Needs attention
                {data.needs_attention.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{data.needs_attention.length}</span>
                )}
              </span>
            }
            actions={
              <Link to="/tasks?status=awaiting_staff_action" className="text-xs font-medium text-teal-700 hover:underline">
                View tasks
              </Link>
            }
            bodyClassName="p-0"
          >
            <InboxList items={data.needs_attention} />
          </Card>
        </div>
      )}

      {(staffRole === 'desk' || !isClinic) && (
        <div className="stagger grid gap-6 lg:grid-cols-3">
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
                      <span className={clsx('whitespace-nowrap text-xs', overdue ? 'font-medium text-red-600' : 'text-slate-500')} title={formatDateTime(t.due_at)}>
                        {overdue ? 'Overdue · ' : 'Due '}
                        {relativeTime(t.due_at)}
                      </span>
                      <StatusBadge value={t.status} text={taskStatusLabel(t.status)} />
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
      )}

      {isClinic && staffRole === 'doctor' && (
        <Card title="Recent activity">
          <Timeline events={data.recent_activity} compact />
        </Card>
      )}
    </div>
  )
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block rounded-2xl transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-teal-500">
      {children}
    </Link>
  )
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }))
  return hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.'
}
