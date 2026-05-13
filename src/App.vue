<template>
  <main v-if="!auth" class="login-screen">
    <section class="login-panel">
      <div class="brand-row">
        <div class="brand-mark">ST</div>
        <div>
          <h1>PhotoPrinter</h1>
          <span>Windows 打印管理员客户端</span>
        </div>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <label>
          <span>服务端地址</span>
          <input v-model.trim="store.settings.serverUrl" placeholder="http://127.0.0.1:8000" />
        </label>
        <label>
          <span>账号</span>
          <input v-model.trim="loginForm.username" autocomplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="loginForm.password" type="password" autocomplete="current-password" />
        </label>
        <button class="primary-button" type="submit" :disabled="loading">
          <LogIn :size="17" />
          登录
        </button>
        <p v-if="messageText" class="form-message error">{{ messageText }}</p>
      </form>
    </section>
  </main>

  <main v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand-row compact">
        <div class="brand-mark">ST</div>
        <div>
          <h1>PhotoPrinter</h1>
          <span>{{ auth.username }}</span>
        </div>
      </div>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activeView === item.key }"
          type="button"
          @click="switchView(item.key)"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <section class="listen-card">
        <div class="listen-topline">
          <span class="status-dot" :class="{ on: printState.listening, warn: printState.lastError }"></span>
          <strong>{{ printState.listening ? '监听中' : '未监听' }}</strong>
        </div>
        <span class="muted">{{ credentialLabel }}</span>
        <span class="muted">{{ listeningActivityLabel }}</span>
        <button
          class="listen-button"
          type="button"
          :class="{ active: printState.listening }"
          @click="printState.listening ? stopListening() : startListening()"
        >
          <RadioTower v-if="!printState.listening" :size="17" />
          <Square v-else :size="16" />
          {{ printState.listening ? '停止监听' : '启动当前活动监听' }}
        </button>
      </section>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <h2>{{ workspaceTitle }}</h2>
          <span>{{ serverLabel }}</span>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" type="button" @click="refreshCurrent">
            <RefreshCcw :size="17" />
            刷新
          </button>
          <button class="ghost-button" type="button" @click="activeView = 'settings'">
            <Settings :size="17" />
            客户端设置
          </button>
          <button class="ghost-button danger" type="button" @click="logout">
            <LogOut :size="17" />
            退出
          </button>
        </div>
      </header>

      <div v-if="messageText" class="banner" :class="messageKind">{{ messageText }}</div>

      <section v-if="activeView === 'activities'" class="content-band">
        <div v-if="selectedActivity" class="activity-workspace">
          <div class="section-head workspace-head">
            <button class="ghost-button" type="button" @click="closeActivity">
              <ChevronLeft :size="17" />
              返回活动
            </button>
            <img class="workspace-cover" :src="activityImage(selectedActivity)" alt="" />
            <div>
              <h3>{{ selectedActivity.name }}</h3>
              <span>{{ selectedActivity.venue || '未设置场地' }} · {{ activityTime(selectedActivity) }}</span>
            </div>
          </div>
          <div class="tabs">
            <button :class="{ active: activityTab === 'records' }" type="button" @click="activityTab = 'records'">打印记录</button>
            <button :class="{ active: activityTab === 'settings' }" type="button" @click="activityTab = 'settings'">打印设置</button>
            <button :class="{ active: activityTab === 'template' }" type="button" @click="activityTab = 'template'">打印模版</button>
          </div>
          <PrintRecordTable
            v-if="activityTab === 'records'"
            :records="activityRecords"
            :loading="loading"
            @preview="openPreview"
            @reprint="handleReprint"
            @delete="handleDeletePrintRecord"
          />
          <form v-else-if="activityTab === 'settings'" class="print-settings-panel" @submit.prevent="saveActivitySettings">
            <section class="settings-card">
              <div>
                <h4>打印规则</h4>
                <p>与 Web 后台活动打印设置保持一致。</p>
              </div>
              <div class="settings-grid compact-grid">
                <label>
                  <span>免费份数</span>
                  <input v-model.number="activityPrintForm.print_free_quota" type="number" min="0" />
                </label>
                <label>
                  <span>单价（元）</span>
                  <input v-model.number="activityPrintForm.print_price_yuan" type="number" min="0" step="0.01" />
                </label>
              </div>
            </section>
            <section class="settings-card">
              <div>
                <h4>渲染模式</h4>
                <p>服务端渲染会走云印，本地客户端渲染会生成本地待打印订单。</p>
              </div>
              <div class="segmented big">
                <button
                  type="button"
                  :class="{ active: activityPrintForm.server_render_enabled }"
                  @click="activityPrintForm.server_render_enabled = true"
                >
                  服务端渲染
                </button>
                <button
                  type="button"
                  :class="{ active: !activityPrintForm.server_render_enabled }"
                  @click="activityPrintForm.server_render_enabled = false"
                >
                  本地客户端渲染
                </button>
              </div>
              <label class="settings-inline">
                <span>渲染倍率</span>
                <select v-model.number="activityPrintForm.print_render_multiplier">
                  <option :value="1">1x</option>
                  <option :value="2">2x</option>
                  <option :value="3">3x</option>
                </select>
              </label>
            </section>
            <div class="button-row full">
              <button class="primary-button" type="submit">保存打印设置</button>
            </div>
          </form>

          <PrintTemplateManager
            v-else
            :activity-id="selectedActivity.id"
            :settings="store.settings"
            :auth="getAuth()"
          />
        </div>

        <div v-else>
          <div class="section-head">
            <div>
              <h3>活动管理</h3>
              <span>打印管理员工作入口</span>
            </div>
          </div>
          <div class="activity-grid">
            <button v-for="activity in activities" :key="activity.id" class="activity-card" type="button" @click="openActivity(activity)">
              <div class="activity-cover">
                <img :src="activityImage(activity)" alt="" />
                <span class="activity-status">{{ formatActivityStatus(activity.status) }}</span>
              </div>
              <div class="activity-body">
                <strong>{{ activity.name }}</strong>
                <span>{{ activityTime(activity) }}</span>
                <small>{{ activity.program_count || 0 }} 个节目 / {{ activity.ready_program_count || 0 }} 已就绪</small>
                <div class="activity-foot">
                  <span>{{ activity.venue || '未设置场地' }}</span>
                  <ChevronRight :size="17" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="activeView === 'materials'" class="content-band">
        <div class="section-head">
          <div>
            <h3>素材管理</h3>
            <span>背景、相框、贴纸素材库</span>
          </div>
          <div class="toolbar">
            <label class="upload-button">
              <Upload :size="16" />
              上传素材
              <input type="file" accept="image/*,.svg" multiple @change="uploadMaterials" />
            </label>
          </div>
        </div>
        <div class="material-tabs">
          <button
            v-for="tab in materialTypeTabs"
            :key="tab.value"
            type="button"
            :class="{ active: materialType === tab.value }"
            @click="selectMaterialType(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div v-if="materialType === 'sticker'" class="category-strip">
          <button
            v-for="category in materialCategoryOptions"
            :key="category.value"
            type="button"
            :class="{ active: materialCategory === category.value }"
            @click="selectMaterialCategory(category.value)"
          >
            {{ category.label }}
          </button>
        </div>
        <div class="material-summary">
          <span>{{ materialTypeLabel }} · {{ materialCategoryLabel }}</span>
          <span>共 {{ materialTotal }} 个素材</span>
        </div>
        <div class="material-grid">
          <article v-for="item in materials" :key="item.id" class="material-item">
            <img :src="resolveUrl(item.thumbnail_url || item.storage_url)" :alt="item.name" />
            <div>
              <strong>{{ item.name }}</strong>
              <span>{{ item.category || item.type }}</span>
            </div>
            <div class="button-row tight">
              <button class="secondary-button" type="button" @click="toggleMaterial(item)">
                {{ item.is_active ? '停用' : '启用' }}
              </button>
              <button class="secondary-button danger" type="button" @click="deleteMaterial(item.id)">删除</button>
            </div>
          </article>
        </div>
        <div class="load-more-row">
          <button v-if="materialHasMore" class="secondary-button" type="button" @click="loadMoreMaterials">加载更多</button>
          <span v-else class="muted">已显示全部素材</span>
        </div>
      </section>

      <section v-else-if="activeView === 'cloud-print'" class="content-band">
        <div class="section-head">
          <div>
            <h3>云印设置</h3>
            <span>全局打印配置</span>
          </div>
        </div>
        <form class="settings-grid" @submit.prevent="saveGlobalPrintSettings">
          <label>
            <span>免费份数</span>
            <input v-model.number="globalPrintSettings.print_free_quota" type="number" min="0" />
          </label>
          <label>
            <span>单价（分）</span>
            <input v-model.number="globalPrintSettings.print_price" type="number" min="0" />
          </label>
          <label>
            <span>渲染模式</span>
            <select v-model="globalPrintSettings.print_render_mode">
              <option value="frontend">前端提交图</option>
              <option value="server">服务端渲染</option>
            </select>
          </label>
          <label>
            <span>派发模式</span>
            <select v-model="globalPrintSettings.print_dispatch_mode">
              <option value="local_client">本地客户端</option>
              <option value="lankuo">蓝阔云印</option>
            </select>
          </label>
          <label class="full">
            <span>蓝阔配置 JSON</span>
            <textarea v-model="lankuoConfigText" spellcheck="false"></textarea>
          </label>
          <button class="primary-button" type="submit">保存云印设置</button>
        </form>
      </section>

      <section v-else-if="activeView === 'orders'" class="content-band">
        <div class="section-head">
          <div>
            <h3>打印订单</h3>
            <span>全部活动订单</span>
          </div>
          <div class="toolbar">
            <input v-model.trim="orderKeyword" placeholder="搜索订单/用户/节目" @keyup.enter="loadPrintOrders" />
            <select v-model="orderStatus" @change="loadPrintOrders">
              <option value="">全部状态</option>
              <option value="queued">排队</option>
              <option value="claimed">已领取</option>
              <option value="rendering">渲染中</option>
              <option value="printing">打印中</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
            </select>
            <button class="secondary-button" type="button" @click="loadPrintOrders">搜索</button>
          </div>
        </div>
        <PrintRecordTable
          :records="printOrders"
          :loading="loading"
          show-activity
          @preview="openPreview"
          @reprint="handleReprint"
          @delete="handleDeletePrintRecord"
        />
      </section>

      <section v-else-if="activeView === 'settings'" class="content-band">
        <div class="section-head">
          <div>
            <h3>客户端设置</h3>
            <span>{{ credentialLabel }}</span>
          </div>
        </div>
        <form class="settings-grid" @submit.prevent="saveLocalSettings">
          <label>
            <span>服务端地址</span>
            <input v-model.trim="store.settings.serverUrl" />
          </label>
          <label>
            <span>客户端名称</span>
            <input v-model.trim="store.settings.clientName" />
          </label>
          <label>
            <span>轮询间隔 ms</span>
            <input v-model.number="store.settings.pollingIntervalMs" type="number" min="1000" />
          </label>
          <label>
            <span>失败重试次数</span>
            <input v-model.number="store.settings.retryLimit" type="number" min="0" max="5" />
          </label>
          <label>
            <span>默认打印机</span>
            <select v-model="store.settings.selectedPrinter">
              <option value="">系统默认</option>
              <option v-for="printer in printers" :key="printer.name" :value="printer.name">
                {{ printer.displayName || printer.name }}
              </option>
            </select>
          </label>
          <label>
            <span>纸张适配</span>
            <select v-model="store.settings.scaleMode">
              <option value="contain">完整显示</option>
              <option value="cover">铺满裁切</option>
            </select>
          </label>
          <label class="switch-line">
            <input v-model="store.settings.autoStart" type="checkbox" />
            <span>启动后自动监听</span>
          </label>
          <div class="button-row full">
            <button class="primary-button" type="submit">保存客户端设置</button>
            <button class="secondary-button" type="button" @click="loadPrinters">刷新打印机</button>
            <button class="secondary-button" type="button" @click="reauthenticateClient">重新认证设备</button>
            <button class="secondary-button" type="button" @click="openLogs">打开日志目录</button>
          </div>
        </form>
      </section>

      <section v-else class="content-band">
        <div class="section-head">
          <div>
            <h3>修改密码</h3>
            <span>{{ auth.username }}</span>
          </div>
        </div>
        <form class="settings-grid narrow" @submit.prevent="changePassword">
          <label>
            <span>旧密码</span>
            <input v-model="passwordForm.oldPassword" type="password" />
          </label>
          <label>
            <span>新密码</span>
            <input v-model="passwordForm.newPassword" type="password" />
          </label>
          <button class="primary-button" type="submit">保存新密码</button>
        </form>
      </section>
    </section>

    <div v-if="previewImage" class="modal-mask" @click="previewImage = ''">
      <div class="preview-modal" @click.stop>
        <img :src="previewImage" alt="打印图片预览" />
        <div class="button-row">
          <a class="secondary-button" :href="previewImage" download>下载原图</a>
          <button class="primary-button" type="button" @click="previewImage = ''">关闭</button>
        </div>
      </div>
    </div>
  </main>
