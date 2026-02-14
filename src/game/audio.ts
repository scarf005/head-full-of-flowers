export class AudioDirector {
  private menuTrack: HTMLAudioElement
  private gameplayTrack: HTMLAudioElement
  private unlocked = false

  private mode: "menu" | "gameplay" | "stopped" = "stopped"

  constructor(menuUrl: string, gameplayUrl: string) {
    this.menuTrack = new Audio(menuUrl)
    this.gameplayTrack = new Audio(gameplayUrl)

    this.menuTrack.loop = true
    this.gameplayTrack.loop = true
    this.menuTrack.preload = "auto"
    this.gameplayTrack.preload = "auto"
    this.menuTrack.volume = 0.22
    this.gameplayTrack.volume = 0.3
  }

  prime() {
    this.unlocked = true
    this.menuTrack.load()
    this.gameplayTrack.load()
  }

  startMenu() {
    if (!this.unlocked || this.mode === "menu") {
      return
    }

    this.gameplayTrack.pause()
    this.gameplayTrack.currentTime = 0
    this.gameplayTrack.muted = true
    this.menuTrack.muted = false
    this.menuTrack.play().catch(() => {})
    this.mode = "menu"
  }

  startGameplay() {
    if (!this.unlocked || this.mode === "gameplay") {
      return
    }

    this.menuTrack.pause()
    this.menuTrack.currentTime = 0
    this.menuTrack.muted = true
    this.gameplayTrack.muted = false
    this.gameplayTrack.play().catch(() => {})
    this.mode = "gameplay"
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
      this.masterGain.gain.value = 0.9

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
    this.chirp(context, 360, 120, 0.09, "triangle", 0.78, true)
    this.chirp(context, 260, 52, 0.16, "sine", 0.68, true, 0.03)
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
    delay = 0
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
