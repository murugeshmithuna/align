// Two hand-built inline SVG body silhouettes (front + back) showing which
// muscle zone(s) a given exercise targets. Rebuilt from an earlier version
// that used blocky rounded-rects/ellipses on a stick-figure-like body (read
// as "robot parts strapped to a mannequin", not a human) - this version
// traces the whole figure as smooth cubic-bezier `<path>` outlines (sloped
// rounded shoulders, a torso that tapers wide-chest-to-narrow-waist-to-
// flared-hip, limbs that taper wider-at-the-joint-to-narrower-at-the-hand/
// foot) and draws each muscle zone as an organic rounded blob (rotated
// ellipses for bicep/delt/calf-style bulges, custom tapered-wedge paths for
// quads/hamstrings, rounded panels for abs/back) rather than axis-aligned
// rectangles. Same "simple inline SVG, no image asset, no icon library"
// convention as AiCoreGlow.jsx/LiveSignalBg.jsx, and the same single-accent-
// color rule (electric lime "coral" tokens) used app-wide: matched zones
// fill lime, everything else stays a dim forest-600/700 outline.

const MATCHED_FILL = 'rgba(198, 255, 61, 0.55)' // coral-500 @ ~55% opacity
const MATCHED_STROKE = '#c6ff3d' // coral-500
const STRUCTURE_STROKE = '#323238' // forest-700, for the body outline
const DETAIL_STROKE = 'rgba(50, 50, 56, 0.6)' // forest-700, faint anatomical detail lines

// An untargeted zone renders as nothing at all (no fill, no stroke) - the
// reference diagram shows a plain, unbroken body outline for every
// untrained region, not a dim marker. Drawing every zone shape at low
// opacity regardless of state (the previous approach) is what made this
// read as a jointed mannequin - a visible dim capsule/ellipse sitting at
// every shoulder/elbow/hip/knee looks exactly like a ball-joint. Only a
// targeted zone should ever be visible, appearing as a color patch on top
// of the plain silhouette rather than one of many always-present parts.
function Zone({ zoneKey, targeted, shape, ...props }) {
  const isOn = targeted.has(zoneKey)
  if (!isOn) return null
  const Tag = shape
  return <Tag fill={MATCHED_FILL} stroke={MATCHED_STROKE} strokeWidth="1.5" {...props} />
}

// Shared silhouette geometry - identical between front/back views (a body's
// outline doesn't change between views, only which internal zones get
// drawn/highlighted does), defined once so both `<Structure>` renders stay
// in sync and the file doesn't carry two near-duplicate outlines to keep
// consistent by hand.
const HEAD = { cx: 100, cy: 26, rx: 16, ry: 18 }
const NECK_D = 'M 92,40 C 91,46 91,50 93,54 L 107,54 C 109,50 109,46 108,40 C 103,43 97,43 92,40 Z'
// One smooth cubic bezier per side (shoulder->waist, waist->hip) instead of
// several stitched short segments - the earlier version's segment joins
// each nudged direction slightly, which reads as a faceted/hexagonal torso
// instead of one continuous tapered curve. Shoulders (68 wide) -> waist (44
// wide, the narrowest point) -> hip flare (56 wide) - deliberately narrower
// at the waist than at either the shoulders or hips, not a straight taper.
const TORSO_D =
  'M 66,63 C 72,56 82,50 100,50 C 118,50 128,56 134,63 ' +
  'C 143,80 138,110 122,145 C 123,155 126,168 128,178 ' +
  'C 124,186 76,186 72,178 C 74,168 77,155 78,145 ' +
  'C 62,110 57,80 66,63 Z'
// Slightly thicker than a minimal stick-limb so the biceps/forearm/deltoid
// zone blobs below can sit fully inside the silhouette instead of
// ballooning past its outer edge.
const ARM_L_D =
  'M 66,63 C 52,64 43,74 38,88 C 35,100 33,112 32,126 C 31,138 30,150 29,160 ' +
  'C 28,169 29,177 32,184 L 48,184 C 47,175 46,166 46,156 C 46,144 47,132 49,122 ' +
  'C 51,108 53,96 57,84 C 59,76 62,68 66,63 Z'
const ARM_R_D =
  'M 134,63 C 148,64 157,74 162,88 C 165,100 167,112 168,126 C 169,138 170,150 171,160 ' +
  'C 172,169 171,177 168,184 L 152,184 C 153,175 154,166 154,156 C 154,144 153,132 151,122 ' +
  'C 149,108 147,96 143,84 C 141,76 138,68 134,63 Z'
