import { CalendarClock, Info } from 'lucide-react'
import type { Appointment } from '@/api/types'
import { StatusBadge } from '@/components/ui'
import { formatDateTime, relativeTime } from '@/lib/format'

const CONFIRMATION_NOTES: Partial<Record<Appointment['confirmation_state'], string>> = {
  rescheduling_requested: 'Patient asked to reschedule. Booking unchanged until staff rebook in the booking system.',
  declined: 'Patient said they will not attend. Booking unchanged until staff cancel it in the booking system.',
  no_answer: 'Patient could not be reached. Booking unchanged.',
  unable_to_confirm: 'Attendance not confirmed on the call. Booking unchanged.',
}

/** Booking status (booking system) and confirmation state (from Jiya's call) are shown as separate facts. */
export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const note = CONFIRMATION_NOTES[appointment.confirmation_state]
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-navy-800">{formatDateTime(appointment.scheduled_at)}</p>
          <p className="text-xs text-slate-500">
            {relativeTime(appointment.scheduled_at)} · {appointment.department} · {appointment.clinician}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <dt>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Booking status</p>
            <p className="text-[11px] text-slate-400">Booking system</p>
          </dt>
          <dd>
            <StatusBadge value={appointment.booking_status} />
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <dt>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Confirmation</p>
            <p className="text-[11px] text-slate-400">From Jiya call</p>
          </dt>
          <dd>
            <StatusBadge value={appointment.confirmation_state} />
          </dd>
        </div>
      </dl>
      {note && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {note}
        </p>
      )}
    </div>
  )
}
