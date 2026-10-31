import { useEffect, useState } from 'react'
import { api, ApiError, type Patient } from '@/api'
import { Button, ErrorBanner } from '@/components/ui'

type Props = {
  open: boolean
  patient: Patient
  onClose: () => void
  onSaved: () => void
}

export function EditPatientDialog({ open, patient, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(patient.display_name)
  const [phone, setPhone] = useState('')
  const [language, setLanguage] = useState(patient.language)
  const [consent, setConsent] = useState(patient.contact_permitted)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setDisplayName(patient.display_name)
    setLanguage(patient.language)
    setConsent(patient.contact_permitted)
    setPhone('')
  }, [patient])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const patch: Record<string, unknown> = {
        display_name: displayName.trim(),
        language,
        contact_permitted: consent,
      }
      if (phone.trim()) patch.phone_e164 = phone.trim()
      await api.updatePatient(patient.patient_id, patch)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update patient')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-medium text-navy-900">Edit patient</h2>
        {error && (
          <div className="mt-3">
            <ErrorBanner error={error} />
          </div>
        )}
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Full name
          <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          New phone (E.164, optional)
          <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono" placeholder={patient.phone_masked} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Language
          <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
            <option value="hinglish">Hinglish</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Consent to voice contact
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Save
          </Button>
        </div>
      </form>
    </div>
  )
}
