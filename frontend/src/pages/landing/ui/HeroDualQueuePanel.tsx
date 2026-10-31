import clsx from 'clsx'
import { useClinicalDemoOptional } from '../demo/ClinicalDemoProvider'
import { DESK_TASKS, HERO_CLINICAL_PREVIEW_IDS, INITIAL_CONCERNS } from '../demo/clinicalDemoData'
import { ConcernPriorityBadge, ConcernStatusBadge } from './ConcernStatusBadge'
import { ProductUiChrome } from './ProductUiChrome'

export function HeroDualQueuePanel() {
  const demo = useClinicalDemoOptional()
  const clinicalRows =
    demo?.concerns.filter((c) => HERO_CLINICAL_PREVIEW_IDS.includes(c.id as (typeof HERO_CLINICAL_PREVIEW_IDS)[number])) ??
    INITIAL_CONCERNS.filter((c) => HERO_CLINICAL_PREVIEW_IDS.includes(c.id as (typeof HERO_CLINICAL_PREVIEW_IDS)[number]))

  return (
    <div className="landing-showcase-unified landing-ui-panel" aria-label="Product demonstration (illustrative)">
      <ProductUiChrome title="Jivana Connect · Today" meta="Illustrative queues — fictional patients" />
      <div className="landing-hero-queues">
        <section className="landing-hero-queue landing-hero-queue-ops">
          <header className="landing-hero-queue-head">
            <p className="landing-eyebrow mb-0">Front desk</p>
            <span className="text-[10px] font-medium text-[var(--landing-ink-muted)]">Operations</span>
          </header>
          <ul className="mt-2 space-y-1.5">
            {DESK_TASKS.map((t) => (
              <li key={t.id} className="rounded-md border border-black/5 bg-white p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--landing-forest)]">{t.title}</p>
                    <p className="text-[10px] text-[var(--landing-ink-muted)]">
                      {t.patientName} · {t.meta}
                    </p>
                  </div>
                  <DeskStatus status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-hero-queue landing-hero-queue-clinical">
          <header className="landing-hero-queue-head">
            <p className="landing-eyebrow mb-0 text-[var(--landing-teal-deep)]">Clinical review</p>
            <span className="text-[10px] font-medium text-[var(--landing-ink-muted)]">Patient-reported</span>
          </header>
          <ul className="mt-2 space-y-1.5">
            {clinicalRows.map((c) => (
              <li
                key={c.id}
                className={clsx(
                  'rounded-md border bg-white p-2',
                  c.priority === 'high' ? 'border-[var(--landing-forest)]/25 bg-[#fdf8f3]' : 'border-black/5',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold leading-snug text-[var(--landing-forest)]">{c.concernSummary.split('.')[0]}</p>
                      {c.priority === 'high' && <ConcernPriorityBadge priority={c.priority} label={c.priorityLabel} />}
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--landing-ink-muted)]">
                      {c.patientName} · {c.reportedAt.split(',')[0]}
                    </p>
                  </div>
                  <ConcernStatusBadge status={c.status} />
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--landing-teal-deep)]">{c.nextAction}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function DeskStatus({ status }: { status: (typeof DESK_TASKS)[0]['status'] }) {
  const label =
    status === 'pending' ? 'Pending' : status === 'calling' ? 'Calling' : status === 'scheduled' ? 'Scheduled' : 'Complete'
  return (
    <span
      className={clsx(
        'shrink-0 rounded px-2 py-0.5 text-[10px] font-medium',
        status === 'calling' && 'bg-[var(--landing-teal)] text-white',
        status === 'pending' && 'bg-[var(--landing-cream)] text-[var(--landing-ink-muted)]',
        status === 'scheduled' && 'bg-sky-50 text-sky-900',
        status === 'complete' && 'bg-emerald-50 text-emerald-900',
      )}
    >
      {label}
    </span>
  )
}
