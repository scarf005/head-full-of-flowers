import killConfirmUrl from "../assets/sfx/kill-confirm-493913-damnsatinist.mp3"
import itemAcquireUrl from "../assets/sfx/item-acquire-678385-deltacode.mp3"
import damageUrl from "../assets/sfx/damage-690623-guinamun.mp3"
import playerDeathUrl from "../assets/sfx/player-death-277322-angrycrazii.mp3"
import reloadUrl from "../assets/sfx/reload-276963-gfl7.mp3"

export class AudioDirector {
  private menuTrack: HTMLAudioElement
  private gameplayTrack: HTMLAudioElement
  private unlocked = false
  private musicVolume = 0.75
  private musicSuppressed = false

  private mode: "menu" | "gameplay" | "stopped" = "stopped"

  constructor(menuUrl: string, gameplayUrl: string) {
    this.menuTrack = new Audio(menuUrl)
    this.gameplayTrack = new Audio(gameplayUrl)

    this.menuTrack.loop = true
    this.gameplayTrack.loop = true
    this.menuTrack.preload = "auto"
    this.gameplayTrack.preload = "auto"
    this.applyVolume()
  }

  private applyVolume() {
    this.menuTrack.volume = Math.max(0, Math.min(1, 0.22 * this.musicVolume))
    this.gameplayTrack.volume = Math.max(0, Math.min(1, 0.3 * this.musicVolume))
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume))
    this.applyVolume()
  }

  prime() {
    this.unlocked = true
    this.menuTrack.load()
    this.gameplayTrack.load()
  }

  async tryAutoplayMenu() {
    if (this.mode === "menu") {
      return true
    }

    this.gameplayTrack.pause()
    this.gameplayTrack.currentTime = 0
    this.gameplayTrack.muted = true
    this.menuTrack.muted = false

    try {
      await this.menuTrack.play()
      this.unlocked = true
      this.mode = "menu"
      return true
    } catch {
      this.menuTrack.pause()
      this.menuTrack.currentTime = 0
      return false
    }
  }

  startMenu() {
    if (!this.unlocked || this.mode === "menu") {
      return
    }

    this.mode = "menu"
    this.gameplayTrack.pause()
    this.gameplayTrack.currentTime = 0
    this.gameplayTrack.muted = true
    this.menuTrack.muted = false
    if (this.musicSuppressed) {
      return
    }

    this.menuTrack.play()
      .catch(() => {})
  }

  startGameplay() {
    if (!this.unlocked || this.mode === "gameplay") {
      return
    }

    this.mode = "gameplay"
    this.menuTrack.pause()
    this.menuTrack.currentTime = 0
    this.menuTrack.muted = true
    this.gameplayTrack.muted = false
    if (this.musicSuppressed) {
      return
    }

    this.gameplayTrack.play()
      .catch(() => {})
  }

  stopAll() {
    this.menuTrack.pause()
    this.gameplayTrack.pause()
    this.menuTrack.currentTime = 0
    this.gameplayTrack.currentTime = 0
    this.menuTrack.muted = false
    this.gameplayTrack.muted = false
    this.musicSuppressed = false
    this.mode = "stopped"
  }

  pauseCurrentMusic() {
    this.musicSuppressed = true
    this.menuTrack.pause()
    this.gameplayTrack.pause()
  }

  resumeCurrentMusic() {
    if (!this.unlocked) {
      return
    }

    this.musicSuppressed = false

    if (this.mode === "menu") {
      this.menuTrack.play().catch(() => {})
      return
    }

    if (this.mode === "gameplay") {
      this.gameplayTrack.play().catch(() => {})
    }
  }
}

export class SfxSynth {
  private context: AudioContext | null = null
  private bus: DynamicsCompressorNode | null = null
  private masterGain: GainNode | null = null
  private impactGain: GainNode | null = null
  private effectsVolume = 0.9
  private killSamplePool = this.createSamplePool(killConfirmUrl, 6)
  private itemAcquireSamplePool = this.createSamplePool(itemAcquireUrl, 4)
  private damageSamplePool = this.createSamplePool(damageUrl, 8)
  private playerDeathSamplePool = this.createSamplePool(playerDeathUrl, 4)
  private reloadSamplePool = this.createSamplePool(reloadUrl, 4)
  private sampleStopTimers = new Map<HTMLAudioElement, number>()

