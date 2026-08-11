// ALIGN's signature AI visual - a left-facing human head/neck/shoulders
// profile with an organic neural network revealed inside it, a sparse
// particle field, and a soft atmospheric glow along the front contour.
// Hand-authored SVG (not a procedural/random generator) - the node and
// particle placement was tuned by eye against a real reference to read as
// "human profile" first, "neural network" on closer inspection, matching
// the brief's own visual-quality bar. Kept as one static, maintainable SVG
// tree per the "prefer a carefully constructed SVG over a canvas engine"
// guidance - nothing here needs per-frame recomputation.
//
// Only the intelligence layer animates (node pulses, one travelling signal,
// slow particle drift, breathing glow) - the silhouette itself never moves.
// All animation is pure CSS (see index.css's "Coach AI Visual" section) so
// prefers-reduced-motion can disable it globally with zero JS.
// Each node/particle needs its own fixed base opacity (the visual
// hierarchy - a few bright "hero" points, many dim background ones) AND a
// pulsing/drifting CSS animation. Animating the `opacity` CSS property
// directly on the circle would overwrite that base value every keyframe,
// flattening every node to the same brightness while pulsing. Wrapping each
// circle in its own <g opacity="base"> and animating a *ratio* on the child
// instead lets SVG's normal nested-opacity compositing multiply the two
// together, so the pulse scales each node's own brightness rather than
// replacing it.
function Node({ cx, cy, r, opacity, delay, hero = false }) {
  return (
    <g opacity={opacity}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className={hero ? 'coach-ai-node-dot coach-ai-node-hero' : 'coach-ai-node-dot'}
        style={{ '--pulse-delay': delay }}
      />
    </g>
  )
}

function Particle({ cx, cy, r, opacity, delay }) {
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={r} className="coach-ai-particle-dot" style={{ '--drift-delay': delay }} />
    </g>
  )
}

// One gentle quadratic-bezier arc per connection instead of a straight
// line - the refinement this component exists for. `bow` is how far the
// curve's control point is offset perpendicular to the straight line
// between the two points (signed, so positive/negative arcs the curve to
// either side); varying it per connection (rather than one fixed amount) is
// what keeps the network reading as irregular neural pathways rather than a
// uniformly-bent wireframe.
export function curvedPath([x1, y1], [x2, y2], bow) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = mx + nx * bow
  const cy = my + ny * bow
  return `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`
}

// Node layout is a branching tree (each node has exactly one parent, aside
// from the two root nodes n1/n3) rather than a triangulated mesh - the
// earlier straight-line version had several closed loops that read as
// geometric polygons once connected. A pure tree can never close a loop, so
// there's nothing for the eye to resolve into a triangle/quadrilateral
// no matter how the curves bow. Density is concentrated in the upper
// skull (n1-n9) and thins into single dead-end branches toward the jaw,
// ear, and neck (n10-n22), matching "denser around the brain, sparser
// toward the face/jaw/neck."
const NODES = {
  n1: { pos: [105, 64], r: 1.8, opacity: 0.65, delay: '0.2s' },
  n2: { pos: [128, 50], r: 1.5, opacity: 0.5, delay: '1.6s' },
  n3: { pos: [150, 80], r: 2.8, opacity: 1, delay: '0s', hero: true },
  n4: { pos: [86, 96], r: 1.6, opacity: 0.55, delay: '2.4s' },
  n5: { pos: [116, 110], r: 1.8, opacity: 0.7, delay: '0.9s' },
  n6: { pos: [136, 138], r: 1.5, opacity: 0.5, delay: '3.1s' },
  n7: { pos: [66, 126], r: 1.2, opacity: 0.4, delay: '1.3s' },
  n8: { pos: [92, 152], r: 1.4, opacity: 0.45, delay: '2.8s' },
  n9: { pos: [158, 118], r: 1.7, opacity: 0.6, delay: '0.6s' },
  n10: { pos: [172, 92], r: 1, opacity: 0.3, delay: '3.6s' },
  n11: { pos: [116, 168], r: 0.9, opacity: 0.28, delay: '1.9s' },
  n12: { pos: [146, 172], r: 1, opacity: 0.32, delay: '0.4s' },
  n13: { pos: [166, 154], r: 1, opacity: 0.3, delay: '2.2s' },
  n14: { pos: [52, 146], r: 0.7, opacity: 0.2, delay: '3.9s' },
  n15: { pos: [72, 172], r: 0.7, opacity: 0.2, delay: '1.1s' },
  n16: { pos: [142, 162], r: 1.1, opacity: 0.38, delay: '2.6s' },
  n17: { pos: [132, 182], r: 0.6, opacity: 0.15, delay: '0.7s' },
  n18: { pos: [76, 55], r: 0.9, opacity: 0.32, delay: '3.3s' },
  n19: { pos: [58, 63], r: 0.6, opacity: 0.18, delay: '1.7s' },
  n20: { pos: [182, 102], r: 0.8, opacity: 0.25, delay: '2.9s' },
  n21: { pos: [156, 192], r: 0.8, opacity: 0.22, delay: '0.5s' },
  n22: { pos: [152, 208], r: 0.5, opacity: 0.12, delay: '3.4s' },
}

