import { useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

export default function MealPhoto() {
  const { userId } = useSession()
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  function handleFileChange(event) {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api.analyzeMeal(userId, file)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Meal Photo</h1>
        <p className="text-sm text-slate-400 mt-1">
          Snap a photo of your plate for a calorie/macro estimate and goal-aware feedback, straight from
          Claude Vision.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="w-full text-sm text-slate-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-forest-800 file:text-slate-200 file:text-sm"
        />
        {previewUrl && (
          <img src={previewUrl} alt="Meal preview" className="w-full max-h-72 object-cover rounded-xl" />
        )}
        <button
          type="submit"
          disabled={!file || loading}
          className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
        >
          {loading ? 'Analyzing…' : 'Analyze meal'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      {result && (
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="font-heading font-semibold">{result.description}</h2>
          </div>

          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="bg-forest-900/60 rounded-xl py-3">
              <div className="text-xl font-heading font-bold text-coral-400 tabular-nums">
                {result.estimated_calories}
              </div>
              <div className="text-xs text-slate-500 mt-1">calories</div>
            </div>
            <div className="bg-forest-900/60 rounded-xl py-3">
              <div className="text-xl font-heading font-bold tabular-nums">{result.protein_g}g</div>
              <div className="text-xs text-slate-500 mt-1">protein</div>
            </div>
            <div className="bg-forest-900/60 rounded-xl py-3">
              <div className="text-xl font-heading font-bold tabular-nums">{result.carbs_g}g</div>
              <div className="text-xs text-slate-500 mt-1">carbs</div>
            </div>
            <div className="bg-forest-900/60 rounded-xl py-3">
              <div className="text-xl font-heading font-bold tabular-nums">{result.fat_g}g</div>
              <div className="text-xs text-slate-500 mt-1">fat</div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Coach's take
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">{result.assessment}</p>
          </div>

          <p className="text-xs text-slate-500">
            Ask the chat "how's my nutrition been?" any time for a rundown across your recent meals.
          </p>
        </div>
      )}
    </div>
  )
}
