<template>
  <div class="ptm">
    <div v-if="notice" class="ptm-notice" :class="noticeKind">{{ notice }}</div>

    <template v-if="mode === 'list'">
      <div class="ptm-toolbar">
        <div>
          <h3>模版列表</h3>
          <p>选择当前活动使用的打印模版。纸张尺寸和画布像素会跟随当前模版生效。</p>
        </div>
        <div class="ptm-actions">
          <button class="ptm-button" type="button" :disabled="loading" @click="loadTemplates">刷新</button>
          <button class="ptm-button primary" type="button" @click="createModalOpen = true">新建模版</button>
        </div>
      </div>

      <div v-if="loading" class="ptm-loading">加载中...</div>
      <div v-else-if="templates.length" class="ptm-template-grid">
        <article
          v-for="item in templates"
          :key="item.id"
          class="ptm-template-card"
          :class="{ active: item.id === activeTemplateId }"
        >
          <div class="ptm-template-preview" :style="previewBoxStyle(item)">
            <span>{{ item.width }} x {{ item.height }}</span>
          </div>
          <div class="ptm-template-meta">
            <strong>{{ item.name }}</strong>
            <span>{{ item.paperLabel }} / {{ item.paperWidthMm }} x {{ item.paperHeightMm }} mm / {{ item.photoCount }} 张照片</span>
          </div>
          <div class="ptm-card-actions">
            <button type="button" @click="editTemplate(item)">编辑</button>
            <button type="button" :disabled="item.id === activeTemplateId" @click="setActiveTemplate(item)">设为当前</button>
            <button class="danger" type="button" @click="deleteTemplate(item.id)">删除</button>
          </div>
        </article>
      </div>
      <button v-else class="ptm-empty" type="button" @click="createModalOpen = true">暂无模版，点击新建打印模版</button>
    </template>

    <template v-else>
      <div class="ptm-editor-shell">
        <aside class="ptm-sidebar">
          <button class="ptm-link" type="button" @click="backToList">返回模版列表</button>

          <section class="ptm-side-section">
            <label>模版名称</label>
            <input v-model.trim="editingTemplate.name" maxlength="50" placeholder="请输入模版名称" />
            <div class="ptm-template-facts">
              <span>{{ editingTemplate.paperLabel }}</span>
              <span>{{ editingTemplate.paperWidthMm }} x {{ editingTemplate.paperHeightMm }} mm</span>
              <span>{{ editingTemplate.width }} x {{ editingTemplate.height }} px</span>
            </div>
          </section>

          <section class="ptm-side-section">
            <div class="ptm-side-title">添加素材</div>
            <div class="ptm-tool-grid">
              <button type="button" @click="openMaterialPicker('background')">背景</button>
              <button type="button" @click="openMaterialPicker('frame')">相框</button>
              <button type="button" @click="openMaterialPicker('sticker')">贴纸</button>
              <button type="button" @click="addText">文字</button>
            </div>
            <button class="ptm-button full" type="button" @click="addPhotoSlot">添加照片区域</button>
          </section>

          <section class="ptm-side-section">
            <div class="ptm-side-title">元素选择</div>
            <div v-if="layerItems.length" class="ptm-layer-list">
              <button
                v-for="item in layerItems"
                :key="item.id"
                type="button"
                :class="{ active: item.object === selectedObject }"
                @click="selectLayerObject(item.object)"
              >
                <span>{{ item.name }}</span>
                <small>{{ item.roleLabel }}</small>
              </button>
            </div>
            <div v-else class="ptm-small-empty">暂无元素</div>
          </section>

          <section class="ptm-side-section">
            <div class="ptm-tool-grid">
              <button type="button" @click="backToList">取消</button>
              <button class="primary" type="button" :disabled="saving" @click="saveEditingTemplate">保存</button>
            </div>
          </section>
        </aside>

        <main class="ptm-editor-main">
          <div class="ptm-canvas-size">{{ editingTemplate.width }} x {{ editingTemplate.height }} px</div>
          <div class="ptm-stage-wrap">
            <div class="ptm-canvas-frame" :style="canvasFrameStyle">
              <canvas ref="canvasRef" />
            </div>
          </div>
        </main>

        <aside class="ptm-inspector">
          <section class="ptm-side-section">
            <div class="ptm-side-title">图层控制</div>
            <div class="ptm-layer-actions">
              <button :disabled="!selectedObject" type="button" @click="bringForward">上移</button>
              <button :disabled="!selectedObject" type="button" @click="sendBackward">下移</button>
              <button :disabled="!selectedObject" type="button" @click="toggleLock">{{ selectedLocked ? '解锁' : '锁定' }}</button>
              <button :disabled="!selectedObject" type="button" @click="bringToFront">置顶</button>
              <button :disabled="!selectedObject" type="button" @click="sendToBack">置底</button>
              <button :disabled="!selectedObject" type="button" @click="alignSelected('horizontal')">左右居中</button>
              <button :disabled="!selectedObject" type="button" @click="alignSelected('vertical')">上下居中</button>
              <button :disabled="!selectedObject" type="button" @click="alignSelected('center')">中心居中</button>
              <button class="danger" :disabled="!selectedObject" type="button" @click="deleteSelected">删除</button>
            </div>
          </section>

          <section v-if="selectedIsText" class="ptm-side-section ptm-property-panel">
            <div class="ptm-side-title">文字属性</div>
            <label><span>文字内容</span><input v-model="inspector.text" @input="applyTextProps" /></label>
            <div class="ptm-property-grid">
              <label><span>字号</span><input v-model.number="inspector.fontSize" min="8" max="400" type="number" @input="applyTextProps" /></label>
              <label>
                <span>字体</span>
                <select v-model="inspector.fontFamily" @change="applyTextProps">
                  <option v-for="font in fontOptions" :key="font.value" :value="font.value">{{ font.label }}</option>
                </select>
              </label>
              <label><span>颜色</span><input v-model="inspector.fill" type="color" @input="applyTextProps" /></label>
              <label>
                <span>对齐</span>
                <select v-model="inspector.textAlign" @change="applyTextProps">
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                  <option value="right">右对齐</option>
                </select>
              </label>
            </div>
            <div class="ptm-checks">
              <label><input v-model="inspector.bold" type="checkbox" @change="applyTextProps" />粗体</label>
              <label><input v-model="inspector.italic" type="checkbox" @change="applyTextProps" />斜体</label>
              <label><input v-model="inspector.underline" type="checkbox" @change="applyTextProps" />下划线</label>
              <label><input v-model="inspector.shadowEnabled" type="checkbox" @change="applyTextProps" />阴影</label>
            </div>
            <div v-if="inspector.shadowEnabled" class="ptm-property-grid">
              <label><span>阴影色</span><input v-model="inspector.shadowColor" type="color" @input="applyTextProps" /></label>
              <label><span>模糊</span><input v-model.number="inspector.shadowBlur" min="0" max="80" type="number" @input="applyTextProps" /></label>
              <label><span>X</span><input v-model.number="inspector.shadowOffsetX" min="-100" max="100" type="number" @input="applyTextProps" /></label>
              <label><span>Y</span><input v-model.number="inspector.shadowOffsetY" min="-100" max="100" type="number" @input="applyTextProps" /></label>
            </div>
          </section>

          <section v-if="selectedIsGraphic" class="ptm-side-section ptm-property-panel">
            <div class="ptm-side-title">{{ selectedIsSvg ? 'SVG属性' : '图形属性' }}</div>
            <div class="ptm-property-grid">
              <label><span>X</span><input v-model.number="inspector.x" type="number" @input="applyObjectBox" /></label>
              <label><span>Y</span><input v-model.number="inspector.y" type="number" @input="applyObjectBox" /></label>
              <label><span>宽</span><input v-model.number="inspector.width" min="1" type="number" @input="applyObjectBox" /></label>
              <label><span>高</span><input v-model.number="inspector.height" min="1" type="number" @input="applyObjectBox" /></label>
              <label><span>旋转</span><input v-model.number="inspector.angle" min="-360" max="360" type="number" @input="applyObjectVisualProps" /></label>
              <label><span>透明度</span><input v-model.number="inspector.opacity" min="0" max="100" type="number" @input="applyObjectVisualProps" /></label>
            </div>
            <div v-if="selectedIsSvg" class="ptm-property-grid">
              <label><span>填充</span><input v-model="inspector.fill" type="color" @input="applyObjectVisualProps" /></label>
              <label><span>描边</span><input v-model="inspector.stroke" type="color" @input="applyObjectVisualProps" /></label>
              <label><span>线宽</span><input v-model.number="inspector.strokeWidth" min="0" max="80" type="number" @input="applyObjectVisualProps" /></label>
            </div>
          </section>

          <section v-if="selectedAllowsObjectMargin" class="ptm-side-section ptm-property-panel">
            <div class="ptm-side-title">元素边距</div>
            <div class="ptm-property-grid">
              <label><span>margin-left</span><input :value="objectMargin('left')" type="number" @input="setObjectMarginLeft(inputValue($event))" /></label>
              <label><span>margin-right</span><input :value="objectMargin('right')" type="number" @input="setObjectMarginRight(inputValue($event))" /></label>
              <label><span>margin-top</span><input :value="objectMargin('top')" type="number" @input="setObjectMarginTop(inputValue($event))" /></label>
              <label><span>margin-bottom</span><input :value="objectMargin('bottom')" type="number" @input="setObjectMarginBottom(inputValue($event))" /></label>
            </div>
          </section>

          <section v-if="selectedIsPhotoSlot" class="ptm-side-section ptm-property-panel">
            <div class="ptm-side-title">照片区域</div>
            <select v-model="selectedSlotId" @change="selectSlot(selectedSlotId)">
              <option v-for="slot in editingTemplate.photoSlots" :key="slot.id" :value="slot.id">
                {{ slotName(slot) }}
              </option>
            </select>
            <div v-if="selectedSlot" class="ptm-ratio-actions">
              <button
                v-for="option in aspectRatioOptions"
                :key="option.label"
                type="button"
                :class="{ active: isSlotRatioActive(option.value) }"
                @click="applySlotAspectRatio(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div v-if="selectedSlot" class="ptm-property-grid">
              <label><span>X</span><input v-model.number="selectedSlot.x" type="number" @input="syncSelectedSlot" /></label>
              <label><span>Y</span><input v-model.number="selectedSlot.y" type="number" @input="syncSelectedSlot" /></label>
              <label><span>宽</span><input v-model.number="selectedSlot.width" min="20" type="number" @input="syncSelectedSlot" /></label>
              <label><span>高</span><input v-model.number="selectedSlot.height" min="20" type="number" @input="syncSelectedSlot" /></label>
            </div>
            <div v-if="selectedSlot" class="ptm-property-grid">
              <label><span>margin-left</span><input :value="slotMargin('left')" type="number" @input="setSlotMarginLeft(inputValue($event))" /></label>
              <label><span>margin-right</span><input :value="slotMargin('right')" type="number" @input="setSlotMarginRight(inputValue($event))" /></label>
              <label><span>margin-top</span><input :value="slotMargin('top')" type="number" @input="setSlotMarginTop(inputValue($event))" /></label>
              <label><span>margin-bottom</span><input :value="slotMargin('bottom')" type="number" @input="setSlotMarginBottom(inputValue($event))" /></label>
            </div>
          </section>
        </aside>
      </div>
    </template>

    <div v-if="createModalOpen" class="ptm-modal-mask" @click="createModalOpen = false">
      <section class="ptm-modal" @click.stop>
        <div class="ptm-modal-head">
          <h3>选择模版尺寸</h3>
          <button type="button" @click="createModalOpen = false">关闭</button>
        </div>
        <div class="ptm-create-field">
          <label>照片数量</label>
          <div class="ptm-segmented">
            <button
              v-for="option in photoCountOptions"
              :key="option"
              type="button"
              :class="{ active: createForm.photoCount === option }"
              @click="createForm.photoCount = option"
            >
              {{ option }}
            </button>
          </div>
        </div>
        <div class="ptm-size-grid">
          <button
            v-for="size in sizeOptions"
            :key="size.key"
            type="button"
            class="ptm-size-card"
            :class="{ active: createForm.sizeKey === size.key }"
            @click="createForm.sizeKey = size.key"
          >
            <span class="ptm-size-icon" :class="{ portrait: size.height > size.width }"></span>
            <strong>{{ size.label }}</strong>
            <small>{{ size.width }} x {{ size.height }}</small>
            <small>{{ size.paperWidthMm }} x {{ size.paperHeightMm }} mm</small>
          </button>
        </div>
        <div class="ptm-modal-actions">
          <button class="ptm-button" type="button" @click="createModalOpen = false">取消</button>
          <button class="ptm-button primary" type="button" @click="createTemplate">确定</button>
        </div>
      </section>
    </div>

    <div v-if="materialModalOpen" class="ptm-modal-mask" @click="materialModalOpen = false">
      <section class="ptm-modal wide" @click.stop>
        <div class="ptm-modal-head">
          <h3>{{ materialModalTitle }}</h3>
          <button type="button" @click="materialModalOpen = false">关闭</button>
        </div>
        <div class="ptm-material-toolbar">
          <label class="ptm-upload-button">
            本地上传
            <input type="file" accept="image/*,.svg" @change="uploadToCanvas" />
          </label>
        </div>
        <div v-if="materialsLoading" class="ptm-loading">素材加载中...</div>
        <template v-else>
          <div v-if="materials.length" class="ptm-material-picker">
            <div class="ptm-material-categories">
              <button
                v-for="category in materialCategories"
                :key="category"
                type="button"
                :class="{ active: activeMaterialCategory === category }"
                @click="activeMaterialCategory = category"
              >
                {{ category }}
              </button>
            </div>
            <div class="ptm-material-grid">
              <button v-for="item in visibleMaterials" :key="item.id" type="button" @click="selectMaterial(item)">
                <img :src="resolveUrl(item.thumbnail_url || item.storage_url)" :alt="item.name" />
                <span>{{ item.name }}</span>
              </button>
            </div>
          </div>
          <div v-else class="ptm-small-empty">暂无素材</div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Canvas, FabricImage, FabricObject, IText, Point, Rect, Shadow, loadSVGFromURL, util } from 'fabric'
