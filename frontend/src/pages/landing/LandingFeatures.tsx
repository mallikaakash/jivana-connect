import { LandingReveal } from '@/features/clinic/landingReveal'
import { CallRecordDetail } from './ui/CallRecordDetail'
import { ClinicalReviewQueueDemo } from './ui/ClinicalReviewQueueDemo'
import { DeskOperationsPreview } from './ui/DeskOperationsPreview'
import { PatientTimelineDemo } from './ui/PatientTimelineDemo'

export function LandingFeatures() {
  return (
    <section id="product" className="landing-section-product">
      <div className="landing-shell">
        <LandingReveal>
          <p className="landing-eyebrow">Product</p>
          <h2 className="landing-section-heading mt-1.5 max-w-xl">Built for real clinic rhythm</h2>
          <p className="landing-lead mt-2 max-w-2xl">
            From patient conversations to coordinated care. Every call has a purpose, every concern has a destination, and every
            follow-up has a next step.
          </p>
        </LandingReveal>

        <LandingReveal delay={60} className="mt-7">
          <article className="landing-feature-primary">
            <div className="landing-feature-primary-copy">
              <h3 className="landing-feature-heading">Jiya handles the calls</h3>
              <p className="landing-feature-copy mt-1.5 max-w-md">
                Appointment confirmations, rescheduling, prescribed test reminders, pending report follow-ups, and post-consultation
                recovery check-ins.
              </p>
            </div>
            <CallRecordDetail />
          </article>
        </LandingReveal>

        <LandingReveal delay={100} className="mt-6">
          <div className="mb-3 max-w-2xl">
            <h3 className="landing-feature-heading">Concerns reach the care team</h3>
            <p className="landing-feature-copy mt-1.5">
              Jiya captures patient-reported symptoms, recovery difficulties, and other concerns in structured summaries, routing them
              to the appropriate doctor or care team. Click a row to inspect details and try demo status actions (local only).
            </p>
          </div>
          <ClinicalReviewQueueDemo />
        </LandingReveal>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <LandingReveal delay={140} className="landing-feature-side">
            <h3 className="landing-feature-heading">Your team knows what to do</h3>
            <p className="landing-feature-copy mt-1">
              Front-desk tasks and clinical reviews appear in separate queues. See pending concerns, assigned owners, callbacks, and
              completed actions without searching transcripts.
            </p>
            <DeskOperationsPreview />
          </LandingReveal>
          <LandingReveal delay={180} className="landing-feature-side">
            <h3 className="landing-feature-heading">Every patient, one connected story</h3>
            <p className="landing-feature-copy mt-1">
              Calls, concerns, assignments, reviews, and follow-ups on one timeline — administrative and clinical events clearly
              distinguished.
            </p>
            <PatientTimelineDemo />
          </LandingReveal>
        </div>
      </div>
    </section>
  )
}
