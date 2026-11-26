import { identify } from './semantics'
import type { DateFormat, Field, Kind, Schema } from './types'

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement
export interface Target { field: Field; controls: Control[]; form: HTMLFormElement | null }
const selector = 'input, textarea, select, [role="combobox"], [role="textbox"], [data-munshi-manual]'
const excluded = new Set(['hidden', 'submit', 'reset', 'button', 'image', 'file', 'password', 'search', 'color', 'range'])

export class Scanner {
  private registry = new Map<string, Target>()
  private ids = new WeakMap<Element, string>()
  private groupIds = new WeakMap<Element, Map<string, string>>()
  private sequence = 0
  private activeForm?: HTMLFormElement
  constructor(private readonly root: Document | HTMLElement, private readonly primaryOnly = false) {}

  scan(): Schema {
    this.registry.clear()
    this.visit(this.root)
    if (this.primaryOnly) {
      const targets = [...this.registry.values()]
      const score = (form: HTMLFormElement) => targets.reduce((total, { field, form: owner }) =>
        total + (owner === form ? 1 + Number(field.required) + Number(field.semantic !== 'free') : 0), 0)
      const forms = this.forms()
      this.activeForm = forms.includes(this.activeForm!) ? this.activeForm : forms.sort((a, b) => score(b) - score(a))[0]
      if (this.activeForm) {
        for (const [id, target] of this.registry) if (target.form !== this.activeForm) this.registry.delete(id)
      }
    }
    const fields = [...this.registry.values()].map(target => target.field)
    return { formId: this.forms()[0]?.id || 'active-page', fields }
  }

  target(id: string) { return this.registry.get(id) }

  forms() {
    return [...new Set([...this.registry.values()].flatMap(target => target.form ? [target.form] : []))]
  }

  matches(element: Element) {
    return [...this.registry.values()].find(target => target.controls.some(control => control === element || control.contains(element)))
  }

  roots() {
    const roots: (Document | HTMLElement)[] = []
    const visit = (root: Document | HTMLElement) => {
      roots.push(root)
      root.querySelectorAll('iframe').forEach(frame => {
        try {
          if (frame.contentDocument) visit(frame.contentDocument)
        } catch { /* Cross-origin form stays outside the scanner. */ }
      })
    }
    visit(this.root)
    return roots
  }

  observe(onChange: () => void) {
    const disconnectors: (() => void)[] = []
    const bind = () => {
      for (const cleanup of disconnectors.splice(0)) cleanup()
      for (const root of this.roots()) {
        const observer = new MutationObserver(records => {
          if (records.some(record => record.type === 'childList' &&
              ![...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && node.matches('[data-munshi-owned]')))) {
            onChange()
            bind()
          } else if (records.some(record => record.type === 'attributes')) onChange()
        })
        observer.observe(root, {
          childList: true, subtree: true, attributes: true,
          attributeFilter: ['hidden', 'required', 'name', 'id', 'aria-label', 'aria-labelledby', 'aria-hidden', 'readonly', 'type'],
        })
        root.addEventListener('load', updateFrame, true)
        disconnectors.push(() => {
          observer.disconnect()
          root.removeEventListener('load', updateFrame, true)
        })
      }
    }
    const updateFrame = (event: Event) => {
      if ((event.target as Element)?.tagName === 'IFRAME') {
        onChange()
        bind()
      }
    }
    bind()
    return () => disconnectors.splice(0).forEach(cleanup => cleanup())
  }