import { adminApi } from '../api/client'
import type { AuthSession, DecorationMaterialItem, LocalSettings } from '../types'

(FabricObject as any).customProperties = ['_templateRole', '_slotId', '_isSvg', '_lockedAspectRatio', '_locked']

type MaterialKind = 'background' | 'frame' | 'sticker'
type SlotMarginSide = 'left' | 'right' | 'top' | 'bottom'
type TemplateRole = 'photo-slot' | 'photo-label' | 'background' | 'frame' | 'sticker' | 'upload' | 'text' | 'svg' | ''

interface PhotoSlot {
  id: string
  x: number
  y: number
  width: number
  height: number
  aspectRatio?: number | null
}

interface TemplateSize {
  key: string
  label: string
  width: number
  height: number
  paperWidthMm: number
  paperHeightMm: number
}

interface PrintTemplateItem {
  id: string
  name: string
  width: number
  height: number
  paperWidthMm: number
  paperHeightMm: number
  dmPaperSize: string
  paperLabel: string
  photoCount: number
  sizeKey: string
  photoSlots: PhotoSlot[]
  canvasJson?: any
}

interface LayerItem {
  id: string
  name: string
  roleLabel: string
  object: FabricObject
}

const props = defineProps<{
  activityId: number
  settings: LocalSettings
  auth: AuthSession
}>()