</template>
<script setup lang="ts">
import { computed, defineComponent, h, onMounted, onUnmounted, reactive, ref, watch, type PropType } from 'vue'
import {
  Box,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ImageUp,
  LayoutDashboard,
  LogIn,
  LogOut,
  Printer,
  RadioTower,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Square,
  Upload,
} from 'lucide-vue-next'
import { adminApi, ApiError, printClientApi } from './api/client'
import PrintTemplateManager from './components/PrintTemplateManager.vue'
import { defaultStore, mergeStore } from './defaults'
import { renderFabricToPng, renderInputFromJob, renderInputFromTemplate } from './quality/fabricRenderer'
import type {
  Activity,
  ActivityPrintSettings,
  AppStore,
  AuthSession,
  DecorationMaterialItem,
  LocalPrintState,
  PrintJob,
  PrintRecordItem,
  PrintSettings,
  PrinterInfo,
} from './types'

const PrintRecordTable = defineComponent({
  props: {
    records: { type: Array as PropType<PrintRecordItem[]>, required: true },
    loading: { type: Boolean, default: false },
    showActivity: { type: Boolean, default: false },
  },
  emits: ['preview', 'reprint', 'delete'],
  setup(props, { emit }) {
    const statusText = (status: string) => ({
      queued: '排队',
      claimed: '已领取',
      rendering: '渲染中',
      printing: '打印中',
      success: '成功',
      failed: '失败',
    }[status] || status)
    const paymentText = (status?: string | null, amount?: number | null) => {
      if (status === 'pending') return amount ? `待支付 ￥${(amount / 100).toFixed(2)}` : '待支付'
      if (status === 'paid') return '已支付'
      if (status === 'free') return '免费'
      if (status === 'refunded') return '已退款'
      return ''
    }
    const canDelete = (record: PrintRecordItem) => ['failed', 'queued'].includes(record.status)
    const imageUrl = (record: PrintRecordItem) => record.print_image_url || record.photo_url || record.original_photo_url || ''
    return () => h('div', { class: 'table-shell' }, [
      props.loading ? h('div', { class: 'table-loading' }, '加载中...') : null,
      h('table', { class: 'data-table' }, [
        h('thead', [
          h('tr', [
            h('th', '照片'),
            props.showActivity ? h('th', '活动') : null,
            h('th', '节目'),
            h('th', '用户'),
            h('th', '模版/纸张'),
            h('th', '状态'),
            h('th', '创建时间'),
            h('th', '操作'),
          ]),
        ]),
        h('tbody', props.records.length ? props.records.map((record) => h('tr', { key: record.id }, [
          h('td', [
            h('div', { class: 'photo-cell' }, [
              imageUrl(record)
                ? h('button', { class: 'thumb-button', onClick: () => emit('preview', record) }, [
                  h('img', { src: imageUrl(record), alt: record.photo_filename || 'print' }),
                ])
                : h('div', { class: 'empty-thumb' }, '无图'),
              h('div', [h('strong', record.order_no || `P${record.id}`), h('span', record.photo_filename || `照片 #${record.photo_id || '-'}`)]),
            ]),
          ]),
          props.showActivity ? h('td', record.activity_name || `活动 #${record.activity_id}`) : null,
          h('td', record.program_name || (record.program_sequence_number ? `节目 ${record.program_sequence_number}` : '-')),
          h('td', [h('strong', record.nickname || record.user_name || '匿名'), h('span', { class: 'cell-sub' }, record.user_identifier || '-')]),
          h('td', [h('strong', record.template_name || '默认模版'), h('span', { class: 'cell-sub' }, `${record.paper_size || '跟随模版'} / ${record.copies} 份`)]),
          h('td', [
            h('span', { class: `status-pill ${record.status}` }, statusText(record.status)),
            paymentText(record.payment_status, record.payment_amount) ? h('span', { class: `payment-pill ${record.payment_status}` }, paymentText(record.payment_status, record.payment_amount)) : null,
            record.error_msg ? h('small', { class: 'error-text' }, record.error_msg) : null,
          ]),
          h('td', record.created_at || '-'),
          h('td', [
            h('div', { class: 'button-row tight' }, [
              h('button', { class: 'secondary-button', onClick: () => emit('reprint', record) }, '重打'),
              canDelete(record) ? h('button', { class: 'secondary-button danger', onClick: () => emit('delete', record) }, '删除') : null,
            ]),
          ]),
        ])) : [
          h('tr', [h('td', { colspan: props.showActivity ? 8 : 7, class: 'empty-table' }, '暂无打印记录')]),
        ]),
      ]),
    ])
  },
})
const navItems = [
  { key: 'activities', label: '活动管理', icon: LayoutDashboard },
  { key: 'materials', label: '素材管理', icon: ImageUp },
  { key: 'cloud-print', label: '云印设置', icon: Printer },
  { key: 'orders', label: '打印订单', icon: ClipboardList },
  { key: 'settings', label: '客户端设置', icon: Settings },
  { key: 'password', label: '修改密码', icon: ShieldCheck },
] as const
type ViewKey = (typeof navItems)[number]['key']
type ActivityTab = 'records' | 'settings' | 'template'

