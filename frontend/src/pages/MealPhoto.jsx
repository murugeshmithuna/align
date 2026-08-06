import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

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
// user confirms it here. "Update Macros" recomputes the totals from whatever
// the ingredient rows currently say, rather than the totals updating live on
// every keystroke - a deliberate choice so partially-edited numbers (e.g.
// typing "150" one digit at a time) don't flash through intermediate totals.
function ReviewModal({ preview, onCancel, onSaved, userId }) {
  const { showToast } = useToast()
  const [description, setDescription] = useState(preview.description)
  const [ingredients, setIngredients] = useState(preview.ingredients)
  const [totals, setTotals] = useState(sumIngredients(preview.ingredients))
  const [saving, setSaving] = useState(false)

  function updateIngredient(index, field, value) {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)))
  }

  function removeIngredient(index) {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { name: '', quantity: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }])
  }

  function handleUpdateMacros() {
    setTotals(sumIngredients(ingredients))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const finalTotals = sumIngredients(ingredients)
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
      onSaved(saved)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6 space-y-5 my-auto">
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
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-xs text-slate-500 px-1">
            <span>Ingredient</span>
            <span className="w-20">Qty</span>
            <span className="w-16">Cal</span>
            <span className="w-14">P</span>
            <span className="w-14">C</span>
            <span className="w-14">F</span>
          </div>
          {ingredients.map((ing, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-2 items-center">
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm min-w-0"
              />
              <input
                type="text"
                value={ing.quantity}
                onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                className="w-20 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
              />
              <input
                type="number"
                value={ing.calories}
                onChange={(e) => updateIngredient(i, 'calories', e.target.value)}
                className="w-16 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
              />
              <input
                type="number"
                value={ing.protein_g}
                onChange={(e) => updateIngredient(i, 'protein_g', e.target.value)}
                className="w-14 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
              />
              <input
                type="number"
                value={ing.carbs_g}
                onChange={(e) => updateIngredient(i, 'carbs_g', e.target.value)}
                className="w-14 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
              />
              <input
                type="number"
                value={ing.fat_g}
                onChange={(e) => updateIngredient(i, 'fat_g', e.target.value)}
                className="w-14 px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-xs"
              />
              <button
                onClick={() => removeIngredient(i)}
                aria-label="Remove ingredient"
                className="text-slate-500 hover:text-red-400 text-sm px-1"
              >
                ✕
              </button>
            </div>
          ))}
          <button onClick={addIngredient} className="text-xs text-coral-400 hover:text-coral-300 font-semibold">
            + Add ingredient
          </button>
        </div>

        <div className="flex items-center justify-between bg-forest-900/60 rounded-xl p-4">
          <div className="grid grid-cols-4 gap-4 flex-1 text-center">
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
          <button
            onClick={handleUpdateMacros}
            className="ml-4 px-3 py-2 rounded-lg border border-forest-600 hover:border-coral-400 transition-colors text-xs font-semibold whitespace-nowrap"
          >
            Update Macros
          </button>
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
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
          >
            {saving ? 'Saving…' : 'Save meal'}
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

  function loadHistory() {
    api
      .listMealAnalyses(userId)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }

  useEffect(loadHistory, [userId])

  function handleSaved() {
    setReviewData(null)
    loadHistory()
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