  private visit(root: Document | HTMLElement) {
    for (const element of root.querySelectorAll<Control>(selector)) {
      if (element.closest('[hidden], [aria-hidden="true"], [data-munshi-owned], [type="hidden"]')) continue
      const native = element.matches('input, textarea, select')
      const input = element as HTMLInputElement
      if (element.closest('fieldset:disabled') || input.disabled || input.readOnly ||
          (element.tagName === 'INPUT' && excluded.has(input.type))) continue
      const style = element.ownerDocument.defaultView?.getComputedStyle(element)
      if (style?.display === 'none' || style?.visibility === 'hidden') continue
      const form = input.form || element.closest('form')
      // A page can also use a collection of controls without a native form.
      const labelOf = (control: Element) => (control as HTMLInputElement).labels?.[0]?.textContent?.replace(/\s*\*$/, '')?.trim()
      const ariaIds = element.getAttribute('aria-labelledby')?.trim().split(/\s+/) || []
      const labelledBy = ariaIds.map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim()
      const heading = element.closest('fieldset')?.querySelector('legend')?.textContent?.trim() ||
        (element.previousElementSibling?.matches('h1,h2,h3,h4,strong,b') ? element.previousElementSibling.textContent?.trim() : '')
      const aria = element.getAttribute('aria-label') || ''
      const placeholder = element.getAttribute('placeholder') || ''
      const name = element.getAttribute('name') || ''
      const hint = (element.matches('input') && element.getAttribute('autocomplete') === 'one-time-code') ? 'otp' : ''
      const label = labelledBy || aria || labelOf(element) || placeholder || name || (element.id || heading || 'Form field')
      const hints = [name, element.id, aria, placeholder, hint].filter(Boolean)
      const nearbyChallenge = element.parentElement?.querySelector('img[alt*="captcha" i], canvas[aria-label*="captcha" i]')
      const semantic = nearbyChallenge ? 'captcha' : identify(label, hints)
      const kind: Kind = element.tagName === 'SELECT' ? 'select' : element.tagName === 'TEXTAREA' ? 'textarea'
        : ['radio', 'checkbox', 'date'].includes(input.type) ? input.type as Kind : 'text'
      const group = (kind === 'radio' || kind === 'checkbox') && name ? name : ''
      const groupRoot = form || element.ownerDocument.documentElement
      const groupKey = kind + ':' + group
      const groups = this.groupIds.get(groupRoot) || new Map<string, string>()
      const prior = group ? groups.get(groupKey) : this.ids.get(element)
      const id = prior || `f${++this.sequence}`
      this.ids.set(element, id)
      if (group) {
        groups.set(groupKey, id)
        this.groupIds.set(groupRoot, groups)
      }
      const required = input.required || element.getAttribute('aria-required') === 'true'
      const entry = this.registry.get(id)
      if (entry) {
        entry.controls.push(element)
        if (heading) {
          entry.field.label = heading
          entry.field.semantic = identify(heading, hints)
        }
        entry.field.options = entry.controls.map(control => labelOf(control) || (control as HTMLInputElement).value)
        entry.field.required ||= required
        continue
      }
      const options = kind === 'select'
        ? [...(element as HTMLSelectElement).options].filter(option => !option.disabled && option.value !== '').map(option => option.label)
        : kind === 'radio' ? [labelOf(element) || input.value] : []
      const dateFormat: DateFormat = kind === 'date' || /yyyy-mm-dd/i.test(placeholder) ? 'YYYY-MM-DD'
        : /mm\/dd\/yyyy/i.test(placeholder) ? 'MM/DD/YYYY' : 'DD/MM/YYYY'
      this.registry.set(id, {
        field: {
          id, kind, label: kind === 'radio' && heading ? heading : label,
          semantic: kind === 'radio' && heading ? identify(heading, hints) : semantic,
          hints, options, required, dateFormat,
          maxLength: input.maxLength > 0 ? input.maxLength : undefined,
          manualOnly: (!native || element.hasAttribute('data-munshi-manual')), writable: semantic !== 'otp' && semantic !== 'captcha',
        },
        controls: [element], form,
      })
    }
    root.querySelectorAll('iframe').forEach(frame => {
      try {
        if (frame.contentDocument) this.visit(frame.contentDocument)
      } catch { /* Cross-origin form stays outside the scanner. */ }
    })
  }
}
