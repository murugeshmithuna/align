// A thin, understated circular ring with one small glowing point traveling
// slowly around its circumference - meant to read as quiet AI/data
// monitoring (continuous tracking, adaptive intelligence), not a loading
// spinner. Deliberately minimal: no particles, no HUD tick marks, nothing
// else animates. Uses only this app's existing accent token (see
// .orbital-ring-dot in index.css, which reads var(--color-coral-500)) -
// no new color introduced. Purely decorative, so hidden from screen readers.
export default function OrbitalRing({ className = '' }) {
  return (
    <div className={`orbital-ring-track ${className}`} aria-hidden="true">
      <div className="orbital-ring-spin">
        <span className="orbital-ring-dot" />
      </div>
    </div>
  )
}
