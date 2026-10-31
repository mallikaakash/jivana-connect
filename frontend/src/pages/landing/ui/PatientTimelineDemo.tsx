import clsx from 'clsx'
import { PATIENT_TIMELINE } from '../demo/clinicalDemoData'

export function PatientTimelineDemo() {
  return (
    <ol className="mt-4 space-y-0 border border-black/5 bg-white text-[11px]">
      {PATIENT_TIMELINE.map((ev, i) => (
        <li
          key={ev.id}
          className={clsx(
            'border-b border-black/5 px-3 py-2.5 last:border-b-0',
            ev.type === 'clinical' && 'border-l-[3px] border-l-[var(--landing-teal)] bg-[var(--landing-mint-soft)]/40',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="font-semibold text-[var(--landing-forest)]">{ev.eventType}</span>
              <p className="mt-0.5 text-[var(--landing-ink-muted)]">{ev.description}</p>
            </div>
            <div className="text-right">
              <span className="whitespace-nowrap text-[10px] text-[var(--landing-ink-muted)]">{ev.at}</span>
              <p className={clsx('mt-0.5 text-[10px] font-medium', ev.type === 'clinical' ? 'text-[var(--landing-teal-deep)]' : 'text-[var(--landing-ink-muted)]')}>
                {ev.status}
              </p>
            </div>
          </div>
          {i === 0 && <p className="mt-1 text-[10px] text-[var(--landing-ink-muted)]">Administrative and clinical events on one timeline — AI captures; clinicians assess.</p>}
        </li>
      ))}
    </ol>
  )
}
