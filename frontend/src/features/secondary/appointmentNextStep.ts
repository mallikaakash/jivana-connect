import type { Appointment } from '@/api'

/**
 * Next step for staff, derived only from contract fields. Never implies the booking changed:
 * `booking_status` is owned by the booking system, and a call cannot alter it.
 */
export function appointmentNextStep(appt: Pick<Appointment, 'booking_status' | 'confirmation_state'>): string {
  if (appt.booking_status === 'cancelled') return 'None — booking cancelled'
  if (appt.booking_status === 'completed') return 'None — visit completed'
  switch (appt.confirmation_state) {
    case 'pending':
      return 'Awaiting confirmation call'
    case 'rescheduling_requested':
      return 'Staff to rebook — booking unchanged'
    case 'declined':
      return 'Staff to review cancellation'
    case 'no_answer':
      return 'Retry call'
    case 'unable_to_confirm':
      return 'Staff to follow up manually'
    case 'confirmed':
      return 'None'
  }
}