const defaultActivityCover = 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=80'
const photoCountOptions = [1, 2, 3, 4]
const materialPageSize = 24
const materialTypeTabs = [
  { value: 'background', label: '背景' },
  { value: 'frame', label: '相框' },
  { value: 'sticker', label: '贴纸' },
] as const
const stickerCategoryLabels = ['表情', '动画', '氛围', '搞怪', '花草', '科技', '食物', '贴纸', '小马', '心情', '印章', 'SVG']
const materialCategoryOptions = computed(() => [
  { value: '', label: '全部' },
  ...stickerCategoryLabels.map((label) => ({ value: label, label })),
])
const templateSizeOptions = [
  { key: 'h4', label: '横4寸', width: 1500, height: 1050, paperWidthMm: 102, paperHeightMm: 71 },
  { key: 'v4', label: '竖4寸', width: 1050, height: 1500, paperWidthMm: 71, paperHeightMm: 102 },
  { key: 'square-5', label: '方5寸', width: 1500, height: 1500, paperWidthMm: 127, paperHeightMm: 127 },
  { key: 'h5', label: '横5寸', width: 1500, height: 1050, paperWidthMm: 127, paperHeightMm: 89 },
  { key: 'v5', label: '竖5寸', width: 1050, height: 1500, paperWidthMm: 89, paperHeightMm: 127 },
  { key: 'h6', label: '横6寸', width: 1800, height: 1200, paperWidthMm: 152, paperHeightMm: 102 },
  { key: 'v6', label: '竖6寸', width: 1200, height: 1800, paperWidthMm: 102, paperHeightMm: 152 },
] as const

