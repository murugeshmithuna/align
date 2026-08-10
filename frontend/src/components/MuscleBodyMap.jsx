// Two hand-built inline SVG body silhouettes (front + back) showing which
// muscle zones this plan's exercises target - a composition preview, not a
// training-history/tier gamification widget. Same "simple inline SVG, no
// image asset, no icon library" convention as AiCoreGlow.jsx/LiveSignalBg.jsx,
// and the same single-accent-color rule (electric lime "coral" tokens) used
// app-wide: matched zones fill lime, everything else stays a dim forest-600
// outline.

const MATCHED_FILL = 'rgba(198, 255, 61, 0.55)' // coral-500 @ ~55% opacity
const MATCHED_STROKE = '#c6ff3d' // coral-500
const IDLE_FILL = 'rgba(69, 69, 76, 0.25)' // forest-600 @ low opacity
const IDLE_STROKE = '#45454c' // forest-600
const STRUCTURE_STROKE = '#323238' // forest-700, for non-zone body outline

function Zone({ zoneKey, targeted, shape, ...props }) {
  const isOn = targeted.has(zoneKey)
  const fill = isOn ? MATCHED_FILL : IDLE_FILL
  const stroke = isOn ? MATCHED_STROKE : IDLE_STROKE
  const Tag = shape
  return <Tag fill={fill} stroke={stroke} strokeWidth="1.5" {...props} />
}

function FrontBody({ targeted }) {
  return (
    <svg viewBox="0 0 200 420" className="w-full h-auto" aria-label="Front view muscle diagram">
      {/* Structural outline - head, neck, hips, lower legs, hands, feet - not
          a targetable zone, just visual context. */}
      <circle cx="100" cy="30" r="22" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="92" y="50" width="16" height="14" rx="4" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="76" y="168" width="48" height="26" rx="10" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="78" y="278" width="16" height="88" rx="7" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="106" y="278" width="16" height="88" rx="7" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="86" cy="372" rx="10" ry="6" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="114" cy="372" rx="10" ry="6" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="26" cy="182" rx="9" ry="11" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="174" cy="182" rx="9" ry="11" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />

      {/* Zones */}
      <Zone zoneKey="shoulders" targeted={targeted} shape="ellipse" cx="58" cy="64" rx="17" ry="13" />
      <Zone zoneKey="shoulders" targeted={targeted} shape="ellipse" cx="142" cy="64" rx="17" ry="13" />

      <Zone zoneKey="chest" targeted={targeted} shape="rect" x="70" y="58" width="60" height="42" rx="10" />

      <Zone zoneKey="abs" targeted={targeted} shape="rect" x="76" y="102" width="48" height="62" rx="8" />

      <Zone zoneKey="biceps" targeted={targeted} shape="rect" x="34" y="70" width="20" height="58" rx="8" />
      <Zone zoneKey="biceps" targeted={targeted} shape="rect" x="146" y="70" width="20" height="58" rx="8" />

      <Zone zoneKey="forearms" targeted={targeted} shape="rect" x="30" y="130" width="18" height="52" rx="7" />
      <Zone zoneKey="forearms" targeted={targeted} shape="rect" x="152" y="130" width="18" height="52" rx="7" />

      <Zone zoneKey="quads" targeted={targeted} shape="rect" x="76" y="196" width="20" height="80" rx="8" />
      <Zone zoneKey="quads" targeted={targeted} shape="rect" x="104" y="196" width="20" height="80" rx="8" />
    </svg>
  )
}

function BackBody({ targeted }) {
  return (
    <svg viewBox="0 0 200 420" className="w-full h-auto" aria-label="Back view muscle diagram">
      <circle cx="100" cy="30" r="22" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="92" y="50" width="16" height="14" rx="4" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="78" y="278" width="16" height="24" rx="6" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="106" y="278" width="16" height="24" rx="6" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="32" y="130" width="18" height="52" rx="7" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <rect x="150" y="130" width="18" height="52" rx="7" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="86" cy="372" rx="10" ry="6" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="114" cy="372" rx="10" ry="6" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="26" cy="182" rx="9" ry="11" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx="174" cy="182" rx="9" ry="11" fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />

      {/* Zones */}
      <Zone zoneKey="shoulders" targeted={targeted} shape="ellipse" cx="58" cy="64" rx="17" ry="13" />
      <Zone zoneKey="shoulders" targeted={targeted} shape="ellipse" cx="142" cy="64" rx="17" ry="13" />

      <Zone zoneKey="upperBack" targeted={targeted} shape="rect" x="70" y="58" width="60" height="52" rx="10" />
      <Zone zoneKey="lowerBack" targeted={targeted} shape="rect" x="76" y="112" width="48" height="40" rx="8" />

      <Zone zoneKey="triceps" targeted={targeted} shape="rect" x="34" y="70" width="20" height="58" rx="8" />
      <Zone zoneKey="triceps" targeted={targeted} shape="rect" x="146" y="70" width="20" height="58" rx="8" />

      <Zone zoneKey="glutes" targeted={targeted} shape="rect" x="72" y="154" width="56" height="38" rx="14" />

      <Zone zoneKey="hamstrings" targeted={targeted} shape="rect" x="76" y="196" width="20" height="80" rx="8" />
      <Zone zoneKey="hamstrings" targeted={targeted} shape="rect" x="104" y="196" width="20" height="80" rx="8" />

      <Zone zoneKey="calves" targeted={targeted} shape="rect" x="78" y="302" width="16" height="64" rx="7" />
      <Zone zoneKey="calves" targeted={targeted} shape="rect" x="106" y="302" width="16" height="64" rx="7" />
    </svg>
  )
}

// `targetedZones` accepts an array or a Set of zone keys (see
// utils/muscleZones.js for the fixed key list) - normalized to a Set once
// here so both views can do cheap `.has()` lookups.
export default function MuscleBodyMap({ targetedZones = [] }) {
  const targeted = targetedZones instanceof Set ? targetedZones : new Set(targetedZones)

  return (
    <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
      <div className="text-center">
        <FrontBody targeted={targeted} />
        <p className="text-xs text-slate-500 mt-1">Front</p>
      </div>
      <div className="text-center">
        <BackBody targeted={targeted} />
        <p className="text-xs text-slate-500 mt-1">Back</p>
      </div>
    </div>
  )
}
