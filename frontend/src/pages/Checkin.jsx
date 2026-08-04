import { useNavigate } from 'react-router-dom'
import CheckinForm from '../components/CheckinForm.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

export default function Checkin() {
  const { userId } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  function handleSubmitted(result) {
    showToast(`Check-in saved: ${result.label}`)
    navigate('/dashboard')
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16 font-body">
      <div className="card p-8">
        <h1 className="font-heading font-bold text-2xl mb-1 text-center">Daily check-in</h1>
        <p className="text-sm text-slate-400 mb-6 text-center">
          Your readiness score adjusts today's training volume and intensity automatically.
        </p>
        <CheckinForm userId={userId} onSubmitted={handleSubmitted} />
      </div>
    </div>
  )
}
