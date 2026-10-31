import clsx from 'clsx'
import { LandingReveal } from '@/features/clinic/landingReveal'
import { useClinicalDemo } from './demo/ClinicalDemoProvider'
import { ConcernStatusBadge } from './ui/ConcernStatusBadge'

const PRINCIPLES = [
  {
    title: 'AI calls, human decisions',
    text: 'Jiya manages routine patient communication and captures concerns. Clinicians retain responsibility for assessment, diagnosis, and treatment decisions.',
  },
  {
    title: 'Operational and clinical workflows',
    text: 'Keep appointment coordination and administrative callbacks separate from patient concerns requiring clinical review, with clear routing and ownership.',
  },
  {
    title: 'Transparent, trackable follow-ups',
    text: 'Structured summaries, outcome fields, and timeline events help your team understand what happened, what needs attention, and what to do next.',
  },
]

function TrustClinicalMock() {
  const { concerns } = useClinicalDemo()
  const track = concerns.find((c) => c.id === 'c1')
  if (!track) return null

  const stages: { label: string; status: typeof track.status }[] = [
    { label: 'New concern captured', status: 'new' },
    { label: 'Assigned to clinician', status: 'assigned' },
    { label: 'Under review', status: 'under_review' },
  ]

  const activeIndex = track.status === 'new' ? 0 : track.status === 'assigned' ? 1 : track.status === 'under_review' || track.status === 'callback_required' ? 2 : 2

  return (
    <div className="landing-ui-panel overflow-hidden">
      <div className="border-b border-black/5 bg-[#faf8f3] px-4 py-2 text-[11px] font-medium text-[var(--landing-ink-muted)]">
        Clinical review · {track.patientName}
      </div>
      <ol className="p-4 space-y-3">
        {stages.map((s, i) => (
          <li key={s.label} className={clsx('flex items-center gap-3', i > activeIndex && 'opacity-40')}>
            <ConcernStatusBadge status={i <= activeIndex ? s.status : 'new'} />
            <span className="text-sm text-[var(--landing-forest)]">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="border-t border-black/5 px-4 py-2 text-[10px] text-[var(--landing-ink-muted)]">
        Live demo state — change statuses in the Clinical Review queue above.
      </p>
    </div>
  )
}

export function LandingTrust() {
  return (
    <section id="trust" className="landing-section-trust">
      <div className="landing-shell">
        <div className="landing-trust-layout">
          <LandingReveal className="landing-trust-copy">
            <p className="landing-eyebrow">For clinics</p>
            <h2 className="landing-section-heading mt-1.5">
              Designed for how outpatient teams actually work
            </h2>
            <p className="landing-feature-copy mt-3">
              Jivana Connect sits alongside your existing booking flow — a coordination layer for voice follow-ups, clinical routing,
              and the work they create.
            </p>
            <ol className="mt-6 space-y-4">
              {PRINCIPLES.map((item, i) => (
                <li key={item.title} className="flex gap-4">
                  <span className="landing-serif mt-0.5 text-lg text-[var(--landing-teal-deep)]">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--landing-forest)]">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--landing-ink-muted)]">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </LandingReveal>

          <LandingReveal delay={100} className="landing-trust-visual">
            <TrustClinicalMock />
          </LandingReveal>
        </div>
      </div>
    </section>
  )
}
