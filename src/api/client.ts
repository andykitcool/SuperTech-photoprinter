import type {
  Activity,
  ActivityPrintSettings,
  AuthSession,
  DecorationMaterialItem,
  LocalSettings,
  PrintJob,
  PrintRecordResponse,
  PrintSettings,
} from '../types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type RequestOptions = RequestInit & {
  auth?: AuthSession | null
  settings: LocalSettings
}

function apiRoot(settings: LocalSettings) {
  return `${settings.serverUrl.replace(/\/+$/, '')}/api`
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = data?.detail || data?.message || `HTTP ${response.status}`
    throw new ApiError(response.status, String(detail))
  }
  return data as T
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.auth?.token) headers.set('Authorization', `Bearer ${options.auth.token}`)

  const response = await fetch(`${apiRoot(options.settings)}${path}`, {
    ...options,
    headers,
  })
  return parseResponse<T>(response)
}

export const adminApi = {
  login(settings: LocalSettings, username: string, password: string) {
    return request<{
      access_token: string
      username: string
      permissions: string[]
      role_codes: string[]
    }>('/admin/login', {
      settings,
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  changePassword(settings: LocalSettings, auth: AuthSession, oldPassword: string, newPassword: string) {
    return request('/admin/password', {
      settings,
      auth,
      method: 'PUT',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    })
  },

  listActivities(settings: LocalSettings, auth: AuthSession) {
    return request<Activity[]>('/admin/activities', { settings, auth, method: 'GET' })
  },

  getActivityPrintRecords(settings: LocalSettings, auth: AuthSession, activityId: number, page = 1, pageSize = 20) {
    return request<PrintRecordResponse>(`/admin/activities/${activityId}/print-records?page=${page}&page_size=${pageSize}`, {
      settings,
      auth,
      method: 'GET',
    })
  },

  getPrintRecords(
    settings: LocalSettings,
    auth: AuthSession,
    params: { page?: number; page_size?: number; activity_id?: number; status?: string; keyword?: string },
  ) {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
    })
    return request<PrintRecordResponse>(`/admin/print-records?${query.toString()}`, { settings, auth, method: 'GET' })
  },

  reprintRecord(settings: LocalSettings, auth: AuthSession, recordId: number) {
    return request(`/admin/print-records/${recordId}/reprint`, { settings, auth, method: 'POST' })
  },

  deletePrintRecord(settings: LocalSettings, auth: AuthSession, recordId: number) {
    return request(`/admin/print-records/${recordId}`, { settings, auth, method: 'DELETE' })
  },

  getActivityPrintSettings(settings: LocalSettings, auth: AuthSession, activityId: number) {
    return request<ActivityPrintSettings>(`/admin/activities/${activityId}/print-settings`, { settings, auth, method: 'GET' })
  },

  updateActivityPrintSettings(settings: LocalSettings, auth: AuthSession, activityId: number, data: ActivityPrintSettings) {
    return request<ActivityPrintSettings>(`/admin/activities/${activityId}/print-settings`, {
      settings,
      auth,
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getActivityPrintTemplate(settings: LocalSettings, auth: AuthSession, activityId: number) {
    return request<{ value: string | null }>(`/settings/activity_${activityId}_print_template`, { settings, auth, method: 'GET' })
  },

  updateActivityPrintTemplate(settings: LocalSettings, auth: AuthSession, activityId: number, value: string) {
    return request(`/settings/activity_${activityId}_print_template`, {
      settings,
      auth,
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  },

  listMaterials(settings: LocalSettings, auth: AuthSession, type?: string, category?: string, page = 1, pageSize = 50) {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (type) query.set('type', type)
    if (category) query.set('category', category)
    return request<{ items: DecorationMaterialItem[]; total: number }>(`/admin/decoration-materials?${query}`, {
      settings,
      auth,
      method: 'GET',
    })
  },

  createMaterial(settings: LocalSettings, auth: AuthSession, data: Partial<DecorationMaterialItem>) {
    return request('/admin/decoration-materials', {
      settings,
      auth,
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateMaterial(settings: LocalSettings, auth: AuthSession, id: number, data: Partial<DecorationMaterialItem>) {
    return request(`/admin/decoration-materials/${id}`, {
      settings,
      auth,
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deleteMaterial(settings: LocalSettings, auth: AuthSession, id: number) {
    return request(`/admin/decoration-materials/${id}`, { settings, auth, method: 'DELETE' })
  },

  uploadMaterial(settings: LocalSettings, auth: AuthSession, file: File) {
    const body = new FormData()
    body.append('file', file)
    return request<{ url?: string; storage_url?: string; thumbnail_url?: string }>('/admin/materials/upload', {
      settings,
      auth,
      method: 'POST',
      body,
    })
  },

  getPrintSettings(settings: LocalSettings, auth: AuthSession) {
    return request<PrintSettings>('/admin/materials/settings', { settings, auth, method: 'GET' })
  },

  updatePrintSettings(settings: LocalSettings, auth: AuthSession, data: PrintSettings) {
    return request<PrintSettings>('/admin/materials/settings', {
      settings,
      auth,
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getLankuoPrinters(settings: LocalSettings, auth: AuthSession, refresh = false) {
    return request<Record<string, unknown>>(`/settings/lankuo/printers?refresh=${refresh ? 'true' : 'false'}`, {
      settings,
      auth,
      method: 'GET',
    })
  },
}

export const printClientApi = {
  async createSession(settings: LocalSettings, auth: AuthSession) {
    return request<{ client_id: string; client_token: string; expires_at: string | null }>('/print-client/session', {
      settings,
      auth,
      method: 'POST',
      body: JSON.stringify({
        client_id: settings.clientId,
        client_name: settings.clientName,
        version: '0.1.0',
      }),
    })
  },

  heartbeat(settings: LocalSettings, payload: Record<string, unknown>) {
    return request<{ ok: boolean }>('/print-client/heartbeat', {
      settings,
      method: 'POST',
      headers: { 'X-Print-Client-Token': settings.clientToken },
      body: JSON.stringify({ client_id: settings.clientId, ...payload }),
    })
  },

  async claim(settings: LocalSettings, activityId: number) {
    const data = await request<{ job: PrintJob | null }>('/print-client/jobs/claim', {
      settings,
      method: 'POST',
      headers: { 'X-Print-Client-Token': settings.clientToken },
      body: JSON.stringify({ client_id: settings.clientId, activity_id: activityId }),
    })
    return data.job
  },

  async uploadRenderedImage(settings: LocalSettings, jobId: string, imageData: string, localJobId?: string) {
    const imageBlob = await fetch(imageData).then((response) => response.blob())
    const formData = new FormData()
    formData.append('client_id', settings.clientId)
    if (localJobId) formData.append('local_job_id', localJobId)
    formData.append('image', imageBlob, `print-${jobId}.png`)

    return request<{ ok: boolean; record_id: number; print_image_url: string }>(`/print-client/jobs/${jobId}/image`, {
      settings,
      method: 'POST',
      headers: { 'X-Print-Client-Token': settings.clientToken },
      body: formData,
    })
  },

  report(settings: LocalSettings, jobId: string, status: PrintJob['status'], message?: string, localJobId?: string, printImageUrl?: string) {
    return request<{ ok: boolean; record_id: number; status: string }>(`/print-client/jobs/${jobId}/status`, {
      settings,
      method: 'POST',
      headers: { 'X-Print-Client-Token': settings.clientToken },
      body: JSON.stringify({
        client_id: settings.clientId,
        status,
        message,
        local_job_id: localJobId,
        print_image_url: printImageUrl,
      }),
    })
  },
}
