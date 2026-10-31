import { useState } from 'react'
import { api, ApiError } from '@/api'
import { ModalOverlay } from '@/components/ModalOverlay'
import { Button, ErrorBanner } from '@/components/ui'
import { PatientDemographicsFields, parseAgeField } from '@/features/clinic/patientDemographicsFields'
import { composeE164, PhoneMobileFields } from '@/features/clinic/phoneField'
import type { PatientGender } from '@/api/types'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreatePatientDialog({ open, onClose, onCreated }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [countryDial, setCountryDial] = useState('+91')
  const [localPhone, setLocalPhone] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<PatientGender | ''>('')
  const [language, setLanguage] = useState<'hi' | 'en' | 'hinglish'>('hinglish')
  const [consent, setConsent] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const phone_e164 = composeE164(countryDial, localPhone)
      const parsedAge = parseAgeField(age)
      await api.createPatient({
        display_name: displayName.trim(),
        phone_e164,
        language,
        contact_permitted: consent,
        ...(parsedAge != null ? { age: parsedAge } : {}),
        ...(gender ? { gender } : {}),
      })
      setDisplayName('')
      setLocalPhone('')
      setAge('')
      setGender('')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register patient')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onBackdropClick={onClose}>
      <form autoComplete="off" onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-medium text-navy-900">Register patient</h2>
        {error && <div className="mt-3"><ErrorBanner error={error} /></div>}
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Full name
          <input required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Mobile number
          <PhoneMobileFields
            countryDial={countryDial}
            localNumber={localPhone}
            onCountryDial={setCountryDial}
            onLocalNumber={setLocalPhone}
            localPlaceholder="Enter mobile number"
            autoComplete="off"
          />
        </label>
        <PatientDemographicsFields age={age} gender={gender} onAge={setAge} onGender={setGender} />
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Preferred language
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
            <option value="hinglish">Hinglish</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Patient consents to follow-up voice calls
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Save patient</Button>
        </div>
      </form>
    </ModalOverlay>
  )
}
