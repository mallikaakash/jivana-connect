import clsx from 'clsx'
import type { ClinicalConcern, ConcernPriority } from '../demo/clinicalDemoData'

const STATUS_LABEL: Record<ClinicalConcern['status'], string> = {
  new: 'New',
  assigned: 'Assigned',
  under_review: 'Under review',
  callback_required: 'Callback required',
  action_recorded: 'Action recorded',
  resolved: 'Resolved',
}

const STATUS_CLASS: Record<ClinicalConcern['status'], string> = {
  new: 'bg-amber-50 text-amber-950 ring-amber-200/80',
  assigned: 'bg-sky-50 text-sky-950 ring-sky-200/80',
  under_review: 'bg-violet-50 text-violet-950 ring-violet-200/80',
  callback_required: 'bg-orange-50 text-orange-950 ring-orange-200/80',
  action_recorded: 'bg-emerald-50 text-emerald-900 ring-emerald-200/80',
  resolved: 'bg-slate-100 text-slate-700 ring-slate-200/80',
}

const PRIORITY_CLASS: Record<ConcernPriority, string> = {
  high: 'bg-[var(--landing-forest)] text-white',
  medium: 'bg-[var(--landing-teal)]/15 text-[var(--landing-teal-deep)] ring-1 ring-[var(--landing-teal)]/25',
  routine: 'bg-[var(--landing-cream)] text-[var(--landing-ink-muted)] ring-1 ring-black/5',
}

export function ConcernStatusBadge({ status }: { status: ClinicalConcern['status'] }) {
  return (
    <span className={clsx('inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ring-1', STATUS_CLASS[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ConcernPriorityBadge({ priority, label }: { priority: ConcernPriority; label: string }) {
  return (
    <span className={clsx('inline-flex rounded px-2 py-0.5 text-[10px] font-semibold', PRIORITY_CLASS[priority])} title={label}>
      {priority === 'high' ? 'High priority' : priority === 'medium' ? 'Medium' : 'Routine'}
    </span>
  )
}
