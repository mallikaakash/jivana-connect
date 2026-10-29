import clsx from 'clsx'
import { AlertTriangle, Bot, CheckCircle2, PhoneCall, PhoneMissed, Sparkles, User, Workflow } from 'lucide-react'
import type { Event, EventType } from '@/api/types'
import { formatDateTime, label, relativeTime } from '@/lib/format'
import { EmptyState } from './ui'

const ICONS: Partial<Record<EventType, { icon: typeof Bot; className: string }>> = {
  call_started: { icon: PhoneCall, className: 'bg-sky-50 text-sky-600' },
  call_completed: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  call_no_answer: { icon: PhoneMissed, className: 'bg-amber-50 text-amber-600' },
  call_failed: { icon: PhoneMissed, className: 'bg-red-50 text-red-600' },
  outcome_extracted: { icon: Sparkles, className: 'bg-violet-50 text-violet-600' },
  task_status_changed: { icon: Workflow, className: 'bg-slate-100 text-slate-600' },
  escalation_created: { icon: AlertTriangle, className: 'bg-red-50 text-red-600' },
  escalation_updated: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-600' },
  staff_action_recorded: { icon: User, className: 'bg-teal-50 text-teal-700' },
}

/** Chronological event list (newest first). `compact` hides absolute timestamps. */
export function Timeline({ events, compact, emptyTitle = 'No activity yet' }: { events: Event[]; compact?: boolean; emptyTitle?: string }) {
  if (events.length === 0) return <EmptyState title={emptyTitle} />
  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return (
    <ol className="space-y-3">
      {sorted.map((e) => {
        const { icon: Icon, className } = ICONS[e.event_type] ?? { icon: Bot, className: 'bg-slate-100 text-slate-500' }
        return (
          <li key={e.event_id} className="flex gap-3">
            <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', className)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800">{e.message}</p>
              <p className="text-xs text-slate-400" title={formatDateTime(e.timestamp)}>
                {relativeTime(e.timestamp)}
                {!compact && ` · ${formatDateTime(e.timestamp)}`} · {label(e.actor)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
