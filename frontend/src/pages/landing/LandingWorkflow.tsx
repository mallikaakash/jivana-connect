import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { LandingReveal } from '@/features/clinic/landingReveal'
import { WorkflowStepPreview } from './ui/WorkflowStepPreview'

const STEPS = [
  {
    n: '01',
    title: 'Register & coordinate',
    text: 'Manage patients, appointments, and follow-up tasks in one workspace.',
    hint: 'Patients · Appointments',
  },
  {
    n: '02',
    title: 'Jiya calls & listens',
    text: 'Multilingual conversations capture responses, complete routine follow-ups, and identify concerns that need attention.',
    hint: 'Calls · Capture',
  },
  {
    n: '03',
    title: 'Review & act',
    text: 'Route patient concerns to clinicians, prioritize work per clinic protocols, and track callbacks and resolutions.',
    hint: 'Escalate · Review',
  },
]

const FLOW = ['Register', 'Call', 'Capture', 'Escalate', 'Review', 'Act']

type Props = {
  onOpenWorkspace: () => void
  loading: boolean
  activeStep: number
}

export function LandingWorkflow({ onOpenWorkspace, loading, activeStep }: Props) {
  return (
    <section id="workflow" className="landing-section-workflow">
      <div className="landing-shell">
        <LandingReveal>
          <div className="landing-workflow-panel">
            <div className="landing-workflow-intro">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">How it works</p>
                <h2 className="landing-serif mt-1.5 text-[clamp(1.35rem,2.5vw,1.85rem)] leading-tight">Three steps, one workspace</h2>
                <p className="mt-2 text-xs leading-relaxed text-emerald-100/85 sm:text-sm">
                  Patient conversation → concern captured → clinical review → action recorded. Jiya supports; clinicians decide.
                </p>
              </div>
            </div>

            <ol className="landing-workflow-pipeline mt-6" aria-label="End-to-end flow">
              {FLOW.map((label, i) => {
                const start = activeStep * 2
                return (
                  <li
                    key={label}
                    className={clsx(i < start && 'is-done', i >= start && i <= start + 1 && 'is-current')}
                  >
                    {label}
                  </li>
                )
              })}
            </ol>

            <ol className="landing-steps">
              {STEPS.map((s, i) => (
                <li key={s.n} className={clsx('landing-step', i === activeStep && 'is-active')}>
                  <span className="landing-step-num">{s.n}</span>
                  <p className="mt-4 font-medium text-white">{s.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">{s.text}</p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-teal-200/80">{s.hint}</p>
                  <div className={clsx('mt-4 transition-opacity duration-500', i === activeStep ? 'opacity-100' : 'opacity-50')}>
                    <WorkflowStepPreview step={i} />
                  </div>
                </li>
              ))}
            </ol>

            <div className="landing-workflow-cta">
              <p className="text-sm text-emerald-100/85">Open the workspace for Today, clinical review, tasks, and calls.</p>
              <button
                type="button"
                className="landing-btn-secondary shrink-0 border-white/20 bg-white text-[var(--landing-forest)] hover:bg-emerald-50"
                onClick={onOpenWorkspace}
                disabled={loading}
              >
                <ArrowRight className="h-4 w-4" />
                Open clinic workspace
              </button>
            </div>
          </div>
        </LandingReveal>
      </div>
    </section>
  )
}
