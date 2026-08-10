// Mirrors backend/app/agent/fatigue.py's estimate_calories_burned() exactly -
// same standard MET formula (calories = MET x weight_kg x duration_hours),
// same constants and same "Compendium of Physical Activities" reasoning
// documented there. This client-side copy exists only for Live Session
// (LiveSession.jsx), which has a real elapsed wall-clock duration
// (sessionStartedAtRef) the backend never sees - everywhere else (manual
// workout logs, the Analytics chart) the backend's own estimate is used
// directly instead of duplicating the math.

// Compendium-of-Physical-Activities-style MET range for resistance/weight
// training: light/moderate effort up to vigorous free-weight effort.
const MET_LIGHT_MODERATE = 3.5
const MET_VIGOROUS = 6.0
const MET_RPE_FLOOR = 5 // RPE at/below this maps to MET_LIGHT_MODERATE
const MET_RPE_CEILING = 9 // RPE at/above this maps to MET_VIGOROUS
const MET_DEFAULT_NO_RPE = 5.0 // flat fallback when no RPE is available (e.g. Live Session)

// Rough average minutes per resistance-training working set (lift + rest),
// used only when no real duration is available - see fatigue.py.
const MINUTES_PER_SET_ESTIMATE = 2.5

function metForRpe(rpe) {
  if (rpe == null) return MET_DEFAULT_NO_RPE
  if (rpe <= MET_RPE_FLOOR) return MET_LIGHT_MODERATE
  if (rpe >= MET_RPE_CEILING) return MET_VIGOROUS
  const fraction = (rpe - MET_RPE_FLOOR) / (MET_RPE_CEILING - MET_RPE_FLOOR)
  return MET_LIGHT_MODERATE + fraction * (MET_VIGOROUS - MET_LIGHT_MODERATE)
}

// weightKgUser: the user's real profile weight - returns null (never a
// fabricated number) if it isn't set. durationMinutes: pass the real elapsed
// time when known (Live Session); otherwise estimated from `sets`.
export function estimateCaloriesBurned({ sets = null, weightKgUser, rpe = null, durationMinutes = null }) {
  if (!weightKgUser || weightKgUser <= 0) return null
  const minutes = durationMinutes != null ? durationMinutes : (sets || 0) * MINUTES_PER_SET_ESTIMATE
  const met = metForRpe(rpe)
  const hours = minutes / 60
  return Math.round(met * weightKgUser * hours * 10) / 10
}
