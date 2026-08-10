// The "A" in ALIGN, drawn as a bold letterform whose crossbar is an EKG/
// heartbeat trace - same "pulse" visual language as the Landing hero's
// LiveSignalBg (a scrolling heartbeat line). The two diagonal legs stay
// plain straight strokes so the glyph still reads unmistakably as "A" at
// small sizes (e.g. the navbar); only the crossbar - already a horizontal
// element in the letterform, the natural place for a horizontal pulse
// trace - carries the pulse detail. `currentColor` so it always matches
// whatever text color it's dropped into (dark navbar text, light landing
// text, etc.) with zero prop plumbing.
function PulseA({ className, style }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 92 L50 8" />
      <path d="M50 8 L92 92" />
      <path d="M20 68 L34 68 L38 76 L42 60 L46 82 L50 34 L54 82 L58 60 L62 68 L80 68" />
    </svg>
  )
}

// Renders "ALIGN" with the custom pulse-A glyph standing in for the literal
// letter. `size` controls the SVG's height relative to the surrounding text
// (tune per call site - a navbar wordmark and a hero headline sit at very
// different font sizes and the glyph needs separate fine-tuning at each).
export default function AlignWordmark({ className = '', size = '1em', gap = '0.02em' }) {
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap ${className}`} style={{ gap }}>
      <PulseA className="inline-block shrink-0" style={{ height: size, width: size, transform: 'translateY(0.1em)' }} />
      LIGN
    </span>
  )
}