  private ensureContext() {
    if (!this.context) {
      this.context = new AudioContext()
      this.bus = this.context.createDynamicsCompressor()
      this.bus.threshold.value = -30
      this.bus.knee.value = 18
      this.bus.ratio.value = 7
      this.bus.attack.value = 0.002
      this.bus.release.value = 0.14

      this.masterGain = this.context.createGain()
      this.masterGain.gain.value = this.effectsVolume

      this.impactGain = this.context.createGain()
      this.impactGain.gain.value = 0.9

      this.bus.connect(this.masterGain)
      this.impactGain.connect(this.bus)
      this.masterGain.connect(this.context.destination)
    }

    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {})
    }

    return this.context
  }

  setEffectsVolume(volume: number) {
    this.effectsVolume = Math.max(0, Math.min(1, volume))
    if (this.masterGain) {
      this.masterGain.gain.value = this.effectsVolume
    }
  }

  prime() {
    this.ensureContext()
    this.preloadSamples()
  }

  shoot() {
    const context = this.ensureContext()
    this.chirp(context, 920, 260, 0.05, "square", 0.12)
  }

  hit() {
    const context = this.ensureContext()
    this.chirp(context, 340, 100, 0.11, "triangle", 0.52, true)
  }

  characterDamage(targetIsPlayer: boolean) {
    this.playSample(this.damageSamplePool, targetIsPlayer ? 0.72 : 0.2)
  }

  die() {
    const context = this.ensureContext()
    this.chirp(context, 980, 280, 0.045, "square", 0.42)
    this.chirp(context, 420, 74, 0.2, "sawtooth", 0.86)
    this.chirp(context, 240, 44, 0.28, "triangle", 0.74, false, 0.018)
  }

  obstacleBreak() {
    const context = this.ensureContext()
    this.chirp(context, 220, 150, 0.05, "triangle", 0.18, true)
    this.chirp(context, 150, 110, 0.09, "sine", 0.14, true, 0.008)
  }

  playerKill() {
    this.playSample(this.killSamplePool, 0.8, 0.2)
  }

  itemAcquire() {
    this.playSample(this.itemAcquireSamplePool, 0.9)
  }

  playerDeath() {
    this.playSample(this.playerDeathSamplePool, 0.78)
  }

  reloadBegin() {
    this.playSample(this.reloadSamplePool, 0.74, 1.1, 1.5)
  }

  reloadEnd() {
    this.playSample(this.reloadSamplePool, 0.8, 2.168, 2.7)
  }

  explosion() {
    const context = this.ensureContext()
    this.chirp(context, 310, 36, 0.24, "sawtooth", 0.22)
  }

  private chirp(
    context: AudioContext,
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
    impact = false,
    delay = 0,
  ) {
    const now = context.currentTime
    const startTime = now + Math.max(0, delay)
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, startTime)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, to), startTime + duration)

    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(gainPeak, startTime + duration * 0.15)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    oscillator.connect(gain)
    const output = impact ? this.impactGain : (this.bus ?? this.masterGain)
    gain.connect(output ?? context.destination)

    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.01)
  }

  private createSamplePool(url: string, voices: number) {
    return Array.from({ length: voices }, () => {
      const sample = new Audio(url)
      sample.preload = "auto"
      return sample
    })
  }

  private preloadSamples() {
    for (
      const sample of [
        ...this.killSamplePool,
        ...this.itemAcquireSamplePool,
        ...this.damageSamplePool,
        ...this.playerDeathSamplePool,
        ...this.reloadSamplePool,
      ]
    ) {
      sample.load()
    }
  }

  private playSample(pool: HTMLAudioElement[], baseVolume: number, startAt = 0, endAt = 0) {
    const sample = pool.find((voice) => voice.paused || voice.ended) ?? pool[0]
    const pendingStop = this.sampleStopTimers.get(sample)
    if (pendingStop !== undefined) {
      clearTimeout(pendingStop)
      this.sampleStopTimers.delete(sample)
    }

    sample.pause()
    sample.currentTime = 0
    if (startAt > 0) {
      try {
        sample.currentTime = startAt
      } catch {
        sample.currentTime = 0
      }
    }
    sample.volume = Math.max(0, Math.min(1, baseVolume * this.effectsVolume))
    sample.play()
      .then(() => {
        if (endAt <= startAt) {
          return
        }

        const stopDelay = Math.max(0, (endAt - startAt) * 1000)
        const stopTimer = globalThis.setTimeout(() => {
          sample.pause()
          this.sampleStopTimers.delete(sample)
        }, stopDelay)
        this.sampleStopTimers.set(sample, stopTimer)
      })
      .catch(() => {})
  }
}
