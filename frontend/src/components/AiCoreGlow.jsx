// Futuristic centerpiece for the landing hero: a pulsing glow core with two
// counter-rotating segmented rings, pure CSS/SVG - no image asset, no 3D
// library. One accent color (electric lime) at layered opacities rather
// than a second hue, matching the "single vibrant accent used everywhere"
// convention now used app-wide.
export default function AiCoreGlow({ className = '' }) {
  return (
    <div
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <div className="ai-core-pulse w-[280px] h-[280px] sm:w-[420px] sm:h-[420px] rounded-full bg-coral-500/25 blur-[70px]" />

      <svg
        className="ai-core-spin-slow absolute inset-0 w-[280px] h-[280px] sm:w-[420px] sm:h-[420px]"
        viewBox="0 0 200 200"
      >
        <circle
          cx="100"
          cy="100"
          r="92"
          fill="none"
          stroke="#c6ff3d"
          strokeWidth="1.5"
          strokeDasharray="3 11"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>

      <svg
        className="ai-core-spin-fast absolute inset-0 w-[280px] h-[280px] sm:w-[420px] sm:h-[420px]"
        viewBox="0 0 200 200"
      >
        <circle
          cx="100"
          cy="100"
          r="70"
          fill="none"
          stroke="#c6ff3d"
          strokeWidth="2"
          strokeDasharray="26 10"
          strokeLinecap="round"
          opacity="0.3"
        />
      </svg>

      <svg
        className="ai-core-spin-slow absolute inset-0 w-[280px] h-[280px] sm:w-[420px] sm:h-[420px]"
        viewBox="0 0 200 200"
        style={{ animationDirection: 'reverse', animationDuration: '14s' }}
      >
        <circle
          cx="100"
          cy="100"
          r="50"
          fill="none"
          stroke="#dfff6b"
          strokeWidth="1"
          strokeDasharray="1 7"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </div>
  )
}
