import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

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

const ANALYSIS_STAGES = [
  'Compressing image…',
  'Analyzing image…',
  'Calculating macros…',
  'Generating coach insight…',
]

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
    if (!file || loading) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const compressed = await compressImage(file)
      const data = await api.analyzeMeal(userId, compressed)
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
          disabled={loading}
          className="w-full text-sm text-slate-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-forest-800 file:text-slate-200 file:text-sm disabled:opacity-50"
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

      {loading && <AnalyzingModal />}

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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Coach's take
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-200">
              <li className="flex gap-2">
                <span>🎯</span>
                <span>
                  <span className="font-semibold">Macro Summary:</span> {result.macro_summary}
                </span>
              </li>
              <li className="flex gap-2">
                <span>💡</span>
                <span>
                  <span className="font-semibold">Quick Tip:</span> {result.quick_tip}
                </span>
              </li>
              <li className="flex gap-2">
                <span>⏳</span>
                <span>
                  <span className="font-semibold">Timing:</span> {result.timing_note}
                </span>
              </li>
            </ul>
          </div>

          <p className="text-xs text-slate-500">
            Ask the chat "how's my nutrition been?" any time for a rundown across your recent meals.
          </p>
        </div>
      )}
    </div>
  )
}
