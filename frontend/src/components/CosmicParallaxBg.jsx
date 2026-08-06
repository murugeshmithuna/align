import { useEffect, useState, Fragment } from 'react'

// Reusable decorative "deep space" backdrop: layered parallax star fields
// plus a glowing planet horizon, tinted with the app's forest/coral brand
// palette (see index.css for the star/#horizon/#earth/#title/#subtitle rules).
// Intended to sit behind page content as an absolutely-positioned, pointer-events-none layer.
export default function CosmicParallaxBg({ head, text, loop = true, className = '' }) {
  const [smallStars, setSmallStars] = useState('')
  const [mediumStars, setMediumStars] = useState('')
  const [bigStars, setBigStars] = useState('')

  // Both optional - the giant low-opacity duplicate of the real foreground
  // heading read as a fake-looking "shadow" behind it rather than a subtle
  // watermark, so callers that don't want that (e.g. Landing.jsx, which
  // already renders its own crisp heading on top) can just omit these.
  const textParts = text ? text.split(',').map((part) => part.trim()) : []

  function generateStarBoxShadow(count) {
    const shadows = []
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 2000)
      const y = Math.floor(Math.random() * 2000)
      shadows.push(`${x}px ${y}px #FFF`)
    }
    return shadows.join(', ')
  }

  useEffect(() => {
    setSmallStars(generateStarBoxShadow(700))
    setMediumStars(generateStarBoxShadow(200))
    setBigStars(generateStarBoxShadow(100))

    document.documentElement.style.setProperty('--animation-iteration', loop ? 'infinite' : '1')
  }, [loop])

  return (
    <div className={`cosmic-parallax-container absolute inset-0 pointer-events-none z-0 overflow-hidden ${className}`}>
      <div id="stars" style={{ boxShadow: smallStars }} className="cosmic-stars"></div>
      <div id="stars2" style={{ boxShadow: mediumStars }} className="cosmic-stars-medium"></div>
      <div id="stars3" style={{ boxShadow: bigStars }} className="cosmic-stars-large"></div>
      <div id="horizon">
        <div className="glow"></div>
      </div>
      <div id="earth"></div>
      {head && (
        <div id="title" className="text-white font-bold opacity-10 text-center select-none">
          {head.toUpperCase()}
        </div>
      )}
      {textParts.length > 0 && (
        <div id="subtitle" className="text-emerald-400 opacity-20 text-center select-none">
          {textParts.map((part, index) => (
            <Fragment key={index}>
              <span className={`subtitle-part-${index + 1}`}>{part.toUpperCase()}</span>
              {index < textParts.length - 1 && ' '}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
