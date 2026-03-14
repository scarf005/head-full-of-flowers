import { clamp } from "../utils.ts"

const MIN_CHROMATIC_ABERRATION_SHAKE = 0.14
const MAX_CHROMATIC_ABERRATION_PX = 28

export const stepChromaticAberrationShake = (
  displayedShake: number,
  targetShake: number,
  dt: number,
  impactFeelLevel: number,
) => {
  const normalizedImpactFeel = clamp(impactFeelLevel || 1, 1, 2)
  const feelDecayScale = 1 + (normalizedImpactFeel - 1) * 2
  const nextTargetShake = Math.max(0, targetShake)

  if (nextTargetShake >= displayedShake) {
    return nextTargetShake
  }

  return Math.max(nextTargetShake, displayedShake - dt * 2.2 * feelDecayScale)
}

export const screenShakeChromaticAberrationPx = (cameraShake: number) => {
  const gatedShake = clamp(cameraShake - MIN_CHROMATIC_ABERRATION_SHAKE, 0, 3.6)
  if (gatedShake <= 0.0001) {
    return 0
  }

  return clamp(Math.pow(gatedShake, 1.16) * 9.6, 0, MAX_CHROMATIC_ABERRATION_PX)
}

export const screenShakeChromaticAberrationAlpha = (shiftPx: number) => {
  if (shiftPx <= 0.0001) {
    return 0
  }

  return clamp(0.42 + (shiftPx / MAX_CHROMATIC_ABERRATION_PX) * 0.58, 0, 1)
}
