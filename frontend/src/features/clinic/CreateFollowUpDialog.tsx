import { useState } from 'react'
import { api, ApiError, TASK_TYPES, type TaskType } from '@/api'
import { ModalOverlay } from '@/components/ModalOverlay'
import { Button, ErrorBanner } from '@/components/ui'
import { label } from '@/lib/format'

const TEMPLATES: Partial<Record<TaskType, { title: string; purpose: string; call_context: string }>> = {
  post_procedure_checkin: {
    title: 'Post-visit follow-up call',
    purpose: 'Check how the patient is feeling after their recent visit or procedure.',
    call_context:
      'Post-visit follow-up. Ask how they feel since the visit. Record any concerns or clinical questions for the care team — do not give medical advice.',
  },
  appointment_confirmation: {
    title: 'Appointment confirmation',
    purpose: 'Confirm the patient can attend their upcoming appointment.',
    call_context: 'Confirm appointment attendance. If they cannot attend, record reschedule preference. Do not book a new slot on the call.',
  },
  callback_request: {
    title: 'Return patient call',
    purpose: 'Patient requested a callback from the clinic.',
    call_context: 'Patient asked the clinic to call back. Be brief and professional.',
  },
  test_report_reminder: {
    title: 'Test reminder',
    purpose: 'Check whether the patient has completed a pending lab test.',
    call_context:
      'Ask only if they completed the test named in visit details. Do not ask for reports, values, or photos. If yes, ask when they can come in for a follow-up visit and record their preference. Do not interpret clinical results.',
  },
  clinician_task_reminder: {
    title: 'Clinician instruction reminder',
    purpose: 'Remind the patient of a specific instruction from their clinician.',
    call_context:
      'Brief reminder of the clinician instruction in visit details. Confirm they understood and will follow it. No medical advice.',
  },
}

type Props = {
  open: boolean
  patientId: string
  patientName: string
  onClose: () => void
  onCreated: (taskId: string) => void
}

export function CreateFollowUpDialog({ open, patientId, patientName, onClose, onCreated }: Props) {
  const [taskType, setTaskType] = useState<TaskType>('post_procedure_checkin')
  const [title, setTitle] = useState(TEMPLATES.post_procedure_checkin!.title)
  const [purpose, setPurpose] = useState(TEMPLATES.post_procedure_checkin!.purpose)
  const [callContext, setCallContext] = useState(TEMPLATES.post_procedure_checkin!.call_context)
  const [dueLocal, setDueLocal] = useState('')
  const [visitDetails, setVisitDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!open) return null

  function applyTemplate(tt: TaskType) {
    setTaskType(tt)
    const t = TEMPLATES[tt]
    if (t) {
      setTitle(t.title)
      setPurpose(t.purpose)
      setCallContext(t.call_context)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!dueLocal) {
      setError('Choose when this follow-up is due.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const due_at = new Date(dueLocal).toISOString()
      const context =
        visitDetails.trim().length > 0 ? `${callContext.trim()}\n\nVisit details: ${visitDetails.trim()}` : callContext
      const res = await api.createTask({
        patient_id: patientId,
        task_type: taskType,
        title,
        purpose,
        call_context: context,
        due_at,
      })
      onCreated(res.task.task_id)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create follow-up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onBackdropClick={onClose}>
      <form onSubmit={submit} className="max-h-[85dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-medium text-navy-900">Schedule follow-up call</h2>
        <p className="mt-0.5 text-sm text-slate-500">{patientName}</p>
        {error && <div className="mt-3"><ErrorBanner error={error} /></div>}
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Type
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={taskType} onChange={(e) => applyTemplate(e.target.value as TaskType)}>
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>{label(t)}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Due (local time)
          <input type="datetime-local" required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Title
          <input required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Purpose (staff-visible)
          <textarea required rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Call context (sent to Jiya)
          <textarea required rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={callContext} onChange={(e) => setCallContext(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Visit / procedure details (optional)
          <textarea
            rows={2}
            placeholder="e.g. Extraction lower left, 29 Oct — ask about pain and swelling"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={visitDetails}
            onChange={(e) => setVisitDetails(e.target.value)}
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create follow-up</Button>
        </div>
      </form>
    </ModalOverlay>
  )
}
