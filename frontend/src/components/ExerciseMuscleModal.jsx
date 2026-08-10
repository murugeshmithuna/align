import MuscleBodyMap from './MuscleBodyMap.jsx'
import { MUSCLE_ZONES, MUSCLE_ZONE_LABELS } from '../utils/muscleZones.js'

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-8" />
    </svg>
  )
}

// Checkmark-pill checklist of every muscle zone this app knows about, lit
// for whichever one(s) this specific exercise targets - same reference-
// matched visual language as the body diagram (lime pill + filled check for
// a hit, dim outline for a miss), just as a scannable list rather than only
// a diagram, mirroring a "target muscle selector" UI the user shared as a
// direct style reference.
function MuscleChecklist({ targeted }) {
  return (
    <div className="space-y-2">
      {MUSCLE_ZONES.map((zone) => {
        const isOn = targeted.has(zone)
        return (
          <div
            key={zone}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
              isOn ? 'border-coral-500 text-coral-400 bg-coral-500/10' : 'border-forest-700 text-slate-500'
            }`}
          >
            <span
              className={`w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${
                isOn ? 'bg-coral-500 border-coral-500 text-forest-950' : 'border-forest-600 text-transparent'
              }`}
            >
              <CheckIcon />
            </span>
            {MUSCLE_ZONE_LABELS[zone] || zone}
          </div>
        )
      })}
    </div>
  )
}

// Compact popover showing one exercise's specific targeted muscle zone(s) -
// same fixed-overlay + `card` modal styling convention as CheckinModal.jsx,
// scoped down to a single exercise instead of a whole plan's aggregate.
export default function ExerciseMuscleModal({ exerciseName, targetedZones, onClose }) {
  const targeted = targetedZones instanceof Set ? targetedZones : new Set(targetedZones)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl p-6 bg-forest-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-heading font-bold text-lg">{exerciseName}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-sm shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_1fr] gap-6 items-center">
          <MuscleChecklist targeted={targeted} />
          <MuscleBodyMap targetedZones={targeted} exerciseName={exerciseName} />
        </div>
      </div>
    </div>
  )
}
