import clsx from 'clsx'
import { ArrowRight, Loader2, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { JivanaConnectLogo } from '@/components/branding/JivanaConnectLogo'

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#workflow', label: 'How it works' },
  { href: '#trust', label: 'For clinics' },
]

type Props = {
  onOpenWorkspace: () => void
  loading: boolean
}

export function LandingHeader({ onOpenWorkspace, loading }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <header className="landing-header">
      <div className="landing-shell landing-header-inner">
        <a href="/" className="shrink-0" aria-label="Jivana Connect home">
          <JivanaConnectLogo variant="onLight" className="origin-left scale-[0.88]" />
        </a>

        <nav className="landing-nav" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" className="landing-btn-nav hidden sm:inline-flex" onClick={onOpenWorkspace} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Open workspace
            {!loading && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />}
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/80 md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className={clsx('landing-shell landing-mobile-nav border-t border-black/5 bg-[var(--landing-ivory)] md:hidden', !open && 'hidden')}>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <button type="button" className="landing-btn-primary mt-1 w-full" onClick={() => { setOpen(false); onOpenWorkspace() }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Open clinic workspace
        </button>
      </div>
    </header>
  )
}
