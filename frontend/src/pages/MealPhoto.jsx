import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useSavedFlash } from '../utils/useSavedFlash.js'

ChartJS.register(ArcElement, Tooltip)

// Same P/C/F colors already used elsewhere on this page (the emerald/sky/
// amber badges below) and in Dashboard.jsx/MacroBar.jsx - reused exactly,
// not a new triad for the same three quantities.
const PROTEIN_COLOR = '#10b981'
const CARBS_COLOR = '#0ea5e9'
const FAT_COLOR = '#f59e0b'

const macroDonutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#17171b',
      borderColor: 'rgba(198, 255, 61, 0.35)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#e2e8f0',
      padding: 8,
      callbacks: { label: (ctx) => `${ctx.label}: ${Math.round(ctx.parsed)}g` },
    },
  },
}

const MAX_DIMENSION_PX = 800
const JPEG_QUALITY = 0.7

// Resizes to fit within MAX_DIMENSION_PX (never upscales) and re-encodes as
// JPEG before upload - a typical phone photo is several MB at 3000px+, which
// both slows the upload and feeds more image tokens into the vision call
// than a macro estimate needs.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not compress the image'))
            return
          }
          resolve(new File([blob], 'meal.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the selected image'))
    }
    img.src = url
  })
}

const ANALYSIS_STAGES = ['Compressing image…', 'Analyzing meal…', 'Calculating macros…', 'Generating coach insight…']

// The single API call is opaque (no real progress events), so this just
// steps through plausible-sounding stages on a timer - purely to give the
// user something better than a frozen button, not literal progress.
function AnalyzingModal() {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, ANALYSIS_STAGES.length - 1))
    }, 1100)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="card w-full max-w-sm p-8 text-center space-y-4">
        <div className="mx-auto w-10 h-10 border-4 border-forest-700 border-t-coral-500 rounded-full animate-spin" />
        <p className="font-heading font-semibold">{ANALYSIS_STAGES[stageIndex]}</p>
      </div>
    </div>
  )
}

function tabClass(active) {
  return `px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors ${
    active ? 'bg-coral-500' : 'bg-forest-900 text-slate-400 hover:text-slate-200'
  }`
}

function sumIngredients(ingredients) {
  return {
    estimated_calories: Math.round(ingredients.reduce((sum, i) => sum + (Number(i.calories) || 0), 0)),
    protein_g: Math.round(ingredients.reduce((sum, i) => sum + (Number(i.protein_g) || 0), 0) * 10) / 10,
    carbs_g: Math.round(ingredients.reduce((sum, i) => sum + (Number(i.carbs_g) || 0), 0) * 10) / 10,
    fat_g: Math.round(ingredients.reduce((sum, i) => sum + (Number(i.fat_g) || 0), 0) * 10) / 10,
  }
}

// The Review & Edit step - AI vision/text parsing sometimes misidentifies an
// ingredient or overestimates a portion, so nothing gets saved until the
// user confirms it here. Calories/P/C/F are read-only per row - editing the
// ingredient name or quantity triggers a fresh macro lookup for that row on
// blur, and the bottom total is a derived useMemo, so it's always in sync
// with the ingredient rows automatically (no separate "recalculate" step).
const ESTIMATE_DEBOUNCE_MS = 600

