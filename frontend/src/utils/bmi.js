// Standard WHO BMI bands - shared by NutritionCalculator.jsx's BMI card and
// its range-bar marker so the number and the visual position never disagree.
export const BMI_BANDS = [
  { max: 18.5, label: 'Underweight', color: '#38bdf8' },
  { max: 25, label: 'Normal', color: '#10b981' },
  { max: 30, label: 'Overweight', color: '#f59e0b' },
  { max: Infinity, label: 'Obese', color: '#ef4444' },
]

export function calculateBmi(heightCm, weightKg) {
  // Plain truthiness checks let a negative number through (e.g. a careless
  // -100 kg entry, still "truthy" in JS) and produced a nonsensical "-0.0
  // Underweight" reading instead of hiding the card - guard on sign, not
  // just presence.
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null
  const heightM = heightCm / 100
  return weightKg / (heightM * heightM)
}

export function bmiBand(bmi) {
  return BMI_BANDS.find((band) => bmi < band.max) ?? BMI_BANDS[BMI_BANDS.length - 1]
}
