export async function startMeter(onLevel: (level: number) => void, signal: AbortSignal) {
  if (!navigator.mediaDevices?.getUserMedia || signal.aborted) return
  let stream: MediaStream | undefined
  let audio: AudioContext | undefined
  let frame = 0
  const cleanup = () => {
    cancelAnimationFrame(frame)
    stream?.getTracks().forEach(track => track.stop())
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {})
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (signal.aborted) return cleanup()
    signal.addEventListener('abort', cleanup, { once: true })
    audio = new AudioContext()
    const analyser = audio.createAnalyser()
    audio.createMediaStreamSource(stream).connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer)
      const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length)
      onLevel(Math.min(1, rms * 5))
      frame = requestAnimationFrame(tick)
    }
    tick()
  } catch { cleanup() }
}