const loading = ref(false)
const saving = ref(false)
const mode = ref<'list' | 'editor'>('list')
const createModalOpen = ref(false)
const materialModalOpen = ref(false)
const materialType = ref<MaterialKind>('background')
const templates = ref<PrintTemplateItem[]>([])
const activeTemplateId = ref('')
const selectedSlotId = ref('')
const canvasRef = ref<HTMLCanvasElement | null>(null)
const fabricCanvas = shallowRef<Canvas | null>(null)
const selectedObject = shallowRef<FabricObject | null>(null)
const selectedLocked = ref(false)
const layerItems = shallowRef<LayerItem[]>([])
const layerObjectIds = new WeakMap<object, string>()
let layerObjectSeed = 0
const materials = ref<DecorationMaterialItem[]>([])
const materialsLoading = ref(false)
const activeMaterialCategory = ref('全部')
const notice = ref('')
const noticeKind = ref<'ok' | 'error' | 'warn'>('ok')

const inspector = reactive({
  text: '',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  angle: 0,
  opacity: 100,
  fill: '#111827',
  stroke: '#000000',
  strokeWidth: 0,
  fontSize: 60,
  fontFamily: 'Microsoft YaHei',
  bold: false,
  italic: false,
  underline: false,
  textAlign: 'left',
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 8,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
})

const baseConfig = reactive<Record<string, any>>({
  templateName: '活动照片贴纸',
  freePrintLimit: 2,
  printConfigMode: 'activity',
  paperKey: 'template',
  dmPaperSize: '0',
  paperWidthMm: 127,
  paperHeightMm: 127,
  canvasWidth: 1500,
  canvasHeight: 1500,
  photoInitX: 50,
  photoInitY: 50,
  photoInitScale: 100,
  photoMargin: 120,
  templates: [],
  activeTemplateId: '',
})

const editingTemplate = reactive<PrintTemplateItem>({
  id: '',
  name: '',
  width: 1500,
  height: 1500,
  paperWidthMm: 127,
  paperHeightMm: 127,
  dmPaperSize: '0',
  paperLabel: '方5寸',
  photoCount: 1,
  sizeKey: 'square-5',
  photoSlots: [],
})

const createForm = reactive({
  photoCount: 1,
  sizeKey: 'square-5',
})

const photoCountOptions = [1, 2, 3, 4]
const sizeOptions: TemplateSize[] = [
  { key: 'h4', label: '横4寸', width: 1500, height: 1050, paperWidthMm: 102, paperHeightMm: 71 },
  { key: 'v4', label: '竖4寸', width: 1050, height: 1500, paperWidthMm: 71, paperHeightMm: 102 },
  { key: 'square-5', label: '方5寸', width: 1500, height: 1500, paperWidthMm: 127, paperHeightMm: 127 },
  { key: 'h5', label: '横5寸', width: 1500, height: 1050, paperWidthMm: 127, paperHeightMm: 89 },
  { key: 'v5', label: '竖5寸', width: 1050, height: 1500, paperWidthMm: 89, paperHeightMm: 127 },
  { key: 'h6', label: '横6寸', width: 1800, height: 1200, paperWidthMm: 152, paperHeightMm: 102 },
  { key: 'v6', label: '竖6寸', width: 1200, height: 1800, paperWidthMm: 102, paperHeightMm: 152 },
]
const fontOptions = [
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '黑体', value: 'SimHei' },
  { label: '宋体', value: 'SimSun' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
]
const aspectRatioOptions = [
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
]
const slotPalette = [
  { fill: 'rgba(59, 130, 246, 0.22)', stroke: '#2563eb' },
  { fill: 'rgba(236, 72, 153, 0.22)', stroke: '#db2777' },
  { fill: 'rgba(16, 185, 129, 0.22)', stroke: '#059669' },
  { fill: 'rgba(245, 158, 11, 0.24)', stroke: '#d97706' },
]

const selectedSlot = computed(() => editingTemplate.photoSlots.find((slot) => slot.id === selectedSlotId.value) || null)
const materialModalTitle = computed(() => ({ background: '选择背景', frame: '选择相框', sticker: '选择贴纸' }[materialType.value]))
const materialCategories = computed(() => {
  const categories = new Set(materials.value.map((item) => item.category || '未分类'))
  return ['全部', ...Array.from(categories)]
})
const visibleMaterials = computed(() => {
  if (activeMaterialCategory.value === '全部') return materials.value
  return materials.value.filter((item) => (item.category || '未分类') === activeMaterialCategory.value)
})
const selectedRole = computed<TemplateRole>(() => ((selectedObject.value as any)?._templateRole || '') as TemplateRole)
const selectedIsPhotoSlot = computed(() => selectedRole.value === 'photo-slot')
const selectedIsText = computed(() => selectedRole.value === 'text')
const selectedIsSvg = computed(() => !!(selectedObject.value as any)?._isSvg)
const selectedIsGraphic = computed(() => !!selectedObject.value && !selectedIsPhotoSlot.value && !selectedIsText.value)
const selectedAllowsObjectMargin = computed(() => selectedRole.value === 'background' || selectedRole.value === 'frame')
const stageScale = computed(() => Math.min(860 / editingTemplate.width, 620 / editingTemplate.height, 1))
const canvasFrameStyle = computed(() => ({
  width: `${Math.round(editingTemplate.width * stageScale.value)}px`,
  height: `${Math.round(editingTemplate.height * stageScale.value)}px`,
}))

function inputValue(event: Event) {
  return Number((event.target as HTMLInputElement).value)
}

function showNotice(text: string, kind: 'ok' | 'error' | 'warn' = 'ok') {
  notice.value = text
  noticeKind.value = kind
  if (kind === 'ok') window.setTimeout(() => {
    if (notice.value === text) notice.value = ''
  }, 2600)
}

function resolveUrl(value?: string | null) {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:')) return value
  const root = props.settings.serverUrl.replace(/\/$/, '')
  if (value.startsWith('/')) return `${root}${value}`
  return `${root}/${value}`
}

function normalizeAssetUrlInJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeAssetUrlInJson)
  if (!value || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(source)) {
    next[key] = key === 'src' && typeof item === 'string' ? resolveUrl(item) : normalizeAssetUrlInJson(item)
  }
  return next
}

function previewBoxStyle(template: PrintTemplateItem) {
  const width = template.width >= template.height ? 230 : Math.round((230 * template.width) / template.height)
  const height = template.width >= template.height ? Math.round((230 * template.height) / template.width) : 230
  return { width: `${width}px`, height: `${height}px` }
}

function slotName(slot: PhotoSlot) {
  const index = editingTemplate.photoSlots.findIndex((item) => item.id === slot.id)
  return `照片 ${index >= 0 ? index + 1 : ''}`
}

function slotVisual(slotId: string) {
  const matched = String(slotId || '').match(/\d+$/)
  const index = Math.max(0, Number(matched?.[0] || 1) - 1)
  return slotPalette[index % slotPalette.length]
}

function generateSlots(count: number, width: number, height: number): PhotoSlot[] {
  const margin = Math.round(Math.min(width, height) * 0.08)
  const gap = Math.round(Math.min(width, height) * 0.035)
  if (count === 1) return [{ id: 'photo-1', x: margin, y: margin, width: width - margin * 2, height: height - margin * 2 }]
  const cols = 2
  const rows = Math.ceil(count / cols)
  const slotW = Math.round((width - margin * 2 - gap * (cols - 1)) / cols)
  const slotH = Math.round((height - margin * 2 - gap * (rows - 1)) / rows)
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    return { id: `photo-${index + 1}`, x: margin + col * (slotW + gap), y: margin + row * (slotH + gap), width: slotW, height: slotH }
  })
}

function makePhotoSlot(slot: PhotoSlot) {
  const visual = slotVisual(slot.id)
  const rect = new Rect({
    left: slot.x,
    top: slot.y,
    width: slot.width,
    height: slot.height,
    fill: visual.fill,
    stroke: visual.stroke,
    strokeWidth: 2,
    strokeDashArray: [10, 8],
    originX: 'left',
    originY: 'top',
    hasControls: true,
    hasBorders: true,
    lockScalingFlip: true,
  }) as any
  rect._templateRole = 'photo-slot'
  rect._slotId = slot.id
  rect._lockedAspectRatio = slot.aspectRatio || null
  return rect
}

