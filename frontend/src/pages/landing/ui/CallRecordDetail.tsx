import { DEMO_DISCLAIMER } from '../demo/clinicalDemoData'
import { ProductUiChrome } from './ProductUiChrome'

/** Illustrative call record — recovery check-in with concern routed to clinical review. */
export function CallRecordDetail() {
  return (
    <div className="landing-ui-panel overflow-hidden">
      <ProductUiChrome title="Call record — Ananya Mehta" meta={`Post-procedure check-in · Outbound · ${DEMO_DISCLAIMER}`} />
      <div className="grid gap-0 md:grid-cols-2">
        <div className="space-y-3 border-b border-black/5 p-3 md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
              Completed
            </span>
            <span className="text-[11px] text-[var(--landing-ink-muted)]">Duration · 2:18</span>
          </div>
          <dl className="grid gap-2 text-xs">
            <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
              <dt className="text-[var(--landing-ink-muted)]">Call type</dt>
              <dd className="font-medium text-[var(--landing-forest)]">Recovery check-in</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
              <dt className="text-[var(--landing-ink-muted)]">Patient</dt>
              <dd className="font-medium text-[var(--landing-forest)]">Ananya Mehta</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
              <dt className="text-[var(--landing-ink-muted)]">Appointment</dt>
              <dd className="font-medium text-[var(--landing-forest)]">Procedure follow-up · Day 2</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
              <dt className="text-[var(--landing-ink-muted)]">Outcome</dt>
              <dd className="font-medium text-[var(--landing-teal-deep)]">Concern captured → clinical review</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--landing-ink-muted)]">Voice agent</dt>
              <dd className="font-medium text-[var(--landing-forest)]">Jiya</dd>
            </div>
          </dl>
        </div>
        <div className="bg-[#faf8f3] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-teal-deep)]">Transcript excerpt</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--landing-ink-muted)]">
            Jiya: How has your recovery been since the procedure? · Patient: The pain is worse than yesterday. · Jiya: I&apos;ve noted
            that for your care team — a clinician will review, not an automated diagnosis.
          </p>
          <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 ring-1 ring-amber-100">
            <p className="text-[10px] font-semibold text-[var(--landing-forest)]">Next action</p>
            <p className="mt-1 text-xs text-[var(--landing-ink-muted)]">
              Route to Clinical Review · High priority per clinic protocol · Assign clinician
            </p>
          </div>
          <p className="mt-3 text-[10px] text-[var(--landing-ink-muted)]">Patient-reported symptoms — requires human clinical assessment.</p>
        </div>
      </div>
    </div>
  )
}

/** Compact card for feature highlight — Priya Nair example from spec. */
export function ClinicalConcernFeatureCard() {
  return (
    <div className="landing-ui-panel overflow-hidden">
      <div className="border-b border-black/5 bg-[#faf8f3] px-4 py-2.5">
        <p className="text-[11px] font-semibold text-[var(--landing-forest)]">Clinical review item</p>
        <p className="text-[10px] text-[var(--landing-ink-muted)]">{DEMO_DISCLAIMER}</p>
      </div>
      <div className="space-y-3 p-4 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--landing-ink-muted)]">Patient</span>
          <span className="font-semibold text-[var(--landing-forest)]">Priya Nair</span>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-teal-deep)]">Reported concern</p>
          <p className="mt-1 leading-relaxed text-[var(--landing-ink-muted)]">
            Patient reports difficulty following a prescribed medication schedule (patient-reported).
          </p>
        </div>
        <div className="flex justify-between gap-2 border-t border-black/5 pt-2">
          <span className="text-[var(--landing-ink-muted)]">Reported</span>
          <span>31 Oct 2026, 11:15 am</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded bg-[var(--landing-teal)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--landing-teal-deep)]">
            High — review required
          </span>
          <span className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900 ring-1 ring-violet-200/80">
            Awaiting clinician review
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--landing-ink-muted)]">Assigned</span>
          <span className="font-medium">Dr. Sharma</span>
        </div>
        <div className="rounded-lg bg-[var(--landing-mint-soft)] px-3 py-2.5">
          <p className="text-[10px] font-semibold text-[var(--landing-forest)]">Next action</p>
          <p className="mt-0.5 text-[var(--landing-ink-muted)]">Clinician callback — assess care-plan adherence</p>
        </div>
      </div>
    </div>
  )
}
