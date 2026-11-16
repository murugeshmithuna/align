import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AIMessageBar from './AIMessageBar.jsx'
import { streamAgentChat } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'
import { ToastProvider } from '../context/ToastContext.jsx'

vi.mock('../api.js', () => ({
  streamAgentChat: vi.fn(),
}))

vi.mock('../context/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}))

function renderBar() {
  return render(
    <ToastProvider>
      <AIMessageBar />
    </ToastProvider>,
  )
}

describe('AIMessageBar', () => {
  it('sends a typed message and renders the streamed reply', async () => {
    useSession.mockReturnValue({ userId: 1 })
    // Simulates a real streamed reply - calls the onEvent callback with a
    // content chunk, the same shape the backend's SSE frames actually use.
    streamAgentChat.mockImplementation(async (message, onEvent) => {
      onEvent({ content: 'Your squat volume is trending up this week.' })
      onEvent({ history: [] })
      onEvent({ done: true })
    })

    renderBar()
    fireEvent.click(screen.getByLabelText('Open AI coach'))

    const input = screen.getByPlaceholderText('Ask your coach…')
    fireEvent.change(input, { target: { value: 'How is my squat progressing?' } })
    fireEvent.submit(input.closest('form'))

    expect(streamAgentChat).toHaveBeenCalledWith(
      'How is my squat progressing?',
      expect.any(Function),
      expect.any(Array),
    )

    await waitFor(() => {
      expect(screen.getByText('Your squat volume is trending up this week.')).toBeInTheDocument()
    })
    // The user's own message is echoed into the log too, not just the reply.
    expect(screen.getByText('How is my squat progressing?')).toBeInTheDocument()
  })
})
