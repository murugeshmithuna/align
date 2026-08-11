import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { bmiBand, calculateBmi } from '../utils/bmi.js'
import { ACTIVITY_LABELS, GOAL_LABELS, calculateBaselineGoals } from '../utils/nutritionGoals.js'
import {
  KG_PER_LB,
  displayToMetric,
  heightDisplayToMetric,
  heightMetricToDisplay,
  metricToDisplay,
} from '../utils/units.js'
import { useSavedFlash } from '../utils/useSavedFlash.js'

// +/- stepper wrapping a plain number input - lets the user nudge an
// auto-calculated goal up/down without retyping the whole number.
function Stepper({ id, value, onChange, step, min = 0, max = Infinity }) {
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
        max={Number.isFinite(max) ? max : undefined}
        // "any" - the auto-calculated value (e.g. protein=176) won't
        // generally be a multiple of `step` (the +/- button increment), and
        // a native step-mismatch silently blocks the whole form's submit
        // event via HTML5 constraint validation with no console error.
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg bg-forest-950 border border-forest-700 text-sm text-center min-w-0"
      />
      <button
        type="button"
        onClick={() => onChange(String(Math.min(max, num + step)))}
        aria-label="Increase"
        className="w-6 h-7 rounded-lg bg-forest-800 hover:bg-forest-700 text-sm leading-none shrink-0"
      >
        +
      </button>
    </div>
  )
}

// A visual target card - plain uppercase-tracked label header (no emoji -
// an icon here would just be decorative filler for something a text label
// already identifies unambiguously), the computed value in large bold
// editorial type with a small muted unit alongside it, then a stepper row
// to adjust it. Distinct from a plain labeled input so the five targets
// read as "goals to hit" rather than a form field.
function MacroTargetCard({ id, label, value, onChange, step, unit, max }) {
  return (
    <div className="card p-4 flex flex-col gap-3">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-heading font-bold tabular-nums leading-none">
          {value === '' ? '—' : value}
        </span>
        <span className="text-xs text-slate-500 font-medium">{unit}</span>
      </div>
      <Stepper id={id} value={value} onChange={onChange} step={step} max={max} />
    </div>
  )
}

// BMI gradient bar - fixed proportional bands over a clamped 15-40 display
// range (Underweight <18.5, Normal <25, Overweight <30, Obese 30+), same
// thresholds bmiBand() classifies by, so the marker position and the label
// can never disagree.
const BMI_MIN = 15
const BMI_MAX = 40
const BMI_GRADIENT =
  'linear-gradient(to right, #38bdf8 0%, #38bdf8 14%, #10b981 14%, #10b981 40%, #f59e0b 40%, #f59e0b 60%, #ef4444 60%, #ef4444 100%)'

function BmiCard({ bmi }) {
  const band = bmi ? bmiBand(bmi) : null
  const pct = bmi ? ((Math.min(BMI_MAX, Math.max(BMI_MIN, bmi)) - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100 : 0

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">BMI</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-heading font-bold tabular-nums">{bmi ? bmi.toFixed(1) : '—'}</span>
            {band && (
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: band.color }}>
                {band.label}
              </span>
            )}
          </div>
        </div>
        {!bmi && (
          <p className="text-xs text-slate-500 max-w-[16rem]">Enter your height and weight above to see your BMI.</p>
        )}
      </div>
      {bmi && (
        <div className="mt-3 relative h-1.5 rounded-full" style={{ backgroundImage: BMI_GRADIENT }}>
          <div
            className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-forest-950 shadow"
            style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>
      )}
    </div>
  )
}

