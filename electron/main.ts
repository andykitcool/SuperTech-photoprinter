import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

type PrintImagePayload = {
  dataUrl: string
  printerName?: string
  copies?: number
  widthPx?: number
  heightPx?: number
  paperWidthMm?: number
  paperHeightMm?: number
  dpi?: number
  scaleMode?: 'contain' | 'cover'
}

type PrinterInfo = {
  name: string
  displayName?: string
  description?: string
  status?: number | string
  isDefault?: boolean
  source?: string
}

const devServerUrl = process.env.ELECTRON_RENDERER_URL
const execFileAsync = promisify(execFile)

function userDataPath(...parts: string[]) {
  return path.join(app.getPath('userData'), ...parts)
}

async function ensureUserData() {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.mkdir(userDataPath('logs'), { recursive: true })
}

function cleanupPrintJobDir(jobDir: string) {
  setTimeout(() => {
    fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined)
  }, 5 * 60 * 1000)
}

async function createWindow() {
  const preload = path.join(__dirname, 'preload.js')
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    title: 'Supertech PhotoPrinter',
    backgroundColor: '#eef3f1',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (devServerUrl) {
    await win.loadURL(devServerUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

/** Standard photo paper size presets (must match templateSizeOptions in App.vue). */
const PAPER_SIZE_PRESETS = [
  { widthPx: 1500, heightPx: 1050, paperWidthMm: 102, paperHeightMm: 71 },
  { widthPx: 1050, heightPx: 1500, paperWidthMm: 71, paperHeightMm: 102 },
  { widthPx: 1500, heightPx: 1500, paperWidthMm: 127, paperHeightMm: 127 },
  { widthPx: 1500, heightPx: 1050, paperWidthMm: 127, paperHeightMm: 89 },
  { widthPx: 1050, heightPx: 1500, paperWidthMm: 89, paperHeightMm: 127 },
  { widthPx: 1800, heightPx: 1200, paperWidthMm: 152, paperHeightMm: 102 },
  { widthPx: 1200, heightPx: 1800, paperWidthMm: 102, paperHeightMm: 152 },
] as const

/** Resolve paper size (mm) from pixel dimensions using known presets. */
function resolvePaperSizeFromPresets(widthPx?: number, heightPx?: number) {
  if (!widthPx || !heightPx) return null
  const match = PAPER_SIZE_PRESETS.find(
    (s) => (s.widthPx === widthPx && s.heightPx === heightPx)
      || (s.widthPx === heightPx && s.heightPx === widthPx),
  )
  if (match) return { widthMm: match.paperWidthMm, heightMm: match.paperHeightMm }
  return null
}

/** Derive paper size in mm from pixel dimensions (fallback – may be inaccurate for 4寸). */
function derivePaperSizeMm(widthPx?: number, heightPx?: number, dpi?: number) {
  // Prefer preset lookup over DPI calculation (4寸 and 5寸 share same pixels but different paper)
  const preset = resolvePaperSizeFromPresets(widthPx, heightPx)
  if (preset) return preset

  const d = dpi || 300
  if (widthPx && heightPx && d > 0) {
    return {
      widthMm: Math.round(widthPx / d * 25.4),
      heightMm: Math.round(heightPx / d * 25.4),
    }
  }
  return null
}

function dataUrlToImageFile(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Missing printable image data')
  }

  const mimeSubtype = match[1].toLowerCase()
  const ext = mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype.replace(/[^a-z0-9]/g, '')
  return {
    ext: ext || 'png',
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function comparablePrinterName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\x00-\x7F]+/g, '')
    .replace(/\s+/g, '')
}

async function resolvePrinterName(requested?: string) {
  const printerName = requested?.trim()
  if (!printerName) return undefined

  const windowsPrinters = await getWindowsPrinters().catch(() => [])
  await appendLog({
    level: 'info',
    message: 'resolving printer name',
    context: {
      requested: printerName,
      printers: windowsPrinters.map((printer) => ({
        name: printer.name,
        displayName: printer.displayName,
        isDefault: printer.isDefault,
        status: printer.status,
        source: printer.source,
      })),
    },
    createdAt: new Date().toISOString(),
  })

  const exact = windowsPrinters.find((printer) => printer.name === printerName)
  if (exact) return exact.name

  const comparable = comparablePrinterName(printerName)
  const matched = windowsPrinters.find((printer) => comparablePrinterName(printer.name) === comparable)
  if (matched) return matched.name

  throw new Error(`Printer is unavailable: ${printerName}. Refresh printers in client settings and select it again.`)
}
/** Print an image file using Windows GDI+ via PowerShell. */
async function printViaPowerShell(imagePath: string, payload: PrintImagePayload) {
  const printerName = payload.printerName || ''
  if (!printerName) throw new Error('Printer name is required for PowerShell printing')

  const paperMm = (payload.paperWidthMm && payload.paperHeightMm)
    ? { widthMm: payload.paperWidthMm, heightMm: payload.paperHeightMm }
    : derivePaperSizeMm(payload.widthPx, payload.heightPx, payload.dpi)
  if (!paperMm) throw new Error('Cannot determine paper size for PowerShell printing')

  // PaperSize width/height are in hundredths of an inch
  const widthInch = Math.round(paperMm.widthMm / 25.4 * 100)
  const heightInch = Math.round(paperMm.heightMm / 25.4 * 100)
  const copies = Math.max(1, Math.min(Number(payload.copies || 1), 99))

  // Escape single quotes for PowerShell
  const safePath = imagePath.replace(/'/g, "''")
  const safePrinter = printerName.replace(/'/g, "''")

  const fit = payload.scaleMode === 'cover' ? 'cover' : 'contain'

  const psScript = `
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$img = $null
try {
  $img = [System.Drawing.Image]::FromFile('${safePath}')
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = '${safePrinter}'
  if (-not $doc.PrinterSettings.IsValid) { throw "Printer '${safePrinter}' is not valid or not available" }
  $paper = New-Object System.Drawing.Printing.PaperSize('Photo', ${widthInch}, ${heightInch})
  $doc.DefaultPageSettings.PaperSize = $paper
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  if (${copies} -gt 1) { $doc.PrinterSettings.Copies = ${copies} }
  $script:printImg = $img
  $script:fitMode = '${fit}'
  $doc.add_PrintPage({
    $bounds = $_.PageBounds
    $imgW = $script:printImg.Width
    $imgH = $script:printImg.Height
    if ($script:fitMode -eq 'cover') {
      $ratio = [Math]::Max($bounds.Width / $imgW, $bounds.Height / $imgH)
    } else {
      $ratio = [Math]::Min($bounds.Width / $imgW, $bounds.Height / $imgH)
    }
    $drawW = $imgW * $ratio
    $drawH = $imgH * $ratio
    $x = ($bounds.Width - $drawW) / 2
    $y = ($bounds.Height - $drawH) / 2
    $_.Graphics.DrawImage($script:printImg, $x, $y, $drawW, $drawH)
    $_.HasMorePages = $false
  })
  $doc.Print()
} finally {
  if ($img) { $img.Dispose() }
}`

  await appendLog({
    level: 'info',
    message: 'printing via PowerShell',
    context: {
      printerName,
      widthInch,
      heightInch,
      copies,
      fit,
      imagePath,
    },
    createdAt: new Date().toISOString(),
  })

  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript,
    ], { windowsHide: true, timeout: 60000 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await appendLog({
      level: 'error',
      message: 'PowerShell print failed',
      context: { error: msg, printerName, imagePath },
      createdAt: new Date().toISOString(),
    })
    throw new Error(`PowerShell print failed: ${msg}`)
  }
}

async function printImage(payload: PrintImagePayload) {
  if (!payload?.dataUrl?.startsWith('data:image/')) {
    throw new Error('Missing printable image data')
  }

  const localJobId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const jobDir = userDataPath('print-jobs', localJobId)
  const { ext, buffer } = dataUrlToImageFile(payload.dataUrl)
  const imagePath = path.join(jobDir, `print.${ext}`)

  await fs.mkdir(jobDir, { recursive: true })
  await fs.writeFile(imagePath, buffer)

  const printerName = await resolvePrinterName(payload.printerName)
  if (!printerName) {
    throw new Error('Printer name is required for printing')
  }

  const printPayload = { ...payload, printerName }

  await appendLog({
    level: 'info',
    message: 'printing via PowerShell',
    context: {
      localJobId,
      imagePath,
      printerName,
      widthPx: payload.widthPx,
      heightPx: payload.heightPx,
    },
    createdAt: new Date().toISOString(),
  })

  try {
    await printViaPowerShell(imagePath, printPayload)
  } finally {
    cleanupPrintJobDir(jobDir)
  }

  await appendLog({
    level: 'info',
    message: 'print image submitted',
    context: {
      localJobId,
      printerName,
      copies: Math.max(1, Math.min(Number(payload.copies || 1), 99)),
      widthPx: payload.widthPx,
      heightPx: payload.heightPx,
    },
    createdAt: new Date().toISOString(),
  })
  return { ok: true, localJobId }
}

async function appendLog(entry: unknown) {
  await ensureUserData()
  const date = new Date().toISOString().slice(0, 10)
  const logPath = userDataPath('logs', `${date}.jsonl`)
  const row = typeof entry === 'object' && entry
    ? { createdAt: new Date().toISOString(), ...entry as Record<string, unknown> }
    : { createdAt: new Date().toISOString(), level: 'info', message: String(entry) }
  await fs.appendFile(logPath, `${JSON.stringify(row)}\n`, 'utf-8')
}

function normalizePrinter(raw: Record<string, unknown>, source: string): PrinterInfo | null {
  const name = String(raw.name || raw.Name || '').trim()
  if (!name) return null
  return {
    name,
    displayName: String(raw.displayName || raw.DisplayName || raw.Name || raw.name || name).trim(),
    description: String(raw.description || raw.Description || '').trim(),
    status: typeof raw.status === 'undefined' ? raw.PrinterStatus as string | number | undefined : raw.status as string | number,
    isDefault: Boolean(raw.isDefault || raw.default || raw.Default),
    source,
  }
}

function mergePrinters(...groups: PrinterInfo[][]) {
  const map = new Map<string, PrinterInfo>()
  for (const printer of groups.flat()) {
    const key = comparablePrinterName(printer.name) || printer.name.toLowerCase()
    const existing = map.get(key)
    const preferDisplayFromCurrent = printer.source === 'windows' || !existing?.displayName
    map.set(key, {
      ...existing,
      ...printer,
      name: existing?.name || printer.name,
      displayName: preferDisplayFromCurrent
        ? (printer.displayName || printer.name)
        : (existing?.displayName || printer.displayName || printer.name),
      isDefault: Boolean(existing?.isDefault || printer.isDefault),
      source: existing?.source && existing.source !== printer.source ? `${existing.source},${printer.source}` : printer.source,
    })
  }
  return Array.from(map.values()).sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

async function getWindowsPrinters(): Promise<PrinterInfo[]> {
  if (process.platform !== 'win32') return []

  const command = [
    '$printers = Get-CimInstance Win32_Printer | Select-Object Name,ShareName,Default,PrinterStatus,WorkOffline,PortName,DriverName;',
    '$printers | ConvertTo-Json -Compress',
  ].join(' ')
  try {
    return await queryPrintersWithPowerShell(command, 'windows')
  } catch {
    return queryPrintersWithPowerShell([
      "$defaultDevice = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows' -Name Device -ErrorAction SilentlyContinue).Device;",
      "$defaultName = if ($defaultDevice) { $defaultDevice.Split(',')[0] } else { '' };",
      "Get-ChildItem -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers' | ForEach-Object {",
      '$props = Get-ItemProperty $_.PSPath;',
      "[pscustomobject]@{ Name = $_.PSChildName; DriverName = $props.'Printer Driver'; PortName = $props.Port; Default = ($_.PSChildName -eq $defaultName) }",
      '} | ConvertTo-Json -Compress',
    ].join(' '), 'registry')
  }
}

async function queryPrintersWithPowerShell(command: string, source: string): Promise<PrinterInfo[]> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    command,
  ], { windowsHide: true, timeout: 8000 })

  const text = stdout.trim()
  if (!text) return []
  const parsed = JSON.parse(text) as Record<string, unknown> | Array<Record<string, unknown>>
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows
    .map((row) => normalizePrinter({
      ...row,
      displayName: row.Name,
      description: [row.DriverName, row.PortName].filter(Boolean).join(' / '),
    }, source))
    .filter((printer): printer is PrinterInfo => Boolean(printer))
}

