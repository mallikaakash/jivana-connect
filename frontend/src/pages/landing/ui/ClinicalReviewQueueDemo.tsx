import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useClinicalDemo } from '../demo/ClinicalDemoProvider'
import { DEMO_DISCLAIMER, type ConcernPriority } from '../demo/clinicalDemoData'
import { ConcernPriorityBadge, ConcernStatusBadge } from './ConcernStatusBadge'
import { ClinicalConcernDetailModal } from './ClinicalConcernDetailModal'

const FILTER_TABS = [
  { id: 'all' as const, label: 'All concerns' },
  { id: 'new' as const, label: 'New' },
  { id: 'awaiting_review' as const, label: 'Awaiting review' },
  { id: 'callback_required' as const, label: 'Callback required' },
  { id: 'resolved' as const, label: 'Resolved' },
]

const PRIORITY_OPTIONS: { value: 'all' | ConcernPriority; label: string }[] = [
  { value: 'all', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'routine', label: 'Routine' },
]

type Props = {
  compact?: boolean
  maxRows?: number
}

export function ClinicalReviewQueueDemo({ compact = false, maxRows }: Props) {
  const {
    filteredConcerns,
    metrics,
    filterTab,
    setFilterTab,
    search,
    setSearch,
    priorityFilter,
    setPriorityFilter,
    setOpenId,
    openId,
  } = useClinicalDemo()

  const rows = maxRows ? filteredConcerns.slice(0, maxRows) : filteredConcerns

  return (
    <div className={clsx('landing-ui-panel overflow-hidden', compact && 'text-xs')}>
      <div className="border-b border-black/5 bg-[#faf8f3] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="landing-serif text-sm text-[var(--landing-forest)] sm:text-base">Clinical Review</p>
            <p className="mt-0.5 text-[11px] text-[var(--landing-ink-muted)]">Patient concerns that need attention from your care team.</p>
          </div>
          <span className="rounded-md bg-white px-2 py-1 text-[10px] text-[var(--landing-ink-muted)] ring-1 ring-black/5">{DEMO_DISCLAIMER}</span>
        </div>

        {!compact && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="New concerns" value={metrics.newCount} />
            <Metric label="Awaiting review" value={metrics.awaiting} />
            <Metric label="Callbacks due" value={metrics.callbacks} />
            <Metric label="Actions completed" value={metrics.completed} />
          </div>
        )}
      </div>

      <div className="border-b border-black/5 bg-white px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={clsx(
                  'rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
                  filterTab === tab.id
                    ? 'bg-[var(--landing-forest)] text-white'
                    : 'bg-[var(--landing-cream)] text-[var(--landing-ink-muted)] hover:text-[var(--landing-forest)]',
                )}
                onClick={() => setFilterTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[8rem] flex-1 sm:max-w-[10rem]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--landing-ink-muted)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patients…"
                className="w-full rounded-md border border-black/10 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[var(--landing-teal)]/50"
              />
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | ConcernPriority)}
              className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-[var(--landing-forest)]"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-black/5">
        {rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--landing-ink-muted)]">No concerns match these filters.</li>
        ) : (
          rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={clsx(
                  'flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--landing-mint-soft)]/60 sm:flex-row sm:items-start sm:justify-between',
                  c.priority === 'high' && 'border-l-[3px] border-l-[var(--landing-forest)] bg-amber-50/20',
                )}
                onClick={() => setOpenId(c.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--landing-forest)]">{c.patientName}</span>
                    <ConcernPriorityBadge priority={c.priority} label={c.priorityLabel} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--landing-ink-muted)]">{c.concernSummary}</p>
                  <p className="mt-1 text-[10px] text-[var(--landing-ink-muted)]">{c.reportedAt}</p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                  <ConcernStatusBadge status={c.status} />
                  <span className="text-[10px] text-[var(--landing-ink-muted)]">{c.assignedTo ?? 'Unassigned'}</span>
                  <span className="text-[10px] font-medium text-[var(--landing-teal-deep)]">{c.nextAction}</span>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>

      {openId && <ClinicalConcernDetailModal />}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/5 bg-white px-2.5 py-2">
      <p className="text-[10px] text-[var(--landing-ink-muted)]">{label}</p>
      <p className="landing-serif text-lg text-[var(--landing-forest)]">{value}</p>
    </div>
  )
}
