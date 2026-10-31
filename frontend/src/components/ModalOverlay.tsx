import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Full-viewport modal: portaled to body so fixed positioning isn’t trapped by scroll/layout ancestors. */
export function ModalOverlay({
  children,
  onBackdropClick,
  maxWidthClass = 'max-w-lg',
}: {
  children: ReactNode
  onBackdropClick?: () => void
  maxWidthClass?: string
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-navy-900/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div className="flex min-h-full items-center justify-center py-6 sm:py-10">
        <div className={`w-full ${maxWidthClass}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