type MaterialType = (typeof materialTypeTabs)[number]['value']
type TemplateMode = 'list' | 'editor'
type TemplateSizeKey = (typeof templateSizeOptions)[number]['key']
type LocalTemplateItem = {
  id: string
  name: string
  width: number
  height: number
  paperWidthMm: number
  paperHeightMm: number
  dmPaperSize?: string
  paperLabel?: string
  photoCount: number
  sizeKey?: string
  photoSlots?: Record<string, unknown>[]
  canvasJson: Record<string, unknown>
}

const store = reactive<AppStore>(defaultStore())
const auth = computed(() => store.auth)
const activeView = ref<ViewKey>('activities')
const activityTab = ref<ActivityTab>('records')
const activities = ref<Activity[]>([])
const selectedActivity = ref<Activity | null>(null)
const activityRecords = ref<PrintRecordItem[]>([])
const printOrders = ref<PrintRecordItem[]>([])
const materials = ref<DecorationMaterialItem[]>([])
const printers = ref<PrinterInfo[]>([])
const materialType = ref<MaterialType>('background')
const materialCategory = ref('')
const materialPage = ref(1)
const materialTotal = ref(0)
const orderKeyword = ref('')
const orderStatus = ref('')
const activityTemplateText = ref('{}')
const templateConfig = ref<Record<string, unknown>>({})
const templates = ref<LocalTemplateItem[]>([])
const activeTemplateId = ref('')
const templateMode = ref<TemplateMode>('list')
const creatingTemplate = ref(false)
const createTemplateForm = reactive<{ sizeKey: TemplateSizeKey; photoCount: number }>({ sizeKey: 'square-5', photoCount: 1 })
const editingTemplate = reactive<LocalTemplateItem>(createBlankTemplate('square-5', 1))
const templateEditorText = ref('{}')
const previewImage = ref('')
const loading = ref(false)
const messageText = ref('')
const messageKind = ref<'ok' | 'error' | 'warn'>('ok')
const listenerTimer = ref<number | null>(null)
const recordRefreshTimer = ref<number | null>(null)
const printState = reactive<LocalPrintState>({ listening: false, busy: false })
const listeningActivity = ref<Activity | null>(null)
const credentialStatus = ref<'unknown' | 'authenticated' | 'unauthenticated' | 'error'>('unknown')
const credentialError = ref('')

const loginForm = reactive({ username: '', password: '' })
const passwordForm = reactive({ oldPassword: '', newPassword: '' })
const activityPrintSettings = reactive<ActivityPrintSettings>({})
const activityPrintForm = reactive({
  print_free_quota: 0,
  print_price_yuan: 0,
  server_render_enabled: true,
  print_render_multiplier: 1,
})
const globalPrintSettings = reactive<PrintSettings>({})
const lankuoConfigText = ref('{}')
const basePageTitle = computed(() => navItems.find((item) => item.key === activeView.value)?.label || 'PhotoPrinter')
const workspaceTitle = computed(() => selectedActivity.value ? selectedActivity.value.name : basePageTitle.value)
const serverLabel = computed(() => store.settings.serverUrl || '未设置服务端')
const credentialLabel = computed(() => {
  if (credentialStatus.value === 'error') return `设备认证失败：${credentialError.value || '请重新认证'}`
  if (store.settings.clientToken) return `设备已认证：${store.settings.clientName}`
  return '设备未认证'
})
const listeningActivityLabel = computed(() => {
  if (listeningActivity.value) return `监听活动：${listeningActivity.value.name}`
  return selectedActivity.value ? `当前活动：${selectedActivity.value.name}` : '请先进入活动工作区'
})
const materialTypeLabel = computed(() => materialTypeTabs.find((item) => item.value === materialType.value)?.label || '素材')
const materialCategoryLabel = computed(() => materialType.value === 'sticker' ? (materialCategory.value || '全部分类') : '全部分类')
const materialHasMore = computed(() => materials.value.length < materialTotal.value)
function friendlyErrorMessage(text: string) {
  if (text === 'Not Found') return '接口未找到，请确认服务端已更新并重启'
  return text
}

function showMessage(text: string, kind: 'ok' | 'error' | 'warn' = 'ok') {
  messageText.value = friendlyErrorMessage(text)
  messageKind.value = kind
  if (kind === 'ok') window.setTimeout(() => {
    if (messageText.value === friendlyErrorMessage(text)) messageText.value = ''
  }, 2600)
}

function getAuth(): AuthSession {
  if (!store.auth) throw new Error('未登录')
  return store.auth
}

function resolveUrl(value?: string | null) {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) return value
  const root = store.settings.serverUrl.replace(/\/$/, '')
  if (value.startsWith('/')) return `${root}${value}`
  return `${root}/${value}`
}

function activityImage(activity: Activity) {
  return activity.cover_image ? resolveUrl(activity.cover_image) : defaultActivityCover
}

function activityTime(activity: Activity) {
  return activity.event_date || activity.start_time || '未设置日期'
}

