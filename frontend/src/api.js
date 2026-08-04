export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok) {
    const error = new Error(data?.detail || `HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return data
}

export const api = {
  health: () => request('/health'),

  listUsers: () => request('/users'),
  createUser: (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),

  getProfile: (userId) => request(`/user/profile/${userId}`),
  saveProfile: (payload) => request('/user/profile', { method: 'POST', body: JSON.stringify(payload) }),

  getTodaysCheckin: (userId) => request(`/user/checkin/today/${userId}`),
  submitCheckin: (payload) => request('/user/checkin', { method: 'POST', body: JSON.stringify(payload) }),

  listPlans: (userId) => request(`/plans/user/${userId}`),
}

// Streams an agent chat reply via SSE. Calls onEvent(payload) for every
// decoded frame ({content}, {tool, status}, {error}, {done}) as it arrives.
export async function streamAgentChat(userId, message, onEvent) {
  const res = await fetch(`${API_BASE_URL}/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, message }),
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop()

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice('data: '.length)))
      } catch {
        // ignore malformed frame
      }
    }
  }
}
