import { DeskController, type Speaker } from '@munshi/engine'
import { portName, type PageMessage, type PanelMessage } from './protocol'

const context = globalThis as typeof globalThis & { munshiInstalled?: boolean }

if (!context.munshiInstalled) {
  context.munshiInstalled = true
  let closeCurrent: (() => void) | undefined

  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== portName || port.sender?.id !== chrome.runtime.id) return
    closeCurrent?.()
    let connected = true
    let active: { id: number; resolve: (success: boolean) => void; onLine?: (line: string) => void } | undefined
    let sequence = 0
    const send = (message: PageMessage) => { if (connected) port.postMessage(message) }
    const speaker: Speaker = {
      get muted() { return Boolean(active) },
      cancel() {
        active?.resolve(false)
        active = undefined
        send({ type: 'cancel' })
      },
      speak(lines, locale, onLine) {
        this.cancel()
        return new Promise<boolean>(resolve => {
          active = { id: ++sequence, resolve, onLine }
          send({ type: 'speak', id: active.id, lines, locale })
        })
      },
    }
    const controller = new DeskController(document, {
      speaker, primaryOnly: true, onChange: value => send({ type: 'view', value }), onSubmit: () => send({ type: 'submitted' }),
    })
    closeCurrent = () => {
      if (!connected) return
      connected = false
      controller.dispose()
      port.disconnect()
    }
    port.onDisconnect.addListener(closeCurrent)
    port.onMessage.addListener((message: PanelMessage) => {
      switch (message.type) {
        case 'utterance': controller.ingest(message.value); break
        case 'language': controller.setLanguage(message.value); break
        case 'start': controller.start(); break
        case 'ask': controller.askNextQuestion(); break
        case 'dismiss-question': controller.dismissInterview(); break
        case 'read': void controller.verify(); break
        case 'confirm': controller.confirm(); break
        case 'acknowledge-readback': controller.acknowledgeReadback(); break
        case 'undo': controller.undo(); break
        case 'resume': controller.resume(); break
        case 'line': if (active?.id === message.id) active.onLine?.(message.text); break
        case 'spoken':
          if (active?.id === message.id) {
            active.resolve(message.success)
            active = undefined
          }
          break
      }
    })
  })
}
