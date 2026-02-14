export class AudioDirector {
  private menuTrack: HTMLAudioElement
  private gameplayTrack: HTMLAudioElement
  private unlocked = false

  constructor(menuUrl: string, gameplayUrl: string) {
    this.menuTrack = new Audio(menuUrl)
    this.gameplayTrack = new Audio(gameplayUrl)

    this.menuTrack.loop = true
    this.gameplayTrack.loop = true
    this.menuTrack.preload = "auto"
    this.gameplayTrack.preload = "auto"
    this.menuTrack.volume = 0.38
    this.gameplayTrack.volume = 0.45
  }

  prime() {
    this.unlocked = true
    this.menuTrack.play().then(() => {
      this.menuTrack.pause()
      this.menuTrack.currentTime = 0
    }).catch(() => {})
  }

  startMenu() {
    if (!this.unlocked) {
      return
    }

    this.gameplayTrack.pause()
    this.gameplayTrack.currentTime = 0
    this.menuTrack.play().catch(() => {})
  }

  startGameplay() {
    if (!this.unlocked) {
      return
    }

    this.menuTrack.pause()
    this.menuTrack.currentTime = 0
    this.gameplayTrack.play().catch(() => {})
  }

  stopAll() {
    this.menuTrack.pause()
    this.gameplayTrack.pause()
  }
}

export class SfxSynth {
  private context: AudioContext | null = null
  private bus: DynamicsCompressorNode | null = null
  private masterGain: GainNode | null = null

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
      this.masterGain.gain.value = 0.8
      this.bus.connect(this.masterGain)
      this.masterGain.connect(this.context.destination)
    }

    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {})
    }

    return this.context
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
    this.chirp(context, 260, 70, 0.1, "triangle", 0.16)
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
    gainPeak: number
  ) {
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, to), now + duration)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + duration * 0.15)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    oscillator.connect(gain)
    gain.connect(this.bus ?? this.masterGain ?? context.destination)

    oscillator.start(now)
    oscillator.stop(now + duration)
  }
}
