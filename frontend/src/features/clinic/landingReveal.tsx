import clsx from 'clsx'
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'

type RevealProps = {
  children: ReactNode
  className?: string
  as?: ElementType
  /** Stagger delay after element enters view (ms). */
  delay?: number
  /** Animate on mount (hero) instead of waiting for scroll. */
  immediate?: boolean
}

export function LandingReveal({ children, className, as: Tag = 'div', delay = 0, immediate = false }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(immediate)

  useEffect(() => {
    if (immediate) {
      const t = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(t)
    }
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [immediate])

  return (
    <Tag
      ref={ref}
      className={clsx('landing-reveal', visible && 'landing-reveal-visible', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}

export function landingHeroStyle(delayMs: number): CSSProperties {
  return { '--hero-delay': `${delayMs}ms` } as CSSProperties
}