function getSlotObject(slotId: string) {
  return fabricCanvas.value?.getObjects().find((item: any) => item._templateRole === 'photo-slot' && item._slotId === slotId) as any
}

function applyObjectLockState(obj: any, locked = !!obj?.lockMovementX) {
  if (!obj) return
  obj.set({
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    selectable: !locked,
    evented: !locked,
    hasControls: !locked,
    hasBorders: !locked,
    hoverCursor: locked ? 'default' : 'move',
  })
  obj._locked = locked
}

function layerObjectId(obj: FabricObject) {
  let id = layerObjectIds.get(obj)
  if (!id) {
    layerObjectSeed += 1
    id = `layer-${layerObjectSeed}`
    layerObjectIds.set(obj, id)
  }
  return id
}

function layerRoleLabel(obj: any) {
  const role = obj?._templateRole as TemplateRole
  if (role === 'photo-slot') return '照片区域'
  if (role === 'background') return '背景'
  if (role === 'frame') return '相框'
  if (role === 'sticker') return '贴纸'
  if (role === 'upload') return '上传图片'
  if (role === 'text') return '文字'
  if (role === 'svg' || obj?._isSvg) return 'SVG'
  const type = String(obj?.type || '').toLowerCase()
  if (type === 'image') return '图片'
  if (type.includes('text')) return '文字'
  if (type === 'rect') return '矩形'
  return '元素'
}

function layerObjectName(obj: any, stackIndex: number) {
  if (obj?._templateRole === 'photo-slot') {
    const index = editingTemplate.photoSlots.findIndex((slot) => slot.id === obj._slotId)
    return `照片区域 ${index >= 0 ? index + 1 : stackIndex + 1}`
  }
  if (obj?._templateRole === 'text') {
    const text = String(obj.text || '').trim()
    return text ? `文字: ${text.slice(0, 18)}` : '文字'
  }
  return `${layerRoleLabel(obj)} ${stackIndex + 1}`
}

function refreshLayerList() {
  const canvas = fabricCanvas.value
  if (!canvas) {
    layerItems.value = []
    return
  }
  layerItems.value = canvas.getObjects()
    .filter((obj: any) => obj._templateRole !== 'photo-label')
    .map((obj: any, index) => ({ id: layerObjectId(obj), name: layerObjectName(obj, index), roleLabel: layerRoleLabel(obj), object: obj as FabricObject }))
    .reverse()
}

function selectLayerObject(obj: FabricObject) {
  const canvas = fabricCanvas.value
  if (!canvas) return
  canvas.setActiveObject(obj)
  selectedObject.value = obj
  selectedLocked.value = !!(obj as any).lockMovementX
  if ((obj as any)._templateRole === 'photo-slot' && (obj as any)._slotId) selectedSlotId.value = (obj as any)._slotId
  refreshInspectorFromObject()
  canvas.requestRenderAll()
}

async function initEditorCanvas() {
  await nextTick()
  if (!canvasRef.value) return
  disposeCanvas()
  const displayW = Math.round(editingTemplate.width * stageScale.value)
  const displayH = Math.round(editingTemplate.height * stageScale.value)
  const canvas = new Canvas(canvasRef.value, {
    width: displayW,
    height: displayH,
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    selection: true,
    enableRetinaScaling: false,
  })
  canvas.setZoom(stageScale.value)
  fabricCanvas.value = canvas
  canvas.on('selection:created', syncSelection)
  canvas.on('selection:updated', syncSelection)
  canvas.on('selection:cleared', () => {
    selectedObject.value = null
    selectedLocked.value = false
  })
  canvas.on('object:added', refreshLayerList)
  canvas.on('object:removed', refreshLayerList)
  canvas.on('object:scaling', maintainPhotoSlotAspectRatio)
  canvas.on('object:modified', handleObjectModified)

  if (editingTemplate.canvasJson) {
    try {
      await canvas.loadFromJSON(normalizeAssetUrlInJson(editingTemplate.canvasJson) as Record<string, unknown>)
      canvas.getObjects().forEach((obj: any) => {
        if (!obj._templateRole && obj.data?.role === 'photo-slot') {
          obj._templateRole = 'photo-slot'
          obj._slotId = obj.data.slotName ? `photo-${String(obj.data.slotName).replace(/\D/g, '') || 1}` : undefined
        }
        applyObjectLockState(obj, !!obj.lockMovementX || !!obj._locked)
        if (obj._templateRole === 'photo-slot' && obj._slotId) {
          const slot = editingTemplate.photoSlots.find((item) => item.id === obj._slotId)
          obj._lockedAspectRatio = slot?.aspectRatio || null
          const visual = slotVisual(obj._slotId)
          obj.set({ fill: visual.fill, stroke: visual.stroke, strokeDashArray: [10, 8], lockScalingFlip: true })
        } else if (obj._templateRole === 'photo-label') {
          canvas.remove(obj)
        }
      })
      canvas.renderAll()
    } catch {
      addInitialSlots()
    }
  } else {
    addInitialSlots()
  }

  const firstSlot = editingTemplate.photoSlots[0]
  if (firstSlot) selectSlot(firstSlot.id)
  refreshLayerList()
}

function addInitialSlots() {
  const canvas = fabricCanvas.value
  if (!canvas) return
  canvas.clear()
  canvas.backgroundColor = '#ffffff'
  editingTemplate.photoSlots.forEach((slot) => canvas.add(makePhotoSlot(slot)))
  canvas.renderAll()
}

function disposeCanvas() {
  fabricCanvas.value?.dispose()
  fabricCanvas.value = null
  selectedObject.value = null
  selectedLocked.value = false
  layerItems.value = []
}

function syncSelection(event: any) {
  const obj = event.selected?.[0] || null
  selectedObject.value = obj
  selectedLocked.value = !!obj?.lockMovementX
  if (obj?._templateRole === 'photo-slot' && obj._slotId) selectedSlotId.value = obj._slotId
  refreshInspectorFromObject()
}

function handleObjectModified(event: any) {
  maintainPhotoSlotAspectRatio(event)
  syncSlotFromObject(event)
  refreshInspectorFromObject()
  refreshLayerList()
}

function maintainPhotoSlotAspectRatio(event: any) {
  const obj = event.target as any
  if (!obj || obj._templateRole !== 'photo-slot' || !obj._lockedAspectRatio) return
  const ratio = Number(obj._lockedAspectRatio)
  if (!Number.isFinite(ratio) || ratio <= 0) return
  const width = Math.max(20, (obj.width || 20) * (obj.scaleX || 1))
  const nextHeight = width / ratio
  obj.set({ scaleY: nextHeight / Math.max(1, obj.height || 1) })
  obj.setCoords()
}

function syncSlotFromObject(event: any) {
  const obj = event.target as any
  if (!obj || obj._templateRole !== 'photo-slot') return
  const slot = editingTemplate.photoSlots.find((item) => item.id === obj._slotId)
  if (!slot) return
  slot.x = Math.round(obj.left || 0)
  slot.y = Math.round(obj.top || 0)
  slot.width = Math.round((obj.width || slot.width) * (obj.scaleX || 1))
  slot.height = Math.round((obj.height || slot.height) * (obj.scaleY || 1))
  if (obj._lockedAspectRatio) {
    slot.aspectRatio = Number(obj._lockedAspectRatio)
    slot.height = Math.round(slot.width / slot.aspectRatio)
  }
  obj.set({ width: slot.width, height: slot.height, scaleX: 1, scaleY: 1 })
  obj._lockedAspectRatio = slot.aspectRatio || null
  obj.setCoords()
  const visual = slotVisual(slot.id)
  obj.set({ fill: visual.fill, stroke: visual.stroke, strokeDashArray: [10, 8] })
  fabricCanvas.value?.renderAll()
}

function normalizeSlotAspect(slot: PhotoSlot, source: 'width' | 'height' = 'width') {
  if (!slot.aspectRatio) return
  const ratio = Number(slot.aspectRatio)
  if (!Number.isFinite(ratio) || ratio <= 0) return
  if (source === 'height') {
    slot.width = Math.max(20, Math.round(slot.height * ratio))
  } else {
    slot.height = Math.max(20, Math.round(slot.width / ratio))
  }
}