// { from, to, bow, opacity } - opacity omitted defers to the CSS default
// (a mid-strength dim connection). Bow signs/magnitudes are hand-varied on
// purpose (never the same value twice in a row) so no two arcs share a
// curvature, and several branches (n8-n11, n1-n18-n19, n10-n20, n13-n21-n22,
// n12-n17, n7-n14, n8-n15) simply end rather than reconnecting anywhere -
// "let some connections fade before reaching another node."
const LINKS = [
  { from: 'n1', to: 'n2', bow: -9 },
  { from: 'n1', to: 'n4', bow: 8 },
  { from: 'n2', to: 'n3', bow: 6 },
  { from: 'n4', to: 'n5', bow: -7 },
  { from: 'n5', to: 'n6', bow: 10, id: 'signal' },
  { from: 'n4', to: 'n7', bow: -15 },
  { from: 'n7', to: 'n8', bow: 7 },
  { from: 'n3', to: 'n9', bow: -9 },
  { from: 'n9', to: 'n10', bow: 11, opacity: 0.32 },
  { from: 'n6', to: 'n16', bow: -6, opacity: 0.4 },
  { from: 'n16', to: 'n12', bow: 9, opacity: 0.3 },
  { from: 'n8', to: 'n11', bow: -8, opacity: 0.28 },
  { from: 'n9', to: 'n13', bow: 8, opacity: 0.32 },
  { from: 'n12', to: 'n17', bow: -5, opacity: 0.18 },
  { from: 'n13', to: 'n21', bow: 6, opacity: 0.24 },
  { from: 'n21', to: 'n22', bow: -4, opacity: 0.14 },
  { from: 'n7', to: 'n14', bow: 5, opacity: 0.24 },
  { from: 'n8', to: 'n15', bow: -7, opacity: 0.22 },
  { from: 'n1', to: 'n18', bow: 7, opacity: 0.32 },
  { from: 'n18', to: 'n19', bow: -5, opacity: 0.18 },
  { from: 'n10', to: 'n20', bow: 9, opacity: 0.26 },
]

