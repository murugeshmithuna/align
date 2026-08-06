// Baseline daily nutrition goal calculator (Mifflin-St Jeor BMR -> TDEE ->
// goal-adjusted calories -> macros). Pure functions, no side effects - the
// UI (Profile.jsx's "Auto-Calculate Baseline Goals") is what turns the
// result into editable, steppable state.

export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
}

export const ACTIVITY_LABELS = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  very_active: 'Very active',
}

// -500/day ≈ 1 lb/week fat-loss rate; +300/day is a lean-gain-oriented
// surplus rather than an aggressive bulk.
const GOAL_CALORIE_ADJUSTMENT = {
  fat_loss: -500,
  maintenance: 0,
  muscle_gain: 300,
}

// Grams of protein per kg bodyweight - within the requested 1.8-2.2g/kg
// range, biased toward the top for muscle gain and the cutting end of that
// range for fat loss (preserve lean mass in a deficit).
const GOAL_PROTEIN_PER_KG = {
  fat_loss: 2.0,
  maintenance: 1.8,
  muscle_gain: 2.2,
}

export const GOAL_LABELS = {
  fat_loss: 'Fat loss',
  maintenance: 'Maintenance',
  muscle_gain: 'Muscle gain',
}

const FAT_PERCENT_OF_CALORIES = 0.25
const CALORIES_PER_G_PROTEIN = 4
const CALORIES_PER_G_CARB = 4
const CALORIES_PER_G_FAT = 9
const FIBER_G_PER_1000_KCAL = 14
const FIBER_MIN_G = 25
const FIBER_MAX_G = 38

// Mifflin-St Jeor - the most widely validated BMR equation for general
// (non-clinical) use, and the one this calculator is built around.
export function calculateBMR({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export function calculateTDEE({ weightKg, heightCm, age, sex, activityLevel }) {
  const bmr = calculateBMR({ weightKg, heightCm, age, sex })
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.sedentary
  return bmr * multiplier
}

// Returns { calories, protein, carbs, fat, fiber } (all whole grams/kcal).
// `goal` is one of GOAL_LABELS' keys (fat_loss | maintenance | muscle_gain).
export function calculateBaselineGoals({ weightKg, heightCm, age, sex, activityLevel, goal }) {
  const tdee = calculateTDEE({ weightKg, heightCm, age, sex, activityLevel })
  const calories = Math.round(tdee + (GOAL_CALORIE_ADJUSTMENT[goal] ?? 0))

  const proteinPerKg = GOAL_PROTEIN_PER_KG[goal] ?? GOAL_PROTEIN_PER_KG.maintenance
  const protein = Math.round(weightKg * proteinPerKg)
  const fat = Math.round((calories * FAT_PERCENT_OF_CALORIES) / CALORIES_PER_G_FAT)

  const remainingCalories = calories - protein * CALORIES_PER_G_PROTEIN - fat * CALORIES_PER_G_FAT
  const carbs = Math.max(0, Math.round(remainingCalories / CALORIES_PER_G_CARB))

  const fiber = Math.min(
    FIBER_MAX_G,
    Math.max(FIBER_MIN_G, Math.round((calories / 1000) * FIBER_G_PER_1000_KCAL)),
  )

  return { calories, protein, carbs, fat, fiber }
}
