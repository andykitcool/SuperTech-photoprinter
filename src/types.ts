export type Permission = 'activity.manage' | 'material.manage' | 'print.manage' | string

export type AuthSession = {
  token: string
  username: string
  permissions: Permission[]
  roleCodes: string[]
}

export type PrinterInfo = {
  name: string
  displayName?: string
  description?: string
  isDefault?: boolean
  source?: string
}

export type LocalSettings = {
  serverUrl: string
  clientId: string
  clientName: string
  clientToken: string
  clientTokenIssuedAt?: string
  clientTokenExpiresAt?: string | null
  pollingIntervalMs: number
  selectedPrinter: string
  scaleMode: 'contain' | 'cover'
  copiesFallback: number
  retryLimit: number
  autoStart: boolean
}

export type Activity = {
  id: number
  name: string
  description?: string | null
  event_date?: string | null
  start_time?: string | null
  end_time?: string | null
  venue?: string | null
  status: string
  cover_image?: string | null
  program_count?: number
  ready_program_count?: number
  created_at?: string
}

export type PrintRecordItem = {
  id: number
  order_no?: string | null
  activity_id: number
  activity_name?: string | null
  program_id: number | null
  program_name: string | null
  program_sequence_number: number | null
  photo_id: number | null
  photo_url: string | null
  original_photo_url?: string | null
  print_image_url?: string | null
  photo_filename: string | null
  user_identifier: string | null
  user_name: string | null
  nickname?: string | null
  avatar_url?: string | null
  template_name: string | null
  paper_size: string | null
  copies: number
  status: string
  task_id: string | null
  error_msg: string | null
  payment_status?: string | null
  payment_order_id?: string | null
  payment_amount?: number | null
  paid_at?: string | null
  printed_at: string | null
  created_at: string | null
}

export type PrintRecordResponse = {
  items: PrintRecordItem[]
  total: number
  page: number
  page_size: number
}

export type DecorationMaterialItem = {
  id: number
  type: string
  name: string
  storage_url: string
  thumbnail_url?: string
  category?: string
  sort_order: number
  is_active: boolean
  created_at?: string
}

export type PrintSettings = {
  print_free_quota?: number
  print_price?: number
  print_render_mode?: 'frontend' | 'server'
  print_render_multiplier?: 1 | 2 | 3
  print_dispatch_mode?: 'lankuo' | 'local_client'
  lankuo_print_config?: Record<string, unknown>
}

export type ActivityPrintSettings = {
  print_free_quota?: number
  print_price?: number
  print_render_mode?: 'frontend' | 'server'
  print_render_multiplier?: 1 | 2 | 3
  print_dispatch_mode?: 'lankuo' | 'local_client'
}

export type JobStatus = 'queued' | 'claimed' | 'rendering' | 'printing' | 'success' | 'failed'

export type PrintJob = {
  id: string
  orderNo: string
  programName: string
  activityName: string
  photoName: string
  photoUrl?: string | null
  printImageUrl?: string | null
  templateId: string
  templateName?: string
  paperName?: string
  widthPx: number
  heightPx: number
  paperWidthMm?: number
  paperHeightMm?: number
  dpi: number
  smoothingMode?: 'auto' | 'quality' | 'pixel'
  canvasJson: string
  copies: number
  status: JobStatus
  createdAt?: string | null
  lastMessage?: string | null
  attempts?: number
}

export type PrintTemplate = {
  templateName?: string
  name?: string
  paperName?: string
  widthPx?: number
  heightPx?: number
  canvasWidth?: number
  canvasHeight?: number
  dpi?: number
  smoothingMode?: 'auto' | 'quality' | 'pixel'
  canvasJson?: string | Record<string, unknown>
  [key: string]: unknown
}

export type LocalPrintState = {
  listening: boolean
  busy: boolean
  lastHeartbeat?: string
  lastError?: string
}

export type AppStore = {
  auth: AuthSession | null
  settings: LocalSettings
  recentJobs: PrintJob[]
}

export type PrintLogEntry = {
  level: 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, unknown>
  createdAt?: string
}