const LEG_L_D =
  'M 76,178 C 70,190 68,205 68,222 C 68,238 69,254 71,268 C 72,276 73,282 74,288 ' +
  'C 73,298 72,308 72,318 C 72,330 71,342 70,354 C 69,364 69,372 70,380 L 84,380 ' +
  'C 85,372 85,364 85,356 C 86,344 87,332 88,320 C 89,308 89,298 88,288 C 89,282 90,276 91,268 ' +
  'C 93,254 94,238 94,222 C 94,205 92,190 88,178 Z'
const LEG_R_D =
  'M 124,178 C 130,190 132,205 132,222 C 132,238 131,254 129,268 C 128,276 127,282 126,288 ' +
  'C 127,298 128,308 128,318 C 128,330 129,342 130,354 C 131,364 131,372 130,380 L 116,380 ' +
  'C 115,372 115,364 115,356 C 114,344 113,332 112,320 C 111,308 111,298 112,288 C 111,282 110,276 109,268 ' +
  'C 107,254 106,238 106,222 C 106,205 108,190 112,178 Z'
const HAND_L = { cx: 41, cy: 192, rx: 9, ry: 11 }
const HAND_R = { cx: 159, cy: 192, rx: 9, ry: 11 }
const FOOT_L = { cx: 77, cy: 389, rx: 13, ry: 8, rotate: -6 }
const FOOT_R = { cx: 123, cy: 389, rx: 13, ry: 8, rotate: 6 }

function Structure({ detailLines = [] }) {
  return (
    <>
      <path d={LEG_L_D} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <path d={LEG_R_D} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <path d={ARM_L_D} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <path d={ARM_R_D} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <path d={TORSO_D} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <path d={NECK_D} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx={HAND_L.cx} cy={HAND_L.cy} rx={HAND_L.rx} ry={HAND_L.ry} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse cx={HAND_R.cx} cy={HAND_R.cy} rx={HAND_R.rx} ry={HAND_R.ry} fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5" />
      <ellipse
        cx={FOOT_L.cx} cy={FOOT_L.cy} rx={FOOT_L.rx} ry={FOOT_L.ry}
        transform={`rotate(${FOOT_L.rotate} ${FOOT_L.cx} ${FOOT_L.cy})`}
        fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5"
      />
      <ellipse
        cx={FOOT_R.cx} cy={FOOT_R.cy} rx={FOOT_R.rx} ry={FOOT_R.ry}
        transform={`rotate(${FOOT_R.rotate} ${FOOT_R.cx} ${FOOT_R.cy})`}
        fill="none" stroke={STRUCTURE_STROKE} strokeWidth="1.5"
      />
      {/* Faint anatomical detail lines (collarbones, sternum, spine, waist
          crease) - purely cosmetic, not tied to any zone's matched state,
          just enough linework so the outline reads as a body rather than a
          blank coloring-book shape. */}
      {detailLines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={DETAIL_STROKE} strokeWidth="1" />
      ))}
    </>
  )
}

const FRONT_DETAIL_LINES = [
  'M 78,58 C 88,62 112,62 122,58', // collarbone curve
  'M 100,64 L 100,110', // sternum line
  'M 100,120 L 100,160', // linea alba (abs center line)
  'M 84,130 L 116,130', // ab crease
  'M 86,148 L 114,148', // ab crease
]
const BACK_DETAIL_LINES = [
  'M 100,58 L 100,150', // spine line
  'M 80,72 C 88,78 96,80 100,80', // left shoulder blade hint
  'M 120,72 C 112,78 104,80 100,80', // right shoulder blade hint
]

