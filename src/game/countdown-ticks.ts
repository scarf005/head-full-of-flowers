interface CountdownTickStage {
  start: number
  end: number
  interval: number
}

const COUNTDOWN_TICK_STAGES: CountdownTickStage[] = [
  { start: 60, end: 30, interval: 1 },
  { start: 30, end: 20, interval: 0.75 },
  { start: 20, end: 10, interval: 0.5 },
  { start: 10, end: 0, interval: 0.25 },
]

const countStageTicks = (from: number, to: number, stage: CountdownTickStage) => {
  let count = 0
  for (let tickTime = stage.start; tickTime > stage.end; tickTime -= stage.interval) {
    if (tickTime <= from && tickTime > to) {
      count += 1
    }
  }
  return count
}

export const countCountdownTicks = (fromTimeRemaining: number, toTimeRemaining: number) => {
  if (toTimeRemaining >= fromTimeRemaining || fromTimeRemaining <= 0 || toTimeRemaining > 60) {
    return 0
  }

  return COUNTDOWN_TICK_STAGES.reduce(
    (count, stage) => count + countStageTicks(fromTimeRemaining, toTimeRemaining, stage),
    0,
  )
}
