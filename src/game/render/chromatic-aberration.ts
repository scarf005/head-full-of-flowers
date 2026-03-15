import { clamp } from "../utils.ts"

const MIN_CHROMATIC_ABERRATION_SHAKE = 0.14
const MAX_CHROMATIC_ABERRATION_PX = 28
const MAX_CHROMATIC_ABERRATION_SHAKE = 0.55
const CHROMATIC_ABERRATION_FADE_PER_SECOND = 2.2
const CHROMATIC_ABERRATION_SHIFT_SCALE = 0.5

export const stepChromaticAberrationShake = (
  displayedShake: number,
  targetShake: number,
  dt: number,
  impactFeelLevel: number,
) => {
  const normalizedImpactFeel = clamp(impactFeelLevel || 1, 1, 2)
  const feelDecayScale = 1 + (normalizedImpactFeel - 1) * 2
  const nextTargetShake = clamp(targetShake, 0, MAX_CHROMATIC_ABERRATION_SHAKE)

  if (nextTargetShake >= displayedShake) {
    return nextTargetShake
  }

  return Math.max(nextTargetShake, displayedShake - dt * CHROMATIC_ABERRATION_FADE_PER_SECOND * feelDecayScale)
}

export const screenShakeChromaticAberrationPx = (cameraShake: number) => {
  const gatedShake = clamp(cameraShake - MIN_CHROMATIC_ABERRATION_SHAKE, 0, 3.6)
  if (gatedShake <= 0.0001) {
    return 0
  }

  return clamp(Math.pow(gatedShake, 1.16) * 9.6 * CHROMATIC_ABERRATION_SHIFT_SCALE, 0, MAX_CHROMATIC_ABERRATION_PX)
}

export const screenShakeChromaticAberrationAlpha = (shiftPx: number) => {
  if (shiftPx <= 0.0001) {
    return 0
  }

  return clamp(0.42 + (shiftPx / MAX_CHROMATIC_ABERRATION_PX) * 0.58, 0, 1)
}
