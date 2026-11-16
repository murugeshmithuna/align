import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppLayout from './AppLayout.jsx'
import { useSession } from '../context/SessionContext.jsx'

vi.mock('../context/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}))

// AppLayout mounts AIMessageBar/Navbar/BottomTabBar, which themselves call
// the API on mount - irrelevant to what this test checks (the redirect
// itself happens before any of them ever render), so they're stubbed out
// rather than dragging their own API mocking into an unrelated test.
vi.mock('./AIMessageBar.jsx', () => ({ default: () => null }))
vi.mock('./BottomTabBar.jsx', () => ({ default: () => null }))
vi.mock('./Navbar.jsx', () => ({ default: () => null }))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  it('redirects to /login when there is no active session', () => {
    useSession.mockReturnValue({ isAuthenticated: false })
    renderAt('/dashboard')
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })

  it('renders the protected route when a session is active', () => {
    useSession.mockReturnValue({ isAuthenticated: true })
    renderAt('/dashboard')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })
})
