import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

// Replaces the earlier "Coach Debate" (Strength Coach vs. Recovery Coach
// chat bubbles, resolved by a Head Coach) with a single unified executive
// decision - no personas, no adversarial framing, one authoritative card.
export default function CoachResolution() {
  const { userId } = useSession()
  const { showToast } = useToast()
  const location = useLocation()
  const [question, setQuestion] = useState(location.state?.dilemma || '')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  // Auto-submits exactly once when the AI Coach hands off a plan-change
  // request here (redirect_to_coach_resolution, orchestrator.py) - the user
  // already stated their dilemma once in chat, so re-typing/re-clicking
  // "Get the resolution" would defeat the point of a seamless handoff.
  // Guarded by a ref (not state) so React StrictMode's double-invoke of
  // effects in dev can't fire this request twice.
  const autoSubmittedRef = useRef(false)

  async function runResolution(questionText) {
    setLoading(true)
    setError('')
    setResult(null)
    setApplied(false)
    try {
      const data = await api.getCoachResolution({ user_id: userId, question: questionText || undefined })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const dilemma = location.state?.dilemma
    if (dilemma && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true
      runResolution(dilemma)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    runResolution(question.trim())
  }

  async function handleApply() {
    if (!result?.plan_id || !result.plan_adjustments.length) return
    setApplying(true)
    try {
      await api.applyCoachResolution({
        user_id: userId,
        plan_id: result.plan_id,
        updates: result.plan_adjustments,
      })
      showToast('Plan adjustment applied.')
      setApplied(true)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setApplying(false)
    }
  }

  const hasAdjustments = Boolean(result?.plan_id && result.plan_adjustments.length > 0)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Coach Resolution &amp; Strategy</h1>
        {/* Ask Coach (the floating drawer on every page) can already adjust
            your plan conversationally - this page isn't a second copy of
            that. It's the dedicated surface for a genuine training dilemma
            (conflicting signals: soreness vs. a heavy day, fatigue vs. a
            goal) that deserves one weighed-through verdict and a concrete
            plan change to match, not a back-and-forth chat. */}
        <p className="text-sm text-slate-400 mt-1">
          For real training dilemmas - conflicting signals like soreness vs. a heavy day - get one
          weighed-through verdict, with the exact sets/reps/weight change applied straight to your plan.
          For quick questions or day-to-day logging, use Ask Coach from any page instead.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6">
        <label className="block text-sm mb-2" htmlFor="resolution-question">
          Submit a training dilemma
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="resolution-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="I feel sore, but today is heavy squat day"
            className="flex-1 px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold whitespace-nowrap"
          >
            {loading ? 'Resolving…' : 'Get the resolution'}
          </button>
        </div>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </form>

      {result && (
        // Border Beam treatment on the page's focal point (the overall
        // resolution summary card): dark-glass .card + a travelling lime
        // gradient ring/bloom, see .border-beam-wrap in index.css. Purely
        // visual - none of the content/behavior below changed.
        <div className="card border-beam-wrap relative p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span>🧠</span>
              <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-slate-400">
                Factors Evaluated
              </h2>
            </div>
            <ul className="space-y-1 text-sm text-slate-300 list-disc list-inside">
              {result.factors_evaluated.map((factor, i) => (
                <li key={i}>{factor}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl p-5 bg-coral-500/10 border-2 border-coral-500">
            <div className="flex items-center gap-2 mb-2">
              <span>🎯</span>
              <h2 className="font-heading font-bold text-coral-300 uppercase tracking-wide text-sm">
                The Unified Resolution
              </h2>
            </div>
            <p className="text-base text-slate-100 leading-relaxed font-medium">{result.resolution}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span>⚡</span>
              <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-slate-400">
                Action Item
              </h2>
            </div>
            {hasAdjustments ? (
              <button
                onClick={handleApply}
                disabled={applying || applied}
                className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
              >
                {applied ? 'Applied ✓' : applying ? 'Applying…' : 'Apply This Plan Adjustment'}
              </button>
            ) : (
              <p className="text-sm text-slate-500">
                No plan edit needed here - the verdict above is the action, follow it as-is.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
