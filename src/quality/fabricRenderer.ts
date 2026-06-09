import { FabricImage, StaticCanvas } from 'fabric'
import type { PrintJob, PrintTemplate } from '../types'

export type RenderResult = {
  dataUrl?: string
  widthPx: number
  heightPx: number
  blob: Blob
}

export type RenderInput = {
  canvasJson: string | Record<string, unknown>
  widthPx: number
  heightPx: number
  smoothingMode?: 'auto' | 'quality' | 'pixel'
  baseUrl?: string
  includeDataUrl?: boolean
}

const ASSET_CHECK_TIMEOUT_MS = 8000
const ASSET_CACHE_MAX_ENTRIES = 48
const ASSET_CACHE_MAX_BYTES = 64 * 1024 * 1024
const OMIT_FABRIC_OBJECT = Symbol('omit-fabric-object')

type AssetCacheEntry = {
  promise: Promise<Blob>
  blob?: Blob
  size: number
  lastUsed: number
}

const assetCache = new Map<string, AssetCacheEntry>()
let assetCacheBytes = 0

function normalizeAssetUrl(value: string, baseUrl?: string) {
  if (!baseUrl || value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')) {
    return value
  }
  const root = baseUrl.replace(/\/$/, '')
  if (value.startsWith('/')) return `${root}${value}`
  if (value.startsWith('uploads/')) return `${root}/${value}`
  return value
}

function prepareFabricJson(value: unknown, baseUrl?: string): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => prepareFabricJson(item, baseUrl))
      .filter((item) => item !== OMIT_FABRIC_OBJECT)
  }
  if (!value || typeof value !== 'object') return value

  const source = value as Record<string, unknown>
  if (source.visible === false || source.excludeFromExport === true) return OMIT_FABRIC_OBJECT
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(source)) {
    if (key === '_canvas_image') continue
    if (key === 'src' && typeof item === 'string') {
      result[key] = normalizeAssetUrl(item, baseUrl)
    } else {
      result[key] = prepareFabricJson(item, baseUrl)
    }
  }
  if ((result.type === 'image' || result.type === 'Image') && !result.crossOrigin) {
    result.crossOrigin = 'anonymous'
  }
  return result
}

function collectImageAssetUrls(value: unknown, urls = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageAssetUrls(item, urls))
    return urls
  }
  if (!value || typeof value !== 'object') return urls

  const source = value as Record<string, unknown>
  if (source.visible === false || source.excludeFromExport === true) return urls
  const type = String(source.type || '').toLowerCase()
  const src = source.src
  if (type === 'image' && typeof src === 'string') {
    const url = src.trim()
    if (url && !url.startsWith('data:') && !url.startsWith('blob:')) urls.add(url)
  }

  Object.values(source).forEach((item) => collectImageAssetUrls(item, urls))
  return urls
}

function shortAssetUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.href)
    const path = `${parsed.pathname}${parsed.search}`
    return path.length > 120 ? `${path.slice(0, 117)}...` : path
  } catch {
    return url.length > 120 ? `${url.slice(0, 117)}...` : url
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取图片数据失败'))
    reader.readAsDataURL(blob)
  })
}

function enforceAssetCacheLimit(protectedUrl?: string) {
  const candidates = Array.from(assetCache.entries())
    .filter(([url, entry]) => url !== protectedUrl && entry.blob)
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)

  while (
    candidates.length
    && (assetCache.size > ASSET_CACHE_MAX_ENTRIES || assetCacheBytes > ASSET_CACHE_MAX_BYTES)
  ) {
    const [url, entry] = candidates.shift()!
    if (assetCache.delete(url)) assetCacheBytes -= entry.size
  }
}

async function downloadAsset(url: string): Promise<Blob> {
  const cached = assetCache.get(url)
  if (cached) {
    cached.lastUsed = Date.now()
    return cached.promise
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ASSET_CHECK_TIMEOUT_MS)
  const entry: AssetCacheEntry = {
    promise: Promise.resolve(new Blob()),
    size: 0,
    lastUsed: Date.now(),
  }
  entry.promise = (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'default',
        credentials: 'omit',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`非图片类型：${contentType}`)
      }
      const blob = await response.blob()
      entry.blob = blob
      entry.size = blob.size
      entry.lastUsed = Date.now()
      assetCacheBytes += blob.size
      enforceAssetCacheLimit(url)
      return blob
    } catch (error) {
      if (assetCache.get(url) === entry) assetCache.delete(url)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`模版素材访问超时：${shortAssetUrl(url)}`)
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`模版素材无法访问：${shortAssetUrl(url)}（${message}）`)
    } finally {
      window.clearTimeout(timer)
    }
  })()
  assetCache.set(url, entry)
  enforceAssetCacheLimit(url)
  return entry.promise
}

