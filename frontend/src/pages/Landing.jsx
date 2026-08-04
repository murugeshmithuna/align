import { Link } from 'react-router-dom'
import HeroScene from '../components/HeroScene.jsx'

const FEATURES = [
  {
    title: 'Pose Tracking',
    tag: 'Vision',
    description:
      'MediaPipe pose estimation checks squat form from an uploaded video and counts reps live from your webcam.',
  },
  {
    title: 'Multi-Agent Coach',
    tag: 'Multi-Agent',
    description:
      'A Strength Coach and a Recovery Coach debate your training data, resolved by a Head Coach into one recommendation.',
  },
  {
    title: 'Fatigue Model',
    tag: 'Modeling',
    description:
      'A real Banister impulse-response model tracks fitness and fatigue from your actual training load - not LLM guesswork.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen font-body">
      <HeroScene />

      <header className="flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-coral-500 pulse-dot" />
          <span className="font-heading font-bold text-lg tracking-tight">AI Fitness Agent</span>
        </div>
        <Link
          to="/login"
          className="px-4 py-2 rounded-full border border-forest-600 hover:border-coral-400 transition-colors text-sm font-heading font-semibold"
        >
          Sign In
        </Link>
      </header>

      <main className="flex flex-col items-center justify-center text-center px-6 py-16">
        <p className="uppercase tracking-[0.2em] text-coral-400 text-xs font-semibold mb-4">
          A coach that watches, listens, and adapts
        </p>
        <h1 className="font-heading font-extrabold text-4xl md:text-6xl leading-tight max-w-3xl">
          Your training plan,
          <span className="text-coral-500"> alive and adapting.</span>
        </h1>
        <p className="mt-6 max-w-xl text-slate-300 text-base md:text-lg">
          Onboard once, then let a multi-agent coach generate, adjust, and explain your training -
          grounded in your real logs, recovery, and daily readiness.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/login"
            className="px-6 py-3 rounded-full bg-coral-500 hover:bg-coral-600 transition-colors font-heading font-semibold shadow-lg shadow-coral-500/20"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 rounded-full border border-forest-600 hover:border-coral-400 transition-colors font-heading font-semibold"
          >
            Sign In
          </Link>
        </div>
      </main>

      <section className="px-6 md:px-12 pb-20">
        <h2 className="font-heading font-bold text-sm uppercase tracking-widest text-slate-400 text-center mb-6">
          What it does
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card p-6">
              <span className="text-coral-400 text-xs font-semibold">{feature.tag}</span>
              <h3 className="font-heading font-semibold text-lg mt-1">{feature.title}</h3>
              <p className="text-sm text-slate-400 mt-2">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
