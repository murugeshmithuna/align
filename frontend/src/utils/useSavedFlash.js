import { useEffect, useRef, useState } from 'react'

// Shared "Saved" confirmation pattern for every save-type button in the app -
// call flashSaved() right after a save request succeeds; the button's label
// swaps to a confirmation state for a couple of seconds, then reverts, so a
// "Save X" button reads as "Saved ✓" rather than either silently doing
// nothing or immediately snapping back to its idle label.
export function useSavedFlash(durationMs = 2200) {
  const [saved, setSaved] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  function flashSaved() {
    setSaved(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setSaved(false), durationMs)
  }

  return [saved, flashSaved]
}
