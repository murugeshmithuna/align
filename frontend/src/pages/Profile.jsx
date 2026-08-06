import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { ACTIVITY_LABELS, GOAL_LABELS, calculateBaselineGoals } from '../utils/nutritionGoals.js'

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

// +/- stepper wrapping a plain number input - lets the user nudge an
// auto-calculated goal up/down without retyping the whole number.
function Stepper({ id, value, onChange, step, min = 0 }) {
  const num = value === '' ? 0 : Number(value)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(min, num - step)))}
        aria-label="Decrease"
        className="w-6 h-7 rounded-lg bg-forest-800 hover:bg-forest-700 text-sm leading-none shrink-0"
      >
        −
      </button>
      <input
        id={id}
        type="number"
        min={min}
        // "any" - the auto-calculated value (e.g. protein=176) won't
        // generally be a multiple of `step` (the +/- button increment), and
        // a native step-mismatch fails HTML5 constraint validation, which
        // silently blocks the whole form's submit event with no console
        // error and no network request. Real bug caught live: "Save Goals"
        // did nothing at all until this was set.
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm text-center min-w-0"
      />
      <button
        type="button"
        onClick={() => onChange(String(num + step))}
        aria-label="Increase"
        className="w-6 h-7 rounded-lg bg-forest-800 hover:bg-forest-700 text-sm leading-none shrink-0"
      >
        +
      </button>
    </div>
  )
}

// height_cm/weight_kg are always stored in metric - these just convert for
// display when the user's preference is imperial.
const CM_PER_IN = 2.54
const KG_PER_LB = 0.45359237

function metricToDisplay(value, units, factor) {
  if (value == null || value === '') return ''
  return units === 'imperial' ? Number((value / factor).toFixed(1)) : value
}

function displayToMetric(value, units, factor) {
  if (value === '' || value == null) return null
  return units === 'imperial' ? Number(value) * factor : Number(value)
}

