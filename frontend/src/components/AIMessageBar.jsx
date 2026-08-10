import { useEffect, useRef, useState } from 'react'
import { streamAgentChat } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { notifyIfMutating } from '../utils/coachEvents.js'

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

const CONFIRM_SHORTHAND = /^(yes|y|yeah|yep|sure|ok|okay|do it|go|go ahead|apply|confirm|tailor it)$/i

// Maps a raw backend tool name to a short, human, present-participle status
// line - never surface an internal function/tool name to the user (e.g.
// "Running adjust_plan…"). Falls back to a generic phrase for any future
// tool this map hasn't been updated for yet, so a new tool can never regress
// back to a raw identifier leaking through.
const TOOL_STATUS_LABELS = {
  generate_workout_plan: 'Generating your plan…',
  adjust_plan: 'Updating your plan…',
  log_workout: 'Logging your workout…',
  update_log: 'Updating your activity log…',
  delete_log: 'Removing that log entry…',
  suggest_supplements: 'Finding supplement suggestions…',
  ask_schedule: 'Checking your schedule…',
  analyze_form: 'Reviewing your form…',
  ask_nutrition: 'Reviewing your nutrition…',
}

function toolStatusLabel(toolName) {
  return TOOL_STATUS_LABELS[toolName] || 'Working on it…'
}

