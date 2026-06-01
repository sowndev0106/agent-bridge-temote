import type { Project, AgentDefinition, Session, AppConfig, FileListResult, FilePreviewResult, GitStatusResult, GitFileDiffResult } from '../../types'

let csrfToken = ''

export function setCsrfToken(t: string) { csrfToken = t }
export function getCsrfToken() { return csrfToken }

async function request<T>(method: string, url: string, body?: unknown, _retried = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (['POST', 'PUT', 'DELETE'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (!json.ok) {
    // CSRF token expired or lost (e.g. after HMR). Fetch a fresh token and retry once.
    if (!_retried && json.error?.code === 'csrf_missing') {
      const refreshRes = await fetch('/api/auth/csrf', { credentials: 'include' })
      const refreshJson = await refreshRes.json()
      if (refreshJson.ok) setCsrfToken(refreshJson.data.csrfToken)
      return request<T>(method, url, body, true)
    }
    throw new Error(json.error?.message ?? 'Request failed')
  }
  return json.data as T
}

type SafeConfig = Omit<AppConfig, 'password' | 'sessionSecret'>

export const api = {
  login: (password: string) => request<{ csrfToken: string }>('POST', '/api/auth/login', { password }),
  logout: () => request<null>('POST', '/api/auth/logout'),
  getCsrf: () => request<{ csrfToken: string }>('GET', '/api/auth/csrf'),
  getProjects: () => request<Project[]>('GET', '/api/projects'),
  createProject: (data: { name: string; path: string; env: Record<string, string> }) =>
    request<Project>('POST', '/api/projects', data),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>('PUT', `/api/projects/${id}`, data),
  deleteProject: (id: string) => request<null>('DELETE', `/api/projects/${id}`),
  browseFolder: (path?: string) =>
    request<{ path: string; parent: string | null; entries: { name: string; path: string }[] }>(
      'GET', `/api/fs/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  listProjectFiles: (projectId: string, path?: string) =>
    request<FileListResult>(
      'GET',
      `/api/projects/${projectId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),
  getProjectFilePreview: (projectId: string, path: string) =>
    request<FilePreviewResult>(
      'GET',
      `/api/projects/${projectId}/files/preview?path=${encodeURIComponent(path)}`
    ),
  writeProjectFile: (projectId: string, path: string, content: string) =>
    request<{ success: boolean }>(
      'PUT',
      `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
      { content }
    ),
  getAgents: () => request<AgentDefinition[]>('GET', '/api/agents'),
  getSessions: () => request<Session[]>('GET', '/api/sessions'),
  launchSession: (projectId: string, agentId: string, title?: string) =>
    request<Session>('POST', '/api/sessions/launch', { projectId, agentId, title }),
  stopSession: (id: string) => request<Session>('POST', `/api/sessions/${id}/stop`),
  restartSession: (id: string) => request<Session>('POST', `/api/sessions/${id}/restart`),
  deleteSession: (id: string) => request<null>('DELETE', `/api/sessions/${id}`),
  getConfig: () => request<SafeConfig>('GET', '/api/config'),
  updateConfig: (data: Partial<AppConfig>) => request<SafeConfig>('PUT', '/api/config', data),
  getGitStatus: (projectId: string) => request<GitStatusResult>('GET', `/api/projects/${projectId}/git/status`),
  getGitDiff: (projectId: string, path: string) => request<GitFileDiffResult>('GET', `/api/projects/${projectId}/git/diff?path=${encodeURIComponent(path)}`),
  sendCodexMessage: (sessionId: string, input: string) => request<Session>('POST', `/api/sessions/${sessionId}/messages`, { input }),
  interruptCodexTurn: (sessionId: string) => request<Session>('POST', `/api/sessions/${sessionId}/interrupt`),
  resolveCodexApproval: (sessionId: string, approvalId: string, decision: 'approved' | 'rejected') => request<Session>('POST', `/api/sessions/${sessionId}/approvals/${approvalId}`, { decision })
}
