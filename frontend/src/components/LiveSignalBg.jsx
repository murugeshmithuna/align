// Hero backdrop: a looping EKG-style signal line, standing in for "a coach
// that watches, listens, and adapts" - literal, on-brand motion instead of
// the previous sci-fi starfield/planet scene, which read as a game splash
// screen rather than a fitness product. Two identical <SignalWave> copies
// sit side by side inside a double-width track that CSS-animates from
// translateX(0) to translateX(-50%) - since both copies are pixel-identical,
// the loop point is seamless with no runtime randomness (unlike the old
// cosmic background's per-mount random star positions).
function SignalWave() {
  return (
    <svg
      className="w-[100vw] h-full shrink-0"
      viewBox="0 0 1200 160"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0,90 L160,90 L182,50 L204,130 L226,90 L500,90 L522,58 L541,122 L563,90 L1200,90"
        stroke="#ff7a4d"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path
        d="M0,110 L380,110 L400,80 L419,140 L440,110 L940,110 L960,84 L978,136 L999,110 L1200,110"
        stroke="#1c6e59"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
      />
    </svg>
  )
}

export default function LiveSignalBg({ className = '' }) {
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-forest-950 to-forest-900" />

      {/* Ambient warm glow - depth without a literal celestial body. */}
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[120%] aspect-square rounded-full bg-coral-500/10 blur-[110px]" />
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[60%] aspect-square rounded-full bg-forest-600/20 blur-[90px]" />

      {/* Kept low and out of the text column's way - a restrained accent
          under the hero copy, not a band fighting the paragraph for
          attention. */}
      <div className="absolute inset-x-0 bottom-[18%] h-16 signal-track flex">
        <SignalWave />
        <SignalWave />
      </div>

      {/* Scrim so body copy stays legible regardless of what's moving behind it. */}
      <div className="absolute inset-0 bg-gradient-to-b from-forest-950/10 via-transparent to-forest-950/70" />
    </div>
  )
}
