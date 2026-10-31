import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import AppointmentsPage from '@/pages/AppointmentsPage'
import CallDetailPage from '@/pages/CallDetailPage'
import CallsPage from '@/pages/CallsPage'
import EscalationDetailPage from '@/pages/EscalationDetailPage'
import EscalationsPage from '@/pages/EscalationsPage'
import NotFoundPage from '@/pages/NotFoundPage'
import OverviewPage from '@/pages/OverviewPage'
import PatientDetailPage from '@/pages/PatientDetailPage'
import PatientsPage from '@/pages/PatientsPage'
import SettingsPage from '@/pages/SettingsPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import TasksPage from '@/pages/TasksPage'
import BatchesPage from '@/pages/BatchesPage'
import { ClinicDeskOnlyRoute } from '@/features/clinic/ClinicDeskOnlyRoute'
import { ClinicAuthGate } from '@/features/clinic/ClinicAuthGate'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ClinicAuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="patients/:patientId" element={<PatientDetailPage />} />
          <Route element={<ClinicDeskOnlyRoute />}>
            <Route path="tasks" element={<TasksPage />} />
            <Route path="batches" element={<BatchesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="calls/:callId" element={<CallDetailPage />} />
          <Route path="escalations" element={<EscalationsPage />} />
          <Route path="escalations/:escalationId" element={<EscalationDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </ClinicAuthGate>
    </BrowserRouter>
  )
}