// Dedicated, high-visibility home for the baseline macro calculator -
// previously buried at the bottom of Profile.jsx. Self-contained: it has its
// own height/weight/age/sex/activity inputs (rather than silently reading
// Profile.jsx's local state, which isn't reachable from a separate route) and
// saves back to the same underlying User fields, so editing either page's
// height/weight keeps the one stored value in sync.
export default function NutritionCalculator() {
  const { userId } = useSession()
  const { showToast } = useToast()

  const [heightDisplay, setHeightDisplay] = useState('')
  const [weightDisplay, setWeightDisplay] = useState('')
  const [preferredUnits, setPreferredUnits] = useState('metric')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('male')
  const [activityLevel, setActivityLevel] = useState('sedentary')
  const [nutritionGoal, setNutritionGoal] = useState('maintenance')
  const [calorieTarget, setCalorieTarget] = useState('')
  const [proteinTarget, setProteinTarget] = useState('')
  const [carbsTarget, setCarbsTarget] = useState('')
  const [fatTarget, setFatTarget] = useState('')
  const [fiberTarget, setFiberTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, flashSaved] = useSavedFlash()

  useEffect(() => {
    api
      .getProfile(userId)
      .then((data) => {
        const units = data.preferred_units || 'metric'
        setPreferredUnits(units)
        setHeightDisplay(heightMetricToDisplay(data.height_cm, units))
        setWeightDisplay(metricToDisplay(data.weight_kg, units, KG_PER_LB))
        setAge(data.age ?? '')
        setSex(data.sex || 'male')
        setActivityLevel(data.activity_level || 'sedentary')
        setCalorieTarget(data.daily_calorie_target ?? '')
        setProteinTarget(data.daily_protein_target ?? '')
        setCarbsTarget(data.daily_carbs_target ?? '')
        setFatTarget(data.daily_fat_target ?? '')
        setFiberTarget(data.daily_fiber_target ?? '')
      })
      .catch(() => {
        /* no profile saved yet - defaults above are fine */
      })
      .finally(() => setLoading(false))
  }, [userId])

  function handleUnitsChange(nextUnits) {
    const heightCm = heightDisplayToMetric(heightDisplay, preferredUnits)
    const weightKg = displayToMetric(weightDisplay, preferredUnits, KG_PER_LB)
    setHeightDisplay(heightMetricToDisplay(heightCm, nextUnits))
    setWeightDisplay(metricToDisplay(weightKg, nextUnits, KG_PER_LB))
    setPreferredUnits(nextUnits)
  }

  const bmi = useMemo(() => {
    const heightCm = heightDisplayToMetric(heightDisplay, preferredUnits)
    const weightKg = displayToMetric(weightDisplay, preferredUnits, KG_PER_LB)
    return calculateBmi(heightCm, weightKg)
  }, [heightDisplay, weightDisplay, preferredUnits])

  function handleAutoCalculate() {
    const heightCm = heightDisplayToMetric(heightDisplay, preferredUnits)
    const weightKg = displayToMetric(weightDisplay, preferredUnits, KG_PER_LB)
    if (!heightCm || !weightKg || !age) {
      showToast('Enter your height, weight, and age first.', 'error')
      return
    }
    // Plain number inputs don't block a typed negative/absurd value the way
    // native form-submit validation would (this button is type="button", so
    // the browser's min/max/step constraints never apply to it) - a
    // careless -100 kg or 99999 cm entry silently produced a negative
    // protein target and a six-figure calorie goal instead of an error.
    // Same bounds the backend's own Pydantic schema already enforces on
    // save, just surfaced here before the pointless calculation runs.
    if (heightCm <= 0 || heightCm < 50 || heightCm > 272) {
      showToast('Enter a realistic height (50-272 cm / ~1\'8"-8\'11").', 'error')
      return
    }
    if (weightKg <= 0 || weightKg < 20 || weightKg > 450) {
      showToast('Enter a realistic weight (20-450 kg / ~44-992 lb).', 'error')
      return
    }
    if (Number(age) <= 0 || Number(age) < 10 || Number(age) > 120) {
      showToast('Enter a realistic age (10-120).', 'error')
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
    setSaving(true)
    try {
      await api.saveProfile({
        user_id: userId,
        height_cm: heightDisplayToMetric(heightDisplay, preferredUnits),
        weight_kg: displayToMetric(weightDisplay, preferredUnits, KG_PER_LB),
        preferred_units: preferredUnits,
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
      flashSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading…</p>
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 font-body space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Baseline goals</p>
        <h1 className="font-heading font-bold text-2xl mt-0.5">Nutritional &amp; Macro Calculator</h1>
        <p className="text-sm text-slate-400 mt-1">
          Auto-calculate a baseline from your stats (Mifflin-St Jeor), then adjust anything before saving.
        </p>
      </div>

      {/* noValidate: the same silent-submit-block bug already found and
          fixed for the Stepper's step mismatch (see units.js's stepper -
          step="any" comment) also applies here via the height/weight/age
          inputs' min/max attributes. Confirmed live: typing a height like
          9999 (outside the visual 50-272 hint) and clicking "Save Goals"
          fired ZERO network requests and showed no error at all - HTML5
          range-constraint validation blocked the submit event entirely
          before handleSaveGoals ever ran. The min/max attributes still work
          as visual hints and still clamp the native up/down spinner arrows -
          disabling constraint validation just stops them from silently
          swallowing a real submit. The backend's own Pydantic Field(ge=/
          le=) bounds remain the actual source of truth and already surface
          a clear, specific toast via formatErrorDetail() on rejection. */}
      <form onSubmit={handleSaveGoals} className="card p-5 space-y-4" noValidate>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="height">
              Height ({preferredUnits === 'metric' ? 'cm' : "ft'in"})
            </label>
            {preferredUnits === 'imperial' ? (
              <input
                id="height"
                type="text"
                inputMode="numeric"
                placeholder={`5'4"`}
                value={heightDisplay}
                onChange={(e) => setHeightDisplay(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
              />
            ) : (
              <input
                id="height"
                type="number"
                min="50"
                max="272"
                step="0.1"
                value={heightDisplay}
                onChange={(e) => setHeightDisplay(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="weight">
              Weight ({preferredUnits === 'metric' ? 'kg' : 'lb'})
            </label>
            <input
              id="weight"
              type="number"
              min={preferredUnits === 'metric' ? 20 : 44}
              max={preferredUnits === 'metric' ? 450 : 992}
              step="0.1"
              value={weightDisplay}
              onChange={(e) => setWeightDisplay(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="age">
              Age
            </label>
            <input
              id="age"
              type="number"
              min="10"
              max="120"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
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
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
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
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            >
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1" htmlFor="nutrition-goal">
              Primary goal
            </label>
            <select
              id="nutrition-goal"
              value={nutritionGoal}
              onChange={(e) => setNutritionGoal(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-forest-950 border border-forest-700 text-sm"
            >
              {Object.entries(GOAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <BmiCard bmi={bmi} />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="units"
                checked={preferredUnits === 'metric'}
                onChange={() => handleUnitsChange('metric')}
              />
              Metric
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="units"
                checked={preferredUnits === 'imperial'}
                onChange={() => handleUnitsChange('imperial')}
              />
              Imperial
            </label>
          </div>
          <button
            type="button"
            onClick={handleAutoCalculate}
            className="px-4 py-2 rounded-full border border-coral-500/60 text-coral-300 hover:bg-coral-500/10 transition-colors text-sm font-heading font-semibold whitespace-nowrap"
          >
            Auto-Calculate Baseline Goals
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MacroTargetCard
            id="calorie-target"
            label="Calories"
            value={calorieTarget}
            onChange={setCalorieTarget}
            step={50}
            max={10000}
            unit="kcal"
          />
          <MacroTargetCard
            id="protein-target"
            label="Protein"
            value={proteinTarget}
            onChange={setProteinTarget}
            step={5}
            max={500}
            unit="g"
          />
          <MacroTargetCard
            id="carbs-target"
            label="Carbs"
            value={carbsTarget}
            onChange={setCarbsTarget}
            step={5}
            max={1000}
            unit="g"
          />
          <MacroTargetCard
            id="fat-target"
            label="Fat"
            value={fatTarget}
            onChange={setFatTarget}
            step={5}
            max={500}
            unit="g"
          />
          <MacroTargetCard
            id="fiber-target"
            label="Fiber"
            value={fiberTarget}
            onChange={setFiberTarget}
            step={1}
            max={200}
            unit="g"
          />
        </div>

        <button
          type="submit"
          disabled={saving || saved}
          className="px-6 py-2.5 rounded-full bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold transition-colors"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Goals'}
        </button>
      </form>
    </div>
  )
}
