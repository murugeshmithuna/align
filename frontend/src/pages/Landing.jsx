import { Link } from 'react-router-dom'
import AlignWordmark from '../components/AlignWordmark.jsx'
import OrbitalRing from '../components/OrbitalRing.jsx'
import { useSession } from '../context/SessionContext.jsx'

// Plain inline SVGs, matching this app's existing icon convention everywhere
// else (see WorkoutLog.jsx/Navbar.jsx) - no icon library dependency.
function BrainIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 4a2.5 2.5 0 0 0-2.45 2c-1.26.2-2.05 1.3-2.05 2.5 0 .3.04.58.12.85A2.5 2.5 0 0 0 4 11.5c0 1 .6 1.87 1.45 2.24-.13.34-.2.71-.2 1.1a2.66 2.66 0 0 0 2.66 2.66c.1.9.87 1.6 1.79 1.6.9 0 1.64-.65 1.78-1.5V6.5A2.5 2.5 0 0 0 9.5 4Z" />
      <path d="M14.5 4a2.5 2.5 0 0 1 2.45 2c1.26.2 2.05 1.3 2.05 2.5 0 .3-.04.58-.12.85A2.5 2.5 0 0 1 20 11.5c0 1-.6 1.87-1.45 2.24.13.34.2.71.2 1.1a2.66 2.66 0 0 1-2.66 2.66 1.79 1.79 0 0 1-1.79 1.6c-.9 0-1.64-.65-1.78-1.5V6.5A2.5 2.5 0 0 1 14.5 4Z" />
    </svg>
  )
}

// Small heartbeat/EKG zigzag - echoes the app's existing "live signal"
// motif (see the AlignWordmark's own pulse-A crossbar) without reusing a
// whole scrolling background component for it.
function PulseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 7 4-14 2 7h6" />
    </svg>
  )
}

function TargetIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  )
}

function LeafIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14Z" />
      <path d="M5 19c0-5 3-9 8-11" />
    </svg>
  )
}

const FEATURE_PHRASES = [
  { icon: BrainIcon, label: 'AI Coaching' },
  { icon: PulseIcon, label: 'Real-Time Tracking' },
  { icon: TargetIcon, label: 'Personalized Insights' },
  { icon: LeafIcon, label: 'Recovery Optimized' },
]

const BOTTOM_FEATURES = [
  { icon: BrainIcon, title: 'AI Coach', subtitle: 'Smart guidance' },
  { icon: PulseIcon, title: 'Live Tracking', subtitle: 'See progress' },
  { icon: TargetIcon, title: 'Nutrition Insights', subtitle: 'Fuel better' },
  { icon: LeafIcon, title: 'Fatigue Modeling', subtitle: 'Train at your best' },
]

const NAV_ANCHORS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#science', label: 'Science' },
]

// Real features only - grouped under the three nav anchors above rather
// than one flat list, so "Features" / "How It Works" / "Science" each
// point at genuine content instead of a decorative dead link.
const FEATURE_ITEMS = [
  {
    name: 'AI Coach',
    description:
      'Reads your profile and daily readiness automatically - generating, adjusting, and explaining your training plan.',
  },
  {
    name: 'Live Form Tracking',
    description:
      'Real-time webcam pose tracking counts reps and calls out form cues mid-set, or upload a video for joint-angle analysis.',
  },
  {
    name: 'Meal Photo Analysis',
    description: 'Snap a meal photo for an ingredient-level calorie and macro estimate, grounded in your actual targets.',
  },
  {
    name: 'Coach Resolution',
    description:
      'Submit a real training dilemma and get one weighed-through verdict, applied straight to your plan.',
  },
]

const HOW_IT_WORKS_STEPS = [
  { step: '01', title: 'Onboard once', description: 'Experience, equipment, goals, and limitations - set once, never re-asked.' },
  { step: '02', title: 'The coach adapts', description: 'Your plan adjusts to real logs, soreness, and daily readiness - not a fixed template.' },
  { step: '03', title: 'You keep improving', description: 'Every session, meal, and check-in sharpens the next recommendation.' },
]

