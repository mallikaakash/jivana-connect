import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { resolveClinicAccessKey, setClinicAccessToken } from '@/api/auth'

export function useOpenWorkspace() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openWorkspace() {
    setLoading(true)
    setError(null)
    try {
      const meta = await api.getMeta()
      if (meta.auth_required) {
        const key = resolveClinicAccessKey(meta)
        if (!key) {
          setError('Clinic access is not configured for this site. Ask your admin to enable the demo access key.')
          return
        }
        setClinicAccessToken(key)
        await api.getDashboardSummary()
      }
      navigate('/today')
    } catch {
      setClinicAccessToken(null)
      setError('Could not reach the clinic server. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, openWorkspace, clearError: () => setError(null) }
}
