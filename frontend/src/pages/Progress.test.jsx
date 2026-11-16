import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Progress from './Progress.jsx'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

// react-chartjs-2 renders to a real <canvas> context jsdom doesn't
// implement - stubbed to a plain element so this test can check the real
// data-driven text (the risk badge/message) without needing a canvas
// polyfill for chart pixels nothing here asserts on anyway.
vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="chart-line" />,
  Bar: () => <div data-testid="chart-bar" />,
  Doughnut: () => <div data-testid="chart-doughnut" />,
}))

vi.mock('../api.js', () => ({
  api: {
    getProgress: vi.fn(),
    getFatigue: vi.fn(),
    getProfile: vi.fn(),
    listLogs: vi.fn(),
    listMealAnalyses: vi.fn(),
    getCheckinHistory: vi.fn(),
  },
}))

vi.mock('../context/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}))

// A real Banister-model-shaped fixture (date/load/fitness/fatigue/form per
// day) - the exact shape backend/app/agent/fatigue.py's compute_banister_
// series returns, feeding a genuine high-injury-risk read through to the
// rendered page.
const FATIGUE_FIXTURE = {
  series: [
    { date: '2026-11-10', load: 100, fitness: 50, fatigue: 80, form: -110 },
    { date: '2026-11-11', load: 0, fitness: 49, fatigue: 68, form: -87 },
  ],
  risk: {
    risk_level: 'high',
    message: 'Fatigue is running well ahead of fitness - high overtraining/injury risk. Consider a deload.',
    form_ratio: -1.776,
  },
}

describe('Progress fatigue section', () => {
  it('renders the real risk level and message from fixture fatigue data', async () => {
    useSession.mockReturnValue({ userId: 1 })
    api.getProgress.mockResolvedValue({ volume_by_date: [], calories_by_date: [], exercises: [] })
    api.getFatigue.mockResolvedValue(FATIGUE_FIXTURE)
    api.getProfile.mockResolvedValue({})
    api.listLogs.mockResolvedValue([])
    api.listMealAnalyses.mockResolvedValue([])
    api.getCheckinHistory.mockResolvedValue([])

    render(<Progress />)

    await waitFor(() => expect(api.getFatigue).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /advanced biometrics/i }))

    await waitFor(() => {
      expect(screen.getByText(/high risk/i)).toBeInTheDocument()
    })
    expect(
      screen.getByText(/fatigue is running well ahead of fitness - high overtraining\/injury risk/i),
    ).toBeInTheDocument()
  })
})
