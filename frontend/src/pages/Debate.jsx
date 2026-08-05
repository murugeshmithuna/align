import { useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

export default function Debate() {
  const { userId } = useSession()
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api.runDebate({ user_id: userId, question: question.trim() || undefined })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Coach Debate</h1>
        <p className="text-sm text-slate-400 mt-1">
          Your Strength Coach and Recovery Coach independently weigh in, then your Head Coach resolves
          it into one call.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6">
        <label className="block text-sm mb-2" htmlFor="debate-question">
          What do you want a second opinion on? (optional)
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="debate-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Should I push hard in training today, or back off?"
            className="flex-1 px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold whitespace-nowrap"
          >
            {loading ? 'Debating…' : 'Get a second opinion'}
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </form>

      {result && (
        <div className="space-y-4">
          <div className="card p-5 border-l-4 border-l-coral-500">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-full bg-coral-500/20 text-coral-400 flex items-center justify-center text-sm font-bold">
                S
              </span>
              <span className="font-heading font-semibold text-coral-400">Strength Coach</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{result.strength_position}</p>
          </div>

          <div className="card p-5 border-l-4 border-l-sky-400">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-full bg-sky-400/20 text-sky-300 flex items-center justify-center text-sm font-bold">
                R
              </span>
              <span className="font-heading font-semibold text-sky-300">Recovery Coach</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{result.recovery_position}</p>
          </div>

          <div className="rounded-xl p-5 bg-coral-500/10 border-2 border-coral-500">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-full bg-coral-500 text-forest-950 flex items-center justify-center text-sm font-bold">
                H
              </span>
              <span className="font-heading font-bold text-coral-300 uppercase tracking-wide text-sm">
                Head Coach's Call
              </span>
            </div>
            <p className="text-base text-slate-100 leading-relaxed font-medium">{result.resolution}</p>
          </div>
        </div>
      )}
    </div>
  )
}
