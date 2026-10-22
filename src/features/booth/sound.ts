/**
 * Countdown beeps and a shutter sound, synthesized with Web Audio (no audio files).
 * iOS only lets audio play after a user gesture, so call unlockAudio() from a tap first.
 */

let ctx: AudioContext | null = null

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext }

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext
      if (!AudioCtor) return
      ctx = new AudioCtor()
    }
    if (ctx.state === "suspended") void ctx.resume()
    // A silent buffer played inside the gesture fully unlocks output on iOS.
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start()
  } catch {
    // Sound is optional.
  }
}

function ready(): AudioContext | null {
  if (!ctx || ctx.state !== "running") return null
  return ctx
}

export function playTick(final = false): void {
  const audio = ready()
  if (!audio) return
  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = "sine"
  osc.frequency.value = final ? 1320 : 880
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
  osc.connect(gain).connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

export function playShutter(): void {
  const audio = ready()
  if (!audio) return
  const now = audio.currentTime
  const length = Math.floor(audio.sampleRate * 0.09)
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1

  // Two filtered noise clicks: the shutter opening and closing.
  for (const [offset, level] of [
    [0, 0.6],
    [0.07, 0.4],
  ] as const) {
    const source = audio.createBufferSource()
    source.buffer = buffer
    const filter = audio.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = 2400
    filter.Q.value = 0.8
    const gain = audio.createGain()
    const t = now + offset
    gain.gain.setValueAtTime(level, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    source.connect(filter).connect(gain).connect(audio.destination)
    source.start(t)
    source.stop(t + 0.09)
  }
}
