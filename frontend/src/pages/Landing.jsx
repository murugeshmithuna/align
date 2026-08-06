import { Link } from 'react-router-dom'
import CosmicParallaxBg from '../components/CosmicParallaxBg.jsx'
import { useSession } from '../context/SessionContext.jsx'

// Marketing summary only - no cards, no links, nothing that renders a tool
// or navigates anywhere on its own. Every feature has its own dedicated
// route; the landing page's job is to describe them, not launch them.
const HIGHLIGHTS = [
  {
    name: 'Core Coaching',
    description:
      'An AI coach that reads your profile and daily readiness automatically - generating, adjusting, and explaining your training plan, and recommending supplements grounded in your actual goals and history.',
  },
  {
    name: 'Vision & Live Coaching',
    description:
      'Real-time webcam pose tracking counts reps and calls out form cues mid-set, or upload a video for joint-angle analysis - depth, knee tracking, back angle.',
  },
  {
    name: 'Multimodal & Multi-Agent',
    description:
      'Snap a meal photo for a calorie/macro estimate and goal-aware feedback, or get a second opinion from a Strength Coach and a Recovery Coach who argue it out until a Head Coach resolves it.',
  },
  {
    name: 'Analytics & Modeling',
    description:
      'Volume and PR trends over time, an auto-generated weekly recap, and a real Banister impulse-response model projecting fitness and fatigue - trends and physiology, not vibes.',
  },
]

export default function Landing() {
  const { isAuthenticated } = useSession()
  const primaryCta = isAuthenticated
    ? { to: '/dashboard', label: 'Go to Dashboard' }
    : { to: '/login', label: 'Get Started' }

  return (
    <div className="min-h-screen font-body">
      {/* Cosmic parallax backdrop is scoped to just this wrapper (header +
          hero) via `relative` + `absolute inset-0` on the child, not the
          whole scrollable page - the feature/footer sections below keep the
          app's normal dark forest/coral surface, unified by sharing the same
          color tokens rather than by repeating the starfield everywhere. */}
      <div className="relative overflow-hidden">
        <CosmicParallaxBg head="AI Fitness Agent" text="Watches, Listens, Adapts" />

        <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-coral-500 pulse-dot" />
            <span className="font-heading font-bold text-lg tracking-tight">AI Fitness Agent</span>
          </div>
          <Link
            to={primaryCta.to}
            className="px-4 py-2 rounded-full border border-forest-600 hover:border-coral-400 transition-colors text-sm font-heading font-semibold"
          >
            {isAuthenticated ? 'Dashboard' : 'Sign In'}
          </Link>
        </header>

        {/* Hero: website title first, tagline right under it, one clear CTA */}
        <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-20 md:py-28">
          <h1 className="font-heading font-extrabold text-5xl md:text-7xl leading-tight">
            AI Fitness Agent
          </h1>
          <p className="mt-4 max-w-2xl text-coral-400 text-lg md:text-xl font-heading font-semibold">
            A coach that watches, listens, and adapts.
          </p>
          <p className="mt-5 max-w-xl text-slate-300 text-base md:text-lg">
            Onboard once, then let a multi-agent coach generate, adjust, and explain your training -
            grounded in your real logs, recovery, and daily readiness.
          </p>

          <div className="mt-10">
            <Link
              to={primaryCta.to}
              className="px-8 py-3.5 rounded-full bg-coral-500 hover:bg-coral-600 transition-colors font-heading font-semibold shadow-lg shadow-coral-500/20 inline-block"
            >
              {primaryCta.label}
            </Link>
          </div>
        </main>
      </div>

      {/* Feature overview: marketing summary text only - no cards, no links,
          nothing interactive. Every feature lives on its own dedicated route
          once you're signed in; this section describes, it doesn't launch. */}
      <section className="px-6 md:px-12 py-16 border-t border-forest-800">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <p className="uppercase tracking-[0.2em] text-coral-400 text-xs font-semibold">
            Everything in one coach
          </p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl mt-2">What you get</h2>
        </div>
        <div className="max-w-3xl mx-auto space-y-8">
          {HIGHLIGHTS.map((item) => (
            <div key={item.name}>
              <h3 className="font-heading font-bold text-lg">{item.name}</h3>
              <p className="text-sm text-slate-400 mt-1.5">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 md:px-12 py-10 border-t border-forest-800 text-center">
        <p className="text-sm text-slate-500">AI Fitness Agent - a coach that watches, listens, and adapts.</p>
      </footer>
    </div>
  )
}
