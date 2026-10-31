import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'

/** In-page modal (never window.confirm). Renders nothing when `open` is false. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-navy-900/30 p-4 backdrop-blur-[6px]" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md animate-pop rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-2xl leading-tight font-light tracking-[-0.02em] text-navy-900">{title}</h3>
        {children && <div className="mt-3 text-sm leading-relaxed text-slate-600">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
