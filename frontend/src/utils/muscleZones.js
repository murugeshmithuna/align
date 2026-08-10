// Maps the free-text `muscle_group` strings written by the LLM's
// generate_workout_plan tool (see backend/app/agent/tools.py - there's no
// fixed catalog, the model can write "Chest", "Quadriceps", "Upper Back",
// "core", etc. in whatever casing/phrasing it lands on) into the muscle
// identifiers `react-body-highlighter` understands (see MuscleBodyMap.jsx) -
// keeping our own zone keys 1:1 with that library's names avoids a pointless
// extra translation layer, since it's the only consumer. Same fuzzy-keyword-
// matching spirit as LiveSession.jsx's matchExerciseConfig - case-insensitive
// substring checks against a fixed internal set, no attempt at exhaustive/
// exact enum matching.
//
// 'shoulders' is a synthetic zone (not one of the library's real muscle
// names) - generic "Shoulders"/"Delts" text can't be reliably split into
// front vs. rear deltoid from a muscle_group string alone, so MuscleBodyMap
// expands it into 'front-deltoids' on the anterior view and 'back-deltoids'
// on the posterior view rather than guessing which head was meant.

export const MUSCLE_ZONES = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearm',
  'abs',
  'obliques',
  'trapezius',
  'upper-back',
  'lower-back',
  'gluteal',
  'quadriceps',
  'hamstring',
  'calves',
]

// Human-readable labels for the checklist UI (ExerciseMuscleModal.jsx) -
// the raw zone keys are library/internal identifiers (kebab-case, plural
// inconsistently), not fit to show a user directly.
export const MUSCLE_ZONE_LABELS = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearm: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  trapezius: 'Traps',
  'upper-back': 'Upper Back',
  'lower-back': 'Lower Back',
  gluteal: 'Glutes',
  quadriceps: 'Quads',
  hamstring: 'Hamstrings',
  calves: 'Calves',
}

// Ordered most-specific-first so e.g. "lower back" matches lower-back before
// a looser "back" keyword (checked last) could grab it as upper-back.
const KEYWORD_RULES = [
  { zone: 'chest', keywords: ['chest', 'pec'] },
  { zone: 'shoulders', keywords: ['shoulder', 'delt'] },
  { zone: 'triceps', keywords: ['tricep'] },
  { zone: 'biceps', keywords: ['bicep'] },
  { zone: 'forearm', keywords: ['forearm'] },
  { zone: 'obliques', keywords: ['oblique'] },
  { zone: 'abs', keywords: ['ab', 'core'] },
  { zone: 'lower-back', keywords: ['lower back', 'low back', 'lumbar'] },
  { zone: 'trapezius', keywords: ['trap'] },
  { zone: 'upper-back', keywords: ['upper back', 'lat', 'rhomboid', 'back'] },
  { zone: 'gluteal', keywords: ['glute'] },
  { zone: 'quadriceps', keywords: ['quad'] },
  { zone: 'hamstring', keywords: ['ham'] },
  { zone: 'calves', keywords: ['calf', 'calve'] },
]

// Never throws - an unrecognized/empty string just returns null (skip),
// rather than crashing or forcing a default guess onto an unrelated zone.
export function classifyMuscleGroup(rawString) {
  if (!rawString || typeof rawString !== 'string') return null
  const lower = rawString.toLowerCase()

  // "ab" is a short, common substring (e.g. would false-match inside other
  // words), so give it a word-boundary-ish check rather than a plain
  // includes() - kept local to this one rule since it's the only
  // troublesome short keyword in the list.
  for (const { zone, keywords } of KEYWORD_RULES) {
    for (const kw of keywords) {
      if (kw === 'ab') {
        if (/\bab(s|dominal|dominals)?\b/.test(lower)) return zone
        continue
      }
      if (lower.includes(kw)) return zone
    }
  }
  return null
}
