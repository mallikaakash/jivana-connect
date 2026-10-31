import clsx from 'clsx'
import { Info } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const TOOLTIP_MAX_W = 280
const GAP = 6
const VIEW_PAD = 12

/** Tiny (i) — hover/focus shows help in a fixed tooltip (not clipped by cards or overflow). */
export function InfoHint({
  title,
  children,
  className,
  iconClassName,
}: {
  title?: string
  children: ReactNode
  className?: string
  iconClassName?: string
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  const reposition = useCallback(() => {
    const btn = btnRef.current
    const tip = tipRef.current
    if (!btn) return

    const r = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const tipH = tip?.offsetHeight ?? 88
    const tipW = Math.min(TOOLTIP_MAX_W, vw - VIEW_PAD * 2)

    let top = r.bottom + GAP
    let placeAbove = false
    if (top + tipH > vh - VIEW_PAD) {
      top = r.top - GAP
      placeAbove = true
    }

    let left = r.left + r.width / 2 - tipW / 2
    left = Math.max(VIEW_PAD, Math.min(left, vw - tipW - VIEW_PAD))

    setStyle({
      position: 'fixed',
      top: placeAbove ? top : top,
      left,
      width: tipW,
      transform: placeAbove ? `translateY(-100%)` : undefined,
      zIndex: 9999,
      visibility: 'visible',
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const raf = requestAnimationFrame(() => reposition())
    const onScroll = () => reposition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, reposition, children, title])

  function show() {
    setOpen(true)
  }

  function hide() {
    setOpen(false)
    setStyle((s) => ({ ...s, visibility: 'hidden' }))
  }

  const tooltip =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={tipRef}
        role="tooltip"
        style={style}
        className="pointer-events-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-[0_8px_30px_-8px_rgb(30_46_36/0.25)]"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {title && <p className="mb-1 text-[11px] font-semibold leading-snug text-navy-900">{title}</p>}
        <div className="text-[11px] leading-relaxed text-slate-600">{children}</div>
      </div>,
      document.body,
    )

  return (
    <>
      <span className={clsx('inline-flex shrink-0 align-middle', className)}>
        <button
          ref={btnRef}
          type="button"
          tabIndex={0}
          aria-label={title ? `About: ${title}` : 'More information'}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={clsx(
            'inline-flex items-center justify-center rounded-full p-0.5 text-slate-400 transition-colors',
            'hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/35',
            open && 'text-teal-700',
          )}
        >
          <Info className={clsx('h-3.5 w-3.5', iconClassName)} strokeWidth={2.25} aria-hidden />
        </button>
      </span>
      {tooltip}
    </>
  )
}
