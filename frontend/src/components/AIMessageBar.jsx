import { useEffect, useRef, useState } from 'react'
import { streamAgentChat } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

let nextId = 1

const ROLE_STYLES = {
  user: 'text-right text-slate-200',
  agent: 'text-coral-300',
  status: 'text-slate-500 italic text-xs',
  error: 'text-red-400',
}

const ROLE_LABELS = {
  user: 'You',
  agent: 'Coach',
  error: 'Error',
  status: '',
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.487 0-2.89-.322-4.126-.89L3 20l1.06-3.18C3.39 15.68 3 14.38 3 13c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  )
}

// Floating AI assistant available from any authenticated page - a slide-over
// drawer over a FAB, reusing the same streaming chat backend as the
// Dashboard's inline ChatPanel, just accessible globally rather than only
// on one page.
export default function AIMessageBar() {
  const { userId } = useSession()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, open])

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
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close AI coach' : 'Open AI coach'}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-coral-500 hover:bg-coral-600 text-forest-950 shadow-lg shadow-coral-500/30 flex items-center justify-center transition-colors"
      >
        {open ? <CloseIcon /> : <ChatBubbleIcon />}
      </button>

      {/* Backdrop - click to close, doesn't block the rest of the page when closed */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <div
        className={`fixed top-0 right-0 z-40 h-full w-full max-w-sm bg-forest-900 border-l border-forest-800 shadow-2xl transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-forest-800">
          <div>
            <h2 className="font-heading font-semibold">AI Coach</h2>
            <p className="text-xs text-slate-500">Available on every page</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-slate-400 hover:text-coral-300 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div ref={logRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2 text-sm">
          {messages.length === 0 && (
            <p className="text-slate-500 text-sm">
              Ask anything - "adjust today's session", "how was my squat form?", "how's my nutrition
              been?"
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={ROLE_STYLES[m.role]}>
              {ROLE_LABELS[m.role] && <span className="font-semibold">{ROLE_LABELS[m.role]}: </span>}
              <span>{m.text}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 px-5 py-4 border-t border-forest-800">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your coach…"
            className="flex-1 px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          />
          <button
            type="submit"
            disabled={sending}
            aria-label="Send"
            className="px-3 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 flex items-center justify-center"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </>
  )
}