// Maps a short typed reply ("2", "yes", "45 mins") back to the exact option
// text of whichever widget is currently awaiting an answer, so the user
// isn't forced to re-type a full sentence. Falls through to the raw text
// (still resolvable by the model, since full history is now sent every turn).
function resolveShortReply(raw, widget) {
  if (!widget) return raw
  const trimmed = raw.trim()

  if (/^\d+$/.test(trimmed)) {
    const option = widget.options[Number(trimmed) - 1]
    if (option) return option
  }

  if (widget.widget_type === 'confirm' && CONFIRM_SHORTHAND.test(trimmed)) {
    return widget.options[0]
  }

  const exact = widget.options.find((o) => o.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact
  const partial = widget.options.find((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
  if (partial) return partial

  return raw
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2ZM5 16l.9 2.6L8.5 19.5 5.9 20.4 5 23l-.9-2.6L1.5 19.5l2.6-.9L5 16ZM18 14l1.1 3.2 3.2 1.1-3.2 1.1L18 22.6l-1.1-3.2-3.2-1.1 3.2-1.1L18 14Z" />
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

// Renders a present_choice widget as real buttons/checkboxes instead of the
// model asking a question in prose. Once answered, collapses to a plain
// "You chose: ..." line so old widgets in the log aren't still clickable.
function ChoiceWidget({ message, disabled, onOptionClick, onToggleOption, onMultiConfirm }) {
  const widget = message.widget

  if (widget.answered) {
    return <div className="mt-1.5 text-xs text-slate-500 italic">You chose: {widget.answered}</div>
  }

  if (widget.widget_type === 'confirm') {
    return (
      <div className="mt-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOptionClick(message.id, widget.options[0])}
          className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-semibold text-forest-950 transition-colors"
        >
          {widget.options[0]}
        </button>
      </div>
    )
  }

  if (widget.widget_type === 'multi_select') {
    const selected = widget.selected || []
    return (
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          {widget.options.map((opt) => {
            const checked = selected.includes(opt)
            return (
              <label
                key={opt}
                className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  checked ? 'border-coral-500 bg-coral-500/10 text-coral-200' : 'border-forest-700 text-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggleOption(message.id, opt)}
                  className="accent-coral-500"
                />
                {opt}
              </label>
            )
          })}
        </div>
        <button
          type="button"
          disabled={disabled || selected.length === 0}
          onClick={() => onMultiConfirm(message.id)}
          className="px-3 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-40 text-xs font-semibold text-forest-950 transition-colors"
        >
          Continue
        </button>
      </div>
    )
  }

  // single_choice
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {widget.options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onOptionClick(message.id, opt)}
          className="px-3 py-1.5 rounded-full border border-coral-500/50 text-coral-200 hover:bg-coral-500/10 disabled:opacity-40 text-xs font-medium transition-colors"
        >
          {opt}
        </button>
      ))}
    </div>
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
  const [activeWidget, setActiveWidget] = useState(null)
  const logRef = useRef(null)
  // Opaque conversation state echoed back to the backend on every turn - the
  // API itself is stateless, so without this a short reply like "2" arrives
  // with no context and looks like a non-sequitur to the model.
  const historyRef = useRef([])
  // Tracks the currently-shown "Updating your plan…" style status message so
  // it can be cleared once the tool actually finishes - the backend sends a
  // matching {"tool": name, "status": "done"} frame right after every
  // {"status": "running"} one, but nothing here was listening for it, so the
  // status message was appended once and then left in the log forever,
  // looking exactly like a permanent hang even when the turn completed in a
  // few seconds and the model's real reply streamed in right below it.
  const statusMessageIdRef = useRef(null)

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

  function attachWidget(id, widget) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, widget: { ...widget, selected: [] } } : m)))
    setActiveWidget({ messageId: id, ...widget })
  }

  function markAnswered(messageId, answerText) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, widget: { ...m.widget, answered: answerText } } : m)),
    )
    setActiveWidget((cur) => (cur && cur.messageId === messageId ? null : cur))
  }

  async function sendToAgent(text) {
    if (!text || sending) return
    appendMessage('user', text)
    setSending(true)
    statusMessageIdRef.current = null
    const agentId = appendMessage('agent', '')

    try {
      await streamAgentChat(
        userId,
        text,
        (payload) => {
          if (payload.content) {
            appendToMessage(agentId, payload.content)
          } else if (payload.tool && payload.status === 'running') {
            statusMessageIdRef.current = appendMessage('status', toolStatusLabel(payload.tool))
          } else if (payload.tool && payload.status === 'done') {
            const id = statusMessageIdRef.current
            if (id != null) {
              setMessages((prev) => prev.filter((m) => m.id !== id))
              statusMessageIdRef.current = null
            }
            // Tells any currently-open page (Dashboard, PlanDetail, etc.) to
            // refetch - without this, a real, successful database change
            // just sits there until the user manually reloads, which is
            // exactly the "said added but can't see it" report this fixes.
            notifyIfMutating(payload.tool)
          } else if (payload.widget) {
            attachWidget(agentId, payload.widget)
          } else if (payload.history) {
            historyRef.current = payload.history
          } else if (payload.error) {
            appendMessage('error', payload.error)
          }
        },
        historyRef.current,
      )
    } catch (err) {
      appendMessage('error', err.message)
    } finally {
      setSending(false)
    }
  }

  function handleOptionClick(messageId, option) {
    markAnswered(messageId, option)
    sendToAgent(option)
  }

  function handleToggleOption(messageId, option) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.widget) return m
        const current = m.widget.selected || []
        const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option]
        return { ...m, widget: { ...m.widget, selected: next } }
      }),
    )
  }

  function handleMultiConfirm(messageId) {
    const msg = messages.find((m) => m.id === messageId)
    const selected = msg?.widget?.selected || []
    if (!selected.length) return
    const answerText = selected.join(', ')
    markAnswered(messageId, answerText)
    sendToAgent(answerText)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const raw = input.trim()
    if (!raw || sending) return
    setInput('')

    if (activeWidget) {
      const resolved = resolveShortReply(raw, activeWidget)
      markAnswered(activeWidget.messageId, resolved)
      sendToAgent(resolved)
      return
    }

    sendToAgent(raw)
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close AI coach' : 'Open AI coach'}
        // A wide labeled pill still overlaps page content it happens to
        // scroll past even once it clears the BottomTabBar (mobile screen
        // real estate is tight and content is full-width). A compact
        // icon-only circle on mobile covers far less; the full labeled pill
        // is kept on desktop where there's no competing tab bar and more
        // room to spare.
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex items-center justify-center md:justify-start gap-2 w-12 h-12 md:w-auto md:h-auto md:pl-4 md:pr-5 md:py-3 rounded-full bg-coral-500 hover:bg-coral-600 text-white shadow-lg shadow-coral-500/30 hover:shadow-xl hover:scale-105 transition-all duration-200 font-heading font-semibold"
      >
        <SparkleIcon />
        <span className="hidden md:inline">Ask Coach</span>
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

        <div id="ai-chat-log" ref={logRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2 text-sm">
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
              {m.widget && (
                <ChoiceWidget
                  message={m}
                  disabled={sending}
                  onOptionClick={handleOptionClick}
                  onToggleOption={handleToggleOption}
                  onMultiConfirm={handleMultiConfirm}
                />
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-forest-800">
          {/* Border Beam treatment: dark-glass rounded-2xl input box with a
              travelling lime gradient ring + soft bloom underneath (see
              .border-beam-wrap in index.css). Same input/button/handler as
              before - visual restyle only. */}
          <form
            onSubmit={handleSubmit}
            className="border-beam-wrap relative flex items-center gap-2 rounded-2xl bg-forest-900/70 border border-forest-700/70 backdrop-blur-md px-2 py-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeWidget ? 'Or type your answer…' : 'Ask your coach…'}
              className="flex-1 min-w-0 px-2 py-2 bg-transparent text-sm placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending}
              aria-label="Send"
              className="w-9 h-9 flex-shrink-0 rounded-full bg-coral-500 hover:bg-coral-600 disabled:opacity-50 flex items-center justify-center transition-colors"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
