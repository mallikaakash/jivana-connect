import { Link } from 'react-router-dom'
import type { Patient } from '@/api/types'
import { attentionStatusLabel, label, patientGenderLabel } from '@/lib/format'
import { StatusBadge } from './ui'

/** Compact patient card used on task, call and escalation detail pages. */
export function PatientSummary({ patient }: { patient: Patient }) {
  const initials = patient.display_name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-serif text-base text-navy-800 ring-1 ring-emerald-200">{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/patients/${patient.patient_id}`} className="font-serif text-lg leading-tight font-light text-navy-900 decoration-teal-500/50 underline-offset-4 transition-colors hover:text-teal-700 hover:underline">
            {patient.display_name}
          </Link>
          <StatusBadge value={patient.attention_status} text={attentionStatusLabel(patient.attention_status)} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {patient.demo_id}
          {patient.age != null && ` · ${patient.age} y`}
          {patient.gender && ` · ${patientGenderLabel(patient.gender)}`} · {label(patient.language)} · {patient.phone_masked}
        </p>
        {!patient.contact_permitted && <p className="mt-1 text-xs font-medium text-amber-700">No call consent on file</p>}
      </div>
    </div>
  )
}
