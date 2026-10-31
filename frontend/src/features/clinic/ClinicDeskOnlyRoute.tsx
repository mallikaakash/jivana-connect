import { Navigate, Outlet } from 'react-router-dom'
import { APP_MODE } from '@/api'
import { useStaffRole } from '@/features/clinic/workspace'

/** In clinic mode, doctors cannot open front-desk task/batch/settings routes directly. */
export function ClinicDeskOnlyRoute() {
  const [role] = useStaffRole()
  if (APP_MODE === 'clinic' && role === 'doctor') {
    return <Navigate to="/today" replace />
  }
  return <Outlet />
}
