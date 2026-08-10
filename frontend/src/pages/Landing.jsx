import { Link } from 'react-router-dom'
import AiCoreGlow from '../components/AiCoreGlow.jsx'
import AlignWordmark from '../components/AlignWordmark.jsx'
import LiveSignalBg from '../components/LiveSignalBg.jsx'
import { useSession } from '../context/SessionContext.jsx'

// Real features only - no fabricated trust logos or stats. Mirrors the
// visual rhythm of a typical landing-page "trusted by" row without
// pretending to have partners/press this app doesn't have.
const FEATURE_BADGES = [
  { icon: '🧠', label: 'AI Coach' },
  { icon: '📹', label: 'Live Form Tracking' },
  { icon: '🍽️', label: 'Nutrition Analysis' },
  { icon: '📊', label: 'Fatigue Modeling' },
]

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
      {/* Live Signal backdrop is scoped to just this wrapper (header + hero)
          via `relative` + `absolute inset-0` on the child, not the whole
          scrollable page - the feature/footer sections below keep the app's
          normal dark forest/coral surface, unified by sharing the same color
          tokens rather than by repeating the animated signal everywhere. */}
      <div className="relative overflow-hidden">
        <LiveSignalBg />
        <AiCoreGlow className="opacity-80" />

        <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
          <AlignWordmark className="font-heading font-bold text-lg tracking-tight" size="1.15em" />
          <Link
            to={primaryCta.to}
            className="px-4 py-2 rounded-full border border-forest-600 hover:border-coral-400 transition-colors text-sm font-heading font-semibold"
          >
            {isAuthenticated ? 'Dashboard' : 'Sign In'}
          </Link>
        </header>

        {/* Hero: eyebrow tagline, bold benefit-led headline, one clear
            primary CTA + a secondary anchor into the feature section below. */}
        <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-20 md:py-28">
          <p className="uppercase tracking-[0.25em] text-coral-400 text-xs md:text-sm font-heading font-semibold">
            A coach that watches, listens, and adapts
          </p>
          <h1 className="mt-4 font-heading font-extrabold uppercase text-4xl sm:text-5xl md:text-7xl leading-[1.05] tracking-tight">
            Train smarter.
            <br />
            Recover faster.
            <br />
            <span className="text-coral-400">Never guess again.</span>
          </h1>
          <p className="mt-6 max-w-xl text-slate-300 text-base md:text-lg">
            Onboard once, then let a multi-agent coach generate, adjust, and explain your training -
            grounded in your real logs, recovery, and daily readiness.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={primaryCta.to}
              className="px-8 py-3.5 rounded-full bg-coral-500 hover:bg-coral-600 transition-colors font-heading font-semibold shadow-lg shadow-coral-500/20 inline-block"
            >
              {primaryCta.label}
            </Link>
            <a
              href="#features"
              className="px-8 py-3.5 rounded-full border border-forest-600 hover:border-coral-400 transition-colors font-heading font-semibold inline-block"
            >
              See what's inside
            </a>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-2.5">
            {FEATURE_BADGES.map((f) => (
              <span
                key={f.label}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-forest-700 bg-forest-900/60 text-xs md:text-sm text-slate-300"
              >
                <span>{f.icon}</span>
                {f.label}
              </span>
            ))}
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
        <p className="text-sm text-slate-500">ALIGN - a coach that watches, listens, and adapts.</p>
      </footer>
    </div>
  )
}
