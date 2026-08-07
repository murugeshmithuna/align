import CheckinForm from './CheckinForm.jsx'

export default function CheckinModal({ userId, onSubmitted, onDismiss }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="card w-full max-w-md p-8 bg-forest-900">
        <h2 className="font-heading font-bold text-xl mb-1 text-center">Daily check-in</h2>
        <p className="text-sm text-slate-400 mb-6 text-center">
          Your readiness score adjusts today's training volume and intensity automatically.
        </p>
        <CheckinForm userId={userId} onSubmitted={onSubmitted} />
        <button
          onClick={onDismiss}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-300 mt-4"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
