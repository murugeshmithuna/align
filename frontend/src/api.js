export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

const ADMIN_TOKEN_KEY = 'fitness_agent_admin_token'

// Set once, right after a real Google Sign-In resolves to an ADMIN_EMAILS
// address (see Login.jsx's redirect-callback handling) - never trust a
// plain user_id for /admin/* the way the rest of this app trusts one for
// everything else (see backend/app/admin_auth.py for why that mattered).
// Called with null to clear it on logout (see SessionContext.jsx).
export function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
  else localStorage.removeItem(ADMIN_TOKEN_KEY)
}

function adminAuthHeader() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// The browser's own local calendar date ("2026-08-11"), NOT UTC - `new
// Date().toISOString()` would shift to UTC internally, defeating the whole
// point. Sent on every agent chat request as `client_date` so the
// orchestrator's day-of-week grounding matches what the user is actually
// looking at locally, not the server's UTC date - see backend/app/agent/
// orchestrator.py's _resolve_today() for the real bug this fixes (a user
// ahead of UTC could have the coach ground "today" a full day behind their
// actual local calendar day).
function localDateString() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

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

  chat: (payload) =>
    request('/agent/chat', { method: 'POST', body: JSON.stringify({ client_date: localDateString(), ...payload }) }),

  // NOTE: no listUsers() or createUser() - there is deliberately no bulk
  // user-listing endpoint and no passwordless email sign-in path on the
  // backend anymore (see backend/app/routers/users.py). Google Sign-In
  // (auth/google/start) is the only way to create or access an account.
  googleSignIn: (idToken) => request('/auth/google', { method: 'POST', body: JSON.stringify({ id_token: idToken }) }),

  listExercises: () => request('/exercises'),
  createExercise: (payload) => request('/exercises', { method: 'POST', body: JSON.stringify(payload) }),
  deleteExercise: (exerciseId) => request(`/exercises/${exerciseId}`, { method: 'DELETE' }),

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

  // Admin-only - gated server-side by a signed admin token (see
  // backend/app/admin_auth.py), not a client-supplied user id. The token is
  // set via setAdminToken() below once, right after a Google Sign-In that
  // resolves to an ADMIN_EMAILS address (see Login.jsx). Sending no/an
  // invalid token gets a real 401/403 from the backend - there's nothing to
  // special-case here, the missing-token case is just "no Authorization
  // header," which adminAuthHeader() naturally produces.
  adminListUsers: () => request('/admin/users', { headers: adminAuthHeader() }),
  adminGetUserDetail: (userId) => request(`/admin/users/${userId}`, { headers: adminAuthHeader() }),
}

// Streams an agent chat reply via SSE. Calls onEvent(payload) for every
// decoded frame ({content}, {tool, status}, {widget}, {history}, {error},
// {done}) as it arrives. `history` is the prior turn's opaque conversation
// state (echoed back from a previous {history} frame) - the backend is
// stateless, so the caller owns persisting and replaying it.
// Client-side safety net on top of the backend's own per-Claude-call timeout
// (orchestrator.py's REQUEST_TIMEOUT_SECONDS, 60s): a hang at the network/
// proxy layer - before a request ever reaches that backend code, or a
// connection that's accepted but silently never sends another byte - would
// otherwise leave this fetch's response body awaited forever with no way to
// know the turn is dead, which is the frontend-side half of the "stuck on
// Running adjust_plan... forever" bug. Tracked as inactivity (reset on every
// chunk received), not one absolute deadline, so a real multi-tool-call turn
// that's still actively streaming is never cut off just for running long;
// comfortably longer than the backend's own timeout so a normal slow-but-
// alive turn always has time to fail cleanly on the backend first.
const STREAM_INACTIVITY_TIMEOUT_MS = 90000
const STREAM_TIMEOUT_MESSAGE = "The coach is taking too long to respond - please try again in a moment."

export async function streamAgentChat(userId, message, onEvent, history = []) {
  const controller = new AbortController()
  let watchdog
  const armWatchdog = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => controller.abort(), STREAM_INACTIVITY_TIMEOUT_MS)
  }
  armWatchdog()

  try {
    let res
    try {
      res = await fetch(`${API_BASE_URL}/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, message, history, client_date: localDateString() }),
        signal: controller.signal,
      })
    } catch (err) {
      throw err.name === 'AbortError' ? new Error(STREAM_TIMEOUT_MESSAGE) : err
    }
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || `HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      let done, value
      try {
        ;({ done, value } = await reader.read())
      } catch (err) {
        throw err.name === 'AbortError' ? new Error(STREAM_TIMEOUT_MESSAGE) : err
      }
      armWatchdog()
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
  } finally {
    clearTimeout(watchdog)
  }
}