function syncSelectedSlot() {
  const slot = selectedSlot.value
  const canvas = fabricCanvas.value
  if (!slot || !canvas) return
  normalizeSlotAspect(slot, 'width')
  const obj = getSlotObject(slot.id)
  if (!obj) return
  obj.set({ left: slot.x, top: slot.y, width: slot.width, height: slot.height, scaleX: 1, scaleY: 1 })
  obj._lockedAspectRatio = slot.aspectRatio || null
  obj.setCoords()
  canvas.setActiveObject(obj)
  canvas.renderAll()
  refreshInspectorFromObject()
}

function slotMargin(side: SlotMarginSide) {
  const slot = selectedSlot.value
  if (!slot) return 0
  if (side === 'left') return Math.max(0, Math.round(slot.x))
  if (side === 'right') return Math.max(0, Math.round(editingTemplate.width - slot.x - slot.width))
  if (side === 'top') return Math.max(0, Math.round(slot.y))
  return Math.max(0, Math.round(editingTemplate.height - slot.y - slot.height))
}

function setSlotMargin(side: SlotMarginSide, rawValue: number | string | null) {
  const slot = selectedSlot.value
  if (!slot) return
  const value = Math.max(0, Math.round(Number(rawValue) || 0))
  const minSize = 20
  const right = slotMargin('right')
  const bottom = slotMargin('bottom')
  if (side === 'left') {
    slot.x = Math.min(value, editingTemplate.width - minSize - right)
    slot.width = Math.max(minSize, editingTemplate.width - slot.x - right)
    normalizeSlotAspect(slot, 'width')
  } else if (side === 'right') {
    slot.width = Math.max(minSize, editingTemplate.width - slot.x - Math.min(value, editingTemplate.width - minSize - slot.x))
    normalizeSlotAspect(slot, 'width')
  } else if (side === 'top') {
    slot.y = Math.min(value, editingTemplate.height - minSize - bottom)
    slot.height = Math.max(minSize, editingTemplate.height - slot.y - bottom)
    normalizeSlotAspect(slot, 'height')
  } else {
    slot.height = Math.max(minSize, editingTemplate.height - slot.y - Math.min(value, editingTemplate.height - minSize - slot.y))
    normalizeSlotAspect(slot, 'height')
  }
  syncSelectedSlot()
}

function setSlotMarginLeft(value: number | string | null) { setSlotMargin('left', value) }
function setSlotMarginRight(value: number | string | null) { setSlotMargin('right', value) }
function setSlotMarginTop(value: number | string | null) { setSlotMargin('top', value) }
function setSlotMarginBottom(value: number | string | null) { setSlotMargin('bottom', value) }

function isSlotRatioActive(ratio: number) {
  return Math.abs(Number(selectedSlot.value?.aspectRatio || 0) - ratio) < 0.001
}

function applySlotAspectRatio(ratio: number) {
  const slot = selectedSlot.value
  if (!slot) return
  const maxWidth = Math.max(20, editingTemplate.width - slot.x)
  const maxHeight = Math.max(20, editingTemplate.height - slot.y)
  let width = Math.max(20, slot.width)
  let height = Math.round(width / ratio)
  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(height * ratio)
  }
  if (width > maxWidth) {
    width = maxWidth
    height = Math.round(width / ratio)
  }
  slot.width = Math.max(20, width)
  slot.height = Math.max(20, height)
  slot.aspectRatio = ratio
  syncSelectedSlot()
}

function nextPhotoSlotId() {
  let index = editingTemplate.photoSlots.length + 1
  const used = new Set(editingTemplate.photoSlots.map((slot) => slot.id))
  while (used.has(`photo-${index}`)) index += 1
  return `photo-${index}`
}

function addPhotoSlot() {
  const canvas = fabricCanvas.value
  if (!canvas) return
  const size = Math.round(Math.min(editingTemplate.width, editingTemplate.height) * 0.38)
  const slot: PhotoSlot = {
    id: nextPhotoSlotId(),
    x: Math.round((editingTemplate.width - size) / 2),
    y: Math.round((editingTemplate.height - size) / 2),
    width: size,
    height: size,
    aspectRatio: 1,
  }
  editingTemplate.photoSlots.push(slot)
  const rect = makePhotoSlot(slot)
  canvas.add(rect)
  selectedSlotId.value = slot.id
  canvas.setActiveObject(rect)
  selectedObject.value = rect
  refreshInspectorFromObject()
}

function normalizeColor(value: any, fallback = '#000000') {
  if (typeof value !== 'string') return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
  const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!rgb) return fallback
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function selectedAny() {
  return selectedObject.value as any
}

function objectBox(obj = selectedAny()) {
  if (!obj) return { left: 0, top: 0, width: 0, height: 0 }
  const box = obj.getBoundingRect()
  return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) }
}

function refreshInspectorFromObject() {
  const obj = selectedAny()
  if (!obj) return
  const box = objectBox(obj)
  inspector.x = box.left
  inspector.y = box.top
  inspector.width = box.width
  inspector.height = box.height
  inspector.angle = Math.round(Number(obj.angle || 0))
  inspector.opacity = Math.round(Number(obj.opacity ?? 1) * 100)
  inspector.fill = normalizeColor(obj.fill, inspector.fill)
  inspector.stroke = normalizeColor(obj.stroke, inspector.stroke)
  inspector.strokeWidth = Math.round(Number(obj.strokeWidth || 0))
  if (obj._templateRole === 'text') {
    inspector.text = obj.text || ''
    inspector.fontSize = Math.round(Number(obj.fontSize || 60))
    inspector.fontFamily = obj.fontFamily || 'Microsoft YaHei'
    inspector.bold = String(obj.fontWeight || '').toLowerCase() === 'bold' || Number(obj.fontWeight) >= 600
    inspector.italic = obj.fontStyle === 'italic'
    inspector.underline = !!obj.underline
    inspector.textAlign = obj.textAlign || 'left'
    inspector.fill = normalizeColor(obj.fill, '#111827')
    inspector.shadowEnabled = !!obj.shadow
    if (obj.shadow) {
      inspector.shadowColor = normalizeColor(obj.shadow.color, '#000000')
      inspector.shadowBlur = Math.round(Number(obj.shadow.blur || 0))
      inspector.shadowOffsetX = Math.round(Number(obj.shadow.offsetX || 0))
      inspector.shadowOffsetY = Math.round(Number(obj.shadow.offsetY || 0))
    }
  }
}

function setSelectedObjectBox(left: number, top: number, width: number, height: number) {
  const obj = selectedAny()
  if (!obj) return
  const current = objectBox(obj)
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const scaleX = (Number(obj.scaleX || 1) * safeWidth) / Math.max(1, current.width)
  const scaleY = (Number(obj.scaleY || 1) * safeHeight) / Math.max(1, current.height)
  obj.set({ scaleX, scaleY })
  obj.setPositionByOrigin(new Point(left + safeWidth / 2, top + safeHeight / 2), 'center', 'center')
  obj.setCoords()
  syncSlotFromObject({ target: obj })
}

function applyObjectBox() {
  const canvas = fabricCanvas.value
  if (!canvas || !selectedObject.value) return
  setSelectedObjectBox(inspector.x, inspector.y, inspector.width, inspector.height)
  refreshInspectorFromObject()
  canvas.renderAll()
}

function applyPaintToObject(obj: any, props: Record<string, any>) {
  obj.set(props)
  const children = obj._objects || []
  children.forEach((child: any) => child.set(props))
}

function applyObjectVisualProps() {
  const canvas = fabricCanvas.value
  const obj = selectedAny()
  if (!canvas || !obj) return
  obj.set({ angle: inspector.angle, opacity: Math.max(0, Math.min(100, Number(inspector.opacity || 0))) / 100 })
  if (obj._isSvg) applyPaintToObject(obj, { fill: inspector.fill, stroke: inspector.stroke, strokeWidth: Number(inspector.strokeWidth || 0) })
  obj.setCoords()
  refreshInspectorFromObject()
  canvas.renderAll()
  refreshLayerList()
}

