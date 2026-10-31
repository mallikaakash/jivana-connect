import { PATIENT_GENDERS, type PatientGender } from '@/api/types'
import { patientGenderLabel } from '@/lib/format'

type Props = {
  age: string
  gender: PatientGender | ''
  onAge: (value: string) => void
  onGender: (value: PatientGender | '') => void
  inputClassName?: string
}

const defaultInput = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2'

export function PatientDemographicsFields({ age, gender, onAge, onGender, inputClassName = defaultInput }: Props) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium text-slate-700">
        Age (years)
        <input
          type="number"
          min={0}
          max={120}
          inputMode="numeric"
          className={inputClassName}
          value={age}
          onChange={(e) => onAge(e.target.value)}
          placeholder="e.g. 34"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Gender
        <select className={inputClassName} value={gender} onChange={(e) => onGender(e.target.value as PatientGender | '')}>
          <option value="">Not specified</option>
          {PATIENT_GENDERS.map((g) => (
            <option key={g} value={g}>
              {patientGenderLabel(g)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function parseAgeField(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return undefined
  return Math.trunc(n)
}