function ReviewModal({ preview, onCancel, onSaved, userId }) {
  const { showToast } = useToast()
  const [description, setDescription] = useState(preview.description)
  const [ingredients, setIngredients] = useState(preview.ingredients)
  const [estimatingIndex, setEstimatingIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, flashSaved] = useSavedFlash()
  const totals = useMemo(() => sumIngredients(ingredients), [ingredients])

  // Mirrors `ingredients` synchronously (unlike React state, which only
  // updates on the next render) - handleSave needs to read the truly latest
  // values right after awaiting any pending recalculation below, not
  // whatever `ingredients`/`totals` this render's closure captured.
  const ingredientsRef = useRef(ingredients)
  ingredientsRef.current = ingredients

  // Per-row debounce timers for auto-recalculation - see scheduleEstimate.
  const debounceTimersRef = useRef({})
  useEffect(() => {
    const timers = debounceTimersRef.current
    return () => Object.values(timers).forEach(clearTimeout)
  }, [])

  function updateIngredient(index, field, value) {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)))
    scheduleEstimate(index)
  }

  function removeIngredient(index) {
    clearTimeout(debounceTimersRef.current[index])
    delete debounceTimersRef.current[index]
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { name: '', quantity: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }])
  }

  // Guards against an out-of-order network response overwriting a newer
  // edit's result. Real race caught via live request/response tracing: a
  // fast edit-name-then-edit-quantity sequence (well within human/careless-
  // user typing speed) can fire TWO overlapping estimate-ingredient requests
  // for the same row - one from the name edit's debounce timer firing before
  // the quantity edit even lands, one from the immediate blur-triggered
  // call - and network/model latency gives no guarantee the more-recent
  // request's response arrives last. Without this guard, the older
  // (semantically stale) response landing after the newer one silently wins,
  // showing macros that don't match what's actually in the name/quantity
  // fields with no visible indication anything went wrong. Each call is
  // tagged with an incrementing per-row sequence number; a response only
  // gets applied if no newer request has been issued for that row since.
  const requestSeqRef = useRef({})

  // Re-estimates one row's macros so the (read-only) numbers and the total
  // stay accurate. Reads from ingredientsRef (not the `ingredients` state
  // variable) so a debounced call firing later always sees the latest edit,
  // not whatever was current when the timer was scheduled. On failure, the
  // row's last-known macros are left untouched (better than zeroing a row
  // the user didn't ask to blank out) and a toast surfaces the failure
  // rather than hiding it.
  async function estimateRow(index) {
    const ing = ingredientsRef.current[index]
    if (!ing || !ing.name?.trim() || !ing.quantity?.trim()) return
    const seq = (requestSeqRef.current[index] || 0) + 1
    requestSeqRef.current[index] = seq
    setEstimatingIndex(index)
    try {
      const est = await api.estimateIngredient({ name: ing.name.trim(), quantity: ing.quantity.trim() })
      // A newer request for this same row was issued while this one was in
      // flight - that one is the source of truth now, discard this result.
      if (requestSeqRef.current[index] !== seq) return
      const next = ingredientsRef.current.map((row, i) =>
        i === index
          ? { ...row, calories: est.calories, protein_g: est.protein_g, carbs_g: est.carbs_g, fat_g: est.fat_g }
          : row,
      )
      ingredientsRef.current = next
      setIngredients(next)
    } catch (err) {
      if (requestSeqRef.current[index] === seq) {
        showToast(`Couldn't recalculate "${ing.name}": ${err.message}`, 'error')
      }
    } finally {
      setEstimatingIndex((cur) => (cur === index ? null : cur))
    }
  }

  // Tracks the currently in-flight estimateRow() promise per row, however it
  // was triggered (debounce firing, blur, or a manual flush) - critical for
  // flushPendingEstimates below. A real bug caught via live network tracing:
  // a plain "clear this row's debounce timer, then fire-and-forget
  // estimateRow()" (what handleIngredientBlur and the debounce timeout both
  // do) leaves NOTHING in debounceTimersRef once it fires - so if the user's
  // click on "Save meal" triggers a genuine blur first (normal browsers, not
  // just Safari's quirky button-focus behavior), the blur handler kicks off
  // the recalculation AND clears the timer entry in the same synchronous
  // tick, then handleSave's flush immediately after finds no pending timer
  // left to wait for and saves the still-stale totals while that
  // just-started network call is still in flight. This ref is what lets
  // flushPendingEstimates await the real in-flight call instead of just
  // checking whether a timer is still ticking.
  const pendingEstimatesRef = useRef({})

  function triggerEstimate(index) {
    const promise = estimateRow(index).finally(() => {
      if (pendingEstimatesRef.current[index] === promise) delete pendingEstimatesRef.current[index]
    })
    pendingEstimatesRef.current[index] = promise
    return promise
  }

  // Debounced on every keystroke (not just on blur) - real bug found in
  // production: Safari doesn't move focus to a plain <button> on click, so a
  // user who edited an ingredient's name and clicked "Save meal" directly
  // (without tabbing away first) never fired a blur event at all, silently
  // saving the OLD macros for the new ingredient name. Debouncing on change
  // fires regardless of what the user clicks next, and handleSave below
  // flushes any still-pending/in-flight recalculation before reading totals
  // as a final safety net.
  function scheduleEstimate(index) {
    clearTimeout(debounceTimersRef.current[index])
    debounceTimersRef.current[index] = setTimeout(() => {
      delete debounceTimersRef.current[index]
      triggerEstimate(index)
    }, ESTIMATE_DEBOUNCE_MS)
  }

  // Immediate on blur (tabbing/clicking away still gets an instant
  // recalculation rather than waiting out the debounce), but only if a
  // recalculation isn't already scheduled/in flight for this row.
  function handleIngredientBlur(index) {
    if (debounceTimersRef.current[index] == null) return
    clearTimeout(debounceTimersRef.current[index])
    delete debounceTimersRef.current[index]
    triggerEstimate(index)
  }

  async function flushPendingEstimates() {
    const scheduledIndexes = Object.keys(debounceTimersRef.current).map(Number)
    for (const index of scheduledIndexes) {
      clearTimeout(debounceTimersRef.current[index])
      delete debounceTimersRef.current[index]
      triggerEstimate(index)
    }
    // Waits for every in-flight call, not just the ones just triggered above
    // - a blur that fired moments before this ran (see pendingEstimatesRef's
    // note) is still in here too.
    await Promise.all(Object.values(pendingEstimatesRef.current))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await flushPendingEstimates()
      const finalTotals = sumIngredients(ingredientsRef.current)
      const saved = await api.saveMeal({
        user_id: userId,
        description,
        estimated_calories: finalTotals.estimated_calories,
        protein_g: finalTotals.protein_g,
        carbs_g: finalTotals.carbs_g,
        fat_g: finalTotals.fat_g,
        macro_summary: preview.macro_summary,
        quick_tip: preview.quick_tip,
        timing_note: preview.timing_note,
      })
      showToast('Meal saved.')
      flashSaved()
      // Briefly show the "Saved ✓" state before the modal closes - otherwise
      // it'd be set and immediately unmounted in the same tick, never
      // actually visible to the user.
      await new Promise((resolve) => setTimeout(resolve, 500))
      onSaved(saved)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-2 sm:px-4 py-8 overflow-y-auto">
      <div className="card w-full max-w-2xl p-4 sm:p-6 space-y-5 my-auto">
        <div>
          <h2 className="font-heading font-bold text-lg">Review & edit</h2>
          <p className="text-xs text-slate-500 mt-1">
            Correct anything the AI got wrong before saving - ingredient, portion, or macros.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1" htmlFor="meal-description">
            Meal description
          </label>
          <input
            id="meal-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
        </div>

        <div className="space-y-2">
          {/* Desktop/tablet: one row per ingredient in a fixed-column grid.
              Below `sm`, that same grid (name input + qty input + 4 macro
              numbers + remove button, 6-7 columns of fixed width) doesn't
              fit a phone screen - it was overflowing the modal horizontally
              and getting clipped rather than wrapping. Below `sm`, each
              ingredient instead renders as a stacked card: name+remove on
              one line, qty on its own line, and the 4 macros as a wrapped
              row of small read-only badges. */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-xs text-slate-500 px-1">
            <span>Ingredient</span>
            <span className="w-20">Qty</span>
            <span className="w-16">Cal</span>
            <span className="w-14">P</span>
            <span className="w-14">C</span>
            <span className="w-14">F</span>
          </div>
          {ingredients.map((ing, i) => {
            const isEstimating = estimatingIndex === i
            return (
              <div key={i} className={`transition-opacity ${isEstimating ? 'opacity-60' : ''}`}>
                {/* Mobile card layout */}
                <div className="sm:hidden border border-forest-700 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                      onBlur={() => handleIngredientBlur(i)}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm"
                    />
                    <button
                      onClick={() => removeIngredient(i)}
                      aria-label="Remove ingredient"
                      className="shrink-0 text-slate-500 hover:text-red-400 text-sm px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                    onBlur={() => handleIngredientBlur(i)}
                    placeholder="Qty"
                    className="w-full px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
                  />
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 tabular-nums">
                    <span>Cal {isEstimating ? '…' : ing.calories}</span>
                    <span>P {isEstimating ? '…' : ing.protein_g}</span>
                    <span>C {isEstimating ? '…' : ing.carbs_g}</span>
                    <span>F {isEstimating ? '…' : ing.fat_g}</span>
                  </div>
                </div>

                {/* Desktop/tablet row layout */}
                <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-2 items-center">
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                    onBlur={() => handleIngredientBlur(i)}
                    className="px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm min-w-0"
                  />
                  <input
                    type="text"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                    onBlur={() => handleIngredientBlur(i)}
                    className="w-20 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
                  />
                  <span className="w-16 px-2 py-1.5 text-xs tabular-nums text-slate-300 text-right">
                    {isEstimating ? '…' : ing.calories}
                  </span>
                  <span className="w-14 px-2 py-1.5 text-xs tabular-nums text-slate-300 text-right">
                    {isEstimating ? '…' : ing.protein_g}
                  </span>
                  <span className="w-14 px-2 py-1.5 text-xs tabular-nums text-slate-300 text-right">
                    {isEstimating ? '…' : ing.carbs_g}
                  </span>
                  <span className="w-14 px-2 py-1.5 text-xs tabular-nums text-slate-300 text-right">
                    {isEstimating ? '…' : ing.fat_g}
                  </span>
                  <button
                    onClick={() => removeIngredient(i)}
                    aria-label="Remove ingredient"
                    className="text-slate-500 hover:text-red-400 text-sm px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
          <button onClick={addIngredient} className="text-xs text-coral-400 hover:text-coral-300 font-semibold">
            + Add ingredient
          </button>
          <p className="text-xs text-slate-500">
            Editing the ingredient or quantity automatically recalculates its macros - Cal/P/C/F are
            read-only.
          </p>
        </div>

        <div className="bg-forest-900/60 rounded-xl p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-heading font-bold text-coral-400 tabular-nums">
                {totals.estimated_calories}
              </div>
              <div className="text-xs text-slate-500">kcal</div>
            </div>
            <div>
              <div className="text-lg font-heading font-bold tabular-nums">{totals.protein_g}g</div>
              <div className="text-xs text-slate-500">protein</div>
            </div>
            <div>
              <div className="text-lg font-heading font-bold tabular-nums">{totals.carbs_g}g</div>
              <div className="text-xs text-slate-500">carbs</div>
            </div>
            <div>
              <div className="text-lg font-heading font-bold tabular-nums">{totals.fat_g}g</div>
              <div className="text-xs text-slate-500">fat</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-forest-700 hover:border-coral-400 transition-colors text-sm font-heading font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || justSaved}
            className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
          >
            {saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save meal'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PhotoTab({ onAnalyzed, userId }) {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleFileChange(event) {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file || loading) return
    setLoading(true)
    setError('')
    try {
      const compressed = await compressImage(file)
      const data = await api.analyzeMeal(userId, compressed)
      onAnalyzed(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={loading}
        className="w-full text-sm text-slate-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-forest-800 file:text-slate-200 file:text-sm disabled:opacity-50"
      />
      {previewUrl && <img src={previewUrl} alt="Meal preview" className="w-full max-h-72 object-cover rounded-xl" />}
      <button
        type="submit"
        disabled={!file || loading}
        className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
      >
        {loading ? 'Analyzing…' : 'Analyze photo'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <AnalyzingModal />}
    </form>
  )
}

function TextTab({ onAnalyzed, userId }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!text.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const data = await api.analyzeMealText({ user_id: userId, text: text.trim() })
      onAnalyzed(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <div>
        <label className="block text-sm mb-1" htmlFor="meal-text">
          Describe your meal
        </label>
        <textarea
          id="meal-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          placeholder="e.g. 2 grilled chicken breasts, 1 cup white rice, and a side of steamed broccoli"
          className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={!text.trim() || loading}
        className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
      >
        {loading ? 'Analyzing…' : 'Analyze description'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <AnalyzingModal />}
    </form>
  )
}

export default function MealPhoto() {
  const { userId } = useSession()
  const [tab, setTab] = useState('photo')
  const [reviewData, setReviewData] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [dailyReview, setDailyReview] = useState(null)
  const [dailyReviewLoading, setDailyReviewLoading] = useState(false)
  const [dailyReviewError, setDailyReviewError] = useState('')

  function loadHistory() {
    api
      .listMealAnalyses(userId)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }

  useEffect(loadHistory, [userId])

  // Real, already-fetched data (today's slice of `history`) - not a second
  // API call - powers a compact "Today's macros" donut next to the Daily
  // review card, same no-fabrication rule as everywhere else in this app.
  const todaysTotals = useMemo(() => {
    const todaysMeals = history.filter((m) => new Date(m.analyzed_at).toDateString() === new Date().toDateString())
    return {
      count: todaysMeals.length,
      calories: todaysMeals.reduce((sum, m) => sum + m.estimated_calories, 0),
      protein: todaysMeals.reduce((sum, m) => sum + m.protein_g, 0),
      carbs: todaysMeals.reduce((sum, m) => sum + m.carbs_g, 0),
      fat: todaysMeals.reduce((sum, m) => sum + m.fat_g, 0),
    }
  }, [history])

  function handleSaved() {
    setReviewData(null)
    loadHistory()
  }

  // Button-triggered rather than auto-fetched on load - a review only makes
  // sense once the day's meals are actually in, and re-running it on every
  // page visit would just re-synthesize the same (or stale) data.
  async function generateDailyReview() {
    setDailyReviewLoading(true)
    setDailyReviewError('')
    try {
      setDailyReview(await api.getDailyNutritionReview(userId))
    } catch (err) {
      setDailyReviewError(err.message)
    } finally {
      setDailyReviewLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Meal Tracking</h1>
        <p className="text-sm text-slate-400 mt-1">
          Snap a photo or describe your meal in words - either way, review the breakdown before it's saved.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('photo')} className={tabClass(tab === 'photo')}>
          Photo Upload
        </button>
        <button onClick={() => setTab('text')} className={tabClass(tab === 'text')}>
          Quick Log
        </button>
      </div>

      {tab === 'photo' ? (
        <PhotoTab onAnalyzed={setReviewData} userId={userId} />
      ) : (
        <TextTab onAnalyzed={setReviewData} userId={userId} />
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold">Today</h2>
          <button
            onClick={generateDailyReview}
            disabled={dailyReviewLoading}
            className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-xs font-semibold whitespace-nowrap"
          >
            {dailyReviewLoading ? 'Reviewing…' : dailyReview ? 'Regenerate' : 'Generate review'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Real, already-fetched totals - no AI call needed for this half. */}
          <div className="flex items-center gap-3 sm:pr-4 sm:border-r sm:border-forest-800 shrink-0">
            {todaysTotals.count > 0 ? (
              <>
                <div className="w-14 h-14 shrink-0">
                  <Doughnut
                    data={{
                      labels: ['Protein', 'Carbs', 'Fat'],
                      datasets: [
                        {
                          data: [todaysTotals.protein, todaysTotals.carbs, todaysTotals.fat],
                          backgroundColor: [PROTEIN_COLOR, CARBS_COLOR, FAT_COLOR],
                          borderColor: '#0c0c0f',
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={macroDonutOptions}
                  />
                </div>
                <div>
                  <p className="font-heading font-bold text-xl leading-none">
                    {Math.round(todaysTotals.calories).toLocaleString()}
                    <span className="text-xs text-slate-400 font-normal ml-1">kcal today</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: PROTEIN_COLOR }} />P{' '}
                      {Math.round(todaysTotals.protein)}g
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CARBS_COLOR }} />C{' '}
                      {Math.round(todaysTotals.carbs)}g
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: FAT_COLOR }} />F{' '}
                      {Math.round(todaysTotals.fat)}g
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 sm:max-w-[9rem]">No meals logged today yet.</p>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {dailyReviewError && <p className="text-sm text-red-400">{dailyReviewError}</p>}
            {dailyReviewLoading ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-forest-700 border-t-coral-500 rounded-full animate-spin" />
                Reviewing today's meals…
              </p>
            ) : dailyReview ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">📊 Macros</p>
                  <p className="text-sm font-semibold text-slate-100">{dailyReview.macro_status}</p>
                </div>
                <div className="rounded-lg border border-forest-700 bg-forest-950/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">💡 Pattern</p>
                  <p className="text-sm font-semibold text-slate-100">{dailyReview.key_pattern}</p>
                </div>
                <div className="rounded-lg border border-coral-500/40 bg-coral-500/10 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-coral-400 mb-1">🎯 Tomorrow</p>
                  <p className="text-sm font-semibold text-slate-100">{dailyReview.recommendation}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Short AI notes on today's macros.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-heading font-semibold mb-3">Recent meals</h2>
        {historyLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing logged yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((meal) => (
              <div key={meal.id} className="border-b border-forest-800 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{meal.description}</p>
                  <span className="text-xs text-slate-500 whitespace-nowrap ml-2">
                    {new Date(meal.analyzed_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-slate-400 tabular-nums">{meal.estimated_calories} kcal</span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                    P {Math.round(meal.protein_g)}g
                  </span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
                    C {Math.round(meal.carbs_g)}g
                  </span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                    F {Math.round(meal.fat_g)}g
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">
          Ask the chat "how's my nutrition been?" any time for a rundown across your recent meals.
        </p>
      </div>

      {reviewData && (
        <ReviewModal
          preview={reviewData}
          userId={userId}
          onCancel={() => setReviewData(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
