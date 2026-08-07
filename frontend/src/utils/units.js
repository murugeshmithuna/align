// height_cm/weight_kg are always stored in metric - these just convert for
// display when the user's preference is imperial. Shared between Profile.jsx
// (training profile height/weight) and NutritionCalculator.jsx (its own
// height/weight inputs, feeding the same underlying fields).
export const CM_PER_IN = 2.54
export const KG_PER_LB = 0.45359237

export function metricToDisplay(value, units, factor) {
  if (value == null || value === '') return ''
  // Round on both branches - metric passthrough previously returned the raw
  // float unrounded (e.g. a value converted from imperial and back could
  // display as "72.5747792000"), while the imperial branch already rounded.
  return Number((units === 'imperial' ? value / factor : value).toFixed(1))
}

export function displayToMetric(value, units, factor) {
  if (value === '' || value == null) return null
  return units === 'imperial' ? Number(value) * factor : Number(value)
}

// Height specifically, in imperial, reads far more naturally as "5'4"" than
// a bare decimal inches figure - these two only apply to the height field
// (weight has no equivalent natural compound format, so it stays a plain
// decimal lb via metricToDisplay/displayToMetric above).
export function cmToFeetInchesString(cm) {
  if (cm == null || cm === '') return ''
  const totalInches = cm / CM_PER_IN
  let feet = Math.floor(totalInches / 12)
  let inches = Math.round(totalInches - feet * 12)
  if (inches === 12) {
    feet += 1
    inches = 0
  }
  return `${feet}'${inches}"`
}

// Height-specific display/parse pair - metric stays a plain cm number
// (via metricToDisplay/displayToMetric like weight), imperial switches to
// the feet'inches string format instead of decimal inches. Shared by
// Profile.jsx and NutritionCalculator.jsx so both pages behave identically.
export function heightMetricToDisplay(cm, units) {
  if (units === 'imperial') return cmToFeetInchesString(cm)
  return cm == null || cm === '' ? '' : Number(cm.toFixed(1))
}

export function heightDisplayToMetric(display, units) {
  return units === 'imperial' ? feetInchesStringToCm(display) : display === '' || display == null ? null : Number(display)
}

export function feetInchesStringToCm(input) {
  if (input == null || input === '') return null
  const str = String(input).trim()

  // "5'4"", "5'4", "5' 4"
  const tickMark = str.match(/^(\d+)\s*'\s*(\d+(?:\.\d+)?)?\s*"?\s*$/)
  if (tickMark) {
    const feet = Number(tickMark[1])
    const inches = tickMark[2] ? Number(tickMark[2]) : 0
    return (feet * 12 + inches) * CM_PER_IN
  }

  // "5ft 4in", "5 ft", "5ft4in"
  const ftIn = str.match(/^(\d+)\s*ft\.?\s*(\d+(?:\.\d+)?)?\s*(?:in\.?)?\s*$/i)
  if (ftIn) {
    const feet = Number(ftIn[1])
    const inches = ftIn[2] ? Number(ftIn[2]) : 0
    return (feet * 12 + inches) * CM_PER_IN
  }

  // Plain number - treated as total inches, same as before this format was added.
  const plain = Number(str)
  return Number.isNaN(plain) ? null : plain * CM_PER_IN
}
