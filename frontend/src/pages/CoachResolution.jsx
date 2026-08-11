import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api.js'
import CoachAIVisual from '../components/CoachAIVisual.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { openAiCoach } from '../utils/coachEvents.js'

// Plain inline SVGs, matching this app's existing icon convention - replace
// the 🧠/🎯/⚡ emoji in the resolution card below with the same underlying
// section labels (Factors Evaluated / The Unified Resolution / Action Item
// text already says what each section is - these are a quiet visual anchor,
// not new information).
function FactorsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  )
}

function VerdictIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ActionIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  )
}

// ALIGN's signature AI visual panel - see CoachAIVisual.jsx and index.css's
// "Coach AI Visual" section. Deliberately minimal composition (label,
// artwork, one short caption) per its own spec: no buttons or badges inside
// the visual itself. "Ask Coach anything" sits outside the panel's visual
// boundary and opens the existing floating AIMessageBar drawer via a plain
// global event (utils/coachEvents.js) rather than a second chat surface.
function CoachAIPanel() {
  return (
    <div className="card p-5 flex flex-col items-center text-center h-full">
      <p className="w-full text-left text-xs uppercase tracking-wide text-slate-500 mb-3">Coach AI</p>
      <div className="w-full flex-1 min-h-[220px]">
        <CoachAIVisual />
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mt-3">
        Powered by advanced
        <br />
        performance intelligence.
      </p>
      <button
        type="button"
        onClick={openAiCoach}
        className="mt-4 w-full px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 text-sm font-heading font-semibold transition-colors"
      >
        Ask Coach anything
      </button>
    </div>
  )
}

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
  // Captured at submit time, separate from the live `question` input state -
  // so the result card's "what you asked" recap always reflects what was
  // actually sent for this result, even if the input field gets edited
  // afterward for a follow-up question before it's submitted.
  const [submittedQuestion, setSubmittedQuestion] = useState('')
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
    setSubmittedQuestion(questionText)
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
    <div className="max-w-7xl mx-auto px-6 py-10 font-body">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Training dilemmas</p>
            <h1 className="font-heading font-bold text-3xl mt-0.5">Coach Resolution &amp; Strategy</h1>
            {/* Ask Coach (the floating drawer on every page) can already adjust
                your plan conversationally - this page isn't a second copy of
                that. It's the dedicated surface for a genuine training dilemma
                (conflicting signals: soreness vs. a heavy day, fatigue vs. a
                goal) that deserves one weighed-through verdict and a concrete
                plan change to match, not a back-and-forth chat. */}
            <p className="text-sm text-slate-400 mt-1">
              For real training dilemmas - conflicting signals like soreness vs. a heavy day - get one
              weighed-through verdict, with the exact sets/reps/weight change applied straight to your
              plan. For quick questions or day-to-day logging, use Ask Coach from any page instead.
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
            // visual - none of the content/behavior below changed. Structured
            // around what happened -> what AI found -> what it means -> what
            // to do, per the four-question hierarchy this page should answer.
            <div className="card border-beam-wrap relative p-6 space-y-5">
              {submittedQuestion && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Your dilemma</p>
                  <p className="text-sm text-slate-300 italic">&ldquo;{submittedQuestion}&rdquo;</p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FactorsIcon className="w-4 h-4 text-slate-400" />
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
                  <VerdictIcon className="w-4 h-4 text-coral-300" />
                  <h2 className="font-heading font-bold text-coral-300 uppercase tracking-wide text-sm">
                    The Unified Resolution
                  </h2>
                </div>
                <p className="text-base text-slate-100 leading-relaxed font-medium">{result.resolution}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ActionIcon className="w-4 h-4 text-slate-400" />
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

        <div className="lg:col-span-4">
          <CoachAIPanel />
        </div>
      </div>
    </div>
  )
}
