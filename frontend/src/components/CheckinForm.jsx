import { useState } from 'react'
import { api } from '../api.js'
import { useSavedFlash } from '../utils/useSavedFlash.js'

const LABELS = {
  1: 'Sick / Exhausted',
  2: 'Sore',
  3: 'Normal',
  4: 'Good',
  5: 'Pumped Up',
}

export default function CheckinForm({ userId, onSubmitted }) {
  const [score, setScore] = useState(3)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, flashSubmitted] = useSavedFlash()

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await api.submitCheckin({ user_id: userId, score: Number(score) })
      flashSubmitted()
      // Briefly show "Submitted ✓" before the parent closes/navigates away
      // on submission - otherwise it'd never actually be visible.
      await new Promise((resolve) => setTimeout(resolve, 500))
      onSubmitted?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <p className="text-sm text-slate-400 mb-4">How are you feeling today?</p>
        <div className="text-center mb-3">
          <span className="font-heading font-bold text-2xl text-coral-400">{LABELS[score]}</span>
        </div>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-full accent-coral-500"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n === Number(score) ? 'text-coral-400 font-semibold' : ''}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || submitted}
        className="w-full px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
      >
        {submitting ? 'Saving…' : submitted ? 'Submitted ✓' : 'Submit check-in'}
      </button>
    </form>
  )
}
