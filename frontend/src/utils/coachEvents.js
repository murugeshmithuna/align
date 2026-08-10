// A tiny global event so pages showing plan/log data (Dashboard, PlanDetail,
// WorkoutLog, Calendar, Progress) can refetch after the AI Coach makes a
// real change - AIMessageBar is a single floating component mounted once in
// AppLayout, completely separate from whichever page happens to be open
// underneath it, so without this, a confirmed "Added X to your plan" reply
// left every other already-mounted page showing stale data until the user
// manually reloaded (confirmed live: the backend write succeeds immediately,
// but nothing tells the currently-open page to look again).
export const COACH_DATA_CHANGED_EVENT = 'align:coach-data-changed'

// Only tools that actually write to the database are worth a refetch -
// read-only tools (ask_schedule, analyze_form, ask_nutrition,
// suggest_supplements) never change anything a page would need to re-fetch.
const MUTATING_TOOLS = new Set([
  'generate_workout_plan',
  'adjust_plan',
  'log_workout',
  'update_log',
  'delete_log',
])

export function notifyIfMutating(toolName) {
  if (MUTATING_TOOLS.has(toolName)) {
    window.dispatchEvent(new CustomEvent(COACH_DATA_CHANGED_EVENT, { detail: { tool: toolName } }))
  }
}

// A page wires this up with its own existing fetch function:
//   useEffect(() => {
//     window.addEventListener(COACH_DATA_CHANGED_EVENT, refetch)
//     return () => window.removeEventListener(COACH_DATA_CHANGED_EVENT, refetch)
//   }, [refetch])
// Kept as a plain event (not a custom hook) so each page's own refetch
// function - already written for its mount-time useEffect - is reused
// as-is, rather than introducing a second, divergent fetch path.
