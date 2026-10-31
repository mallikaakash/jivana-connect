import clsx from 'clsx'
import { X } from 'lucide-react'
import { ModalOverlay } from '@/components/ModalOverlay'
import { useClinicalDemo } from '../demo/ClinicalDemoProvider'
import { DEMO_DISCLAIMER } from '../demo/clinicalDemoData'
import { ConcernPriorityBadge, ConcernStatusBadge } from './ConcernStatusBadge'

export function ClinicalConcernDetailModal() {
  const {
    concerns,
    openId,
    setOpenId,
    assignClinician,
    markUnderReview,
    requestCallback,
    recordAction,
    markResolved,
  } = useClinicalDemo()

  const concern = concerns.find((c) => c.id === openId)
  if (!concern) return null

  const close = () => setOpenId(null)

  return (
    <ModalOverlay onBackdropClick={close} maxWidthClass="max-w-2xl">
      <div className="landing-ui-panel max-h-[min(90vh,40rem)] overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 bg-[#faf8f3] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-teal-deep)]">Clinical review</p>
            <h3 className="landing-serif text-lg text-[var(--landing-forest)]">{concern.patientName}</h3>
            <p className="mt-0.5 text-xs text-[var(--landing-ink-muted)]">{DEMO_DISCLAIMER}</p>
          </div>
          <button type="button" className="rounded-full p-1.5 hover:bg-black/5" aria-label="Close" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <ConcernStatusBadge status={concern.status} />
            <ConcernPriorityBadge priority={concern.priority} label={concern.priorityLabel} />
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-ink-muted)]">Concern summary</p>
              <p className="mt-1 text-[var(--landing-forest)]">{concern.concernSummary}</p>
              <p className="mt-1 text-xs text-[var(--landing-ink-muted)]">Patient-reported information — not a verified diagnosis.</p>
            </div>

            <div className="rounded-lg border border-[var(--landing-mint)] bg-[var(--landing-mint-soft)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-teal-deep)]">In the patient&apos;s words (illustrative)</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--landing-ink-muted)]">{concern.patientReported}</p>
            </div>

            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
                <dt className="text-[var(--landing-ink-muted)]">Related visit</dt>
                <dd className="text-right font-medium text-[var(--landing-forest)]">{concern.relatedContext}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
                <dt className="text-[var(--landing-ink-muted)]">Reported</dt>
                <dd className="font-medium text-[var(--landing-forest)]">{concern.reportedAt}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
                <dt className="text-[var(--landing-ink-muted)]">Escalation</dt>
                <dd className="max-w-[16rem] text-right text-[var(--landing-ink-muted)]">{concern.escalationReason}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
                <dt className="text-[var(--landing-ink-muted)]">Assigned</dt>
                <dd className="font-medium text-[var(--landing-forest)]">{concern.assignedTo ?? 'Unassigned'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--landing-ink-muted)]">Next action</dt>
                <dd className="max-w-[16rem] text-right font-medium text-[var(--landing-forest)]">{concern.nextAction}</dd>
              </div>
            </dl>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-ink-muted)]">Activity</p>
              <ol className="mt-2 space-y-1.5 border-l-2 border-[var(--landing-mint)] pl-3 text-xs">
                {concern.activity.map((a) => (
                  <li key={`${a.at}-${a.label}`}>
                    <span className="font-medium text-[var(--landing-forest)]">{a.label}</span>
                    <span className="text-[var(--landing-ink-muted)]"> · {a.at}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="mt-5 border-t border-black/5 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--landing-ink-muted)]">Demo actions (local only)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionBtn onClick={() => assignClinician(concern.id, 'Dr. Sharma')} label="Assign to clinician" />
              <ActionBtn onClick={() => markUnderReview(concern.id)} label="Mark under review" />
              <ActionBtn onClick={() => requestCallback(concern.id)} label="Request callback" />
              <ActionBtn onClick={() => recordAction(concern.id)} label="Record action" />
              <ActionBtn onClick={() => markResolved(concern.id)} label="Mark resolved" variant="primary" />
            </div>
            <p className="mt-2 text-[10px] text-[var(--landing-ink-muted)]">
              Acknowledging a task does not mean the patient&apos;s concern is resolved. Status changes are for demonstration only.
            </p>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

function ActionBtn({
  label,
  onClick,
  variant = 'secondary',
}: {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      type="button"
      className={clsx(
        'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
        variant === 'primary'
          ? 'bg-[var(--landing-forest)] text-white hover:bg-[var(--landing-teal-deep)]'
          : 'border border-black/10 bg-white text-[var(--landing-forest)] hover:border-[var(--landing-teal)]/40',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