function formatActivityStatus(status?: string | null) {
  return ({ active: '进行中', published: '已发布', draft: '草稿', closed: '已结束', archived: '已归档' } as Record<string, string>)[status || ''] || '活动'
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function getTemplateSize(sizeKey: string) {
  return templateSizeOptions.find((item) => item.key === sizeKey) || templateSizeOptions[2]
}

/** Resolve paper dimensions (mm) from pixel size by matching template size presets.
 *  NOTE: 4寸 and 5寸 share the same pixel dimensions (1500×1050), so this can
 *  only return the first match (4寸). Always prefer explicit paperWidthMm/paperHeightMm. */
function resolvePaperMm(widthPx: number, heightPx: number) {
  const match = templateSizeOptions.find(
    (s) => (s.width === widthPx && s.height === heightPx)
      || (s.width === heightPx && s.height === widthPx),
  )
  if (match) return { widthMm: match.paperWidthMm, heightMm: match.paperHeightMm }
  return undefined
}

/** Find paper size from locally loaded template data (most accurate for 4寸 vs 5寸). */
function findTemplatePaperSize(templateId?: string, widthPx?: number, heightPx?: number) {
  if (!templateId) return undefined
  const tpl = templates.value.find((t) => t.id === templateId)
  if (tpl?.paperWidthMm && tpl?.paperHeightMm) {
    return { widthMm: tpl.paperWidthMm, heightMm: tpl.paperHeightMm }
  }
  // Also try matching by sizeKey
  if (tpl?.sizeKey) {
    const size = getTemplateSize(tpl.sizeKey)
    return { widthMm: size.paperWidthMm, heightMm: size.paperHeightMm }
  }
  return undefined
}

function createPhotoSlots(width: number, height: number, photoCount: number) {
  const cols = photoCount === 1 ? 1 : 2
  const rows = Math.ceil(photoCount / cols)
  const gap = Math.round(Math.min(width, height) * 0.04)
  const slotWidth = Math.floor((width - gap * (cols + 1)) / cols)
  const slotHeight = Math.floor((height - gap * (rows + 1)) / rows)
  return Array.from({ length: photoCount }, (_, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    return {
      id: `photo-${index + 1}`,
      name: `照片${index + 1}`,
      left: gap + col * (slotWidth + gap),
      top: gap + row * (slotHeight + gap),
      width: slotWidth,
      height: slotHeight,
    }
  })
}

function createCanvasJson(width: number, height: number, photoCount: number) {
  const slots = createPhotoSlots(width, height, photoCount)
  return {
    version: '6.6.1',
    background: '#ffffff',
    objects: slots.map((slot) => ({
      type: 'rect',
      left: slot.left,
      top: slot.top,
      width: slot.width,
      height: slot.height,
      fill: '#f5f7fa',
      stroke: '#8c8c8c',
      strokeWidth: 3,
      strokeDashArray: [18, 12],
      rx: 0,
      ry: 0,
      name: slot.name,
      data: { role: 'photo-slot', slotName: slot.name },
    })),
  }
}

function createBlankTemplate(sizeKey: TemplateSizeKey, photoCount: number): LocalTemplateItem {
  const size = getTemplateSize(sizeKey)
  const slots = createPhotoSlots(size.width, size.height, photoCount)
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${size.label}${photoCount}张`,
    width: size.width,
    height: size.height,
    paperWidthMm: size.paperWidthMm,
    paperHeightMm: size.paperHeightMm,
    dmPaperSize: '0',
    paperLabel: size.label,
    photoCount,
    sizeKey: size.key,
    photoSlots: slots,
    canvasJson: createCanvasJson(size.width, size.height, photoCount),
  }
}

function normalizeTemplateItem(raw: Record<string, any>, index: number): LocalTemplateItem {
  const size = getTemplateSize(String(raw.sizeKey || 'square-5'))
  const width = Number(raw.width || raw.canvasWidth || size.width)
  const height = Number(raw.height || raw.canvasHeight || size.height)
  const photoCount = Number(raw.photoCount || raw.photo_count || raw.photoSlots?.length || 1)
  return {
    id: String(raw.id || `tpl-${index + 1}`),
    name: String(raw.name || raw.templateName || `打印模版 ${index + 1}`),
    width,
    height,
    paperWidthMm: Number(raw.paperWidthMm || size.paperWidthMm),
    paperHeightMm: Number(raw.paperHeightMm || size.paperHeightMm),
    dmPaperSize: String(raw.dmPaperSize || '0'),
    paperLabel: String(raw.paperLabel || size.label),
    photoCount,
    sizeKey: String(raw.sizeKey || size.key),
    photoSlots: Array.isArray(raw.photoSlots) ? raw.photoSlots : createPhotoSlots(width, height, photoCount),
    canvasJson: raw.canvasJson || createCanvasJson(width, height, photoCount),
  }
}

function loadTemplateStateFromText(text: string) {
  const payload = JSON.parse(text || '{}') as Record<string, any>
  const rawTemplates = Array.isArray(payload.templates) ? payload.templates : []
  const normalized = rawTemplates.map(normalizeTemplateItem)
  if (!normalized.length && (payload.canvasJson || payload.objects)) normalized.push(normalizeTemplateItem(payload, 0))
  templateConfig.value = payload
  templates.value = normalized
  activeTemplateId.value = String(payload.activeTemplateId || normalized[0]?.id || '')
  templateMode.value = 'list'
  creatingTemplate.value = false
  rebuildActivityTemplateText()
}

function rebuildActivityTemplateText() {
  const active = templates.value.find((item) => item.id === activeTemplateId.value) || templates.value[0]
  if (active && !activeTemplateId.value) activeTemplateId.value = active.id
  const base = {
    ...templateConfig.value,
    templates: templates.value.map((item) => deepClone(item)),
    activeTemplateId: activeTemplateId.value,
  } as Record<string, unknown>
  if (active) {
    base.canvasWidth = active.width
    base.canvasHeight = active.height
    base.paperWidthMm = active.paperWidthMm
    base.paperHeightMm = active.paperHeightMm
    base.dmPaperSize = active.dmPaperSize || '0'
    base.activeTemplateId = active.id
  }
  templateConfig.value = base
  activityTemplateText.value = JSON.stringify(base, null, 2)
}

async function persistActivityTemplate(successText = '打印模版已保存') {
  if (!selectedActivity.value) return
  await handleApi(() => adminApi.updateActivityPrintTemplate(store.settings, getAuth(), selectedActivity.value!.id, activityTemplateText.value), '保存打印模版失败')
  showMessage(successText)
}
async function saveStore() {
  const snapshot = JSON.parse(JSON.stringify(store))
  if (window.photoPrinter) await window.photoPrinter.saveStore(snapshot)
  else window.localStorage.setItem('supertech-photoprinter-store', JSON.stringify(snapshot))
}

async function loadStore() {
  const cached = window.photoPrinter
    ? await window.photoPrinter.loadStore()
    : JSON.parse(window.localStorage.getItem('supertech-photoprinter-store') || 'null')
  Object.assign(store, mergeStore(cached))
}

async function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
  await window.photoPrinter?.writeLog({ level, message, context, createdAt: new Date().toISOString() }).catch(() => undefined)
  if (level === 'error') console.error(message, context)
  else console.log(message, context || '')
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    task.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function handleApi<T>(task: () => Promise<T>, fallback = '操作失败') {
  loading.value = true
  try {
    return await task()
  } catch (error) {
    const text = error instanceof ApiError || error instanceof Error ? error.message : String(error)
    showMessage(text || fallback, 'error')
    throw error
  } finally {
    loading.value = false
  }
}

async function handleLogin() {
  messageText.value = ''
  messageKind.value = 'ok'
  await handleApi(async () => {
    const data = await adminApi.login(store.settings, loginForm.username, loginForm.password)
    store.auth = {
      token: data.access_token,
      username: data.username,
      permissions: data.permissions || [],
      roleCodes: data.role_codes || [],
    }
    if (!hasPermission('print.manage')) {
      store.auth = null
      throw new Error('当前账号没有打印管理权限')
    }
    activeView.value = 'activities'
    selectedActivity.value = null
    activityRecords.value = []
    printOrders.value = []
    const credentialOk = await ensureClientSession(true)
    await saveStore()
    await loadActivities()
    showMessage(credentialOk ? '登录成功' : `登录成功，但${credentialLabel.value}`, credentialOk ? 'ok' : 'warn')
  }, '登录失败')
}

function hasPermission(permission: string) {
  const session = auth.value
  if (!session) return false
  return session.username === 'admin' || session.roleCodes.includes('super_admin') || session.permissions.includes(permission)
}

async function ensureClientSession(force = false) {
  if (!auth.value) {
    credentialStatus.value = 'unauthenticated'
    return false
  }
  if (store.settings.clientToken && !force) {
    credentialStatus.value = 'authenticated'
    credentialError.value = ''
    return true
  }
  try {
    const session = await printClientApi.createSession(store.settings, auth.value)
    store.settings.clientToken = session.client_token
    store.settings.clientTokenIssuedAt = new Date().toISOString()
    credentialStatus.value = 'authenticated'
    credentialError.value = ''
    await saveStore()
    return true
  } catch (error) {
    credentialStatus.value = 'error'
    credentialError.value = friendlyErrorMessage(error instanceof Error ? error.message : String(error))
    return false
  }
}

async function logout() {
  stopListening()
  store.auth = null
  store.settings.clientToken = ''
  credentialStatus.value = 'unauthenticated'
  credentialError.value = ''
  activeView.value = 'activities'
  selectedActivity.value = null
  activityRecords.value = []
  printOrders.value = []
  messageText.value = ''
  stopRecordHotRefresh()
  await saveStore()
}

function switchView(view: ViewKey) {
  selectedActivity.value = null
  activeView.value = view
  void refreshCurrent()
  window.setTimeout(startRecordHotRefresh, 0)
}

async function refreshCurrent() {
  if (!auth.value) return
  if (activeView.value === 'activities') {
    if (selectedActivity.value) await openActivity(selectedActivity.value, false)
    else await loadActivities()
  } else if (activeView.value === 'materials') await loadMaterials()
  else if (activeView.value === 'cloud-print') await loadGlobalPrintSettings()
  else if (activeView.value === 'orders') await loadPrintOrders()
  else if (activeView.value === 'settings') await loadPrinters()
}

async function loadActivities() {
  activities.value = await handleApi(() => adminApi.listActivities(store.settings, getAuth()), '活动加载失败') || []
}

async function openActivity(activity: Activity, switchTab = true) {
  selectedActivity.value = activity
  if (switchTab) activityTab.value = 'records'
  await Promise.all([loadActivityRecords(), loadActivitySettings(), loadActivityTemplate()])
  startRecordHotRefresh()
}

function closeActivity() {
  selectedActivity.value = null
  activityRecords.value = []
  startRecordHotRefresh()
}

async function loadActivityRecords() {
  if (!selectedActivity.value) return
  const data = await handleApi(() => adminApi.getActivityPrintRecords(store.settings, getAuth(), selectedActivity.value!.id, 1, 50), '打印记录加载失败')
  activityRecords.value = data?.items || []
}

async function loadActivitySettings() {
  if (!selectedActivity.value) return
  const data = await adminApi.getActivityPrintSettings(store.settings, getAuth(), selectedActivity.value.id)
  Object.assign(activityPrintSettings, data)
  activityPrintForm.print_free_quota = Number(data.print_free_quota || 0)
  activityPrintForm.print_price_yuan = Number(data.print_price || 0) / 100
  activityPrintForm.server_render_enabled = (data.print_dispatch_mode || 'lankuo') !== 'local_client'
  activityPrintForm.print_render_multiplier = Number(data.print_render_multiplier || 1)
}

async function saveActivitySettings() {
  if (!selectedActivity.value) return
  const payload: ActivityPrintSettings = {
    ...activityPrintSettings,
    print_free_quota: Number(activityPrintForm.print_free_quota || 0),
    print_price: Math.round(Number(activityPrintForm.print_price_yuan || 0) * 100),
    print_dispatch_mode: activityPrintForm.server_render_enabled ? 'lankuo' : 'local_client',
    print_render_mode: activityPrintForm.server_render_enabled ? 'server' : 'frontend',
    print_render_multiplier: (Number(activityPrintForm.print_render_multiplier || 1) as 1 | 2 | 3),
  }
  await handleApi(() => adminApi.updateActivityPrintSettings(store.settings, getAuth(), selectedActivity.value!.id, payload), '保存失败')
  Object.assign(activityPrintSettings, payload)
  showMessage('活动打印设置已保存')
}

async function loadActivityTemplate() {
  if (!selectedActivity.value) return
  const data = await adminApi.getActivityPrintTemplate(store.settings, getAuth(), selectedActivity.value.id)
  activityTemplateText.value = data.value || '{}'
  loadTemplateStateFromText(activityTemplateText.value)
}

async function saveActivityTemplate() {
  JSON.parse(activityTemplateText.value || '{}')
  loadTemplateStateFromText(activityTemplateText.value)
  await persistActivityTemplate()
}

async function saveTemplateList() {
  rebuildActivityTemplateText()
  await persistActivityTemplate()
}

function startCreateTemplate() {
  creatingTemplate.value = true
}

function cancelCreateTemplate() {
  creatingTemplate.value = false
}

function createTemplate() {
  const item = createBlankTemplate(createTemplateForm.sizeKey, createTemplateForm.photoCount)
  templates.value = [item, ...templates.value]
  activeTemplateId.value = item.id
  creatingTemplate.value = false
  editTemplate(item)
}

function editTemplate(item: LocalTemplateItem) {
  Object.assign(editingTemplate, deepClone(item))
  templateEditorText.value = JSON.stringify(editingTemplate.canvasJson || {}, null, 2)
  templateMode.value = 'editor'
}

async function saveTemplateEditor() {
  editingTemplate.canvasJson = JSON.parse(templateEditorText.value || '{}')
  const index = templates.value.findIndex((item) => item.id === editingTemplate.id)
  const nextItem = deepClone(editingTemplate)
  if (index >= 0) templates.value.splice(index, 1, nextItem)
  else templates.value.unshift(nextItem)
  activeTemplateId.value = nextItem.id
  rebuildActivityTemplateText()
  await persistActivityTemplate('打印模版编辑已保存')
  templateMode.value = 'list'
}

async function setActiveTemplate(item: LocalTemplateItem) {
  activeTemplateId.value = item.id
  rebuildActivityTemplateText()
  await persistActivityTemplate('当前打印模版已切换')
}

async function deleteTemplate(id: string) {
  templates.value = templates.value.filter((item) => item.id !== id)
  if (activeTemplateId.value === id) activeTemplateId.value = templates.value[0]?.id || ''
  rebuildActivityTemplateText()
  await persistActivityTemplate('打印模版已删除')
}

async function previewTemplateItem(item: LocalTemplateItem) {
  const result = await renderFabricToPng(renderInputFromTemplate({
    ...item,
    canvasJson: item.canvasJson,
    widthPx: item.width,
    heightPx: item.height,
  }, store.settings.serverUrl))
  previewImage.value = result.dataUrl
}

async function previewEditingTemplate() {
  const canvasJson = JSON.parse(templateEditorText.value || '{}')
  await previewTemplateItem({ ...deepClone(editingTemplate), canvasJson })
}

async function previewActivityTemplate() {
  const active = templates.value.find((item) => item.id === activeTemplateId.value) || templates.value[0]
  if (active) {
    await previewTemplateItem(active)
    return
  }
  const payload = JSON.parse(activityTemplateText.value || '{}')
  const result = await renderFabricToPng(renderInputFromTemplate({
    ...payload,
    canvasJson: payload.canvasJson || payload,
    widthPx: payload.canvasWidth || 1800,
    heightPx: payload.canvasHeight || 1200,
  }, store.settings.serverUrl))
  previewImage.value = result.dataUrl
}

function selectMaterialType(value: MaterialType) {
  materialType.value = value
  materialCategory.value = ''
  void loadMaterials(true)
}

function selectMaterialCategory(value: string) {
  materialCategory.value = value
  void loadMaterials(true)
}

async function loadMaterials(reset = true) {
  if (reset) materialPage.value = 1
  const category = materialType.value === 'sticker' ? materialCategory.value : ''
  const data = await handleApi(
    () => adminApi.listMaterials(store.settings, getAuth(), materialType.value, category || undefined, materialPage.value, materialPageSize),
    '素材加载失败',
  )
  const items = data?.items || []
  materials.value = reset ? items : [...materials.value, ...items]
  materialTotal.value = data?.total ?? materials.value.length
}

async function loadMoreMaterials() {
  if (!materialHasMore.value) return
  materialPage.value += 1
  await loadMaterials(false)
}

function currentUploadCategory() {
  if (materialType.value === 'background') return '背景素材'
  if (materialType.value === 'frame') return '相框素材'
  return materialCategory.value || '贴纸'
}

async function uploadMaterials(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  await handleApi(async () => {
    for (const file of files) {
      const uploaded = await adminApi.uploadMaterial(store.settings, getAuth(), file)
      const url = uploaded.url || uploaded.storage_url || ''
      if (!url) throw new Error(`${file.name} 上传失败`)
      await adminApi.createMaterial(store.settings, getAuth(), {
        type: materialType.value,
        name: file.name.replace(/\.[^.]+$/, ''),
        storage_url: url,
        thumbnail_url: uploaded.thumbnail_url || url,
        category: currentUploadCategory(),
        is_active: true,
      })
    }
    await loadMaterials(true)
    showMessage('素材已上传')
  }, '素材上传失败')
  input.value = ''
}

async function toggleMaterial(item: DecorationMaterialItem) {
  await handleApi(() => adminApi.updateMaterial(store.settings, getAuth(), item.id, { is_active: !item.is_active }), '更新素材失败')
  await loadMaterials(true)
}

async function deleteMaterial(id: number) {
  await handleApi(() => adminApi.deleteMaterial(store.settings, getAuth(), id), '删除素材失败')
  await loadMaterials(true)
}
async function loadGlobalPrintSettings() {
  const data = await handleApi(() => adminApi.getPrintSettings(store.settings, getAuth()), '云印设置加载失败')
  Object.assign(globalPrintSettings, data || {})
  lankuoConfigText.value = JSON.stringify(globalPrintSettings.lankuo_print_config || {}, null, 2)
}

async function saveGlobalPrintSettings() {
  const config = JSON.parse(lankuoConfigText.value || '{}')
  await handleApi(() => adminApi.updatePrintSettings(store.settings, getAuth(), {
    ...globalPrintSettings,
    lankuo_print_config: config,
  }), '保存云印设置失败')
  showMessage('云印设置已保存')
}

async function loadPrintOrders() {
  const data = await handleApi(() => adminApi.getPrintRecords(store.settings, getAuth(), {
    page: 1,
    page_size: 80,
    status: orderStatus.value,
    keyword: orderKeyword.value,
  }), '打印订单加载失败')
  printOrders.value = data?.items || []
}

async function refreshRecordsSilently() {
  if (!auth.value) return
  try {
    if (activeView.value === 'activities' && selectedActivity.value && activityTab.value === 'records') {
      const data = await adminApi.getActivityPrintRecords(store.settings, getAuth(), selectedActivity.value.id, 1, 50)
      activityRecords.value = data?.items || []
    } else if (activeView.value === 'orders') {
      const data = await adminApi.getPrintRecords(store.settings, getAuth(), {
        page: 1,
        page_size: 80,
        status: orderStatus.value,
        keyword: orderKeyword.value,
      })
      printOrders.value = data?.items || []
    }
  } catch (error) {
    await log('warn', 'record hot refresh failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

function stopRecordHotRefresh() {
  if (recordRefreshTimer.value) window.clearInterval(recordRefreshTimer.value)
  recordRefreshTimer.value = null
}

function startRecordHotRefresh() {
  stopRecordHotRefresh()
  const shouldRefreshActivityRecords = activeView.value === 'activities' && !!selectedActivity.value && activityTab.value === 'records'
  const shouldRefreshOrders = activeView.value === 'orders'
  if (!auth.value || (!shouldRefreshActivityRecords && !shouldRefreshOrders)) return
  recordRefreshTimer.value = window.setInterval(() => void refreshRecordsSilently(), 2500)
}

function openPreview(record: PrintRecordItem) {
  previewImage.value = resolveUrl(record.print_image_url || record.photo_url || record.original_photo_url)
}

async function handleReprint(record: PrintRecordItem) {
  await handleApi(() => adminApi.reprintRecord(store.settings, getAuth(), record.id), '重打失败')
  showMessage('已创建重打订单')
  await refreshCurrent()
}

async function handleDeletePrintRecord(record: PrintRecordItem) {
  await handleApi(() => adminApi.deletePrintRecord(store.settings, getAuth(), record.id), '删除失败')
  showMessage('打印记录已删除')
  await refreshCurrent()
}

function comparablePrinterName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\x00-\x7F]+/g, '')
    .replace(/\s+/g, '')
}

async function loadPrinters() {
  if (!window.photoPrinter) {
    printers.value = []
    return
  }
  const list = await window.photoPrinter.getPrinters()
  printers.value = list.map((item) => ({
    name: String(item.name || ''),
    displayName: String(item.displayName || item.name || ''),
    description: String(item.description || ''),
    isDefault: Boolean(item.isDefault || item.default),
    source: String(item.source || ''),
  })).filter((item) => item.name)

  if (store.settings.selectedPrinter) {
    const selected = store.settings.selectedPrinter
    const exact = printers.value.some((item) => item.name === selected)
    if (!exact) {
      const matched = printers.value.find((item) => comparablePrinterName(item.name) === comparablePrinterName(selected))
      if (matched) store.settings.selectedPrinter = matched.name
    }
  }

  if (!store.settings.selectedPrinter) {
    const defaultPrinter = printers.value.find((item) => item.isDefault)
    if (defaultPrinter) store.settings.selectedPrinter = defaultPrinter.name
  }
  await saveStore()
}

async function saveLocalSettings() {
  await ensureClientSession(true)
  await saveStore()
  showMessage('客户端设置已保存')
  if (printState.listening) startListening()
}

async function reauthenticateClient() {
  const ok = await ensureClientSession(true)
  showMessage(ok ? '设备认证成功' : credentialLabel.value, ok ? 'ok' : 'error')
}

async function openLogs() {
  await window.photoPrinter?.openLogs()
}

async function changePassword() {
  await handleApi(() => adminApi.changePassword(store.settings, getAuth(), passwordForm.oldPassword, passwordForm.newPassword), '修改密码失败')
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  showMessage('密码已更新')
}

function upsertRecentJob(job: PrintJob) {
  const index = store.recentJobs.findIndex((item) => item.id === job.id)
  if (index >= 0) store.recentJobs[index] = { ...store.recentJobs[index], ...job }
  else store.recentJobs.unshift(job)
  store.recentJobs = store.recentJobs.slice(0, 100)
}

async function processJob(job: PrintJob) {
  const attempts = Math.max(1, Number(store.settings.retryLimit || 0) + 1)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      job.attempts = attempt
      job.status = 'rendering'
      job.lastMessage = '正在渲染图片'
      upsertRecentJob(job)
      await printClientApi.report(store.settings, job.id, 'rendering', job.lastMessage)
      const render = await withTimeout(
        renderFabricToPng(renderInputFromJob(job, store.settings.serverUrl)),
        60000,
        '渲染超时，请检查模版素材是否能访问',
      )
      job.status = 'printing'
      job.lastMessage = '正在发送打印任务'
      upsertRecentJob(job)
      await printClientApi.report(store.settings, job.id, 'printing', job.lastMessage)
      if (!window.photoPrinter) throw new Error('当前环境不支持本地打印')

      // Resolve paper dimensions: prefer job data → match local template by sizeKey/pixel → pixel-based fallback
      const jobPaper = (job.paperWidthMm && job.paperHeightMm)
        ? { widthMm: job.paperWidthMm, heightMm: job.paperHeightMm }
        : undefined
      const templatePaper = !jobPaper
        ? findTemplatePaperSize(job.templateId, render.widthPx, render.heightPx)
        : undefined
      const fallbackPaper = (!jobPaper && !templatePaper)
        ? resolvePaperMm(render.widthPx, render.heightPx)
        : undefined
      const paperSize = jobPaper || templatePaper || fallbackPaper

      const printResult = await withTimeout(window.photoPrinter.printImage({
        dataUrl: render.dataUrl,
        printerName: store.settings.selectedPrinter,
        copies: job.copies || store.settings.copiesFallback || 1,
        widthPx: render.widthPx,
        heightPx: render.heightPx,
        paperWidthMm: paperSize?.widthMm,
        paperHeightMm: paperSize?.heightMm,
        dpi: job.dpi || 300,
        scaleMode: store.settings.scaleMode,
      }), 520000, '打印超时，请检查打印机状态')
      job.status = 'success'
      job.lastMessage = '打印完成'
      upsertRecentJob(job)
      await printClientApi.report(store.settings, job.id, 'success', job.lastMessage, String((printResult as Record<string, unknown>)?.localJobId || ''))
      await log('info', 'print job success', { jobId: job.id, orderNo: job.orderNo })
      await saveStore()
      return
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      await log('error', 'print job failed', { jobId: job.id, attempt, error: text })
      if (attempt >= attempts) {
        job.status = 'failed'
        job.lastMessage = text
        upsertRecentJob(job)
        await printClientApi.report(store.settings, job.id, 'failed', text).catch(() => undefined)
        await saveStore()
        return
      }
    }
  }
}

async function pollOnce() {
  if (!printState.listening || printState.busy) return
  if (!auth.value) {
    stopListening()
    return
  }
  if (!listeningActivity.value) {
    stopListening()
    showMessage('监听已停止：未选择活动', 'warn')
    return
  }
  printState.busy = true
  try {
    const credentialOk = await ensureClientSession()
    if (!credentialOk) throw new Error(credentialError.value || '设备未认证')
    await printClientApi.heartbeat(store.settings, {
      activity_id: listeningActivity.value.id,
      activity_name: listeningActivity.value.name,
      version: '0.1.0',
      printer_name: store.settings.selectedPrinter,
      queue_length: store.recentJobs.filter((item) => !['success', 'failed'].includes(item.status)).length,
      status: 'online',
    })
    printState.lastHeartbeat = new Date().toISOString()
    const job = await printClientApi.claim(store.settings, listeningActivity.value.id)
    if (job) {
      job.status = 'claimed'
      job.lastMessage = '已领取订单'
      upsertRecentJob(job)
      await processJob(job)
      await refreshCurrent()
    }
    printState.lastError = ''
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    printState.lastError = text
    await log('error', 'listener tick failed', { error: text })
  } finally {
    printState.busy = false
  }
}

function stopListening() {
  printState.listening = false
  if (listenerTimer.value) window.clearInterval(listenerTimer.value)
  listenerTimer.value = null
  listeningActivity.value = null
}

function startListening(targetActivity = selectedActivity.value || listeningActivity.value) {
  if (!targetActivity) {
    showMessage('请先打开要监听的活动，再启动监听', 'warn')
    activeView.value = 'activities'
    return
  }
  if (!store.settings.clientToken && credentialStatus.value !== 'authenticated') {
    showMessage('设备尚未认证，请先重新认证设备', 'warn')
  }
  stopListening()
  listeningActivity.value = targetActivity
  printState.listening = true
  const interval = Math.max(1000, Number(store.settings.pollingIntervalMs || 2500))
  listenerTimer.value = window.setInterval(() => void pollOnce(), interval)
  void pollOnce()
}

watch(() => store.settings.pollingIntervalMs, () => {
  if (printState.listening && listeningActivity.value) startListening(listeningActivity.value)
})

watch([activeView, activityTab, () => selectedActivity.value?.id], startRecordHotRefresh)

onMounted(async () => {
  await loadStore()
  credentialStatus.value = store.settings.clientToken ? 'authenticated' : 'unauthenticated'
  await loadPrinters()
  if (auth.value) {
    await ensureClientSession().catch(() => undefined)
    await loadActivities().catch(() => undefined)
  }
  startRecordHotRefresh()
})

onUnmounted(() => {
  stopListening()
  stopRecordHotRefresh()
})
</script>






