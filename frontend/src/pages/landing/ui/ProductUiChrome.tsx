export function ProductUiChrome({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="landing-ui-chrome">
      <div className="landing-ui-dots" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className="truncate text-[11px] font-medium text-[var(--landing-ink-muted)]">{title}</p>
        {meta && <p className="truncate text-[10px] text-[var(--landing-ink-muted)]/80">{meta}</p>}
      </div>
      <span className="hidden w-8 sm:block" aria-hidden />
    </div>
  )
}
