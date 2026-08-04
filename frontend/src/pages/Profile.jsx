import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

const EQUIPMENT_OPTIONS = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'gym', label: 'Full gym' },
]

const GOAL_OPTIONS = [
  { value: 'build_strength', label: 'Build strength' },
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'endurance', label: 'Endurance' },
]

export default function Profile() {
  const { userId } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [experienceLevel, setExperienceLevel] = useState('beginner')
  const [targetFrequency, setTargetFrequency] = useState(3)
  const [equipment, setEquipment] = useState([])
  const [goals, setGoals] = useState([])
  const [limitations, setLimitations] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)

  useEffect(() => {
    api
      .getProfile(userId)
      .then((data) => {
        setExperienceLevel(data.experience_level || 'beginner')
        setTargetFrequency(data.target_frequency || 3)
        setEquipment(data.available_equipment || [])
        setGoals(data.primary_goals || [])
        setLimitations(data.physical_limitations || '')
        setHasSaved(Boolean(data.experience_level))
      })
      .catch(() => {
        /* no profile saved yet - defaults above are fine */
      })
      .finally(() => setLoading(false))
  }, [userId])

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  async function handleSave(event) {
    event.preventDefault()
    const isFirstSave = !hasSaved
    setSaving(true)
    if (isFirstSave) {
      showToast("Saving profile and generating your baseline plan - this can take up to 30 seconds…")
    }
    try {
      await api.saveProfile({
        user_id: userId,
        experience_level: experienceLevel,
        target_frequency: Number(targetFrequency),
        available_equipment: equipment,
        primary_goals: goals,
        physical_limitations: limitations || null,
      })
      showToast(isFirstSave ? 'Profile saved - your baseline plan is ready!' : 'Profile saved.')
      setHasSaved(true)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading your profile…</p>
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 font-body">
      <h1 className="font-heading font-bold text-2xl mb-1">Your training profile</h1>
      <p className="text-sm text-slate-400 mb-6">
        Set this once. The chat agent reads it automatically and won't ask you to repeat it.
      </p>

      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm mb-1" htmlFor="experience">
            Experience level
          </label>
          <select
            id="experience"
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1" htmlFor="frequency">
            Target frequency (days/week)
          </label>
          <input
            id="frequency"
            type="number"
            min="1"
            max="7"
            value={targetFrequency}
            onChange={(e) => setTargetFrequency(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
        </div>

        <div>
          <span className="block text-sm mb-1">Available equipment</span>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={equipment.includes(opt.value)}
                  onChange={() => toggle(equipment, setEquipment, opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-sm mb-1">Primary goals</span>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            {GOAL_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={goals.includes(opt.value)}
                  onChange={() => toggle(goals, setGoals, opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1" htmlFor="limitations">
            Physical limitations (optional)
          </label>
          <textarea
            id="limitations"
            rows={2}
            placeholder="e.g. bad left knee, avoid overhead pressing"
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
          >
            {saving ? (hasSaved ? 'Saving…' : 'Generating your plan…') : 'Save profile'}
          </button>
          {hasSaved && (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-lg border border-forest-600 hover:border-coral-400 transition-colors text-sm font-heading font-semibold"
            >
              Continue to dashboard →
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