export default function Landing() {
  const { isAuthenticated } = useSession()
  const primaryCta = isAuthenticated
    ? { to: '/dashboard', label: 'Dashboard' }
    : { to: '/login', label: 'Get Started' }

  return (
    <div className="min-h-screen font-body bg-forest-950">
      <div className="relative overflow-hidden min-h-[92vh] md:min-h-[90vh] flex flex-col">
        <header
          className="hero-fade-in relative z-10 flex items-center justify-between gap-4 px-6 md:px-12 py-6 md:py-8"
          style={{ '--hero-delay': 0 }}
        >
          <AlignWordmark className="font-heading font-bold text-base tracking-[0.15em]" size="1.1em" />
          <nav className="hidden md:flex items-center gap-8 text-xs font-heading font-semibold uppercase tracking-[0.15em] text-slate-400">
            {NAV_ANCHORS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-slate-200 transition-colors">
                {l.label}
              </a>
            ))}
            <Link to={isAuthenticated ? '/dashboard' : '/login'} className="hover:text-slate-200 transition-colors">
              {isAuthenticated ? 'Dashboard' : 'Log In'}
            </Link>
          </nav>
          <Link
            to={primaryCta.to}
            className="px-5 py-2.5 rounded-full bg-coral-500 hover:bg-coral-600 transition-colors text-xs font-heading font-bold uppercase tracking-wide whitespace-nowrap"
          >
            Get Started
          </Link>
        </header>

        {/* Two-column hero: copy left, athlete visual + orbital ring right -
            stacked on mobile (visual below the copy, same hierarchy). */}
        <main className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-8 items-center px-6 md:px-12 py-12 md:py-0">
          <div className="max-w-xl">
            <p
              className="hero-fade-in uppercase tracking-[0.3em] text-coral-400 text-xs font-heading font-semibold"
              style={{ '--hero-delay': 1 }}
            >
              Coach. Adapt. Evolve.
            </p>
            <h1
              className="hero-fade-in mt-5 font-heading font-extrabold uppercase text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight"
              style={{ '--hero-delay': 2 }}
            >
              Train smarter.
              <br />
              Recover faster.
              <br />
              <span className="text-coral-400">Always improving.</span>
            </h1>

            <div
              className="hero-fade-in mt-8 flex flex-wrap gap-x-6 gap-y-3"
              style={{ '--hero-delay': 3 }}
            >
              {FEATURE_PHRASES.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-2 text-xs font-heading font-semibold uppercase tracking-wide text-slate-300"
                >
                  <Icon className="w-4 h-4 text-coral-400 shrink-0" />
                  {label}
                </span>
              ))}
            </div>

            <Link
              to={primaryCta.to}
              className="hero-fade-in mt-10 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-coral-500 hover:bg-coral-600 transition-colors font-heading font-bold uppercase tracking-wide shadow-lg shadow-coral-500/20"
              style={{ '--hero-delay': 4 }}
            >
              {primaryCta.label}
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Athlete visual - drop a real photo at src/assets/hero-athlete.jpg
              (or any path) and replace the placeholder <div> below with an
              <img src={...} alt="" className="absolute inset-0 w-full h-full
              object-cover" /> - left as a duotone placeholder here since no
              real photo asset exists in this project yet. Uses only existing
              theme tokens (forest-800/900/950), no new color. */}
          <div
            className="hero-fade-in relative flex items-center justify-center"
            style={{ '--hero-delay': 5 }}
          >
            <div className="relative w-full max-w-md aspect-[4/5]">
              <OrbitalRing />
              <div className="absolute inset-6 rounded-[2rem] overflow-hidden bg-gradient-to-b from-forest-800 via-forest-900 to-forest-950 border border-forest-700 flex items-center justify-center text-center px-8">
                <p className="text-xs uppercase tracking-widest text-slate-600 leading-relaxed">
                  Athlete photo goes here
                  <br />
                  <span className="text-slate-700">src/assets/hero-athlete.jpg</span>
                </p>
              </div>
            </div>
          </div>
        </main>

        <div
          className="hero-fade-in relative z-10 border-t border-forest-800 px-6 md:px-12 py-6"
          style={{ '--hero-delay': 6 }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
            {BOTTOM_FEATURES.map(({ icon: Icon, title, subtitle }) => (
              <div key={title} className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full border border-forest-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-coral-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-heading font-semibold leading-tight">{title}</p>
                  <p className="text-xs text-slate-500 leading-tight">{subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section id="features" className="px-6 md:px-12 py-20 border-t border-forest-800">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="uppercase tracking-[0.2em] text-coral-400 text-xs font-semibold">Everything in one coach</p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl mt-2">Features</h2>
        </div>
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
          {FEATURE_ITEMS.map((item) => (
            <div key={item.name}>
              <h3 className="font-heading font-bold text-lg">{item.name}</h3>
              <p className="text-sm text-slate-400 mt-1.5">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="px-6 md:px-12 py-20 border-t border-forest-800">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="uppercase tracking-[0.2em] text-coral-400 text-xs font-semibold">The loop</p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl mt-2">How it works</h2>
        </div>
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {HOW_IT_WORKS_STEPS.map((s) => (
            <div key={s.step}>
              <p className="font-heading font-extrabold text-3xl text-coral-400">{s.step}</p>
              <h3 className="font-heading font-bold text-base mt-2">{s.title}</h3>
              <p className="text-sm text-slate-400 mt-1.5">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="science" className="px-6 md:px-12 py-20 border-t border-forest-800">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="uppercase tracking-[0.2em] text-coral-400 text-xs font-semibold">Grounded in physiology</p>
          <h2 className="font-heading font-bold text-2xl md:text-3xl mt-2">Science</h2>
        </div>
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h3 className="font-heading font-bold text-lg">Fitness-fatigue modeling</h3>
            <p className="text-sm text-slate-400 mt-1.5">
              A real Banister impulse-response model tracks training load against recovery over time -
              projecting fitness, fatigue, and form from your actual session history, not a guess.
            </p>
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg">Real energy-expenditure estimates</h3>
            <p className="text-sm text-slate-400 mt-1.5">
              Calories burned are computed from a standard MET formula against your own bodyweight and
              session intensity - never a fabricated number, and left blank rather than guessed when your
              weight isn't on file.
            </p>
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg">Trends, not vibes</h3>
            <p className="text-sm text-slate-400 mt-1.5">
              Volume and PR trends, weekly recaps, and nutrition audits are all computed directly from your
              logged data first, then narrated - the numbers come from you, not from the model.
            </p>
          </div>
        </div>
      </section>

      <footer className="px-6 md:px-12 py-10 border-t border-forest-800 text-center">
        <p className="text-sm text-slate-500">ALIGN - a coach that watches, listens, and adapts.</p>
      </footer>
    </div>
  )
}
