import clsx from 'clsx'
import { ArrowLeft, List } from 'lucide-react'
import { InfoHint } from '@/components/InfoHint'
import { Button } from '@/components/ui'
import { CLINIC_TASK_VIEWS, type ClinicTaskView } from '@/features/clinic/taskListFilters'

export function ClinicTaskViewTabs({
  active,
  counts,
  onChange,
}: {
  active: ClinicTaskView
  counts?: Partial<Record<ClinicTaskView, number>>
  onChange: (view: ClinicTaskView) => void
}) {
  const activeMeta = CLINIC_TASK_VIEWS.find((v) => v.id === active)
  const total = counts?.all
  const onFocusedView = active === 'attention' || active === 'calls'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Task list views"
      >
        {CLINIC_TASK_VIEWS.map((v) => {
          const n = counts?.[v.id]
          const selected = active === v.id
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(v.id)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset transition-colors',
                selected
                  ? 'bg-navy-800 text-white ring-navy-800'
                  : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {v.label}
              {n !== undefined && (
                <span
                  className={clsx(
                    'tabular-nums rounded-full px-1.5 py-0.5 text-xs font-semibold',
                    selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {onFocusedView && (
          <Button type="button" variant="secondary" icon={<List className="h-4 w-4" />} onClick={() => onChange('open')}>
            View all open
            {counts?.open !== undefined ? ` (${counts.open})` : ''}
          </Button>
        )}
        {active !== 'all' && (
          <Button type="button" variant={onFocusedView ? 'ghost' : 'secondary'} onClick={() => onChange('all')}>
            Full task list
            {total !== undefined ? ` (${total})` : ''}
          </Button>
        )}
        {active === 'all' && (counts?.attention ?? 0) > 0 && (
          <Button type="button" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => onChange('attention')}>
            Back to need attention
          </Button>
        )}
      </div>
      </div>
      {activeMeta && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-600">{activeMeta.label}</span>
          <InfoHint title={activeMeta.label} className="-translate-y-px">
            {activeMeta.lead}
          </InfoHint>
        </p>
      )}
    </div>
  )
}
