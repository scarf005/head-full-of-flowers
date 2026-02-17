export interface RenderPathProfileSnapshot {
  frames: number
  pickupVisibleFrames: number
  pickupHiddenFrames: number
  obstacleFxWebGlFrames: number
  trailWebGlFrames: number
  mergedCompositeFrames: number
  splitCompositeFrames: number
}

export interface RenderPathWindowRateSnapshot {
  sampleFrames: number
  mergedPercent: number
  splitPercent: number
  pickupVisiblePercent: number
  pickupHiddenPercent: number
}

const toPercent = (value: number, total: number) => {
  if (total <= 0) {
    return 0
  }

  return (100 * Math.max(0, value)) / total
}

export const sameRenderPathProfileSnapshot = (
  left: RenderPathProfileSnapshot,
  right: RenderPathProfileSnapshot,
) => {
  return (
    left.frames === right.frames &&
    left.pickupVisibleFrames === right.pickupVisibleFrames &&
    left.pickupHiddenFrames === right.pickupHiddenFrames &&
    left.obstacleFxWebGlFrames === right.obstacleFxWebGlFrames &&
    left.trailWebGlFrames === right.trailWebGlFrames &&
    left.mergedCompositeFrames === right.mergedCompositeFrames &&
    left.splitCompositeFrames === right.splitCompositeFrames
  )
}

export const cloneRenderPathProfileSnapshot = (
  source: RenderPathProfileSnapshot,
): RenderPathProfileSnapshot => {
  return {
    frames: source.frames,
    pickupVisibleFrames: source.pickupVisibleFrames,
    pickupHiddenFrames: source.pickupHiddenFrames,
    obstacleFxWebGlFrames: source.obstacleFxWebGlFrames,
    trailWebGlFrames: source.trailWebGlFrames,
    mergedCompositeFrames: source.mergedCompositeFrames,
    splitCompositeFrames: source.splitCompositeFrames,
  }
}

export const computeRenderPathWindowRateSnapshot = (
  history: RenderPathProfileSnapshot[],
  current: RenderPathProfileSnapshot,
  windowFrames = 300,
): RenderPathWindowRateSnapshot => {
  const last = history[history.length - 1]
  if (!last || current.frames < last.frames) {
    history.length = 0
  }

  if (history.length === 0 || history[history.length - 1].frames !== current.frames) {
    history.push(cloneRenderPathProfileSnapshot(current))
  }

  const minFrame = current.frames - Math.max(1, windowFrames)
  while (history.length > 1 && history[1].frames <= minFrame) {
    history.shift()
  }

  const start = history[0] ?? current
  const sampleFrames = Math.max(0, current.frames - start.frames)

  return {
    sampleFrames,
    mergedPercent: toPercent(current.mergedCompositeFrames - start.mergedCompositeFrames, sampleFrames),
    splitPercent: toPercent(current.splitCompositeFrames - start.splitCompositeFrames, sampleFrames),
    pickupVisiblePercent: toPercent(current.pickupVisibleFrames - start.pickupVisibleFrames, sampleFrames),
    pickupHiddenPercent: toPercent(current.pickupHiddenFrames - start.pickupHiddenFrames, sampleFrames),
  }
}
