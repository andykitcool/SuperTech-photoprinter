import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('photoPrinter', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (store: unknown) => ipcRenderer.invoke('store:save', store),
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  printImage: (payload: unknown) => ipcRenderer.invoke('printer:print-image', payload),
  writeLog: (entry: unknown) => ipcRenderer.invoke('app:write-log', entry),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
})
