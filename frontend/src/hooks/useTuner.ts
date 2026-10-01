import { useCallback, useEffect, useRef, useState } from 'react'

type TunerState = { running: boolean; frequency: number | null; level: number; error: string | null }
type SafariWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }

function yin(buffer: Float32Array, sampleRate: number) {
  const minTau = Math.max(2, Math.floor(sampleRate / 500))
  const maxTau = Math.min(Math.floor(sampleRate / 55), Math.floor(buffer.length / 2) - 1)
  if (maxTau <= minTau) return null
  const differences = new Float32Array(maxTau + 1)
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < buffer.length - maxTau; i++) { const delta = buffer[i] - buffer[i + tau]; sum += delta * delta }
    differences[tau] = sum
  }
  const cmndf = new Float32Array(maxTau + 1)
  let runningSum = 0
  for (let tau = 1; tau <= maxTau; tau++) { runningSum += differences[tau]; cmndf[tau] = runningSum ? differences[tau] * tau / runningSum : 1 }
  let tau = -1
  for (let candidate = minTau; candidate <= maxTau; candidate++) {
    if (cmndf[candidate] < 0.14) { while (candidate + 1 <= maxTau && cmndf[candidate + 1] < cmndf[candidate]) candidate++; tau = candidate; break }
  }
  if (tau < 0) return null
  const betterTau = tau > 1 && tau < maxTau ? tau + (cmndf[tau - 1] - cmndf[tau + 1]) / (2 * (cmndf[tau - 1] - 2 * cmndf[tau] + cmndf[tau + 1])) : tau
  const frequency = sampleRate / betterTau
  const confidence = 1 - cmndf[tau]
  if (!Number.isFinite(frequency) || confidence < 0.78 || frequency < 55 || frequency > 500) return null
  // A strong subharmonic match helps avoid locking to a guitar's second harmonic.
  if (tau * 2 <= maxTau && cmndf[tau * 2] < cmndf[tau] * 1.18) { const corrected = sampleRate / (betterTau * 2); if (corrected >= 55) return corrected }
  return frequency
}
function rms(buffer: Float32Array) { let sum = 0; for (const sample of buffer) sum += sample * sample; return Math.sqrt(sum / buffer.length) }

export function useTuner() {
  const [state, setState] = useState<TunerState>({ running: false, frequency: null, level: 0, error: null })
  const audioRef = useRef<{ context: AudioContext; stream: MediaStream; analyser: AnalyserNode; frame: number } | null>(null)
  const historyRef = useRef<number[]>([])
  const stop = useCallback(async () => {
    const audio = audioRef.current
    audioRef.current = null
    if (audio) { cancelAnimationFrame(audio.frame); audio.stream.getTracks().forEach(track => track.stop()); await audio.context.close() }
    historyRef.current = []
    setState({ running: false, frequency: null, level: 0, error: null })
  }, [])
  const start = useCallback(async () => {
    if (audioRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) { setState(current => ({ ...current, error: 'このブラウザではマイク入力を利用できません。HTTPS接続を確認してください。' })); return }
    let context: AudioContext | null = null
    try {
      // Construct and resume inside the button's user gesture before the permission prompt.
      const AudioContextConstructor = window.AudioContext ?? (window as SafariWindow).webkitAudioContext
      if (!AudioContextConstructor) throw new Error('AudioContext is not supported')
      context = new AudioContextConstructor()
      await context.resume()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } })
      const activeContext = context
      if (!activeContext) throw new Error('AudioContext was not created')
      const analyser = activeContext.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0
      activeContext.createMediaStreamSource(stream).connect(analyser)
      const buffer = new Float32Array(analyser.fftSize)
      const audio = { context: activeContext, stream, analyser, frame: 0 }
      let lastProcess = 0
      let lastDetected: number | null = null
      audioRef.current = audio
      setState({ running: true, frequency: null, level: 0, error: null })
      const tick = () => {
        if (audioRef.current !== audio) return
        analyser.getFloatTimeDomainData(buffer)
        const level = rms(buffer)
        if (performance.now() - lastProcess >= 50) {
          lastProcess = performance.now()
          let detected = level > 0.008 ? yin(buffer, activeContext.sampleRate) : null
          if (detected) { const history = [...historyRef.current, detected].slice(-5); historyRef.current = history; const sorted = [...history].sort((a, b) => a - b); detected = sorted[Math.floor(sorted.length / 2)] }
          else if (level < 0.004) historyRef.current = []
          lastDetected = detected
        }
        setState(current => ({ ...current, frequency: lastDetected, level }))
        audio.frame = requestAnimationFrame(tick)
      }
      audio.frame = requestAnimationFrame(tick)
    } catch (error) {
      if (context) await context.close().catch(() => undefined)
      const message = error instanceof DOMException && error.name === 'NotAllowedError' ? 'マイクの使用が許可されていません。ブラウザの設定からマイクを許可してください。' : 'マイクを開始できませんでした。HTTPS接続とデバイス設定を確認してください。'
      setState({ running: false, frequency: null, level: 0, error: message })
    }
  }, [])
  useEffect(() => () => { void stop() }, [stop])
  return { ...state, start, stop }
}
