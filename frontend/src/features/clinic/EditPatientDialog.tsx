import { useEffect, useState } from 'react'
import { api, ApiError, type Patient } from '@/api'
import { ModalOverlay } from '@/components/ModalOverlay'
import { Button, ErrorBanner } from '@/components/ui'
import type { PatientGender } from '@/api/types'
import { PatientDemographicsFields, parseAgeField } from '@/features/clinic/patientDemographicsFields'
import { composeE164, PhoneMobileFields } from '@/features/clinic/phoneField'

type Props = {
  open: boolean
  patient: Patient
  onClose: () => void
  onSaved: () => void
}

export function EditPatientDialog({ open, patient, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(patient.display_name)
  const [countryDial, setCountryDial] = useState('+91')
  const [localPhone, setLocalPhone] = useState('')
  const [changePhone, setChangePhone] = useState(false)
  const [age, setAge] = useState(patient.age != null ? String(patient.age) : '')
  const [gender, setGender] = useState<PatientGender | ''>(patient.gender ?? '')
  const [language, setLanguage] = useState(patient.language)
  const [consent, setConsent] = useState(patient.contact_permitted)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setDisplayName(patient.display_name)
    setAge(patient.age != null ? String(patient.age) : '')
    setGender(patient.gender ?? '')
    setLanguage(patient.language)
    setConsent(patient.contact_permitted)
    setLocalPhone('')
    setChangePhone(false)
    setCountryDial('+91')
  }, [patient])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const parsedAge = parseAgeField(age)
      const patch: Record<string, unknown> = {
        display_name: displayName.trim(),
        language,
        contact_permitted: consent,
        age: parsedAge ?? null,
        gender: gender || null,
      }
      if (changePhone && localPhone.replace(/\D/g, '').length > 0) {
        patch.phone_e164 = composeE164(countryDial, localPhone)
      }
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
    <ModalOverlay onBackdropClick={onClose}>
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
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
        <div className="mt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={changePhone} onChange={(e) => setChangePhone(e.target.checked)} />
            Update mobile number <span className="text-slate-400">(currently {patient.phone_masked})</span>
          </label>
          {changePhone && (
            <PhoneMobileFields
              countryDial={countryDial}
              localNumber={localPhone}
              onCountryDial={setCountryDial}
              onLocalNumber={setLocalPhone}
            />
          )}
        </div>
        <PatientDemographicsFields
          age={age}
          gender={gender}
          onAge={setAge}
          onGender={setGender}
          inputClassName="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
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
    </ModalOverlay>
  )
}