function FrontBody({ targeted }) {
  return (
    <svg viewBox="0 0 200 420" className="w-full h-auto" aria-label="Front view muscle diagram">
      <Structure detailLines={FRONT_DETAIL_LINES} />

      {/* Shoulders (deltoid cap) - sized to sit fully inside the arm's top
          curve rather than overflowing past its outer edge. */}
      <Zone
        zoneKey="shoulders" targeted={targeted} shape="ellipse"
        cx="48" cy="78" rx="9" ry="12" transform="rotate(-20 48 78)"
      />
      <Zone
        zoneKey="shoulders" targeted={targeted} shape="ellipse"
        cx="152" cy="78" rx="9" ry="12" transform="rotate(20 152 78)"
      />

      {/* Chest (paired pec bulges) */}
      <Zone zoneKey="chest" targeted={targeted} shape="ellipse" cx="82" cy="80" rx="15" ry="13" transform="rotate(-12 82 80)" />
      <Zone zoneKey="chest" targeted={targeted} shape="ellipse" cx="118" cy="80" rx="15" ry="13" transform="rotate(12 118 80)" />

      {/* Abs (rounded panel, not a straight-edged rect) */}
      <Zone
        zoneKey="abs" targeted={targeted} shape="path"
        d="M 84,100 C 80,100 78,106 78,114 L 78,148 C 78,158 80,164 86,168 L 114,168 C 120,164 122,158 122,148 L 122,114 C 122,106 120,100 116,100 Z"
      />

      {/* Biceps - soft tapered oval on the upper arm */}
      <Zone zoneKey="biceps" targeted={targeted} shape="ellipse" cx="44" cy="100" rx="9" ry="18" transform="rotate(-8 44 100)" />
      <Zone zoneKey="biceps" targeted={targeted} shape="ellipse" cx="156" cy="100" rx="9" ry="18" transform="rotate(8 156 100)" />

      {/* Forearms - tapered capsule */}
      <Zone zoneKey="forearms" targeted={targeted} shape="ellipse" cx="37" cy="150" rx="7" ry="20" transform="rotate(-5 37 150)" />
      <Zone zoneKey="forearms" targeted={targeted} shape="ellipse" cx="163" cy="150" rx="7" ry="20" transform="rotate(5 163 150)" />

      {/* Quads - rounded wedge shape (wide at hip, narrowing to the knee) */}
      <Zone
        zoneKey="quads" targeted={targeted} shape="path"
        d="M 74,190 C 72,200 71,215 72,230 C 73,245 75,260 79,272 C 82,280 88,282 92,276 C 95,265 95,250 94,235 C 93,220 91,205 88,192 C 84,186 78,186 74,190 Z"
      />
      <Zone
        zoneKey="quads" targeted={targeted} shape="path"
        d="M 126,190 C 128,200 129,215 128,230 C 127,245 125,260 121,272 C 118,280 112,282 108,276 C 105,265 105,250 106,235 C 107,220 109,205 112,192 C 116,186 122,186 126,190 Z"
      />
    </svg>
  )
}

function BackBody({ targeted }) {
  return (
    <svg viewBox="0 0 200 420" className="w-full h-auto" aria-label="Back view muscle diagram">
      <Structure detailLines={BACK_DETAIL_LINES} />

      {/* Shoulders (deltoid cap) */}
      <Zone zoneKey="shoulders" targeted={targeted} shape="ellipse" cx="48" cy="78" rx="9" ry="12" transform="rotate(-20 48 78)" />
      <Zone zoneKey="shoulders" targeted={targeted} shape="ellipse" cx="152" cy="78" rx="9" ry="12" transform="rotate(20 152 78)" />

      {/* Upper back - wide rounded trapezoid across the shoulder blades */}
      <Zone
        zoneKey="upperBack" targeted={targeted} shape="path"
        d="M 72,66 C 68,80 68,95 72,108 C 85,114 115,114 128,108 C 132,95 132,80 128,66 C 115,72 85,72 72,66 Z"
      />
      {/* Lower back - narrower rounded panel below it */}
      <Zone
        zoneKey="lowerBack" targeted={targeted} shape="path"
        d="M 82,114 C 79,122 78,132 80,142 C 81,150 84,156 90,158 L 110,158 C 116,156 119,150 120,142 C 122,132 121,122 118,114 C 108,118 92,118 82,114 Z"
      />

      {/* Triceps - soft tapered oval on the upper arm (back view) */}
      <Zone zoneKey="triceps" targeted={targeted} shape="ellipse" cx="44" cy="100" rx="9" ry="18" transform="rotate(-8 44 100)" />
      <Zone zoneKey="triceps" targeted={targeted} shape="ellipse" cx="156" cy="100" rx="9" ry="18" transform="rotate(8 156 100)" />

      {/* Glutes - wide rounded band across the hips */}
      <Zone
        zoneKey="glutes" targeted={targeted} shape="path"
        d="M 70,178 C 68,190 70,203 78,210 C 88,216 112,216 122,210 C 130,203 132,190 130,178 C 124,183 76,183 70,178 Z"
      />

      {/* Hamstrings - rounded wedge shape (wide at hip, narrowing to the knee) */}
      <Zone
        zoneKey="hamstrings" targeted={targeted} shape="path"
        d="M 74,190 C 72,200 71,215 72,230 C 73,245 75,260 79,272 C 82,280 88,282 92,276 C 95,265 95,250 94,235 C 93,220 91,205 88,192 C 84,186 78,186 74,190 Z"
      />
      <Zone
        zoneKey="hamstrings" targeted={targeted} shape="path"
        d="M 126,190 C 128,200 129,215 128,230 C 127,245 125,260 121,272 C 118,280 112,282 108,276 C 105,265 105,250 106,235 C 107,220 109,205 112,192 C 116,186 122,186 126,190 Z"
      />

      {/* Calves - tapered capsule */}
      <Zone zoneKey="calves" targeted={targeted} shape="ellipse" cx="70" cy="330" rx="9" ry="24" transform="rotate(-3 70 330)" />
      <Zone zoneKey="calves" targeted={targeted} shape="ellipse" cx="130" cy="330" rx="9" ry="24" transform="rotate(3 130 330)" />
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
