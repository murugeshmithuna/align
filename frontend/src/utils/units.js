// height_cm/weight_kg are always stored in metric - these just convert for
// display when the user's preference is imperial. Shared between Profile.jsx
// (training profile height/weight) and NutritionCalculator.jsx (its own
// height/weight inputs, feeding the same underlying fields).
export const CM_PER_IN = 2.54
export const KG_PER_LB = 0.45359237

export function metricToDisplay(value, units, factor) {
  if (value == null || value === '') return ''
  return units === 'imperial' ? Number((value / factor).toFixed(1)) : value
}

export function displayToMetric(value, units, factor) {
  if (value === '' || value == null) return null
  return units === 'imperial' ? Number(value) * factor : Number(value)
}
