// Maps the free-text `muscle_group` strings written by the LLM's
// generate_workout_plan tool (see backend/app/agent/tools.py - there's no
// fixed catalog, the model can write "Chest", "Quadriceps", "Upper Back",
// "core", etc. in whatever casing/phrasing it lands on) into one of a
// small, fixed set of zone keys that MuscleBodyMap.jsx knows how to render.
// Same fuzzy-keyword-matching spirit as LiveSession.jsx's matchExerciseConfig -
// case-insensitive substring checks against a fixed internal set, no attempt
// at exhaustive/exact enum matching.

export const MUSCLE_ZONES = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'upperBack',
  'lowerBack',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
]

// Ordered most-specific-first so e.g. "lower back" matches lowerBack before
// a looser "back" keyword (checked later) could grab it as upperBack.
const KEYWORD_RULES = [
  { zone: 'chest', keywords: ['chest', 'pec'] },
  { zone: 'shoulders', keywords: ['shoulder', 'delt'] },
  { zone: 'triceps', keywords: ['tricep'] },
  { zone: 'biceps', keywords: ['bicep'] },
  { zone: 'forearms', keywords: ['forearm'] },
  { zone: 'abs', keywords: ['ab', 'core', 'oblique'] },
  { zone: 'lowerBack', keywords: ['lower back', 'low back', 'lumbar'] },
  { zone: 'upperBack', keywords: ['upper back', 'lat', 'trap', 'rhomboid', 'back'] },
  { zone: 'glutes', keywords: ['glute'] },
  { zone: 'quads', keywords: ['quad'] },
  { zone: 'hamstrings', keywords: ['ham'] },
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
