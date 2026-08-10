// Radial/donut progress indicator - same "no target set falls back to
// filled-if-any-value-logged" philosophy as MacroBar.jsx, just a ring
// instead of a bar. One accent color used consistently across every ring in
// the app (matches the rest of the brand - a single vibrant accent, not a
// different hue per metric) rather than assigning an arbitrary new color
// per stat.
const SIZE = 84
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function ProgressRing({ value, target, label, unit = '', color = '#c6ff3d' }) {
  const pct = target ? Math.min(1, value / target) : value > 0 ? 1 : 0
  const offset = CIRCUMFERENCE * (1 - pct)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#212126"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-heading font-bold tabular-nums leading-none">
            {Math.round(value).toLocaleString()}
          </span>
          {unit && <span className="text-[9px] text-slate-500 mt-0.5">{unit}</span>}
        </div>
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}