export default function Profile() {
  const { userId } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [experienceLevel, setExperienceLevel] = useState('beginner')
  const [targetFrequency, setTargetFrequency] = useState(3)
  const [equipment, setEquipment] = useState([])
  const [goals, setGoals] = useState([])
  const [limitations, setLimitations] = useState('')
  const [heightDisplay, setHeightDisplay] = useState('')
  const [weightDisplay, setWeightDisplay] = useState('')
  const [preferredUnits, setPreferredUnits] = useState('metric')
  const [calorieTarget, setCalorieTarget] = useState('')
  const [proteinTarget, setProteinTarget] = useState('')
  const [carbsTarget, setCarbsTarget] = useState('')
  const [fatTarget, setFatTarget] = useState('')
  const [fiberTarget, setFiberTarget] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('male')
  const [activityLevel, setActivityLevel] = useState('sedentary')
  const [nutritionGoal, setNutritionGoal] = useState('maintenance')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)

  useEffect(() => {
    api
      .getProfile(userId)
      .then((data) => {
        const units = data.preferred_units || 'metric'
        setExperienceLevel(data.experience_level || 'beginner')
        setTargetFrequency(data.target_frequency || 3)
        setEquipment(data.available_equipment || [])
        setGoals(data.primary_goals || [])
        setLimitations(data.physical_limitations || '')
        setPreferredUnits(units)
        setHeightDisplay(metricToDisplay(data.height_cm, units, CM_PER_IN))
        setWeightDisplay(metricToDisplay(data.weight_kg, units, KG_PER_LB))
        setCalorieTarget(data.daily_calorie_target ?? '')
        setProteinTarget(data.daily_protein_target ?? '')
        setCarbsTarget(data.daily_carbs_target ?? '')
        setFatTarget(data.daily_fat_target ?? '')
        setFiberTarget(data.daily_fiber_target ?? '')
        setAge(data.age ?? '')
        setSex(data.sex || 'male')
        setActivityLevel(data.activity_level || 'sedentary')
        setHasSaved(Boolean(data.experience_level))
      })
      .catch(() => {
        /* no profile saved yet - defaults above are fine */
      })
      .finally(() => setLoading(false))
  }, [userId])

  // Switching the unit toggle converts the currently-typed value in place,
  // rather than clearing it or silently reinterpreting the same number under
  // a different unit.
  function handleUnitsChange(nextUnits) {
    const heightCm = displayToMetric(heightDisplay, preferredUnits, CM_PER_IN)
    const weightKg = displayToMetric(weightDisplay, preferredUnits, KG_PER_LB)
    setHeightDisplay(metricToDisplay(heightCm, nextUnits, CM_PER_IN))
    setWeightDisplay(metricToDisplay(weightKg, nextUnits, KG_PER_LB))
    setPreferredUnits(nextUnits)
  }

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
        height_cm: displayToMetric(heightDisplay, preferredUnits, CM_PER_IN),
        weight_kg: displayToMetric(weightDisplay, preferredUnits, KG_PER_LB),
        preferred_units: preferredUnits,
        daily_calorie_target: calorieTarget === '' ? null : Number(calorieTarget),
        daily_protein_target: proteinTarget === '' ? null : Number(proteinTarget),
        daily_carbs_target: carbsTarget === '' ? null : Number(carbsTarget),
        daily_fat_target: fatTarget === '' ? null : Number(fatTarget),
      })
      showToast(isFirstSave ? 'Profile saved - your baseline plan is ready!' : 'Profile saved.')
      setHasSaved(true)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Computes calorie/protein/carbs/fat/fiber goals from height/weight/age/
  // sex/activity/goal and drops them straight into the editable target
  // state below - nothing is saved until "Save Goals" is clicked.
  function handleAutoCalculate() {
    const heightCm = displayToMetric(heightDisplay, preferredUnits, CM_PER_IN)
    const weightKg = displayToMetric(weightDisplay, preferredUnits, KG_PER_LB)
    if (!heightCm || !weightKg || !age) {
      showToast('Enter your height, weight, and age above first.', 'error')
      return
    }
    const result = calculateBaselineGoals({
      heightCm,
      weightKg,
      age: Number(age),
      sex,
      activityLevel,
      goal: nutritionGoal,
    })
    setCalorieTarget(String(result.calories))
    setProteinTarget(String(result.protein))
    setCarbsTarget(String(result.carbs))
    setFatTarget(String(result.fat))
    setFiberTarget(String(result.fiber))
    showToast('Baseline goals calculated - adjust as needed, then Save Goals.')
  }

  async function handleSaveGoals(event) {
    event.preventDefault()
    setSavingGoals(true)
    try {
      await api.saveProfile({
        user_id: userId,
        age: age === '' ? null : Number(age),
        sex,
        activity_level: activityLevel,
        daily_calorie_target: calorieTarget === '' ? null : Number(calorieTarget),
        daily_protein_target: proteinTarget === '' ? null : Number(proteinTarget),
        daily_carbs_target: carbsTarget === '' ? null : Number(carbsTarget),
        daily_fat_target: fatTarget === '' ? null : Number(fatTarget),
        daily_fiber_target: fiberTarget === '' ? null : Number(fiberTarget),
      })
      showToast('Nutrition goals saved.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingGoals(false)
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
          <span className="block text-sm mb-1">Units</span>
          <div className="flex gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="units"
                checked={preferredUnits === 'metric'}
                onChange={() => handleUnitsChange('metric')}
              />
              Metric (cm / kg)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="units"
                checked={preferredUnits === 'imperial'}
                onChange={() => handleUnitsChange('imperial')}
              />
              Imperial (in / lb)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1" htmlFor="height">
              Height ({preferredUnits === 'metric' ? 'cm' : 'in'})
            </label>
            <input
              id="height"
              type="number"
              min="0"
              step="0.1"
              value={heightDisplay}
              onChange={(e) => setHeightDisplay(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1" htmlFor="weight">
              Weight ({preferredUnits === 'metric' ? 'kg' : 'lb'})
            </label>
            <input
              id="weight"
              type="number"
              min="0"
              step="0.1"
              value={weightDisplay}
              onChange={(e) => setWeightDisplay(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
            />
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

      <form onSubmit={handleSaveGoals} className="card p-6 space-y-5 mt-6">
        <div>
          <h2 className="font-heading font-bold text-lg">Nutrition goals</h2>
          <p className="text-sm text-slate-400 mt-1">
            Auto-calculate a baseline from your stats, then adjust anything before saving.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="age">
              Age
            </label>
            <input
              id="age"
              type="number"
              min="0"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="sex">
              Sex
            </label>
            <select
              id="sex"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="activity-level">
              Activity level
            </label>
            <select
              id="activity-level"
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
            >
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1" htmlFor="nutrition-goal">
              Primary goal
            </label>
            <select
              id="nutrition-goal"
              value={nutritionGoal}
              onChange={(e) => setNutritionGoal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
            >
              {Object.entries(GOAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAutoCalculate}
            className="px-4 py-2 rounded-lg border border-coral-500 text-coral-300 hover:bg-coral-500/10 transition-colors text-sm font-heading font-semibold whitespace-nowrap"
          >
            Auto-Calculate Baseline Goals
          </button>
        </div>

        <div>
          <span className="block text-sm mb-1">Daily targets (editable)</span>
          <p className="text-xs text-slate-500 mb-2">
            Power the macro progress bars on your dashboard - use +/- or type a value, or leave blank.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="calorie-target">
                🎯 Calories
              </label>
              <Stepper id="calorie-target" value={calorieTarget} onChange={setCalorieTarget} step={50} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="protein-target">
                🥩 Protein (g)
              </label>
              <Stepper id="protein-target" value={proteinTarget} onChange={setProteinTarget} step={5} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="carbs-target">
                🍞 Carbs (g)
              </label>
              <Stepper id="carbs-target" value={carbsTarget} onChange={setCarbsTarget} step={5} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="fat-target">
                🥑 Fat (g)
              </label>
              <Stepper id="fat-target" value={fatTarget} onChange={setFatTarget} step={5} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1" htmlFor="fiber-target">
                🌾 Fiber (g)
              </label>
              <Stepper id="fiber-target" value={fiberTarget} onChange={setFiberTarget} step={1} />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={savingGoals}
          className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
        >
          {savingGoals ? 'Saving…' : 'Save Goals'}
        </button>
      </form>
    </div>
  )
}
