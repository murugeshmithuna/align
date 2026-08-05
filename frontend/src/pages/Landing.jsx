import { Link } from 'react-router-dom'
import HeroScene from '../components/HeroScene.jsx'
import { useSession } from '../context/SessionContext.jsx'

// Every feature from the system spec, grouped into the categories a visitor
// actually thinks in. `to: null` means the feature isn't built yet - it still
// gets its own card (so nothing is hidden), just an honest "Coming soon"
// badge instead of a dead or fake link.
const FEATURE_CATEGORIES = [
  {
    name: 'Core Coaching',
    description: 'Talk to your coach - it reads your profile and readiness automatically.',
    features: [
      {
        title: 'AI Workout Plan Generation',
        description: 'Describe your goals in plain language and get a structured training plan.',
        to: '/dashboard',
      },
      {
        title: 'Adaptive Plan Adjustment',
        description: "Volume and intensity adjust to your logged performance and today's readiness.",
        to: '/dashboard',
      },
      {
        title: 'Supplement Guidance',
        description: 'Recommendations grounded in your actual goals and training history.',
        to: '/dashboard',
      },
      {
        title: 'Grounded Schedule Q&A',
        description: '"When should I train legs again?" - answered from your real logs, not guesses.',
        to: null,
      },
    ],
  },
  {
    name: 'Vision & Live Coaching',
    description: 'Real-time form feedback while you train.',
    features: [
      {
        title: 'Live Rep Counting & Voice Coaching',
        description: 'Webcam pose tracking counts reps and calls out cues mid-set.',
        to: '/live-session',
      },
      {
        title: 'Squat Form Check',
        description: 'Upload a video for joint-angle analysis - depth, knee tracking, back angle.',
        to: '/live-session',
      },
    ],
  },
  {
    name: 'Multimodal & Multi-Agent',
    description: 'Beyond chat: vision on your meals, debate between specialist coaches.',
    features: [
      {
        title: 'Food Photo Analysis',
        description: 'Snap a meal photo for a calorie/macro estimate and goal-aware swaps.',
        to: null,
      },
      {
        title: 'Multi-Agent Debate',
        description: 'A Strength Coach and a Recovery Coach argue it out; a Head Coach resolves it.',
        to: null,
      },
    ],
  },
  {
    name: 'Analytics & Modeling',
    description: 'Trends and physiology, not vibes.',
    features: [
      {
        title: 'Progress Charts & Weekly Recap',
        description: 'Volume and PR trends over time, plus an auto-generated weekly summary.',
        to: '/progress',
      },
      {
        title: 'Fatigue & Injury-Risk Modeling',
        description: 'A real Banister impulse-response model projects fitness and fatigue trends.',
        to: null,
      },
      {
        title: 'Limb Asymmetry Check',
        description: 'Left/right movement comparison reusing pose-estimation landmark data.',
        to: null,
      },
    ],
  },
  {
    name: 'Account & Daily Management',
    description: 'The baseline the coach builds everything else from.',
    features: [
      {
        title: 'Onboarding & Baseline Profile',
        description: 'Set experience level, frequency, equipment, and goals once.',
        to: '/profile',
      },
      {
        title: 'Daily Readiness Check-In',
        description: "Log how you feel today and today's plan adjusts automatically.",
        to: '/checkin',
      },
      {
        title: 'Calendar-Aware Scheduling',
        description: 'Optional read-only Google Calendar sync factors busy days into scheduling.',
        to: null,
      },
    ],
  },
]

function FeatureCard({ feature }) {
  const isBuilt = Boolean(feature.to)
  return (
    <div className="card p-5 flex flex-col h-full">
      <h3 className="font-heading font-semibold">{feature.title}</h3>
      <p className="text-sm text-slate-400 mt-1.5 flex-1">{feature.description}</p>
      {isBuilt ? (
        <Link
          to={feature.to}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-coral-400 hover:text-coral-300 transition-colors"
        >
          Open →
        </Link>
      ) : (
        <span className="mt-4 inline-block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Coming soon
        </span>
      )}
    </div>
  )
}

export default function Landing() {
  const { isAuthenticated } = useSession()
  const primaryCta = isAuthenticated
    ? { to: '/dashboard', label: 'Go to Dashboard' }
    : { to: '/login', label: 'Get Started' }

  return (
    <div className="min-h-screen font-body">
      <HeroScene />

      <header className="flex items-center justify-between px-6 md:px-12 py-6">
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
      <main className="flex flex-col items-center justify-center text-center px-6 py-20 md:py-28">
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

      {/* Features: one section per category, generous spacing between them */}
      <section className="px-6 md:px-12 pb-8">
        <div className="max-w-5xl mx-auto text-center mb-4">
          <p className="uppercase tracking-[0.2em] text-coral-400 text-xs font-semibold">
            Everything in one coach
          </p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl mt-2">
            Every feature, one tap away
          </h2>
        </div>
      </section>

      {FEATURE_CATEGORIES.map((category, i) => (
        <section
          key={category.name}
          className={`px-6 md:px-12 py-10 ${i % 2 === 1 ? 'bg-forest-900/40' : ''}`}
        >
          <div className="max-w-5xl mx-auto">
            <h3 className="font-heading font-bold text-lg">{category.name}</h3>
            <p className="text-sm text-slate-400 mt-1 mb-6">{category.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {category.features.map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <footer className="px-6 md:px-12 py-10 border-t border-forest-800 text-center">
        <p className="text-sm text-slate-500">AI Fitness Agent - a coach that watches, listens, and adapts.</p>
      </footer>
    </div>
  )
}
