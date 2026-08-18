import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'

function Section({ title, children, empty }) {
  return (
    <div className="card p-4">
      <h2 className="font-heading font-semibold text-sm mb-3">{title}</h2>
      {empty ? <p className="text-sm text-slate-500">Nothing yet.</p> : children}
    </div>
  )
}

export default function AdminUserDetail() {
  const { userId: viewedUserId } = useParams()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api
      .adminGetUserDetail(viewedUserId)
      .then(setDetail)
      .catch((err) => setError(err.status === 401 || err.status === 403 ? 'not_authorized' : err.message))
      .finally(() => setLoading(false))
  }, [viewedUserId])

  if (loading) {
    return <p className="text-slate-400 text-sm px-6 py-12">Loading…</p>
  }

  if (error === 'not_authorized') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 font-body">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-400">Your account doesn't have admin access.</p>
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return <p className="text-sm text-red-400 px-6 py-12">{error || 'User not found.'}</p>
  }

  const { user, plans, recent_logs, recent_meals, recent_checkins, recent_soreness_notes } = detail

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 font-body space-y-4">
      <Link to="/admin" className="text-sm text-coral-400 hover:text-coral-300">
        ← All users
      </Link>

      <div className="card p-5 flex items-center gap-4">
        {user.photo_url ? (
          <img src={user.photo_url} alt={user.name} className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-forest-800 text-coral-300 flex items-center justify-center text-xl font-semibold">
            {user.name[0].toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-heading font-bold text-xl">{user.name}</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
          <p className="text-xs text-slate-600 mt-1">
            Joined {new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="card p-3">
          <p className="text-xs text-slate-500">Experience</p>
          <p className="font-semibold">{user.experience_level ?? '—'}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">Target frequency</p>
          <p className="font-semibold">{user.target_frequency ? `${user.target_frequency}/wk` : '—'}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">Calorie target</p>
          <p className="font-semibold">{user.daily_calorie_target ? `${user.daily_calorie_target} kcal` : '—'}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-500">Protein target</p>
          <p className="font-semibold">{user.daily_protein_target ? `${user.daily_protein_target}g` : '—'}</p>
        </div>
      </div>

      <Section title={`Plans (${plans.length})`} empty={plans.length === 0}>
        <div className="space-y-2">
          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center justify-between text-sm border-b border-forest-800/60 last:border-0 pb-2 last:pb-0">
              <div>
                <span className="font-semibold">{plan.name}</span>
                {plan.is_active && (
                  <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">Active</span>
                )}
              </div>
              <span className="text-slate-500">{plan.plan_exercises.length} exercises</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Recent workout logs (${recent_logs.length})`} empty={recent_logs.length === 0}>
        <div className="space-y-1.5 text-sm">
          {recent_logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between text-slate-300">
              <span>{log.exercise.name}</span>
              <span className="text-slate-500 tabular-nums">
                {log.sets ?? '—'}x{log.reps ?? '—'} {log.weight ? `@ ${log.weight}` : ''} ·{' '}
                {new Date(log.performed_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Recent meals (${recent_meals.length})`} empty={recent_meals.length === 0}>
        <div className="space-y-1.5 text-sm">
          {recent_meals.map((meal) => (
            <div key={meal.id} className="flex items-center justify-between text-slate-300 gap-3">
              <span className="truncate">{meal.description}</span>
              <span className="text-slate-500 tabular-nums shrink-0">
                {meal.estimated_calories} kcal · {new Date(meal.analyzed_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Recent check-ins (${recent_checkins.length})`} empty={recent_checkins.length === 0}>
        <div className="space-y-1.5 text-sm">
          {recent_checkins.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-slate-300">
              <span>{c.label}</span>
              <span className="text-slate-500">
                {c.plan_status_label} · {new Date(c.checkin_date).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Soreness notes (${recent_soreness_notes.length})`} empty={recent_soreness_notes.length === 0}>
        <div className="space-y-1.5 text-sm">
          {recent_soreness_notes.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-slate-300">
              <span>
                {s.muscle_group} · severity {s.severity}/5
              </span>
              <span className="text-slate-500">{new Date(s.noted_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
