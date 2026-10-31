import { CheckCheck, CheckCircle2, MessageSquarePlus, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  api,
  type Escalation,
  type EscalationAction,
  type EscalationPatch,
  type EscalationResolutionType,
} from '@/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button, ErrorBanner } from '@/components/ui'
import { label } from '@/lib/format'
import { Note } from './common'

const DEFAULT_AUTHOR = 'Demo staff'

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50'

const RESOLUTION_OPTIONS: { value: EscalationResolutionType; label: string }[] = [
  { value: 'called_patient', label: 'Called patient back' },
  { value: 'advised_come_in', label: 'Advised to come in' },
  { value: 'not_clinical', label: 'Not clinical — admin handled' },
  { value: 'referred_elsewhere', label: 'Referred elsewhere' },
  { value: 'admin_handled', label: 'Admin / scheduling only' },
]

const DONE_TEXT: Record<EscalationAction, string> = {
  acknowledge: 'Acknowledgement recorded',
  assign: 'Assignment recorded',
  add_note: 'Note added',
  resolve: 'Escalation marked resolved',
}

/**
 * Only the actions the backend implements (acknowledge, assign, add note, resolve).
 * Each waits for the PATCH response and hands the returned escalation to `onUpdated`; nothing is shown as done before that.
 */
export function EscalationActions({
  escalation,
  onUpdated,
  author = DEFAULT_AUTHOR,
  requireResolutionNote = false,
  requireResolutionType = false,
}: {
  escalation: Escalation
  onUpdated: (e: Escalation) => void
  author?: string
  requireResolutionNote?: boolean
  requireResolutionType?: boolean
}) {
  const [pending, setPending] = useState<EscalationAction | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [confirmResolve, setConfirmResolve] = useState(false)
  const [resolutionType, setResolutionType] = useState<EscalationResolutionType>('called_patient')

  const { status } = escalation
  const resolved = status === 'resolved'

  async function run(patch: EscalationPatch): Promise<boolean> {
    setPending(patch.action)
    setError(null)
    setDone(null)
    try {
      const res = await api.updateEscalation(escalation.escalation_id, { ...patch, author })
      onUpdated(res.escalation)
      setDone(DONE_TEXT[patch.action])
      return true
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      return false
    } finally {
      setPending(null)
    }
  }

  async function submitAssign(e: FormEvent) {
    e.preventDefault()
    const name = assignee.trim()
    if (!name) return
    if (await run({ action: 'assign', assigned_to: name })) setAssignee('')
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault()
    const text = note.trim()
    if (!text) return
    if (await run({ action: 'add_note', note: text })) setNote('')
  }

  async function doResolve() {
    if (requireResolutionNote && !note.trim() && escalation.notes.length === 0) {
      setError(new Error('Add a resolution note before marking resolved.'))
      setConfirmResolve(false)
      return
    }
    if (requireResolutionNote && note.trim()) {
      if (!(await run({ action: 'add_note', note: note.trim() }))) {
        setConfirmResolve(false)
        return
      }
      setNote('')
    }
    if (requireResolutionType && !resolutionType) {
      setError(new Error('Choose how this was resolved.'))
      setConfirmResolve(false)
      return
    }
    if (await run({ action: 'resolve', resolution_type: requireResolutionType ? resolutionType : undefined })) {
      setConfirmResolve(false)
    }
  }

  const busy = pending !== null

  if (resolved) {
    return (
      <div className="space-y-3">
        {done && <p className="text-sm font-medium text-emerald-700">{done}.</p>}
        <Note>This escalation is resolved. No further actions are available.</Note>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && <ErrorBanner error={`Action failed: ${error.message} Nothing was changed.`} />}
      {done && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {done}.
        </p>
      )}

      {status === 'open' && (
        <div>
          <Button
            icon={<CheckCheck className="h-4 w-4" />}
            loading={pending === 'acknowledge'}
            disabled={busy}
            onClick={() => void run({ action: 'acknowledge' })}
          >
            Acknowledge
          </Button>
          <Note className="mt-1.5">Records that staff have seen this concern.</Note>
        </div>
      )}

      {(status === 'open' || status === 'acknowledged') && (
        <form onSubmit={submitAssign} className="space-y-2">
          <label htmlFor="esc-assignee" className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Assign to
          </label>
          <div className="flex gap-2">
            <input
              id="esc-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="e.g. Nurse Priya (demo)"
              className={INPUT_CLASS}
              disabled={busy}
            />
            <Button
              type="submit"
              variant="secondary"
              icon={<UserPlus className="h-4 w-4" />}
              loading={pending === 'assign'}
              disabled={busy || !assignee.trim()}
            >
              Assign
            </Button>
          </div>
        </form>
      )}

      <form onSubmit={submitNote} className="space-y-2">
        <label htmlFor="esc-note" className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Add note
        </label>
        <textarea
          id="esc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What was done or what happens next"
          className={INPUT_CLASS}
          disabled={busy}
        />
        <Button
          type="submit"
          variant="secondary"
          icon={<MessageSquarePlus className="h-4 w-4" />}
          loading={pending === 'add_note'}
          disabled={busy || !note.trim()}
        >
          Add note
        </Button>
      </form>

      <div className="border-t border-slate-100 pt-4">
        <Button variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} disabled={busy} onClick={() => setConfirmResolve(true)}>
          Mark resolved
        </Button>
        <Note className="mt-1.5">Current status: {label(status)}. Add a note describing the next step before resolving.</Note>
      </div>

      <ConfirmDialog
        open={confirmResolve}
        title="Mark escalation as resolved?"
        confirmLabel="Mark resolved"
        loading={pending === 'resolve'}
        onConfirm={() => void doResolve()}
        onCancel={() => {
          if (!busy) setConfirmResolve(false)
        }}
      >
        <p>It will leave the active escalation queue. Only resolve once a staff member has recorded the next step for this patient.</p>
        {requireResolutionType && (
          <label className="mt-3 block text-sm text-slate-700">
            Resolution
            <select
              className={`${INPUT_CLASS} mt-1`}
              value={resolutionType}
              onChange={(e) => setResolutionType(e.target.value as EscalationResolutionType)}
            >
              {RESOLUTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && pending === null && confirmResolve && <p className="mt-2 text-red-700">Last attempt failed: {error.message}</p>}
      </ConfirmDialog>
    </div>
  )
}
