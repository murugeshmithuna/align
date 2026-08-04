import { useEffect, useRef, useState } from 'react'
import { streamAgentChat } from '../api.js'

let nextId = 1

const ROLE_STYLES = {
  user: 'text-right text-slate-200',
  agent: 'text-coral-300',
  status: 'text-slate-500 italic text-xs',
  error: 'text-red-400',
}

const ROLE_LABELS = {
  user: 'You',
  agent: 'Agent',
  error: 'Error',
  status: '',
}

export default function ChatPanel({ userId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages])

  function appendMessage(role, text) {
    const id = nextId++
    setMessages((prev) => [...prev, { id, role, text }])
    return id
  }

  function appendToMessage(id, chunk) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: m.text + chunk } : m)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const message = input.trim()
    if (!message || sending) return

    appendMessage('user', message)
    setInput('')
    setSending(true)
    const agentId = appendMessage('agent', '')

    try {
      await streamAgentChat(userId, message, (payload) => {
        if (payload.content) {
          appendToMessage(agentId, payload.content)
        } else if (payload.tool && payload.status === 'running') {
          appendMessage('status', `Running ${payload.tool}…`)
        } else if (payload.error) {
          appendMessage('error', payload.error)
        }
      })
    } catch (err) {
      appendMessage('error', err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-heading font-semibold mb-1">Talk to your coach</h2>
      <p className="text-sm text-slate-400 mb-4">
        Uses your saved profile and today's check-in automatically - just describe what you want.
      </p>

      <div ref={logRef} className="space-y-2 mb-4 max-h-72 overflow-y-auto text-sm">
        {messages.map((m) => (
          <div key={m.id} className={ROLE_STYLES[m.role]}>
            {ROLE_LABELS[m.role] && <span className="font-semibold">{ROLE_LABELS[m.role]}: </span>}
            <span>{m.text}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Build me a 3-day full body plan"
          className="flex-1 px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-semibold"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
