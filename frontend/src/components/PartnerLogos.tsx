import clsx from 'clsx'

type PartnerLogosProps = {
  className?: string
  /** Light main canvas vs dark nav sidebar */
  surface?: 'light' | 'dark'
  /** Side-by-side logos (preferred in sidebar / header) */
  layout?: 'row' | 'stack'
  /** Label left, logos right — fits nav sidebar width */
  inline?: boolean
  compact?: boolean
}

export function PartnerLogos({
  className,
  surface = 'light',
  layout = 'row',
  inline = false,
  compact = false,
}: PartnerLogosProps) {
  const onDark = surface === 'dark'
  const bolnaSrc = onDark ? '/partners/bolna-logo-dark.png' : '/partners/bolna-logo-dark.png'
  const sarvamSrc = onDark ? '/partners/sarvam-wordmark-white.svg' : '/partners/sarvam-wordmark-black.svg'
  const rowHeight = compact ? 'h-[18px]' : 'h-6'
  const linkBase = clsx(
    'flex shrink-0 items-center justify-center transition-opacity',
    rowHeight,
    onDark ? 'opacity-70 hover:opacity-100' : 'opacity-55 grayscale hover:opacity-100 hover:grayscale-0',
  )
  const bolnaImgClass = clsx(
    'w-auto object-contain object-center',
    compact ? 'h-[18px] max-w-[80px]' : 'h-6 max-w-[104px]',
    onDark && 'brightness-0 invert',
  )
  const sarvamImgClass = clsx(
    'w-auto object-contain object-center',
    compact ? 'h-3 max-w-[58px]' : 'h-3.5 max-w-[76px]',
  )

  const logos = (
    <div
      className={clsx(
        'flex items-center',
        rowHeight,
        layout === 'row' ? 'flex-row gap-2.5' : 'flex-col gap-2.5',
        compact && 'gap-2',
      )}
    >
      <a
        href="https://www.bolna.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className={linkBase}
        aria-label="Bolna AI — voice agents"
      >
        <img src={bolnaSrc} alt="" className={bolnaImgClass} />
      </a>
      <span
        className={clsx(
          'shrink-0',
          layout === 'row' ? (compact ? 'h-3 w-px' : 'h-4 w-px') : 'hidden',
          onDark ? 'bg-white/20' : 'bg-slate-200',
        )}
        aria-hidden
      />
      <a
        href="https://indus.sarvam.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className={linkBase}
        aria-label="Indus by Sarvam — AI platform"
      >
        <img src={sarvamSrc} alt="" className={sarvamImgClass} />
      </a>
    </div>
  )

  if (compact) {
    return <div className={className}>{logos}</div>
  }

  return (
    <div
      className={clsx(
        inline
          ? 'flex min-w-0 items-center gap-3'
          : layout === 'row'
            ? 'flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4'
            : 'flex flex-col gap-3',
        className,
      )}
    >
      <p
        className={clsx(
          'shrink-0 text-[10px] font-medium uppercase tracking-[0.18em]',
          onDark ? 'text-emerald-200/45' : 'text-slate-400',
          inline && 'w-[3.25rem] self-center leading-tight',
          !inline && layout === 'row' && 'sm:w-[3.25rem] sm:leading-tight',
        )}
      >
        {layout === 'row' || inline ? (
          <>
            Powered
            <span className="block">by</span>
          </>
        ) : (
          'Voice & AI stack'
        )}
      </p>
      <div className={clsx(inline && !compact && 'ml-2 sm:ml-3')}>{logos}</div>
    </div>
  )
}
