import { FabricImage, StaticCanvas } from 'fabric'
import type { PrintJob, PrintTemplate } from '../types'

export type RenderResult = {
  dataUrl: string
  widthPx: number
  heightPx: number
}

export type RenderInput = {
  canvasJson: string | Record<string, unknown>
  widthPx: number
  heightPx: number
  smoothingMode?: 'auto' | 'quality' | 'pixel'
  baseUrl?: string
}

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
  if (Array.isArray(value)) return value.map((item) => prepareFabricJson(item, baseUrl))
  if (!value || typeof value !== 'object') return value

  const source = value as Record<string, unknown>
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

  try {
    configureSmoothing(canvas, input.smoothingMode)
    const prepared = prepareFabricJson(parseCanvasJson(input.canvasJson), input.baseUrl)
    await canvas.loadFromJSON(prepared as Record<string, unknown>)
    if (document.fonts?.ready) await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    normalizeImageObjects(canvas, input.smoothingMode)
    canvas.setDimensions({ width: widthPx, height: heightPx })
    canvas.setZoom(1)
    canvas.renderAll()
    return {
      dataUrl: canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        enableRetinaScaling: false,
      }),
      widthPx,
      heightPx,
    }
  } finally {
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
