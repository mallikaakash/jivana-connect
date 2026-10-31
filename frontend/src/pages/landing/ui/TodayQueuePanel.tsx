import clsx from 'clsx'
import { useLandingStory, DEMO } from '../storyContext'

export function TodayQueuePanel({ compact = false }: { compact?: boolean }) {
  const phase = useLandingStory()
  const live = phase === 'live'
  const done = phase === 'summary' || phase === 'resolved'

  return (
    <div className={clsx('bg-[#f6f3eb]', compact ? 'p-3' : 'p-4 sm:p-5')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {!compact && <p className="landing-eyebrow mb-1">Front desk</p>}
          <p className={clsx('landing-serif text-[var(--landing-forest)]', compact ? 'text-base' : 'text-xl')}>
            Today&apos;s follow-ups
          </p>
        </div>
        <span className="rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-[var(--landing-ink-muted)] ring-1 ring-black/5">
          {done ? '2 open' : live ? '1 active' : '3 due'}
        </span>
      </div>

      <ul className={clsx('space-y-2', compact ? 'mt-3' : 'mt-4')}>
        <li
          className={clsx(
            'rounded-lg border bg-white transition-colors duration-500',
            compact ? 'p-2.5' : 'p-3',
            live && 'border-[var(--landing-teal)]/35',
            done && 'border-emerald-200/80 bg-emerald-50/40',
            !live && !done && 'border-black/5',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={clsx('font-semibold text-[var(--landing-forest)]', compact ? 'text-xs' : 'text-sm')}>{DEMO.task}</p>
              <p className={clsx('text-[var(--landing-ink-muted)]', compact ? 'text-[10px]' : 'text-xs')}>{DEMO.patient} · {DEMO.department}</p>
            </div>
            <span
              className={clsx(
                'shrink-0 rounded px-2 py-0.5 text-[10px] font-medium',
                done && 'bg-emerald-100 text-emerald-900',
                live && 'bg-[var(--landing-teal)] text-white',
                !done && !live && 'bg-[var(--landing-cream)] text-[var(--landing-ink-muted)]',
              )}
            >
              {done ? 'Complete' : live ? 'Calling' : 'Pending'}
            </span>
          </div>
          {live && !compact && (
            <p className="mt-2 text-xs text-[var(--landing-teal-deep)]">Illustration: Jiya confirming attendance…</p>
          )}
        </li>
        <li className={clsx('rounded-lg border border-black/5 bg-white/70', compact ? 'p-2.5' : 'p-3')}>
          <p className={clsx('font-medium text-[var(--landing-forest)]', compact ? 'text-xs' : 'text-sm')}>Lipid profile reminder</p>
          <p className={clsx('text-[var(--landing-ink-muted)]', compact ? 'text-[10px]' : 'text-xs')}>Due today · Attempt 1 of 3</p>
        </li>
      </ul>
    </div>
  )
}
