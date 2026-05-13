import type { AppStore, LocalSettings } from './types'

const uuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function defaultSettings(): LocalSettings {
  return {
    serverUrl: 'http://127.0.0.1:8000',
    clientId: uuid(),
    clientName: `PhotoPrinter-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    clientToken: '',
    pollingIntervalMs: 2500,
    selectedPrinter: '',
    scaleMode: 'contain',
    copiesFallback: 1,
    retryLimit: 1,
    autoStart: false,
  }
}

export function defaultStore(): AppStore {
  return {
    auth: null,
    settings: defaultSettings(),
    recentJobs: [],
  }
}

export function mergeStore(input: unknown): AppStore {
  const base = defaultStore()
  if (!input || typeof input !== 'object') return base
  const data = input as Partial<AppStore>
  if (data.auth) base.auth = data.auth
  if (data.settings) base.settings = { ...base.settings, ...data.settings }
  if (!base.settings.clientId) base.settings.clientId = defaultSettings().clientId
  if (!base.settings.clientName) base.settings.clientName = defaultSettings().clientName
  if (Array.isArray(data.recentJobs)) base.recentJobs = data.recentJobs.slice(0, 100)
  return base
}
