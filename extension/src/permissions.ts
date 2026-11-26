document.getElementById('grant')?.addEventListener('click', async () => {
  const result = document.getElementById('result')!
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(track => track.stop())
    result.textContent = 'Microphone access granted. Return to the side panel.'
  } catch {
    result.textContent = 'Microphone access is unavailable. Check Chrome settings or type into the side panel.'
  }
})
