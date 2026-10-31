import clsx from 'clsx'
import { DEMO } from '../storyContext'

export function CallSummaryPanel({ visible, embedded }: { visible: boolean; embedded?: boolean }) {
  return (
    <div
      className={clsx(
        'flex flex-col bg-white transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        embedded ? 'border-l border-black/5' : 'landing-ui-panel',
        visible ? 'opacity-100' : 'hidden sm:flex sm:pointer-events-none sm:opacity-35',
      )}
      aria-hidden={!visible}
    >
      <div className="border-b border-black/5 bg-[#faf8f3] px-4 py-2.5">
        <p className="text-[11px] font-semibold text-[var(--landing-forest)]">Call outcome</p>
        <p className="text-[10px] text-[var(--landing-ink-muted)]">{DEMO.patient}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--landing-ink-muted)]">Status</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200/80">
            Appointment confirmed
          </span>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-teal-deep)]">Summary</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--landing-ink-muted)]">{DEMO.summary}</p>
        </div>
        <div className="mt-auto rounded-lg border border-[var(--landing-mint)] bg-[var(--landing-mint-soft)] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-teal-deep)]">Next action</p>
          <p className="mt-0.5 text-xs font-medium text-[var(--landing-forest)]">{DEMO.nextAction}</p>
        </div>
        <p className="text-[10px] text-[var(--landing-ink-muted)]">Structured fields saved · 31 Oct, 4:12 pm</p>
      </div>
    </div>
  )
}
