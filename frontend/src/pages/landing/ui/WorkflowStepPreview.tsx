import { DEMO_DISCLAIMER } from '../demo/clinicalDemoData'

export function WorkflowStepPreview({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="landing-step-preview">
        <div className="landing-step-preview-row">
          <span className="landing-step-preview-label">Patient</span>
          <span className="font-medium text-white">Ananya Mehta</span>
        </div>
        <div className="landing-step-preview-row">
          <span className="landing-step-preview-label">Appointment</span>
          <span>Procedure · Follow-up booked</span>
        </div>
        <div className="landing-step-preview-row border-t border-white/10 pt-2">
          <span className="landing-step-preview-label">Task</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">Recovery check-in queued</span>
        </div>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="landing-step-preview">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-white">Outbound · Jiya</span>
          <span className="rounded bg-teal-300/25 px-1.5 py-0.5 text-[10px] font-semibold text-teal-50">Completed</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/85">Routine answers captured · Patient-reported pain noted</p>
        <p className="mt-2 rounded border border-amber-200/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-50/95">
          Concern structured · Routed to Clinical Review ({DEMO_DISCLAIMER})
        </p>
      </div>
    )
  }

  return (
    <div className="landing-step-preview">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-200/90">Clinical review</p>
      <ul className="mt-2 space-y-1.5 text-[11px]">
        <li className="flex justify-between gap-2 rounded bg-white/10 px-2 py-1.5">
          <span className="text-emerald-50/95">Worsening pain · High</span>
          <span className="shrink-0 text-amber-100/90">New</span>
        </li>
        <li className="flex justify-between gap-2 px-2 py-0.5 text-emerald-100/75">
          <span>Assigned · Dr. on call</span>
          <span>Act</span>
        </li>
      </ul>
    </div>
  )
}
