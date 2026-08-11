// ALIGN's signature AI visual - a clean, abstract left-facing head/neck/
// shoulders silhouette with a sparse neural network revealed inside it, a
// sparse particle field, and a soft atmospheric glow. Hand-authored SVG (not
// a procedural/random generator), simplified from an earlier anatomically-
// literal pass into an intentionally abstract, architectural/editorial
// treatment - recognizable as a head profile via one smooth continuous
// contour (a single gentle nose projection, no separate lip/chin detail, no
// eyes/brows/hair/skin texture) rather than a realistic portrait. Kept as
// one static, maintainable SVG tree per the "prefer a carefully constructed
// SVG over a canvas engine" guidance - nothing here needs per-frame
// recomputation.
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
function Node({ cx, cy, r, opacity, delay, hero = false, bright = false }) {
  const cls = hero
    ? 'coach-ai-node-dot coach-ai-node-hero'
    : bright
      ? 'coach-ai-node-dot coach-ai-node-bright'
      : 'coach-ai-node-dot'
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={r} className={cls} style={{ '--pulse-delay': delay }} />
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

// Node layout is a branching tree rooted at the hero node (n1) - every other
// node has exactly one parent, so the network can never close a loop no
// matter how the curves bow (nothing for the eye to resolve into a
// triangle/polygon or a dense constellation mesh). Deliberately sparse (14
// nodes, not dozens) with real gaps between them - concentrated around the
// hero/bright pair near the temple, thinning into a few short dead-end
// branches toward the jaw and neck, kept well clear of the front contour so
// it never reads as distorting the silhouette.
const NODES = {
  n1: { pos: [150, 58], r: 2.6, opacity: 1, delay: '0s', hero: true },
  n2: { pos: [120, 45], r: 1.6, opacity: 0.5, delay: '1.6s' },
  n3: { pos: [172, 46], r: 1.4, opacity: 0.4, delay: '0.7s' },
  n4: { pos: [128, 82], r: 1.7, opacity: 0.55, delay: '0.9s' },
  n5: { pos: [98, 58], r: 1.1, opacity: 0.32, delay: '2.4s' },
  n6: { pos: [182, 70], r: 2, opacity: 0.78, delay: '0.3s', bright: true },
  n7: { pos: [148, 96], r: 1.4, opacity: 0.42, delay: '1.1s' },
  n8: { pos: [92, 82], r: 1, opacity: 0.28, delay: '2.8s' },
  n9: { pos: [175, 120], r: 0.9, opacity: 0.24, delay: '0.5s' },
  n10: { pos: [112, 108], r: 1, opacity: 0.3, delay: '1.9s' },
  n11: { pos: [82, 102], r: 0.7, opacity: 0.18, delay: '3.3s' },
  n12: { pos: [138, 124], r: 0.9, opacity: 0.24, delay: '2.1s' },
  n13: { pos: [108, 132], r: 0.6, opacity: 0.15, delay: '0.6s' },
  n14: { pos: [128, 142], r: 0.5, opacity: 0.1, delay: '2.6s' },
}

// { from, to, bow, opacity } - opacity omitted defers to the CSS default (a
// mid-strength dim connection). Bow signs/magnitudes are hand-varied on
// purpose so no two nearby arcs share a curvature. One subtle travelling
// signal, riding the short hop between the network's two brightest points
// (n1-n6, hero to the secondary "bright" node).
const LINKS = [
  { from: 'n1', to: 'n2', bow: -7 },
  { from: 'n1', to: 'n3', bow: 6, id: 'signal' },
  { from: 'n1', to: 'n4', bow: -5 },
  { from: 'n2', to: 'n5', bow: 5, opacity: 0.26 },
  { from: 'n3', to: 'n6', bow: 6 },
  { from: 'n4', to: 'n7', bow: -5, opacity: 0.3 },
  { from: 'n4', to: 'n8', bow: 6, opacity: 0.24 },
  { from: 'n6', to: 'n9', bow: -5, opacity: 0.2 },
  { from: 'n7', to: 'n10', bow: 5, opacity: 0.24 },
  { from: 'n8', to: 'n11', bow: -4, opacity: 0.16 },
  { from: 'n7', to: 'n12', bow: 6, opacity: 0.2 },
  { from: 'n10', to: 'n13', bow: -4, opacity: 0.14 },
  { from: 'n12', to: 'n14', bow: 4, opacity: 0.12 },
]

export default function CoachAIVisual({ className = '' }) {
  return (
    <svg
      viewBox="0 0 240 280"
      className={`coach-ai-visual ${className}`}
      role="img"
      aria-label="Animated visualization of the AI coach as an abstract head profile with an internal neural network"
    >
      <defs>
        <radialGradient id="coachAiHeadGrad" cx="42%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#233047" stopOpacity="0.85" />
          <stop offset="65%" stopColor="#182337" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#111a2b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="coachAiFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="83%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </linearGradient>
        <mask id="coachAiBottomFade">
          <rect x="0" y="0" width="240" height="280" fill="url(#coachAiFade)" />
        </mask>
        {/* Simplified to one smooth continuous contour - a rounded forehead,
            a single gentle nose projection (no separate bridge/tip/base
            detail), no lip or chin sub-curves, a clean jaw, and a neck that
            widens into the shoulders. Intentionally abstract rather than
            anatomically literal - "recognizable as a head" without reading
            as a realistic portrait. */}
        <clipPath id="coachAiHeadClip">
          <path
            d="M 130 16 C 104 16, 84 26, 70 42 C 62 50, 56 58, 50 68
               C 44 78, 42 86, 48 92 C 54 98, 60 100, 64 106 C 70 114, 80 119, 92 120
               C 98 121, 102 121, 106 122 C 108 132, 108 144, 106 154
               C 104 168, 98 178, 88 186 C 78 193, 68 198, 60 204
               C 48 213, 38 226, 34 242 C 31 254, 30 267, 30 280
               L 210 280 C 208 260, 210 220, 204 186 C 198 173, 195 160, 194 145
               C 193 126, 196 106, 194 87 C 191 66, 181 47, 165 34 C 154 24, 141 17, 130 16 Z"
          />
        </clipPath>
      </defs>

      <g mask="url(#coachAiBottomFade)">
        {/* Full closed silhouette - crown, forehead, nose, jaw, neck front,
            shoulder front, (bottom, faded), shoulder back, neck back, skull
            back, closing at the crown. A soft radial fill only, no hard
            edge - the "mass" of the head is felt, not drawn solid. */}
        <path
          className="coach-ai-fill"
          d="M 130 16 C 104 16, 84 26, 70 42 C 62 50, 56 58, 50 68
             C 44 78, 42 86, 48 92 C 54 98, 60 100, 64 106 C 70 114, 80 119, 92 120
             C 98 121, 102 121, 106 122 C 108 132, 108 144, 106 154
             C 104 168, 98 178, 88 186 C 78 193, 68 198, 60 204
             C 48 213, 38 226, 34 242 C 31 254, 30 267, 30 280
             L 210 280 C 208 260, 210 220, 204 186 C 198 173, 195 160, 194 145
             C 193 126, 196 106, 194 87 C 191 66, 181 47, 165 34 C 154 24, 141 17, 130 16 Z"
        />

        {/* Atmospheric glow, strongest along the forehead/nose/jaw - a
            blurred duplicate of just that segment, not the full outline. */}
        <path
          className="coach-ai-glow"
          d="M 70 42 C 62 50, 56 58, 50 68 C 44 78, 42 86, 48 92 C 54 98, 60 100, 64 106
             C 70 114, 80 119, 92 120 C 98 121, 102 121, 106 122"
        />

        {/* Front contour - the crisp, clearly-visible edge, thin and
            restrained rather than a thick glowing tube. */}
        <path
          className="coach-ai-front"
          d="M 130 16 C 104 16, 84 26, 70 42 C 62 50, 56 58, 50 68
             C 44 78, 42 86, 48 92 C 54 98, 60 100, 64 106 C 70 114, 80 119, 92 120
             C 98 121, 102 121, 106 122 C 108 132, 108 144, 106 154
             C 104 168, 98 178, 88 186 C 78 193, 68 198, 60 204
             C 48 213, 38 226, 34 242"
        />

        {/* Back of skull, ear, neck, shoulder - dimmer, fading into darkness. */}
        <path
          className="coach-ai-back"
          d="M 130 16 C 141 17, 154 24, 165 34 C 181 47, 191 66, 194 87
             C 196 106, 193 126, 194 145 C 195 160, 198 173, 204 186
             C 210 220, 208 260, 208 278"
        />
        <path
          className="coach-ai-ear"
          d="M 155 92 C 168 86, 178 96, 174 110 C 171 120, 160 123, 155 113 C 151 105, 150 97, 155 92 Z"
        />

        {/* Neural network, clipped to the head silhouette so it never spills
            past the outline - sparse and organic (see LINKS/NODES above), a
            pure branching tree so nothing can read as a triangle/polygon or
            a dense wireframe mesh, and visually secondary to the silhouette
            rather than competing with it. */}
        <g clipPath="url(#coachAiHeadClip)">
          {/* Atmospheric "brain region" glow, distinct from the front-contour
              .coach-ai-glow above - a soft blurred wash sitting behind the
              network, centered on the hero/bright node cluster, clipped to
              the silhouette so it reads as internal luminosity rather than a
              halo escaping the head. Kept extremely restrained. */}
          <ellipse className="coach-ai-brain-glow" cx="153" cy="68" rx="48" ry="36" />
          <g className="coach-ai-link">
            {LINKS.map((link) => {
              const d = curvedPath(NODES[link.from].pos, NODES[link.to].pos, link.bow)
              return <path key={`${link.from}-${link.to}`} d={d} opacity={link.opacity} />
            })}
            {/* One subtle travelling signal - rides the exact curve of the
                n1-n3 connection (computed from the identical NODES/bow
                inputs) rather than a separate straight overlay. */}
            <path
              className="coach-ai-signal"
              d={curvedPath(NODES.n1.pos, NODES.n3.pos, LINKS.find((l) => l.id === 'signal').bow)}
            />
          </g>
          <g>
            {Object.values(NODES).map(({ pos: [cx, cy], r, opacity, delay, hero, bright }) => (
              <Node
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={r}
                opacity={opacity}
                delay={delay}
                hero={hero}
                bright={bright}
              />
            ))}
          </g>
        </g>
      </g>

      {/* Particle field - unclipped, sparse, drifts very slowly. Deliberately
          irregular (no mirrored pairs, no even spacing/grid) so it reads as
          ambient drift rather than a generated ring; a couple sit close in
          near the forehead/hero-node glow as small "sparks" of activity,
          the rest thin out toward the panel edges. */}
      <g>
        <Particle cx={30} cy={35} r={0.9} opacity={0.55} delay="0s" />
        <Particle cx={205} cy={22} r={0.5} opacity={0.3} delay="2.2s" />
        <Particle cx={14} cy={78} r={0.7} opacity={0.4} delay="4.1s" />
        <Particle cx={218} cy={98} r={0.8} opacity={0.45} delay="1.3s" />
        <Particle cx={7} cy={143} r={0.55} opacity={0.28} delay="3.4s" />
        <Particle cx={224} cy={158} r={0.65} opacity={0.35} delay="0.7s" />
        <Particle cx={49} cy={11} r={0.45} opacity={0.28} delay="2.8s" />
        <Particle cx={168} cy={6} r={0.6} opacity={0.32} delay="1.8s" />
        <Particle cx={4} cy={198} r={0.5} opacity={0.22} delay="3.9s" />
        <Particle cx={231} cy={178} r={0.55} opacity={0.28} delay="0.4s" />
        <Particle cx={63} cy={248} r={0.45} opacity={0.2} delay="4.6s" />
        <Particle cx={183} cy={258} r={0.55} opacity={0.25} delay="2.1s" />
        <Particle cx={58} cy={58} r={0.35} opacity={0.5} delay="1.1s" />
        <Particle cx={178} cy={88} r={0.3} opacity={0.45} delay="3s" />
      </g>
    </svg>
  )
}
