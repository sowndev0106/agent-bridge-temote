import type { Project, AgentDefinition, Session, AppConfig } from '../../types'

let csrfToken = ''

export function setCsrfToken(t: string) { csrfToken = t }
export function getCsrfToken() { return csrfToken }

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (['POST', 'PUT', 'DELETE'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message ?? 'Request failed')
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
  getAgents: () => request<AgentDefinition[]>('GET', '/api/agents'),
  getSessions: () => request<Session[]>('GET', '/api/sessions'),
  launchSession: (projectId: string, agentId: string) =>
    request<Session>('POST', '/api/sessions/launch', { projectId, agentId }),
  stopSession: (id: string) => request<Session>('POST', `/api/sessions/${id}/stop`),
  restartSession: (id: string) => request<Session>('POST', `/api/sessions/${id}/restart`),
  deleteSession: (id: string) => request<null>('DELETE', `/api/sessions/${id}`),
  getConfig: () => request<SafeConfig>('GET', '/api/config'),
  updateConfig: (data: Partial<AppConfig>) => request<SafeConfig>('PUT', '/api/config', data)
}