ipcMain.handle('store:load', async () => {
  await ensureUserData()
  const storePath = userDataPath('store.json')
  try {
    const raw = await fs.readFile(storePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
})

ipcMain.handle('store:save', async (_event, store) => {
  await ensureUserData()
  const storePath = userDataPath('store.json')
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8')
  return { ok: true }
})

ipcMain.handle('printer:list', async (event) => {
  const electronPrinters = (await event.sender.getPrintersAsync())
    .map((printer) => normalizePrinter(printer as unknown as Record<string, unknown>, 'electron'))
    .filter((printer): printer is PrinterInfo => Boolean(printer))
  let windowsPrinters: PrinterInfo[] = []
  try {
    windowsPrinters = await getWindowsPrinters()
  } catch (error) {
    console.warn('Failed to query Windows printers', error)
  }
  return mergePrinters(electronPrinters, windowsPrinters)
})

ipcMain.handle('printer:print-image', async (_event, payload: PrintImagePayload) => {
  return printImage(payload)
})

ipcMain.handle('app:write-log', async (_event, entry) => {
  await appendLog(entry)
  return { ok: true }
})

ipcMain.handle('app:open-logs', async () => {
  await ensureUserData()
  await shell.openPath(userDataPath('logs'))
  return { ok: true }
})

app.whenReady().then(async () => {
  await ensureUserData()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

