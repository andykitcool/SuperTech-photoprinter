/// <reference types="vite/client" />

export type NativeBridge = {
  loadStore: () => Promise<unknown>
  saveStore: (store: unknown) => Promise<{ ok: boolean }>
  getPrinters: () => Promise<Array<Record<string, unknown>>>
  printImage: (payload: unknown) => Promise<{ ok: boolean }>
  writeLog: (entry: unknown) => Promise<{ ok: boolean }>
  openLogs: () => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    photoPrinter?: NativeBridge
  }
}