export default function CoachAIVisual({ className = '' }) {
  return (
    <svg
      viewBox="0 0 240 280"
      className={`coach-ai-visual ${className}`}
      role="img"
      aria-label="Animated visualization of the AI coach as a human profile with an internal neural network"
    >
      <defs>
        <radialGradient id="coachAiHeadGrad" cx="42%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#1e1e22" stopOpacity="0.85" />
          <stop offset="65%" stopColor="#161619" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#121214" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="coachAiFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="83%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </linearGradient>
        <mask id="coachAiBottomFade">
          <rect x="0" y="0" width="240" height="280" fill="url(#coachAiFade)" />
        </mask>
        <clipPath id="coachAiHeadClip">
          <path
            d="M 128 20 C 100 20, 82 26, 66 42 C 58 50, 54 58, 50 68 C 46 82, 40 92, 28 106
               C 22 112, 22 116, 28 121 C 33 126, 36 130, 33 136 C 31 140, 36 143, 38 148
               C 40 152, 36 155, 33 160 C 30 165, 34 170, 37 176 C 39 181, 34 186, 30 193
               C 27 200, 32 210, 42 218 C 54 226, 70 230, 86 232 C 100 233, 112 230, 120 224
               C 128 232, 134 244, 136 258 C 137 265, 130 271, 112 276 L 30 280 L 225 280
               C 214 270, 205 258, 200 244 C 195 230, 192 216, 190 202 C 188 188, 190 172, 194 156
               C 199 138, 200 118, 196 98 C 192 78, 182 56, 165 40 C 155 30, 142 22, 128 20 Z"
          />
        </clipPath>
      </defs>

      <g mask="url(#coachAiBottomFade)">
        {/* Full closed silhouette - crown, forehead, face, jaw, neck front,
            shoulder front, (bottom, faded), shoulder back, neck back,
            skull back, closing at the crown. A soft radial fill only, no
            hard edge - the "mass" of the head is felt, not drawn solid. */}
        <path
          className="coach-ai-fill"
          d="M 128 20 C 100 20, 82 26, 66 42 C 58 50, 54 58, 50 68 C 46 82, 40 92, 28 106
             C 22 112, 22 116, 28 121 C 33 126, 36 130, 33 136 C 31 140, 36 143, 38 148
             C 40 152, 36 155, 33 160 C 30 165, 34 170, 37 176 C 39 181, 34 186, 30 193
             C 27 200, 32 210, 42 218 C 54 226, 70 230, 86 232 C 100 233, 112 230, 120 224
             C 128 232, 134 244, 136 258 C 137 265, 130 271, 112 276 L 30 280 L 225 280
             C 214 270, 205 258, 200 244 C 195 230, 192 216, 190 202 C 188 188, 190 172, 194 156
             C 199 138, 200 118, 196 98 C 192 78, 182 56, 165 40 C 155 30, 142 22, 128 20 Z"
        />

        {/* Atmospheric glow, strongest along forehead/nose/lips/chin/jaw -
            a blurred duplicate of just that segment, not the full outline. */}
        <path
          className="coach-ai-glow"
          d="M 66 42 C 58 50, 54 58, 50 68 C 46 82, 40 92, 28 106 C 22 112, 22 116, 28 121
             C 33 126, 36 130, 33 136 C 31 140, 36 143, 38 148 C 40 152, 36 155, 33 160
             C 30 165, 34 170, 37 176 C 39 181, 34 186, 30 193 C 27 200, 32 210, 42 218"
        />

        {/* Front contour - the crisp, clearly-visible edge of the face. */}
        <path
          className="coach-ai-front"
          d="M 128 20 C 100 20, 82 26, 66 42 C 58 50, 54 58, 50 68 C 46 82, 40 92, 28 106
             C 22 112, 22 116, 28 121 C 33 126, 36 130, 33 136 C 31 140, 36 143, 38 148
             C 40 152, 36 155, 33 160 C 30 165, 34 170, 37 176 C 39 181, 34 186, 30 193
             C 27 200, 32 210, 42 218 C 54 226, 70 230, 86 232 C 100 233, 112 230, 120 224
             C 128 232, 134 244, 136 258 C 138 266, 130 274, 108 279"
        />

        {/* Back of skull, ear, neck, shoulder - dimmer, fading into darkness. */}
        <path
          className="coach-ai-back"
          d="M 128 20 C 155 30, 168 46, 178 66 C 188 86, 192 108, 190 130 C 188 152, 182 172, 176 190
             C 172 202, 170 214, 172 226 C 174 240, 182 254, 196 266 C 204 273, 212 278, 222 280"
        />
        <path
          className="coach-ai-ear"
          d="M 168 158 C 182 152, 190 164, 185 178 C 182 187, 172 187, 168 178 C 165 171, 165 163, 168 158 Z"
        />

        {/* Neural network, clipped to the head silhouette so it never spills
            past the anatomical outline - densest around the skull, thinning
            toward jaw/ear/neck with several dead-end branches fading into
            darkness. A pure branching tree (see LINKS/NODES above) with
            gently curved connections - no closed loops, so nothing can read
            as a triangle/polygon no matter how the arcs bow. */}
        <g clipPath="url(#coachAiHeadClip)">
          <g className="coach-ai-link">
            {LINKS.map((link) => {
              const d = curvedPath(NODES[link.from].pos, NODES[link.to].pos, link.bow)
              return <path key={`${link.from}-${link.to}`} d={d} opacity={link.opacity} />
            })}
            {/* The travelling signal rides the exact same curve as the
                n5-n6 connection (computed from the identical NODES/bow
                inputs) rather than a separate straight overlay - it visually
                belongs to the path it travels along. */}
            <path
              className="coach-ai-signal"
              d={curvedPath(NODES.n5.pos, NODES.n6.pos, LINKS.find((l) => l.id === 'signal').bow)}
            />
          </g>
          <g>
            {Object.values(NODES).map(({ pos: [cx, cy], r, opacity, delay, hero }) => (
              <Node key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} opacity={opacity} delay={delay} hero={hero} />
            ))}
          </g>
        </g>
      </g>

      {/* Particle field - unclipped, sparse, drifts very slowly. Concentrated
          near the head and thinning toward the panel edges. */}
      <g>
        <Particle cx={35} cy={40} r={0.8} opacity={0.5} delay="0s" />
        <Particle cx={200} cy={30} r={0.6} opacity={0.35} delay="2s" />
        <Particle cx={20} cy={90} r={0.7} opacity={0.4} delay="4s" />
        <Particle cx={210} cy={70} r={0.9} opacity={0.5} delay="1s" />
        <Particle cx={15} cy={150} r={0.6} opacity={0.3} delay="3s" />
        <Particle cx={215} cy={130} r={0.7} opacity={0.4} delay="5s" />
        <Particle cx={45} cy={15} r={0.5} opacity={0.3} delay="2.5s" />
        <Particle cx={180} cy={10} r={0.6} opacity={0.35} delay="0.5s" />
        <Particle cx={10} cy={200} r={0.5} opacity={0.25} delay="3.5s" />
        <Particle cx={225} cy={190} r={0.6} opacity={0.3} delay="1.5s" />
        <Particle cx={60} cy={250} r={0.5} opacity={0.25} delay="4.5s" />
        <Particle cx={190} cy={240} r={0.6} opacity={0.3} delay="5.5s" />
      </g>
    </svg>
  )
}