async function preloadAndInjectAssets(json: unknown): Promise<() => void> {
  const urls = Array.from(collectImageAssetUrls(json))
  if (!urls.length) return () => undefined

  const objectUrls = new Map<string, string>()
  const results = await Promise.allSettled(urls.map(async (url) => {
    const blob = await downloadAsset(url)
    objectUrls.set(url, URL.createObjectURL(blob))
  }))

  const failures = results
    .map((item) => ({ status: item.status, reason: item.status === 'rejected' ? item.reason : null }))
    .filter((item) => item.status === 'rejected')

  if (failures.length) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url))
    const first = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
    const more = failures.length > 1 ? `；另有 ${failures.length - 1} 个素材也无法访问` : ''
    throw new Error(`${first}${more}`)
  }

  walkAndInjectAssets(json, objectUrls)
  return () => objectUrls.forEach((url) => URL.revokeObjectURL(url))
}

function walkAndInjectAssets(value: unknown, objectUrls: Map<string, string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walkAndInjectAssets(item, objectUrls))
    return
  }
  if (!value || typeof value !== 'object') return
  const source = value as Record<string, unknown>
  const type = String(source.type || '').toLowerCase()
  if (type === 'image' && typeof source.src === 'string') {
    const objectUrl = objectUrls.get(source.src)
    if (objectUrl) source.src = objectUrl
  }
  Object.values(source).forEach((item) => walkAndInjectAssets(item, objectUrls))
}

function parseCanvasJson(value: string | Record<string, unknown>) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>
  } catch (error) {
    throw new Error(`Fabric JSON 解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

function configureSmoothing(canvas: StaticCanvas, smoothingMode: RenderInput['smoothingMode']) {
  const ctx = canvas.getContext()
  if (smoothingMode === 'pixel') {
    ctx.imageSmoothingEnabled = false
    return
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = smoothingMode === 'quality' ? 'high' : 'medium'
}

function normalizeImageObjects(canvas: StaticCanvas, smoothingMode: RenderInput['smoothingMode']) {
  if (smoothingMode !== 'pixel') return
  canvas.getObjects().forEach((object) => {
    if (object instanceof FabricImage) object.set('imageSmoothing', false)
  })
}

export async function renderFabricToPng(input: RenderInput): Promise<RenderResult> {
  const widthPx = Math.max(1, Math.min(Math.round(input.widthPx || 1800), 8000))
  const heightPx = Math.max(1, Math.min(Math.round(input.heightPx || 1200), 8000))
  const element = document.createElement('canvas')
  element.width = widthPx
  element.height = heightPx

  const canvas = new StaticCanvas(element, {
    width: widthPx,
    height: heightPx,
    backgroundColor: '#ffffff',
    renderOnAddRemove: false,
    enableRetinaScaling: false,
  })

  let releaseAssets: () => void = () => undefined
  try {
    configureSmoothing(canvas, input.smoothingMode)
    const prepared = prepareFabricJson(parseCanvasJson(input.canvasJson), input.baseUrl)
    releaseAssets = await preloadAndInjectAssets(prepared)
    await canvas.loadFromJSON(prepared as Record<string, unknown>)
    releaseAssets()
    releaseAssets = () => undefined
    if (document.fonts?.ready) await document.fonts.ready
    normalizeImageObjects(canvas, input.smoothingMode)
    canvas.setDimensions({ width: widthPx, height: heightPx })
    canvas.setZoom(1)
    canvas.renderAll()

    const blob = await new Promise<Blob>((resolve, reject) => {
      element.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('toBlob 生成失败'))
      }, 'image/png')
    })
    const dataUrl = input.includeDataUrl === false ? undefined : await blobToDataUrl(blob)

    return { dataUrl, blob, widthPx, heightPx }
  } finally {
    releaseAssets()
    canvas.dispose()
  }
}

export function renderInputFromJob(job: PrintJob, baseUrl?: string): RenderInput {
  return {
    canvasJson: job.canvasJson || '{}',
    widthPx: job.widthPx || 1800,
    heightPx: job.heightPx || 1200,
    smoothingMode: job.smoothingMode || 'auto',
    baseUrl,
    includeDataUrl: false,
  }
}

export function renderInputFromTemplate(template: PrintTemplate, baseUrl?: string): RenderInput {
  const widthPx = Number(template.widthPx || template.canvasWidth || 1800)
  const heightPx = Number(template.heightPx || template.canvasHeight || 1200)
  return {
    canvasJson: template.canvasJson || template,
    widthPx,
    heightPx,
    smoothingMode: template.smoothingMode || 'auto',
    baseUrl,
  }
}
