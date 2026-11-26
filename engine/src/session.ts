import type { Issue, Patch } from './types'

export class Session {
  private recent: { id: string; at: number }[] = []
  private question?: { id: string; at: number }
  private history: { patches: Patch[]; issues: Record<string, Issue> }[] = []

  ask(id: string, now: number) { this.question = { id, at: now } }

  pending(now: number) {
    if (this.question && now - this.question.at <= 10_000) return this.question.id
    this.question = undefined
  }

  clearQuestion() { this.question = undefined }

  recentFields(now: number) {
    return this.recent.filter(event => now - event.at <= 20_000).map(event => event.id)
  }

  record(patches: Patch[], issues: Record<string, Issue>, fields: string[], now: number) {
    if (!patches.length && !fields.length) return
    this.history.push({ patches, issues })
    if (this.history.length > 40) this.history.shift()
    for (const id of fields) this.recent = [{ id, at: now }, ...this.recent.filter(item => item.id !== id)].slice(0, 12)
  }

  undo() { return this.history.pop() }
}
