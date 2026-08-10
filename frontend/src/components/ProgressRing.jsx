// Radial/donut progress indicator(s) - same "no target set falls back to
// filled-if-any-value-logged" philosophy as MacroBar.jsx, just a ring
// instead of a bar. One accent color used consistently across every ring in
// the app (matches the rest of the brand - a single vibrant accent, not a
// different hue per metric) rather than assigning an arbitrary new color
// per stat.
//
// Generalized to render N concentric rings in one SVG (outermost ring first
// in the `rings` array) so a single component can show, e.g., "workouts
// this week" as the outer ring and "calories today" nested inside it,
// Apple-Watch-Move/Exercise/Stand-style - rather than laying out several
// independent single-ring SVGs side by side. `ProgressRing` (single ring)
// is now a thin wrapper around `ConcentricRings` with one entry, so every
// existing call site keeps working unchanged.
const STROKE = 10
const GAP = 6
const DEFAULT_SIZE = 140

function ringPct(value, target) {
  if (target) return Math.min(1, value / target)
  return value > 0 ? 1 : 0
}

export function ConcentricRings({ rings, centerLabel, centerValue, size = DEFAULT_SIZE }) {
  const cx = size / 2
  const cy = size / 2

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {rings.map((ring, i) => {
          const radius = cx - STROKE / 2 - i * (STROKE + GAP)
          const circumference = 2 * Math.PI * radius
          const pct = ringPct(ring.value, ring.target)
          const offset = circumference * (1 - pct)
          return (
            <g key={ring.key ?? i}>
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#212126" strokeWidth={STROKE} />
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={ring.color || '#c6ff3d'}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </g>
          )
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-lg font-heading font-bold tabular-nums leading-none">{centerValue}</span>
          )}
          {centerLabel && <span className="text-[9px] text-slate-500 mt-1 text-center px-2">{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}

export default function ProgressRing({ value, target, label, unit = '', color = '#c6ff3d' }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <ConcentricRings
        rings={[{ value, target, color }]}
        centerValue={Math.round(value).toLocaleString()}
        centerLabel={unit}
        size={84}
      />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}
