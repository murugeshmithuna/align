import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import WheelPicker from '../components/WheelPicker.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  KG_PER_LB,
  displayToMetric,
  heightDisplayToMetric,
  heightMetricToDisplay,
  metricToDisplay,
} from '../utils/units.js'
import { useSavedFlash } from '../utils/useSavedFlash.js'

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

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7]

const CM_RANGE = Array.from({ length: 111 }, (_, i) => 120 + i) // 120-230 cm
const FEET_RANGE = [3, 4, 5, 6, 7, 8]
const INCH_RANGE = Array.from({ length: 12 }, (_, i) => i) // 0-11
const KG_RANGE = Array.from({ length: 221 }, (_, i) => 30 + i) // 30-250 kg
const LB_RANGE = Array.from({ length: 485 }, (_, i) => 66 + i) // 66-550 lb

const STEPS = ['experience', 'frequency', 'equipment', 'goals', 'height', 'weight', 'limitations', 'review']

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-8" />
    </svg>
  )
}

function PillChoice({ options, value, onChange }) {
  return (
    <div className="space-y-2.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`w-full px-4 py-3 rounded-xl border text-sm font-heading font-semibold transition-colors ${
            value === opt.value
              ? 'bg-coral-500 border-coral-500'
              : 'bg-forest-900 border-forest-700 text-slate-300 hover:border-coral-500/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function PillMultiSelect({ options, values, onToggle }) {
  return (
    <div className="space-y-2.5">
      {options.map((opt) => {
        const checked = values.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
              checked ? 'bg-coral-500/10 border-coral-500 text-coral-400' : 'bg-forest-900 border-forest-700 text-slate-300 hover:border-coral-500/60'
            }`}
          >
            <span>{opt.label}</span>
            <span
              className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${
                checked ? 'bg-coral-500 border-coral-500' : 'border-forest-600 text-transparent'
              }`}
            >
              <CheckIcon />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StepDots({ count, current, onJump }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to step ${i + 1}`}
          onClick={() => onJump(i)}
          className={`h-1.5 rounded-full transition-all ${i === current ? 'w-6 bg-coral-500' : 'w-1.5 bg-forest-600 hover:bg-forest-500'}`}
        />
      ))}
    </div>
  )
}

function StepHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-6 text-center">
      <p className="text-xs uppercase tracking-wide text-coral-400/80 font-heading font-semibold mb-1">{eyebrow}</p>
      <h1 className="font-heading font-bold text-xl">{title}</h1>
      {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

function parseFeetInches(display) {
  const match = /^(\d+)'(\d+)"?$/.exec(String(display || '').trim())
  if (!match) return { feet: 5, inches: 8 }
  return { feet: Number(match[1]), inches: Number(match[2]) }
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-forest-700/60 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 text-right font-medium">{value}</span>
    </div>
  )
}

const STEP_META = {
  experience: { eyebrow: 'Step 1 of 8', title: "What's your experience level?", subtitle: 'This shapes how your plan progresses.' },
  frequency: { eyebrow: 'Step 2 of 8', title: 'How many days a week?', subtitle: 'How often you want to train.' },
  equipment: { eyebrow: 'Step 3 of 8', title: 'What equipment do you have?', subtitle: 'Select everything available to you.' },
  goals: { eyebrow: 'Step 4 of 8', title: "What's your goal?", subtitle: 'Pick as many as apply.' },
  height: { eyebrow: 'Step 5 of 8', title: 'What is your height?', subtitle: null },
  weight: { eyebrow: 'Step 6 of 8', title: 'What is your weight?', subtitle: null },
  limitations: { eyebrow: 'Step 7 of 8', title: 'Any physical limitations?', subtitle: 'Optional - injuries, mobility limits, anything to work around.' },
  review: { eyebrow: 'Step 8 of 8', title: 'Review your profile', subtitle: 'The chat agent reads this automatically and builds your plan from it.' },
}

export default function Profile() {
  const { userId } = useSession()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [experienceLevel, setExperienceLevel] = useState('beginner')
  const [targetFrequency, setTargetFrequency] = useState(3)
  const [equipment, setEquipment] = useState([])
  const [goals, setGoals] = useState([])
  const [limitations, setLimitations] = useState('')
  const [heightDisplay, setHeightDisplay] = useState('173')
  const [weightDisplay, setWeightDisplay] = useState(70)
  const [preferredUnits, setPreferredUnits] = useState('metric')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, flashSaved] = useSavedFlash()
  const [hasSaved, setHasSaved] = useState(false)

  useEffect(() => {
    setLoadError(false)
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
        setHeightDisplay(heightMetricToDisplay(data.height_cm, units) || (units === 'imperial' ? `5'8"` : '173'))
        setWeightDisplay(Math.round(metricToDisplay(data.weight_kg, units, KG_PER_LB)) || (units === 'imperial' ? 154 : 70))
        setHasSaved(Boolean(data.experience_level))
      })
      .catch((err) => {
        // A genuine 404 here means the user row itself doesn't exist, which
        // is effectively impossible once an account has been created - the
        // row (with null fields) is always there, so GET returns 200 even
        // for a brand-new profile. Every OTHER failure (network error,
        // timeout, a cold-starting backend - Render's free tier spins down
        // and the first request after idle can take 30s+, see CLAUDE.md) was
        // previously swallowed by this same silent catch, which left a user
        // who HAD already saved a real profile staring at the wizard reset
        // to hardcoded defaults with no indication anything went wrong -
        // indistinguishable from "my data didn't save." Surface it instead.
        if (err?.status !== 404) {
          setLoadError(true)
          showToast("Couldn't load your saved profile - check your connection and try again.", 'error')
        }
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Switching the unit toggle converts the currently-picked value in place,
  // rather than clearing it or silently reinterpreting the same number under
  // a different unit.
  function handleUnitsChange(nextUnits) {
    const heightCm = heightDisplayToMetric(heightDisplay, preferredUnits)
    const weightKg = displayToMetric(weightDisplay, preferredUnits, KG_PER_LB)
    setHeightDisplay(heightMetricToDisplay(heightCm, nextUnits))
    setWeightDisplay(Math.round(metricToDisplay(weightKg, nextUnits, KG_PER_LB)))
    setPreferredUnits(nextUnits)
  }

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  function goNext() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  async function handleSave() {
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
        height_cm: heightDisplayToMetric(heightDisplay, preferredUnits),
        weight_kg: displayToMetric(weightDisplay, preferredUnits, KG_PER_LB),
        preferred_units: preferredUnits,
      })
      showToast(isFirstSave ? 'Profile saved - your baseline plan is ready!' : 'Profile saved.')
      setHasSaved(true)
      flashSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading your profile…</p>
  }

  // Don't show the wizard at all when the load genuinely failed (as opposed
  // to a brand-new profile, which resolves normally with null fields) -
  // rendering it anyway would look identical to a real reset, and letting
  // the user click through and "Save profile" here would silently overwrite
  // their real saved answers with these hardcoded defaults.
  if (loadError) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center font-body">
        <p className="text-slate-300 text-sm mb-5">
          We couldn't load your saved profile. Your data is safe - this looks like a connection issue, not a
          reset - please try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl bg-coral-500 text-sm font-heading font-semibold"
        >
          Retry
        </button>
      </div>
    )
  }

  const { feet, inches } = parseFeetInches(heightDisplay)
  const heightCmValue = Math.min(230, Math.max(120, Math.round(Number(heightDisplay)) || 173))
  const weightBounds = preferredUnits === 'imperial' ? { min: 66, max: 550 } : { min: 30, max: 250 }
  const weightValue = Math.min(weightBounds.max, Math.max(weightBounds.min, Math.round(Number(weightDisplay)) || 70))

  const current = STEPS[step]
  const meta = STEP_META[current]

  return (
    <div className="max-w-md mx-auto px-6 py-10 font-body">
      <StepDots count={STEPS.length} current={step} onJump={setStep} />

      <div key={current} className="wizard-step card p-6">
        <StepHeader eyebrow={meta.eyebrow} title={meta.title} subtitle={meta.subtitle} />

        {current === 'experience' && (
          <PillChoice options={EXPERIENCE_OPTIONS} value={experienceLevel} onChange={setExperienceLevel} />
        )}

        {current === 'frequency' && (
          <div className="flex flex-wrap justify-center gap-2.5">
            {FREQUENCY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTargetFrequency(n)}
                className={`w-12 h-12 rounded-full border font-heading font-bold transition-colors ${
                  Number(targetFrequency) === n
                    ? 'bg-coral-500 border-coral-500'
                    : 'bg-forest-900 border-forest-700 text-slate-300 hover:border-coral-500/60'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {current === 'equipment' && (
          <PillMultiSelect options={EQUIPMENT_OPTIONS} values={equipment} onToggle={(v) => toggle(equipment, setEquipment, v)} />
        )}

        {current === 'goals' && (
          <PillMultiSelect options={GOAL_OPTIONS} values={goals} onToggle={(v) => toggle(goals, setGoals, v)} />
        )}

        {current === 'height' && (
          <div>
            <div className="flex justify-center mb-5">
              <div className="inline-flex rounded-full border border-forest-700 p-1 bg-forest-900">
                {['metric', 'imperial'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => handleUnitsChange(u)}
                    className={`px-3 py-1 rounded-full text-xs font-heading font-semibold transition-colors ${
                      preferredUnits === u ? 'bg-coral-500' : 'text-slate-400'
                    }`}
                  >
                    {u === 'metric' ? 'cm' : "ft'in"}
                  </button>
                ))}
              </div>
            </div>
            {preferredUnits === 'metric' ? (
              <div className="flex justify-center">
                <WheelPicker values={CM_RANGE} value={heightCmValue} onChange={(v) => setHeightDisplay(String(v))} formatValue={(v) => `${v} cm`} />
              </div>
            ) : (
              <div className="flex justify-center gap-4">
                <WheelPicker values={FEET_RANGE} value={feet} onChange={(v) => setHeightDisplay(`${v}'${inches}"`)} formatValue={(v) => `${v} ft`} />
                <WheelPicker values={INCH_RANGE} value={inches} onChange={(v) => setHeightDisplay(`${feet}'${v}"`)} formatValue={(v) => `${v} in`} />
              </div>
            )}
          </div>
        )}

        {current === 'weight' && (
          <div>
            <div className="flex justify-center mb-5">
              <div className="inline-flex rounded-full border border-forest-700 p-1 bg-forest-900">
                {['metric', 'imperial'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => handleUnitsChange(u)}
                    className={`px-3 py-1 rounded-full text-xs font-heading font-semibold transition-colors ${
                      preferredUnits === u ? 'bg-coral-500' : 'text-slate-400'
                    }`}
                  >
                    {u === 'metric' ? 'kg' : 'lb'}
                  </button>
                ))}
              </div>
            </div>
            <WheelPicker
              values={preferredUnits === 'imperial' ? LB_RANGE : KG_RANGE}
              value={weightValue}
              onChange={setWeightDisplay}
              orientation="horizontal"
            />
            <p className="text-center text-xs text-slate-500 mt-2">{preferredUnits === 'imperial' ? 'lb' : 'kg'}</p>
          </div>
        )}

        {current === 'limitations' && (
          <textarea
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            rows={4}
            placeholder="e.g. lower back sensitivity, avoid overhead pressing"
            className="w-full rounded-xl border border-forest-700 bg-forest-900 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-coral-500"
          />
        )}

        {current === 'review' && (
          <div className="space-y-1 text-sm">
            <ReviewRow label="Experience" value={EXPERIENCE_OPTIONS.find((o) => o.value === experienceLevel)?.label} />
            <ReviewRow label="Frequency" value={`${targetFrequency}x / week`} />
            <ReviewRow label="Equipment" value={equipment.map((v) => EQUIPMENT_OPTIONS.find((o) => o.value === v)?.label).join(', ') || 'None selected'} />
            <ReviewRow label="Goals" value={goals.map((v) => GOAL_OPTIONS.find((o) => o.value === v)?.label).join(', ') || 'None selected'} />
            <ReviewRow label="Height" value={heightMetricToDisplay(heightDisplayToMetric(heightDisplay, preferredUnits), preferredUnits)} />
            <ReviewRow label="Weight" value={`${weightDisplay} ${preferredUnits === 'imperial' ? 'lb' : 'kg'}`} />
            <ReviewRow label="Limitations" value={limitations || 'None noted'} />
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <button
            type="button"
            onClick={goBack}
            className="flex-1 py-3 rounded-xl border border-forest-700 text-sm font-heading font-semibold text-slate-300 hover:border-coral-500/60"
          >
            Back
          </button>
        )}
        {current === 'limitations' && (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 py-3 rounded-xl border border-forest-700 text-sm font-heading font-semibold text-slate-400 hover:border-coral-500/60"
          >
            Skip
          </button>
        )}
        {current !== 'review' ? (
          <button type="button" onClick={goNext} className="flex-1 py-3 rounded-xl bg-coral-500 text-sm font-heading font-semibold">
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || saved}
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-coral-500 text-sm font-heading font-semibold disabled:opacity-70"
          >
            {saved ? 'Saved ✓' : saving ? (hasSaved ? 'Saving…' : 'Generating your plan…') : 'Save profile'}
          </button>
        )}
      </div>

      {hasSaved && current === 'review' && !saving && (
        <button type="button" onClick={() => navigate('/dashboard')} className="w-full text-center text-sm text-coral-400 mt-4 hover:underline">
          Continue to dashboard →
        </button>
      )}
    </div>
  )
}
