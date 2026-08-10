// Futuristic centerpiece for the landing hero: a pulsing glow core with two
// counter-rotating segmented rings, pure CSS/SVG - no image asset, no 3D
// library. Same brand colors as everywhere else in the app (coral accent,
// forest-600 secondary) rather than introducing a new palette just for this
// one page.
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
          stroke="#ff7a4d"
          strokeWidth="1.5"
          strokeDasharray="3 11"
          strokeLinecap="round"
          opacity="0.55"
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
          stroke="#1c6e59"
          strokeWidth="2"
          strokeDasharray="26 10"
          strokeLinecap="round"
          opacity="0.65"
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
          stroke="#ff9a72"
          strokeWidth="1"
          strokeDasharray="1 7"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
    </div>
  )
}
