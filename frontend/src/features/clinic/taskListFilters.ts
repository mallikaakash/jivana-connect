import type { TaskFilters, TaskQueueFilter, TaskStatus } from '@/api'

/** Primary tabs on Tasks (clinic front desk). */
export type ClinicTaskView = 'attention' | 'calls' | 'open' | 'all'

export const CLINIC_TASK_VIEWS: {
  id: ClinicTaskView
  label: string
  lead: string
  queue?: TaskQueueFilter
}[] = [
  {
    id: 'attention',
    label: 'Need attention',
    lead: 'Same count as on Today — callbacks, reschedules, and follow-ups waiting on front desk after a call.',
    queue: 'operations',
  },
  {
    id: 'calls',
    label: 'Scheduled calls',
    lead: 'Confirmations and reminders Jiya should place today or that are already overdue.',
    queue: 'followups_due',
  },
  {
    id: 'open',
    label: 'All open',
    lead: 'Every active task, including calls still in progress and work not in the Today queue.',
    queue: 'open',
  },
  {
    id: 'all',
    label: 'Full list',
    lead: 'Open and completed tasks — use filters below to narrow further.',
  },
]

export function clinicViewFromSearchParams(params: URLSearchParams): ClinicTaskView {
  const view = params.get('view')
  if (view === 'attention' || view === 'calls' || view === 'open' || view === 'all') return view
  const queue = params.get('queue')
  if (queue === 'operations') return 'attention'
  if (queue === 'followups_due') return 'calls'
  if (queue === 'open') return 'open'
  if (!queue && !params.get('status') && !params.get('due') && !params.get('task_type')) return 'attention'
  return 'all'
}

export function clinicFiltersForView(view: ClinicTaskView, extra: Omit<TaskFilters, 'queue'>): TaskFilters {
  const def = CLINIC_TASK_VIEWS.find((v) => v.id === view)
  return { ...extra, queue: def?.queue }
}

/** Status chips — open work only (completed lives under Full list + status filter). */
export const CLINIC_TASK_CHIP_STATUSES: TaskStatus[] = [
  'awaiting_staff_action',
  'pending',
  'due',
  'in_progress',
  'failed',
]
