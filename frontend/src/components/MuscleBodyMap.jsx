import Model from 'react-body-highlighter'

// Front + back muscle diagram showing which zone(s) an exercise targets.
// Uses react-body-highlighter (MIT) for the actual body illustration rather
// than a hand-built SVG - a from-scratch attempt at this (see git history)
// read as a blocky mannequin, not a human body, no matter how much the
// paths were tweaked. This library's polygons are real anatomical shapes,
// which is what "look like a human" actually requires here.
//
// Only the app's one lime accent is used for a matched zone (not this
// library's own default blue) - `bodyColor` also swaps its neutral gray
// default for this app's dim charcoal outline tone, so it fits the rest of
// the dark theme instead of looking like an unrelated widget dropped in.
const MATCHED_COLOR = '#ccff00' // coral-500
const BODY_COLOR = '#323238' // forest-700

// 'shoulders' is a synthetic zone from utils/muscleZones.js, not one of the
// library's real muscle names - generic "Shoulders"/"Delts" text in a
// muscle_group string can't be reliably attributed to one deltoid head, so
// it's expanded into both the anterior and posterior equivalents rather
// than guessing which was meant. Passing a muscle name that doesn't belong
// to a given view is harmless - the library only renders muscles that
// exist in that view's own fixed anatomical set and silently ignores the
// rest, so no per-view filtering is needed here.
function musclesForView(zoneKeys, view) {
  return zoneKeys.map((zone) => (zone === 'shoulders' ? (view === 'anterior' ? 'front-deltoids' : 'back-deltoids') : zone))
}

export default function MuscleBodyMap({ targetedZones = [], exerciseName = 'Exercise' }) {
  const zoneKeys = targetedZones instanceof Set ? [...targetedZones] : targetedZones
  if (zoneKeys.length === 0) return null

  const frontData = [{ name: exerciseName, muscles: musclesForView(zoneKeys, 'anterior') }]
  const backData = [{ name: exerciseName, muscles: musclesForView(zoneKeys, 'posterior') }]

  return (
    <div className="grid grid-cols-2 gap-6 max-w-xs mx-auto">
      <div className="text-center">
        <Model
          type="anterior"
          data={frontData}
          bodyColor={BODY_COLOR}
          highlightedColors={[MATCHED_COLOR]}
          style={{ width: '100%' }}
          svgStyle={{ width: '100%', height: 'auto' }}
        />
        <p className="text-xs text-slate-500 mt-1">Front</p>
      </div>
      <div className="text-center">
        <Model
          type="posterior"
          data={backData}
          bodyColor={BODY_COLOR}
          highlightedColors={[MATCHED_COLOR]}
          style={{ width: '100%' }}
          svgStyle={{ width: '100%', height: 'auto' }}
        />
        <p className="text-xs text-slate-500 mt-1">Back</p>
      </div>
    </div>
  )
}
