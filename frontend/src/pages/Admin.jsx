import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

export default function Admin() {
  const { userId } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .adminListUsers(userId)
      .then(setUsers)
      .catch((err) => setError(err.status === 403 ? 'not_authorized' : err.message))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading users…</p>
  }

  if (error === 'not_authorized') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 font-body">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-400">
            Your account doesn't have admin access. This page is restricted to allowlisted emails.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-400 px-6 py-12">{error}</p>
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-body space-y-4">
      <div>
        <h1 className="font-heading font-bold text-2xl">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">All registered users and their activity.</p>
      </div>

      {/* Real table width (measured live) came out ~44px wider than this
          card's content box at the page's own max-w-4xl - the "View →"
          column was silently clipped past the right edge with no visible
          scrollbar hint, and "Signed up" wrapped its date across 3 lines,
          stretching every row. overflow-x-auto still made it technically
          reachable by scrolling, but nothing signaled that. Tightened cell
          padding (px-4->px-3) and stopped the date/count columns from
          wrapping - comfortably fits the same 8 columns without needing to
          scroll on a standard viewport. */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-forest-800">
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Email</th>
              <th className="px-3 py-3 font-semibold whitespace-nowrap">Signed up</th>
              <th className="px-3 py-3 font-semibold text-right">Plans</th>
              <th className="px-3 py-3 font-semibold text-right">Logs</th>
              <th className="px-3 py-3 font-semibold text-right">Meals</th>
              <th className="px-3 py-3 font-semibold text-right">Check-ins</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-forest-800/60 last:border-0">
                <td className="px-3 py-3 font-semibold max-w-[10rem] truncate" title={u.name}>
                  {u.name}
                </td>
                <td className="px-3 py-3 text-slate-400 max-w-[14rem]">
                  <span className="truncate inline-block max-w-full align-bottom" title={u.email}>
                    {u.email}
                  </span>
                  {u.signed_in_with_google && (
                    <span className="ml-2 text-xs text-emerald-400 font-semibold uppercase tracking-wide">
                      Google
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{u.plan_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.log_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.meal_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.checkin_count}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <Link to={`/admin/users/${u.id}`} className="text-coral-400 hover:text-coral-300 font-semibold">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
