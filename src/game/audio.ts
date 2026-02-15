export class AudioDirector {
  private menuTrack: HTMLAudioElement
  private gameplayTrack: HTMLAudioElement
  private unlocked = false
  private musicVolume = 0.75

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

    this.gameplayTrack.pause()
    this.gameplayTrack.currentTime = 0
    this.gameplayTrack.muted = true
    this.menuTrack.muted = false
    this.menuTrack.play()
      .then(() => {
        this.mode = "menu"
      })
      .catch(() => {})
  }

  startGameplay() {
    if (!this.unlocked || this.mode === "gameplay") {
      return
    }

    this.menuTrack.pause()
    this.menuTrack.currentTime = 0
    this.menuTrack.muted = true
    this.gameplayTrack.muted = false
    this.gameplayTrack.play()
      .then(() => {
        this.mode = "gameplay"
      })
      .catch(() => {})
  }

  stopAll() {
    this.menuTrack.pause()
    this.gameplayTrack.pause()
    this.menuTrack.currentTime = 0
    this.gameplayTrack.currentTime = 0
    this.menuTrack.muted = false
    this.gameplayTrack.muted = false
    this.mode = "stopped"
  }
}

export class SfxSynth {
  private context: AudioContext | null = null
  private bus: DynamicsCompressorNode | null = null
  private masterGain: GainNode | null = null
  private impactGain: GainNode | null = null
  private effectsVolume = 0.9

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
  }

  shoot() {
    const context = this.ensureContext()
    this.chirp(context, 920, 260, 0.05, "square", 0.12)
  }

  hit() {
    const context = this.ensureContext()
    this.chirp(context, 340, 100, 0.11, "triangle", 0.52, true)
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
    const context = this.ensureContext()
    this.chirp(context, 740, 1480, 0.075, "square", 0.44)
    this.chirp(context, 1480, 2220, 0.055, "triangle", 0.31, false, 0.024)
  }

  playerDeath() {
    const context = this.ensureContext()
    this.chirp(context, 520, 140, 0.1, "sawtooth", 0.64)
    this.chirp(context, 260, 60, 0.2, "triangle", 0.52, false, 0.016)
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
}
