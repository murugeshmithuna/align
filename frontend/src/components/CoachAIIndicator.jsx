import { curvedPath } from './CoachAIVisual.jsx'

// A small "AI is present here" signal that reuses CoachAIVisual's exact
// visual language (the same curved-connection network + node/link CSS
// classes, so the pulse/travelling-signal animations and reduced-motion
// handling all just work) without duplicating the full head artwork -
// intended for compact spots like a Dashboard insight entry point, not as
// a second hero visual. Presentation only: no data, no side effects.
const NODES = [
  { pos: [14, 20], r: 1.6, opacity: 0.5 },
  { pos: [30, 12], r: 1.3, opacity: 0.4 },
  { pos: [42, 24], r: 2.4, opacity: 1, hero: true },
  { pos: [20, 36], r: 1.3, opacity: 0.42 },
  { pos: [36, 40], r: 1.1, opacity: 0.35 },
]

const LINKS = [
  { from: 0, to: 1, bow: -4 },
  { from: 1, to: 2, bow: 3 },
  { from: 0, to: 3, bow: 4 },
  { from: 2, to: 4, bow: -3 },
  { from: 3, to: 4, bow: 3 },
]

export default function CoachAIIndicator({ className = '' }) {
  return (
    <svg viewBox="0 0 56 52" className={`coach-ai-visual ${className}`} role="img" aria-label="AI coach indicator">
      <g className="coach-ai-link">
        {LINKS.map((link) => (
          <path key={`${link.from}-${link.to}`} d={curvedPath(NODES[link.from].pos, NODES[link.to].pos, link.bow)} />
        ))}
      </g>
      {NODES.map(({ pos: [cx, cy], r, opacity, hero }, i) => (
        <g key={i} opacity={opacity}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            className={hero ? 'coach-ai-node-dot coach-ai-node-hero' : 'coach-ai-node-dot'}
            style={{ '--pulse-delay': `${i * 0.6}s` }}
          />
        </g>
      ))}
    </svg>
  )
}
