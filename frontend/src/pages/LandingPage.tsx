import { ArrowRight, Loader2 } from 'lucide-react'
import { ErrorBanner } from '@/components/ui'
import { PartnerLogos } from '@/components/PartnerLogos'
import { landingHeroStyle } from '@/features/clinic/landingReveal'
import { ClinicalDemoProvider } from './landing/demo/ClinicalDemoProvider'
import { HeroShowcase } from './landing/HeroShowcase'
import { LandingFeatures } from './landing/LandingFeatures'
import { LandingHeader } from './landing/LandingHeader'
import { LandingTrust } from './landing/LandingTrust'
import { LandingWorkflow } from './landing/LandingWorkflow'
import { LandingStoryProvider } from './landing/storyContext'
import { useCallStory } from './landing/useCallStory'
import { useOpenWorkspace } from './landing/useOpenWorkspace'
import './landing/landing.css'

function storyStepIndex(phase: ReturnType<typeof useCallStory>) {
  if (phase === 'idle') return 0
  if (phase === 'live' || phase === 'summary') return 1
  return 2
}

export default function LandingPage() {
  const { loading, error, openWorkspace } = useOpenWorkspace()
  const storyPhase = useCallStory(true)
  const activeStep = storyStepIndex(storyPhase)
  const open = () => void openWorkspace()

  return (
    <ClinicalDemoProvider>
      <LandingStoryProvider phase={storyPhase}>
        <div className="landing-page min-h-dvh">
          <LandingHeader onOpenWorkspace={open} loading={loading} />

          <section className="landing-hero" aria-labelledby="landing-headline">
            <div className="landing-shell">
              <div className="landing-hero-grid">
                <div className="landing-hero-copy min-w-0">
                  <p className="landing-hero-in landing-eyebrow" style={landingHeroStyle(0)}>
                    Clinic operations · Voice AI
                  </p>
                  <h1 id="landing-headline" className="landing-display landing-hero-in mt-2" style={landingHeroStyle(60)}>
                    Know who needs a call.
                    <span className="landing-display-accent mt-0.5 block max-w-[14ch] sm:max-w-none">Know who needs care.</span>
                  </h1>
                  <p className="landing-lead landing-hero-in mt-3 max-w-[34rem]" style={landingHeroStyle(130)}>
                    Jiya handles patient follow-ups, appointment coordination, and recovery check-ins. When patients raise concerns,
                    Jivana Connect captures what they say and routes it to the right doctor or care team, with clear next steps in
                    one workspace.
                  </p>
                  <div className="landing-hero-in mt-5 flex flex-col gap-2 sm:flex-row sm:items-center" style={landingHeroStyle(200)}>
                    <button type="button" className="landing-btn-primary w-full sm:w-auto" onClick={open} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Open clinic workspace
                    </button>
                    <a href="#product" className="landing-btn-secondary w-full sm:w-auto">
                      See how it works
                    </a>
                  </div>
                  {error && (
                    <div className="mt-4 max-w-md">
                      <ErrorBanner error={error} onRetry={open} />
                    </div>
                  )}
                </div>

                <div className="landing-hero-in landing-hero-visual" style={landingHeroStyle(160)}>
                  <HeroShowcase />
                </div>
              </div>
            </div>
          </section>

          <LandingFeatures />
          <LandingWorkflow onOpenWorkspace={open} loading={loading} activeStep={activeStep} />
          <LandingTrust />

          <section className="landing-close" aria-labelledby="landing-close-title">
            <div className="landing-shell landing-close-inner">
              <div>
                <h2 id="landing-close-title" className="landing-serif text-xl sm:text-2xl">
                  Step into the clinic workspace
                </h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-emerald-100/85">
                  Same product your front desk and clinicians use — routine follow-ups, clinical review, and timeline in one place.
                </p>
              </div>
              <button
                type="button"
                className="landing-btn-secondary shrink-0 border-white/25 bg-white text-[var(--landing-forest)] hover:bg-emerald-50"
                onClick={open}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Open clinic workspace
              </button>
            </div>
          </section>

          <footer className="landing-footer">
            <div className="landing-shell">
              <PartnerLogos surface="dark" layout="row" inline className="mx-auto justify-center opacity-90" />
            </div>
          </footer>
        </div>
      </LandingStoryProvider>
    </ClinicalDemoProvider>
  )
}