function applyTextProps() {
  const canvas = fabricCanvas.value
  const obj = selectedAny()
  if (!canvas || !obj || obj._templateRole !== 'text') return
  obj.set({
    text: inspector.text,
    fontSize: Number(inspector.fontSize || 60),
    fontFamily: inspector.fontFamily,
    fill: inspector.fill,
    fontWeight: inspector.bold ? 'bold' : 'normal',
    fontStyle: inspector.italic ? 'italic' : 'normal',
    underline: inspector.underline,
    textAlign: inspector.textAlign,
    shadow: inspector.shadowEnabled ? new Shadow({
      color: inspector.shadowColor,
      blur: Number(inspector.shadowBlur || 0),
      offsetX: Number(inspector.shadowOffsetX || 0),
      offsetY: Number(inspector.shadowOffsetY || 0),
    }) : null,
  })
  obj.setCoords()
  refreshInspectorFromObject()
  canvas.renderAll()
  refreshLayerList()
}

function objectMargin(side: SlotMarginSide) {
  const obj = selectedAny()
  if (!obj) return 0
  const box = objectBox(obj)
  if (side === 'left') return Math.max(0, box.left)
  if (side === 'right') return Math.max(0, Math.round(editingTemplate.width - box.left - box.width))
  if (side === 'top') return Math.max(0, box.top)
  return Math.max(0, Math.round(editingTemplate.height - box.top - box.height))
}

function setObjectMargin(side: SlotMarginSide, rawValue: number | string | null) {
  const canvas = fabricCanvas.value
  const obj = selectedAny()
  if (!canvas || !obj) return
  const value = Math.max(0, Math.round(Number(rawValue) || 0))
  const minSize = 1
  const box = objectBox(obj)
  const right = objectMargin('right')
  const bottom = objectMargin('bottom')
  let left = box.left
  let top = box.top
  let width = box.width
  let height = box.height
  if (side === 'left') {
    left = Math.min(value, editingTemplate.width - minSize - right)
    width = Math.max(minSize, editingTemplate.width - left - right)
  } else if (side === 'right') {
    width = Math.max(minSize, editingTemplate.width - left - Math.min(value, editingTemplate.width - minSize - left))
  } else if (side === 'top') {
    top = Math.min(value, editingTemplate.height - minSize - bottom)
    height = Math.max(minSize, editingTemplate.height - top - bottom)
  } else {
    height = Math.max(minSize, editingTemplate.height - top - Math.min(value, editingTemplate.height - minSize - top))
  }
  setSelectedObjectBox(left, top, width, height)
  refreshInspectorFromObject()
  canvas.renderAll()
}

function setObjectMarginLeft(value: number | string | null) { setObjectMargin('left', value) }
function setObjectMarginRight(value: number | string | null) { setObjectMargin('right', value) }
function setObjectMarginTop(value: number | string | null) { setObjectMargin('top', value) }
function setObjectMarginBottom(value: number | string | null) { setObjectMargin('bottom', value) }

function selectSlot(value: string | number) {
  const id = String(value)
  selectedSlotId.value = id
  const canvas = fabricCanvas.value
  if (!canvas) return
  const obj = canvas.getObjects().find((item: any) => item._slotId === id)
  if (obj) {
    canvas.setActiveObject(obj)
    selectedObject.value = obj
    selectedLocked.value = !!(obj as any).lockMovementX
    refreshInspectorFromObject()
    canvas.renderAll()
  }
}

function alignSelected(modeValue: 'horizontal' | 'vertical' | 'center') {
  const canvas = fabricCanvas.value
  const obj = selectedObject.value as any
  if (!canvas || !obj) return
  if (modeValue === 'horizontal' || modeValue === 'center') obj.setPositionByOrigin(new Point(editingTemplate.width / 2, obj.getCenterPoint().y), 'center', 'center')
  if (modeValue === 'vertical' || modeValue === 'center') obj.setPositionByOrigin(new Point(obj.getCenterPoint().x, editingTemplate.height / 2), 'center', 'center')
  obj.setCoords()
  canvas.setActiveObject(obj)
  syncSlotFromObject({ target: obj })
  refreshInspectorFromObject()
  canvas.renderAll()
}

function isSvgUrl(url: string) {
  return /\.svg(?:$|[?#])/i.test(url)
}

async function loadCanvasAsset(rawUrl: string, role: MaterialKind | 'upload') {
  const url = resolveUrl(rawUrl)
  if (!isSvgUrl(url)) {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    return { object: img as any, isSvg: false }
  }
  const parsed = await loadSVGFromURL(url, undefined, { crossOrigin: 'anonymous' })
  const objects = parsed.objects.filter(Boolean) as FabricObject[]
  const svgObject = util.groupSVGElements(objects, parsed.options) as any
  svgObject._isSvg = true
  svgObject._templateRole = role
  return { object: svgObject, isSvg: true }
}

async function addImageToCanvas(url: string, role: MaterialKind | 'upload') {
  const canvas = fabricCanvas.value
  if (!canvas) return
  const { object: img, isSvg } = await loadCanvasAsset(url, role)
  const w = editingTemplate.width
  const h = editingTemplate.height
  if (role === 'background') {
    canvas.getObjects().filter((obj: any) => obj._templateRole === 'background').forEach((obj) => canvas.remove(obj))
    img.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: w / (img.width || 1), scaleY: h / (img.height || 1) })
    img._templateRole = 'background'
    img._isSvg = isSvg
    applyObjectLockState(img, true)
    canvas.add(img)
    ;(canvas as any).sendObjectToBack(img)
    selectedObject.value = null
  } else {
    const maxW = role === 'frame' ? w : w * 0.35
    const maxH = role === 'frame' ? h : h * 0.35
    const scale = Math.min(maxW / (img.width || 1), maxH / (img.height || 1), 1)
    img.set({ left: w / 2, top: h / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, hasControls: true, hasBorders: true })
    img._templateRole = role
    img._isSvg = isSvg
    canvas.add(img)
    canvas.setActiveObject(img)
    selectedObject.value = img
  }
  refreshInspectorFromObject()
  canvas.renderAll()
  refreshLayerList()
}

function addText() {
  const canvas = fabricCanvas.value
  if (!canvas) return
  const text = new IText('双击编辑文字', {
    left: editingTemplate.width / 2,
    top: editingTemplate.height / 2,
    originX: 'center',
    originY: 'center',
    fontSize: 60,
    fill: '#111827',
    fontFamily: 'Microsoft YaHei',
  }) as any
  text._templateRole = 'text'
  canvas.add(text)
  canvas.setActiveObject(text)
  selectedObject.value = text
  refreshInspectorFromObject()
  canvas.renderAll()
  refreshLayerList()
}

async function openMaterialPicker(type: MaterialKind) {
  materialType.value = type
  activeMaterialCategory.value = '全部'
  materialModalOpen.value = true
  materialsLoading.value = true
  try {
    materials.value = await fetchAllMaterials(type)
  } catch {
    showNotice('加载素材失败', 'error')
  } finally {
    materialsLoading.value = false
  }
}

async function fetchAllMaterials(type: MaterialKind) {
  const pageSize = 200
  let page = 1
  let total = Number.POSITIVE_INFINITY
  const items: DecorationMaterialItem[] = []
  while (items.length < total) {
    const data = await adminApi.listMaterials(props.settings, props.auth, type, undefined, page, pageSize)
    const list = data.items || []
    items.push(...list)
    total = Number(data.total ?? items.length)
    if (!list.length || list.length < pageSize) break
    page += 1
  }
  return items
}

async function selectMaterial(item: DecorationMaterialItem) {
  await addImageToCanvas(item.storage_url, materialType.value)
  materialModalOpen.value = false
}

