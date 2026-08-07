// No target set falls back to "filled if anything's logged, empty
// otherwise" rather than a fabricated percentage against a number that
// doesn't exist.
export default function MacroBar({ label, value, target, unit, color, badge }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="flex items-baseline gap-2 shrink-0">
          <span className="text-xs font-semibold tabular-nums">
            {Math.round(value).toLocaleString()}
            {unit}
            {target ? ` / ${Math.round(target).toLocaleString()}${unit}` : ''}
          </span>
          {badge}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-forest-900 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{
            width: target ? `${Math.min(100, (value / target) * 100)}%` : value > 0 ? '100%' : '0%',
          }}
        />
      </div>
    </div>
  )
}
