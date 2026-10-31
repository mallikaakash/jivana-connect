import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <div>
      <EmptyState title="Page not found" description="That page does not exist in this prototype." />
      <div className="text-center">
        <Link to="/today" className="text-sm font-medium text-teal-700 hover:underline">
          Back to overview
        </Link>
      </div>
    </div>
  )
}