async function uploadToCanvas(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const uploadRes = await adminApi.uploadMaterial(props.settings, props.auth, file)
    const url = uploadRes.storage_url || uploadRes.url
    if (!url) throw new Error('upload url missing')
    await addImageToCanvas(url, materialType.value)
    await adminApi.createMaterial(props.settings, props.auth, {
      type: materialType.value,
      name: file.name.replace(/\.[^.]+$/, ''),
      storage_url: url,
      thumbnail_url: uploadRes.thumbnail_url || url,
      category: '模版编辑上传',
      is_active: true,
      sort_order: 0,
    })
    showNotice('素材已添加')
    materialModalOpen.value = false
  } catch {
    showNotice('上传素材失败', 'error')
  } finally {
    input.value = ''
  }
}

function bringForward() {
  const canvas = fabricCanvas.value
  if (!canvas || !selectedObject.value) return
  ;(canvas as any).bringObjectForward(selectedObject.value)
  canvas.renderAll()
  refreshLayerList()
}

function sendBackward() {
  const canvas = fabricCanvas.value
  if (!canvas || !selectedObject.value) return
  ;(canvas as any).sendObjectBackwards(selectedObject.value)
  canvas.renderAll()
  refreshLayerList()
}

function bringToFront() {
  const canvas = fabricCanvas.value
  if (!canvas || !selectedObject.value) return
  ;(canvas as any).bringObjectToFront(selectedObject.value)
  canvas.renderAll()
  refreshLayerList()
}

function sendToBack() {
  const canvas = fabricCanvas.value
  if (!canvas || !selectedObject.value) return
  ;(canvas as any).sendObjectToBack(selectedObject.value)
  canvas.renderAll()
  refreshLayerList()
}

function toggleLock() {
  const canvas = fabricCanvas.value
  const obj = selectedObject.value as any
  if (!canvas || !obj) return
  const locked = !obj.lockMovementX
  applyObjectLockState(obj, locked)
  obj.setCoords()
  if (locked) {
    canvas.discardActiveObject()
    selectedObject.value = obj
    selectedLocked.value = true
  } else {
    canvas.setActiveObject(obj)
    selectedLocked.value = false
  }
  canvas.requestRenderAll()
  refreshLayerList()
}

function deleteSelected() {
  const canvas = fabricCanvas.value
  if (!canvas || !selectedObject.value) return
  const obj = selectedObject.value as any
  if (obj._templateRole === 'photo-slot' && obj._slotId) {
    editingTemplate.photoSlots = editingTemplate.photoSlots.filter((slot) => slot.id !== obj._slotId)
  }
  canvas.remove(selectedObject.value)
  selectedObject.value = null
  selectedLocked.value = false
  selectedSlotId.value = editingTemplate.photoSlots[0]?.id || ''
  canvas.renderAll()
}

function snapshotCanvasJson() {
  const canvas = fabricCanvas.value
  if (!canvas) return null
  return (canvas as any).toJSON(['_templateRole', '_slotId', '_isSvg', '_lockedAspectRatio', '_locked'])
}

function templateFromSize(size: TemplateSize): PrintTemplateItem {
  return {
    id: `template-${Date.now()}`,
    name: `${size.label} ${createForm.photoCount}张`,
    width: size.width,
    height: size.height,
    paperWidthMm: size.paperWidthMm,
    paperHeightMm: size.paperHeightMm,
    dmPaperSize: '0',
    paperLabel: size.label,
    photoCount: createForm.photoCount,
    sizeKey: size.key,
    photoSlots: generateSlots(createForm.photoCount, size.width, size.height),
  }
}

function normalizeTemplate(item: any, index = 0): PrintTemplateItem {
  const size = sizeOptions.find((entry) => entry.key === item?.sizeKey) || sizeOptions[2]
  const width = Number(item?.width || item?.canvasWidth || size.width)
  const height = Number(item?.height || item?.canvasHeight || size.height)
  const rawSlots = Array.isArray(item?.photoSlots) ? item.photoSlots : []
  const slots = rawSlots.length
    ? rawSlots.map((slot: any, slotIndex: number) => ({
      id: String(slot.id || `photo-${slotIndex + 1}`),
      x: Number(slot.x ?? slot.left ?? 0),
      y: Number(slot.y ?? slot.top ?? 0),
      width: Number(slot.width || 240),
      height: Number(slot.height || 240),
      aspectRatio: slot.aspectRatio ?? null,
    }))
    : generateSlots(Number(item?.photoCount || 1), width, height)
  return {
    id: String(item?.id || `template-${index + 1}`),
    name: String(item?.name || item?.templateName || `打印模版 ${index + 1}`),
    width,
    height,
    paperWidthMm: Number(item?.paperWidthMm || size.paperWidthMm),
    paperHeightMm: Number(item?.paperHeightMm || size.paperHeightMm),
    dmPaperSize: String(item?.dmPaperSize || '0'),
    paperLabel: String(item?.paperLabel || size.label),
    photoCount: Number(item?.photoCount || slots.length || 1),
    sizeKey: String(item?.sizeKey || size.key),
    photoSlots: slots,
    canvasJson: item?.canvasJson,
  }
}

function applyTemplate(item: PrintTemplateItem) {
  Object.assign(editingTemplate, JSON.parse(JSON.stringify(item)))
  selectedSlotId.value = editingTemplate.photoSlots[0]?.id || ''
}

function serializeTemplateToBase(item: PrintTemplateItem) {
  baseConfig.templateName = item.name
  baseConfig.printConfigMode = 'activity'
  baseConfig.paperKey = item.sizeKey
  baseConfig.dmPaperSize = item.dmPaperSize || '0'
  baseConfig.paperWidthMm = item.paperWidthMm
  baseConfig.paperHeightMm = item.paperHeightMm
  baseConfig.canvasWidth = item.width
  baseConfig.canvasHeight = item.height
  baseConfig.photoSlots = item.photoSlots
  baseConfig.activeTemplateId = item.id
  baseConfig.templates = templates.value
  const first = item.photoSlots[0]
  if (first) baseConfig.photoMargin = Math.max(0, Math.round(Math.min(first.x, first.y)))
}

function clearBaseTemplateConfig() {
  baseConfig.templateName = ''
  baseConfig.paperKey = ''
  baseConfig.dmPaperSize = ''
  baseConfig.canvasWidth = 0
  baseConfig.canvasHeight = 0
  baseConfig.paperWidthMm = 0
  baseConfig.paperHeightMm = 0
  baseConfig.photoSlots = []
  baseConfig.activeTemplateId = ''
  baseConfig.templates = []
  delete baseConfig.canvasJson
}

async function loadTemplates() {
  loading.value = true
  try {
    const res = await adminApi.getActivityPrintTemplate(props.settings, props.auth, props.activityId)
    const parsed = res.value ? JSON.parse(res.value) : null
    if (!parsed) {
      templates.value = []
      activeTemplateId.value = ''
      return
    }
    Object.assign(baseConfig, parsed)
    if (Array.isArray(parsed.templates)) {
      templates.value = parsed.templates.map(normalizeTemplate)
      activeTemplateId.value = templates.value.length ? String(parsed.activeTemplateId || templates.value[0].id) : ''
      return
    }
    const fallback = normalizeTemplate(parsed, 0)
    fallback.id = 'default'
    fallback.name = parsed.templateName || '默认模版'
    templates.value = [fallback]
    activeTemplateId.value = fallback.id
  } catch {
    templates.value = []
    activeTemplateId.value = ''
    showNotice('加载模版失败', 'error')
  } finally {
    loading.value = false
  }
}

async function createTemplate() {
  const size = sizeOptions.find((item) => item.key === createForm.sizeKey) || sizeOptions[2]
  const next = templateFromSize(size)
  templates.value.unshift(next)
  activeTemplateId.value = next.id
  applyTemplate(next)
  mode.value = 'editor'
  createModalOpen.value = false
  await initEditorCanvas()
}

async function editTemplate(item: PrintTemplateItem) {
  applyTemplate(item)
  mode.value = 'editor'
  await initEditorCanvas()
}

