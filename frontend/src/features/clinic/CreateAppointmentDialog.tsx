import { useEffect, useState } from 'react'
import { api, ApiError, type PatientListItem } from '@/api'
import { Button, ErrorBanner } from '@/components/ui'

type Props = {
  open: boolean
  defaultPatientId?: string
  onClose: () => void
  onCreated: (appointmentId: string, taskId: string | null) => void
}

export function CreateAppointmentDialog({ open, defaultPatientId, onClose, onCreated }: Props) {
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientId, setPatientId] = useState(defaultPatientId ?? '')
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [department, setDepartment] = useState('')
  const [clinician, setClinician] = useState('')
  const [spawnTask, setSpawnTask] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setPatientId(defaultPatientId ?? '')
    void api.listPatients().then((r) => setPatients(r.items))
  }, [open, defaultPatientId])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientId || !scheduledLocal) {
      setError('Choose a patient and appointment time.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const scheduled_at = new Date(scheduledLocal).toISOString()
      const res = await api.createAppointment({
        patient_id: patientId,
        scheduled_at,
        department: department.trim() || undefined,
        clinician: clinician.trim() || undefined,
        spawn_confirmation_task: spawnTask,
      })
      onCreated(res.appointment.appointment_id, res.task?.task_id ?? null)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create appointment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-medium text-navy-900">Book appointment</h2>
        <p className="mt-1 text-sm text-slate-600">Creates the visit and optionally a Jiya confirmation call task.</p>
        {error && (
          <div className="mt-3">
            <ErrorBanner error={error} />
          </div>
        )}
        {!defaultPatientId && (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Patient
            <select required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Scheduled time
          <input type="datetime-local" required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Department
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. General medicine" />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Clinician
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="e.g. Dr. Sharma" />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={spawnTask} onChange={(e) => setSpawnTask(e.target.checked)} />
          Schedule Jiya confirmation call (due day before visit)
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Book
          </Button>
        </div>
      </form>
    </div>
  )
}
