export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

// FastAPI's own request-validation errors (a Field(ge=/le=) violation, a
// missing required field, etc.) send `detail` as an array of
// {loc, msg, type} objects, not a plain string - passed straight into
// `new Error(...)`, that stringifies to a useless "[object Object]" toast.
// Every other error path (a plain `raise HTTPException(detail="...")`) still
// sends a string, so this only needs to special-case the array shape.
function formatErrorDetail(detail) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = Array.isArray(e.loc) ? e.loc.filter((part) => part !== 'body').join('.') : ''
        return field ? `${field}: ${e.msg}` : e.msg
      })
      .join('; ')
  }
  return null
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok) {
    const error = new Error(formatErrorDetail(data?.detail) || `HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return data
}

export const api = {
  health: () => request('/health'),

  chat: (payload) => request('/agent/chat', { method: 'POST', body: JSON.stringify(payload) }),

  // NOTE: no listUsers() - there is deliberately no bulk user-listing
  // endpoint on the backend (see backend/app/routers/users.py). createUser
  // is find-or-create by email, so it also serves as "sign in with your own
  // email" for a returning non-Google user.
  createUser: (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
  googleSignIn: (idToken) => request('/auth/google', { method: 'POST', body: JSON.stringify({ id_token: idToken }) }),

  listExercises: () => request('/exercises'),
  createExercise: (payload) => request('/exercises', { method: 'POST', body: JSON.stringify(payload) }),

  getProfile: (userId) => request(`/user/profile/${userId}`),
  saveProfile: (payload) => request('/user/profile', { method: 'POST', body: JSON.stringify(payload) }),

  getTodaysCheckin: (userId) => request(`/user/checkin/today/${userId}`),
  getCheckinHistory: (userId) => request(`/user/checkin/history/${userId}`),
  submitCheckin: (payload) => request('/user/checkin', { method: 'POST', body: JSON.stringify(payload) }),

  listPlans: (userId) => request(`/plans/user/${userId}`),
  getPlan: (planId) => request(`/plans/${planId}`),
  activatePlan: (planId) => request(`/plans/${planId}/activate`, { method: 'PATCH' }),

  createLog: (payload) => request('/logs', { method: 'POST', body: JSON.stringify(payload) }),
  listLogs: (userId) => request(`/logs/user/${userId}`),
  listMealAnalyses: (userId) => request(`/vision/meal-analyses/user/${userId}`),

  getProgress: (userId) => request(`/logs/user/${userId}/progress`),
  getWeeklyRecap: (userId) => request(`/agent/weekly-recap/${userId}`),
  getWeeklyDigest: (userId) => request(`/agent/weekly-digest/${userId}`),
  getCoachResolution: (payload) =>
    request('/agent/coach-resolution', { method: 'POST', body: JSON.stringify(payload) }),
  applyCoachResolution: (payload) =>
    request('/agent/coach-resolution/apply', { method: 'POST', body: JSON.stringify(payload) }),

  getFatigue: (userId) => request(`/fatigue/user/${userId}`),
  checkAsymmetry: (payload) => request('/fatigue/asymmetry', { method: 'POST', body: JSON.stringify(payload) }),

  // Multipart uploads - can't use the JSON `request()` helper above.
  analyzeSquat: async (userId, file) => {
    const formData = new FormData()
    formData.append('user_id', userId)
    formData.append('video', file)
    const res = await fetch(`${API_BASE_URL}/vision/analyze-squat`, { method: 'POST', body: formData })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const error = new Error(formatErrorDetail(data?.detail) || `HTTP ${res.status}`)
      error.status = res.status
      throw error
    }
    return data
  },

  analyzeMeal: async (userId, file) => {
    const formData = new FormData()
    formData.append('user_id', userId)
    formData.append('photo', file)
    const res = await fetch(`${API_BASE_URL}/vision/analyze-meal`, { method: 'POST', body: formData })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const error = new Error(formatErrorDetail(data?.detail) || `HTTP ${res.status}`)
      error.status = res.status
      throw error
    }
    return data
  },

  analyzeMealText: (payload) =>
    request('/vision/analyze-meal-text', { method: 'POST', body: JSON.stringify(payload) }),
  saveMeal: (payload) => request('/vision/save-meal', { method: 'POST', body: JSON.stringify(payload) }),
  estimateIngredient: (payload) =>
    request('/vision/estimate-ingredient', { method: 'POST', body: JSON.stringify(payload) }),

  submitLiveSessionForm: (payload) => request('/vision/live-session-form', { method: 'POST', body: JSON.stringify(payload) }),

  getDailyNutritionReview: (userId) => request(`/agent/nutrition-review/daily/${userId}`),
  getWeeklyNutritionReview: (userId) => request(`/agent/nutrition-review/weekly/${userId}`),

  // Admin-only - gated server-side by ADMIN_EMAILS (backend/app/config.py).
  // requesterId is the signed-in viewer; the backend 403s unless their email
  // is on the allowlist.
  adminListUsers: (requesterId) => request(`/admin/users?requester_id=${requesterId}`),
  adminGetUserDetail: (requesterId, userId) => request(`/admin/users/${userId}?requester_id=${requesterId}`),
}

// Streams an agent chat reply via SSE. Calls onEvent(payload) for every
// decoded frame ({content}, {tool, status}, {widget}, {history}, {error},
// {done}) as it arrives. `history` is the prior turn's opaque conversation
// state (echoed back from a previous {history} frame) - the backend is
// stateless, so the caller owns persisting and replaying it.
export async function streamAgentChat(userId, message, onEvent, history = []) {
  const res = await fetch(`${API_BASE_URL}/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, message, history }),
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