async function persistTemplates() {
  const active = templates.value.find((item) => item.id === activeTemplateId.value) || templates.value[0]
  if (active) serializeTemplateToBase(active)
  else clearBaseTemplateConfig()
  await adminApi.updateActivityPrintTemplate(
    props.settings,
    props.auth,
    props.activityId,
    JSON.stringify({ ...baseConfig, templates: templates.value, activeTemplateId: activeTemplateId.value }, null, 2),
  )
}

async function saveEditingTemplate() {
  if (!editingTemplate.name.trim()) {
    showNotice('请输入模版名称', 'warn')
    return
  }
  saving.value = true
  try {
    const index = templates.value.findIndex((item) => item.id === editingTemplate.id)
    const snapshot = JSON.parse(JSON.stringify(editingTemplate)) as PrintTemplateItem
    snapshot.canvasJson = snapshotCanvasJson()
    if (index >= 0) templates.value.splice(index, 1, snapshot)
    else templates.value.unshift(snapshot)
    activeTemplateId.value = snapshot.id
    await persistTemplates()
    showNotice('模版已保存')
    disposeCanvas()
    mode.value = 'list'
  } catch {
    showNotice('保存模版失败', 'error')
  } finally {
    saving.value = false
  }
}

async function setActiveTemplate(item: PrintTemplateItem) {
  activeTemplateId.value = item.id
  try {
    await persistTemplates()
    showNotice('已设为当前模版')
  } catch {
    showNotice('保存当前模版失败', 'error')
  }
}

async function deleteTemplate(id: string) {
  if (!window.confirm('确定删除该模版？')) return
  templates.value = templates.value.filter((item) => item.id !== id)
  if (activeTemplateId.value === id) activeTemplateId.value = templates.value[0]?.id || ''
  try {
    await persistTemplates()
    showNotice('模版已删除')
  } catch {
    showNotice('删除模版失败', 'error')
  }
}

function backToList() {
  disposeCanvas()
  mode.value = 'list'
}

watch(stageScale, () => {
  if (mode.value === 'editor') void initEditorCanvas()
})

watch(() => props.activityId, () => {
  disposeCanvas()
  mode.value = 'list'
  void loadTemplates()
})

onMounted(loadTemplates)
onBeforeUnmount(disposeCanvas)
</script>

<style scoped>
.ptm {
  background: #f7f8fb;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  padding: 18px;
}

.ptm-toolbar,
.ptm-modal-head,
.ptm-modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ptm-toolbar {
  margin-bottom: 16px;
}

.ptm-toolbar h3,
.ptm-modal h3 {
  margin: 0;
  font-size: 16px;
}

.ptm-toolbar p {
  margin: 4px 0 0;
  color: #8c8c8c;
  font-size: 13px;
}

.ptm-actions,
.ptm-card-actions,
.ptm-modal-actions {
  display: flex;
  gap: 8px;
}

.ptm-button,
.ptm-card-actions button,
.ptm-link,
.ptm-tool-grid button,
.ptm-layer-actions button,
.ptm-layer-list button,
.ptm-ratio-actions button,
.ptm-modal-head button,
.ptm-segmented button,
.ptm-size-card,
.ptm-material-categories button {
  min-height: 32px;
  border: 1px solid #d9e2ec;
  border-radius: 6px;
  background: #fff;
  color: #475569;
  padding: 0 10px;
}

.ptm-button.primary,
.ptm-tool-grid .primary,
.ptm-segmented button.active,
.ptm-size-card.active,
.ptm-material-categories button.active,
.ptm-ratio-actions button.active {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.ptm-button.full {
  width: 100%;
}

.danger {
  color: #d92d20 !important;
  border-color: #fecdca !important;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ptm-notice {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #175cd3;
}

.ptm-notice.error {
  border-color: #fecdca;
  background: #fef3f2;
  color: #b42318;
}

.ptm-notice.warn {
  border-color: #fedf89;
  background: #fffaeb;
  color: #b54708;
}

.ptm-loading,
.ptm-small-empty,
.ptm-empty {
  padding: 34px;
  text-align: center;
  color: #8c8c8c;
}

.ptm-empty {
  width: 100%;
  min-height: 180px;
  border: 1px dashed #b4bccb;
  border-radius: 8px;
  background: #fff;
  color: #1677ff;
  font-weight: 700;
}

.ptm-template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 14px;
}

.ptm-template-card {
  background: #fff;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  padding: 14px;
}

.ptm-template-card.active {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.ptm-template-preview {
  position: relative;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: linear-gradient(135deg, #fff, #eef6ff);
  color: #64748b;
  font-size: 12px;
}

.ptm-template-meta {
  display: grid;
  gap: 3px;
}

.ptm-template-meta span {
  color: #8c8c8c;
  font-size: 12px;
}

.ptm-card-actions {
  justify-content: flex-end;
  margin-top: 12px;
  flex-wrap: wrap;
}

.ptm-editor-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  min-height: 700px;
  background: #eef0f5;
  border-radius: 8px;
  overflow: hidden;
}

.ptm-sidebar,
.ptm-inspector {
  background: #fff;
  padding: 16px;
  overflow: auto;
  max-height: calc(100vh - 190px);
}

.ptm-sidebar {
  border-right: 1px solid #e5e7eb;
}

.ptm-inspector {
  border-left: 1px solid #e5e7eb;
}

.ptm-link {
  margin-bottom: 12px;
}

.ptm-side-section {
  margin-bottom: 18px;
}

.ptm-side-section label,
.ptm-side-title {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
}

.ptm-side-section input,
.ptm-side-section select {
  width: 100%;
  border: 1px solid #d8dce6;
  border-radius: 6px;
  padding: 8px 9px;
}

.ptm-template-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.ptm-template-facts span {
  border-radius: 12px;
  background: #f1f5f9;
  color: #475569;
  padding: 3px 8px;
  font-size: 12px;
}

.ptm-tool-grid,
.ptm-layer-actions,
.ptm-property-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.ptm-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 8px 0;
}

.ptm-checks label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.ptm-checks input {
  width: auto;
}

.ptm-ratio-actions {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin: 12px 0;
}

.ptm-editor-main {
  min-width: 0;
  padding: 18px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
}

.ptm-canvas-size {
  justify-self: center;
  color: #64748b;
  font-size: 12px;
}

.ptm-stage-wrap {
  display: grid;
  place-items: center;
  min-height: 650px;
  overflow: auto;
}

.ptm-canvas-frame {
  background: #fff;
  border: 1px solid #cbd5e1;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}

.ptm-layer-list {
  display: grid;
  gap: 6px;
}

.ptm-layer-list button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
}

.ptm-layer-list button.active {
  border-color: #1677ff;
  background: #eff6ff;
}

.ptm-layer-list small {
  color: #8c8c8c;
}

.ptm-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(16, 24, 40, 0.68);
}

.ptm-modal {
  width: min(640px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: #fff;
  border-radius: 8px;
  padding: 18px;
  display: grid;
  gap: 16px;
}

.ptm-modal.wide {
  width: min(860px, 96vw);
}

.ptm-create-field {
  display: grid;
  gap: 8px;
}

.ptm-segmented {
  display: flex;
  gap: 8px;
}

.ptm-size-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.ptm-size-card {
  min-height: 132px;
  display: grid;
  justify-items: center;
  gap: 5px;
  padding: 12px 8px;
}

.ptm-size-icon {
  width: 46px;
  height: 30px;
  border-radius: 4px;
  border: 2px solid currentColor;
  opacity: 0.8;
}

.ptm-size-icon.portrait {
  width: 30px;
  height: 46px;
}

.ptm-material-toolbar {
  display: flex;
  justify-content: flex-end;
}

.ptm-upload-button {
  position: relative;
  overflow: hidden;
  min-height: 34px;
  border: 1px solid #d9e2ec;
  border-radius: 6px;
  padding: 7px 12px;
  color: #475569;
}

.ptm-upload-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.ptm-material-picker {
  display: grid;
  gap: 12px;
}

.ptm-material-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ptm-material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 10px;
}

.ptm-material-grid button {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  display: grid;
  gap: 6px;
  color: #475569;
}

.ptm-material-grid img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  background: #f7f8fa;
  border-radius: 6px;
}
</style>
