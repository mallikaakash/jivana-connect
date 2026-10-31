import clsx from 'clsx'

const LOGO_SRC = '/jivana-connect-logo.png'

type Variant = 'onDark' | 'onLight'

const TAGLINE = 'Care that never loses touch.'

function JivanaLogomark({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      className={clsx('shrink-0 object-contain object-left', className)}
      width={1024}
      height={682}
      decoding="async"
    />
  )
}

function JivanaWordmark({ variant, size = 'default' }: { variant: Variant; size?: 'default' | 'large' }) {
  const primary = variant === 'onDark' ? 'text-white' : 'text-[#123528]'
  const secondary = variant === 'onDark' ? 'text-emerald-100/90' : 'text-[#2d6a5a]'
  const titleSize = size === 'large' ? 'text-[18px]' : 'text-[15px]'
  const subSize = size === 'large' ? 'text-[11px]' : 'text-[10px]'

  return (
    <div className="min-w-0 shrink leading-none">
      <div className={clsx('whitespace-nowrap font-semibold tracking-[0.07em]', titleSize, primary)}>JIVANA</div>
      <div className={clsx('mt-1 whitespace-nowrap font-medium tracking-[0.28em]', subSize, secondary)}>CONNECT</div>
    </div>
  )
}

export function JivanaConnectLogo({
  variant = 'onLight',
  showTagline = false,
  className,
}: {
  variant?: Variant
  showTagline?: boolean
  className?: string
}) {
  const taglineClass = variant === 'onDark' ? 'text-emerald-100/75' : 'text-[#2d6a5a]/85'
  const large = variant === 'onLight' && showTagline
  const markSize = large ? 'h-[52px] w-auto max-w-[78px]' : 'h-9 w-auto max-w-[54px]'

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      <div className={clsx('flex min-w-0 flex-nowrap items-center', large ? 'gap-3.5' : 'gap-2.5')}>
        <JivanaLogomark className={markSize} />
        <JivanaWordmark variant={variant} size={large ? 'large' : 'default'} />
      </div>
      {showTagline && (
        <p className={clsx('text-[12px] font-light tracking-wide', taglineClass)}>{TAGLINE}</p>
      )}
    </div>
  )
}
