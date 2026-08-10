import MuscleBodyMap from './MuscleBodyMap.jsx'

// Compact popover showing one exercise's specific targeted muscle zone(s) -
// same fixed-overlay + `card` modal styling convention as CheckinModal.jsx,
// scoped down to a single exercise instead of a whole plan's aggregate.
export default function ExerciseMuscleModal({ exerciseName, targetedZones, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm p-6 bg-forest-900"
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
        <MuscleBodyMap targetedZones={targetedZones} />
      </div>
    </div>
  )
}
