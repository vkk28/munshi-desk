import type { Scanner } from './scanner'
import { isCheckpoint } from './types'

const eventFor = (control: HTMLElement, type: string) =>
  new control.ownerDocument.defaultView!.Event(type, { bubbles: true, composed: true })

export class Filler {
  private flashes = new Map<HTMLElement, { timer: ReturnType<typeof setTimeout>; previous: string }>()
  private submitButtons = new Map<HTMLInputElement | HTMLButtonElement, boolean>()
  constructor(private readonly scanner: Scanner) {}

  read(id: string) {
    const target = this.scanner.target(id)
    if (!target) return ''
    const first = target.controls[0] as HTMLInputElement
    if (target.field.kind === 'radio' || (target.field.kind === 'checkbox' && target.field.options.length)) {
      return target.controls.flatMap((control, index) =>
        (control as HTMLInputElement).checked ? [target.field.options[index] || (control as HTMLInputElement).value] : [],
      ).join(', ')
    }
    if (target.field.kind === 'checkbox') return String(first.checked)
    if (target.field.kind === 'select') {
      const selected = (first as unknown as HTMLSelectElement).selectedOptions[0]
      return selected?.value ? selected.label : ''
    }
    return typeof first.value === 'string' ? first.value : first.getAttribute('data-value') || ''
  }

  checkpointComplete(id: string) {
    const input = this.scanner.target(id)?.controls[0] as HTMLInputElement | undefined
    return Boolean(this.read(id)) && (input?.validity?.valid ?? true)
  }

  write(id: string, value: string) {
    const target = this.scanner.target(id)
    if (!target || !target.field.writable || isCheckpoint(target.field) || target.field.manualOnly) return false
    const { field, controls } = target
    for (const [index, control] of controls.entries()) {
      const checked = field.kind === 'radio' || field.kind === 'checkbox'
      let actual: string | boolean = value
      if (checked) actual = field.options.length ? value.split(', ').includes(field.options[index]) : value === 'true'
      if (field.kind === 'select') {
        const option = [...(control as HTMLSelectElement).options].find(item => !item.disabled && item.label === value)
        actual = option?.value || ''
        if (value && !option) return false
      }
      if (checked && (control as HTMLInputElement).checked !== actual &&
          (field.kind === 'checkbox' || actual === true)) {
        control.click()
        this.flash(control)
        continue
      }
      const key = checked ? 'checked' : 'value'
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), key)?.set
      if (!setter) return false
      setter.call(control, actual)
      control.dispatchEvent(eventFor(control, 'input'))
      control.dispatchEvent(eventFor(control, 'change'))
      this.flash(control)
    }
    return this.read(id) === value || (field.kind === 'checkbox' && !value && this.read(id) === 'false')
  }

  setLocked(locked: boolean) {
    const controls = this.scanner.forms().flatMap(form => Array.from(form.elements)
      .filter((element): element is HTMLInputElement | HTMLButtonElement =>
        element.matches('button[type="submit"], button:not([type]), input[type="submit"], input[type="image"]')))
    for (const [button, baseline] of this.submitButtons) {
      if (!locked || !controls.includes(button)) {
        if (button.disabled !== baseline) button.disabled = baseline
        this.submitButtons.delete(button)
      }
    }
    if (!locked) return
    for (const button of controls) {
      if (!this.submitButtons.has(button)) this.submitButtons.set(button, button.disabled)
      if (!button.disabled) button.disabled = true
    }
  }

  intercept(allow: () => boolean, submitted: (event: SubmitEvent) => void) {
    const removers: (() => void)[] = []
    for (const form of this.scanner.forms()) {
      const handler = (event: SubmitEvent) => {
        if (!allow()) {
          event.preventDefault()
          event.stopImmediatePropagation()
        } else submitted(event)
      }
      form.addEventListener('submit', handler, true)
      removers.push(() => form.removeEventListener('submit', handler, true))
    }
    return () => removers.forEach(remove => remove())
  }

  dispose() {
    this.setLocked(false)
    for (const [control, flash] of this.flashes) {
      clearTimeout(flash.timer)
      control.style.outline = flash.previous
    }
    this.flashes.clear()
  }

  private flash(control: HTMLElement) {
    const pending = this.flashes.get(control)
    if (pending) clearTimeout(pending.timer)
    const previous = pending?.previous ?? control.style.outline
    control.style.outline = '2px solid #477deb'
    const timer = setTimeout(() => {
      control.style.outline = previous
      this.flashes.delete(control)
    }, 1000)
    this.flashes.set(control, { previous, timer })
  }
}
