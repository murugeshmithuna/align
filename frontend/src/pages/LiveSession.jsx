import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DrawingUtils, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { jsPDF } from 'jspdf'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

// Same model bundle used server-side for batch analysis
// (backend/app/vision/pose_analysis.py) - one model, two runtimes.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'

// BlazePose 33-point landmark indices (verified against the official
// MediaPipe Pose Landmarker guide - same indices used server-side in
// pose_analysis.py).
const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
}

// Required-keypoint confidence gate: below this, don't trust the angle
// enough to count reps or process form at all (raised from an earlier 0.5 -
// camera repositioning or a laptop nudge tends to produce low-confidence
// landmark jitter rather than a clean drop to near-zero, so a loose
// threshold let those frames through as if they were reliable).
const MIN_LANDMARK_VISIBILITY = 0.75

// Camera-shift guard: if a large fraction of ALL landmarks (not just the
// exercise's own joints) move more than this normalized distance between
// consecutive frames, that's the whole frame shifting - i.e. the camera
// moved - not the person. A real rep only displaces the joints actually
// involved in the movement; a nudged laptop/camera displaces everything at
// once, including landmarks (ears, opposite-side shoulder, etc.) that have
// no reason to move during, say, a bicep curl.
const CAMERA_SHIFT_DISTANCE = 0.04
const CAMERA_SHIFT_FRACTION = 0.8

// Minimum time the joint angle must stay at/past the flexed threshold
// before the rep is allowed to count - filters out a brief, jittery dip
// below the threshold (a camera flicker, a partial/incomplete rep) that
// crosses the angle boundary for a single frame without a real controlled
// rep happening.
const PEAK_DWELL_MS = 400

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x))
}

function landmarkDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Returns the fraction of landmarks that moved more than CAMERA_SHIFT_DISTANCE
// since the previous frame - a high fraction means the whole frame shifted.
function computeShiftFraction(landmarks, prevLandmarks) {
  if (!prevLandmarks) return 0
  let shifted = 0
  for (let i = 0; i < landmarks.length; i++) {
    if (landmarkDistance(landmarks[i], prevLandmarks[i]) > CAMERA_SHIFT_DISTANCE) shifted++
  }
  return shifted / landmarks.length
}

function angleDeg(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const dot = ba.x * bc.x + ba.y * bc.y
  const mag = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y)
  if (!mag) return 0
  return (Math.acos(clamp(dot / mag, -1, 1)) * 180) / Math.PI
}

function avgVisibility(landmarks, indices) {
  return indices.reduce((sum, i) => sum + landmarks[i].visibility, 0) / indices.length
}

// Every supported exercise reduces to the same shape: a 3-point angle that
// starts extended (large angle, "UP"), decreases to a flexed "DOWN" position,
// then returns to extended - one rep. Only the joint triplet and thresholds
// change between squats/curls/pushups, so one state machine drives all three.
const EXERCISE_CONFIGS = {
  squat: {
    label: 'Squat',
    left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
    right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    // checkForm also reads the shoulder (back angle) - gate its confidence too,
    // not just the hip/knee/ankle triplet used for the rep-counting angle.
    extraVisibility: { left: [LM.LEFT_SHOULDER], right: [LM.RIGHT_SHOULDER] },
    extendedAngle: 160,
    flexedAngle: 110,
    goodRepMaxAngle: 100, // depth: min angle reached must be at/below this
    downCue: 'Keep descending',
    upCue: 'Drive up!',
    checkForm(landmarks, side) {
      const hip = landmarks[side === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP]
      const knee = landmarks[side === 'left' ? LM.LEFT_KNEE : LM.RIGHT_KNEE]
      const ankle = landmarks[side === 'left' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE]
      const shoulder = landmarks[side === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER]
      const leftHip = landmarks[LM.LEFT_HIP]
      const rightHip = landmarks[LM.RIGHT_HIP]
      const hipWidth = Math.abs(leftHip.x - rightHip.x) || 1e-6
      const kneeOffsetPct = (Math.abs(knee.x - ankle.x) / hipWidth) * 100
      const trunk = { x: shoulder.x - hip.x, y: shoulder.y - hip.y }
      const trunkMag = Math.hypot(trunk.x, trunk.y) || 1e-6
      const backAngle = (Math.acos(clamp((trunk.y * -1) / trunkMag, -1, 1)) * 180) / Math.PI
      if (kneeOffsetPct > 15) return { ok: false, cue: 'Push your knees out' }
      if (backAngle > 45) return { ok: false, cue: 'Keep your chest up' }
      return { ok: true, cue: null }
    },
    repFormCue(rep) {
      return rep.minAngle <= this.goodRepMaxAngle ? null : 'Go lower next rep'
    },
  },
  bicep_curl: {
    label: 'Bicep Curl',
    left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
    right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    // checkForm also reads the hip (torso reference for elbow drift).
    extraVisibility: { left: [LM.LEFT_HIP], right: [LM.RIGHT_HIP] },
    extendedAngle: 155,
    flexedAngle: 55,
    goodRepMaxAngle: 70,
    downCue: 'Curl it up',
    upCue: 'Lower with control',
    checkForm(landmarks, side) {
      const shoulder = landmarks[side === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER]
      const elbow = landmarks[side === 'left' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW]
      const hip = landmarks[side === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP]
      const torsoHeight = Math.abs(shoulder.y - hip.y) || 1e-6
      const elbowDriftPct = (Math.abs(elbow.x - shoulder.x) / torsoHeight) * 100
      if (elbowDriftPct > 25) return { ok: false, cue: 'Keep your elbow pinned to your side' }
      return { ok: true, cue: null }
    },
    repFormCue(rep) {
      return rep.minAngle <= this.goodRepMaxAngle ? null : 'Squeeze harder at the top'
    },
  },
  pushup: {
    label: 'Push-up',
    left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
    right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    // checkForm also reads the hip + ankle (hip-sag alignment check).
    extraVisibility: { left: [LM.LEFT_HIP, LM.LEFT_ANKLE], right: [LM.RIGHT_HIP, LM.RIGHT_ANKLE] },
    extendedAngle: 160,
    flexedAngle: 90,
    goodRepMaxAngle: 100,
    downCue: 'Lower your chest',
    upCue: 'Push up!',
    checkForm(landmarks, side) {
      const shoulder = landmarks[side === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER]
      const hip = landmarks[side === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP]
      const ankle = landmarks[side === 'left' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE]
      const hipAngle = angleDeg(shoulder, hip, ankle)
      if (hipAngle < 160) return { ok: false, cue: "Don't let your hips sag" }
      return { ok: true, cue: null }
    },
    repFormCue(rep) {
      return rep.minAngle <= this.goodRepMaxAngle ? null : 'Go lower next rep'
    },
  },
}

// Free-text plan exercise names ("Back Squat", "Dumbbell Bicep Curl", ...)
// are matched to a supported config by keyword rather than exact match.
function matchExerciseConfig(name) {
  const lower = name.toLowerCase()
  if (lower.includes('squat')) return 'squat'
  if (lower.includes('curl')) return 'bicep_curl'
  if (lower.includes('push')) return 'pushup'
  return null
}

// sessionStorage key for a paused session's draft - scoped per user (shared
// devices) and cleared when the tab/browser closes, unlike localStorage,
// which matches "I stepped away for a bit" better than "resume this forever."
const DRAFT_VERSION = 1
function draftKey(userId) {
  return `live_session_draft_v${DRAFT_VERSION}_${userId}`
}

function frameAngleAndSide(landmarks, config) {
  const side = avgVisibility(landmarks, config.left) >= avgVisibility(landmarks, config.right) ? 'left' : 'right'
  const triplet = side === 'left' ? config.left : config.right
  const extra = (side === 'left' ? config.extraVisibility?.left : config.extraVisibility?.right) || []
  const requiredIndices = [...triplet, ...extra]

  const minVisibility = Math.min(...requiredIndices.map((i) => landmarks[i].visibility))
  if (minVisibility < MIN_LANDMARK_VISIBILITY) return null

  const [aIdx, bIdx, cIdx] = triplet
  const angle = angleDeg(landmarks[aIdx], landmarks[bIdx], landmarks[cIdx])
  return { angle, side }
}

// Rep counts almost never exceed this in a single set; falls back to the
// numeral otherwise (speechSynthesis pronounces numerals correctly anyway).
const NUMBER_WORDS = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen', 'Twenty',
]
function repNumberWord(n) {
  return NUMBER_WORDS[n] || String(n)
}

function SpeakerOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18 5.5a9 9 0 0 1 0 13"
      />
    </svg>
  )
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m16 9 5 6m0-6-5 6" />
    </svg>
  )
}

function tabClass(active) {
  return `px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors ${
    active ? 'bg-coral-500' : 'bg-forest-900 text-slate-400 hover:text-slate-200'
  }`
}

// Text-based PDF via jsPDF's own drawing primitives rather than html2canvas -
// this content is fundamentally tabular/textual (a title, a date, a short
// exercise list, a few numbers), so rendering it as real vector text keeps
// the file small and the text selectable/searchable, instead of rasterizing
// a DOM snapshot into an oversized embedded image.
function buildWorkoutPdf({ exercises, formAccuracyPct, durationLabel, aiNote }) {
  const doc = new jsPDF()
  // Print-safe olive-lime (see Progress.jsx's identical PDF color note) -
  // the on-screen neon lime is unreadable on a white PDF page.
  const CORAL = [122, 176, 24]
  const SLATE = [100, 116, 139]
  const INK = [15, 23, 42]
  const marginX = 20
  let y = 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...CORAL)
  doc.text('AI Fitness Agent', marginX, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text('Workout Summary', marginX, y)
  y += 6

  doc.setFontSize(10)
  doc.setTextColor(...SLATE)
  doc.text(new Date().toLocaleDateString(undefined, { dateStyle: 'long' }), marginX, y)
  y += 4
  doc.setDrawColor(...SLATE)
  doc.line(marginX, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text('Completed Exercises', marginX, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  let totalVolume = 0
  if (exercises.length === 0) {
    doc.setTextColor(...SLATE)
    doc.text('No exercises completed this session.', marginX, y)
    y += 7
  } else {
    for (const ex of exercises) {
      const weightLabel = ex.weight ? `@ ${ex.weight}` : '(bodyweight)'
      doc.setTextColor(...INK)
      doc.text(`${ex.name} - ${ex.sets} x ${ex.reps} ${weightLabel}`, marginX, y)
      y += 6
      totalVolume += ex.sets * ex.reps * (ex.weight || 0)
    }
    y += 4
  }

  doc.setDrawColor(...SLATE)
  doc.line(marginX, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text('Key Performance Metrics', marginX, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const metrics = [
    ['Total Volume', `${totalVolume.toLocaleString()}`],
    ['Form Accuracy Score', formAccuracyPct == null ? 'n/a' : `${formAccuracyPct}%`],
    ['Workout Duration', durationLabel],
  ]
  for (const [label, value] of metrics) {
    doc.setTextColor(...SLATE)
    doc.text(label, marginX, y)
    doc.setTextColor(...INK)
    doc.text(value, marginX + 60, y)
    y += 7
  }
  y += 5

  doc.setDrawColor(...SLATE)
  doc.line(marginX, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text("AI Coach's Notes", marginX, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  const noteLines = doc.splitTextToSize(aiNote || 'No notes generated for this session.', 170)
  doc.text(noteLines, marginX, y)

  doc.save(`workout-summary-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// Builds the exercise queue for the session: from the plan exercises passed
// via router state if launched from a plan's "Start today's session", or a
// single manually-picked exercise otherwise. Plan exercises whose name
// doesn't match a supported pose-tracked exercise are skipped (noted, not
// silently dropped) rather than blocking the whole session.
function buildQueueFromPlan(planExercises) {
  const queue = []
  const skipped = []
  for (const pe of planExercises) {
    const configKey = matchExerciseConfig(pe.exercise.name)
    if (!configKey) {
      skipped.push(pe.exercise.name)
      continue
    }
    queue.push({
      planExerciseId: pe.id,
      exerciseId: pe.exercise_id,
      name: pe.exercise.name,
      configKey,
      targetSets: pe.sets || 3,
      targetReps: pe.reps || 10,
      targetWeight: pe.target_weight ?? null,
      restSeconds: pe.rest_seconds || 60,
    })
  }
  return { queue, skipped }
}

export default function LiveSession() {
  const { userId } = useSession()
  const location = useLocation()
  const [tab, setTab] = useState('live')

  const planExercises = location.state?.planExercises || null
  const planId = location.state?.planId || null

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-body space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl">Live Session</h1>
        <p className="text-sm text-slate-400 mt-1">
          Live webcam rep counting with spoken cues, or upload a squat video for a detailed form check.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('live')} className={tabClass(tab === 'live')}>
          Live webcam
        </button>
        <button onClick={() => setTab('upload')} className={tabClass(tab === 'upload')}>
          Upload video
        </button>
      </div>

      {tab === 'live' ? (
        <LiveWebcamSession userId={userId} planExercises={planExercises} planId={planId} />
      ) : (
        <SquatVideoUpload userId={userId} />
      )}
    </div>
  )
}

function LiveWebcamSession({ userId, planExercises, planId }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const drawingUtilsRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const repStateRef = useRef({
    state: 'START_POSITION',
    current: null,
    reachedFlexed: false,
    peakReachedAt: null,
    prevAngle: null,
  })
  const formOkRef = useRef(true)
  const prevLandmarksRef = useRef(null)
  const cameraShiftingRef = useRef(false)
  const voiceEnabledRef = useRef(true)
  // Session metrics for the PDF export - counted every processed frame /
  // completed exercise, not recomputed after the fact.
  const sessionStartedAtRef = useRef(null)
  const formFrameCountsRef = useRef({ ok: 0, total: 0 })
  const completedExercisesRef = useRef([])
  // Per-exercise rep-by-rep depth/form pass-fail, keyed by exercise label
  // ("Squat", "Bicep Curl", "Push-up") - fed from the exact same
  // repFormCue()/checkForm() results already driving the live voice cues,
  // just kept around instead of discarded so a real session-over-session
  // trend can be computed server-side once the workout finishes.
  const repFormLogRef = useRef({})
  // Guards against double-logging/double-submitting the same session's data
  // if both the natural full-completion path and a later manual stop/unmount
  // somehow both try to finalize (e.g. the user stops right as the last rep
  // also finished the workout).
  const sessionFinalizedRef = useRef(false)

  // `renderLoop` recurses via requestAnimationFrame(renderLoop) using the
  // closure captured when `start()` first scheduled it - it never picks up a
  // later render's state. Everything the loop's logic needs to read or
  // mutate lives here instead, so it's always current regardless of which
  // render's closure is executing; the mirrored useState values below exist
  // purely to drive the HUD.
  const sessionRef = useRef({ queueIndex: 0, currentSet: 1, repCount: 0, restUntil: null, manualExercise: 'squat' })

  const { queue, skipped } = useMemo(() => {
    if (planExercises && planExercises.length > 0) return buildQueueFromPlan(planExercises)
    return { queue: [], skipped: [] }
  }, [planExercises])
  const usingPlan = queue.length > 0

  const [manualExercise, setManualExerciseState] = useState('squat')
  const [queueIndex, setQueueIndexState] = useState(0)
  const [currentSet, setCurrentSetState] = useState(1)
  const [repCount, setRepCountState] = useState(0)
  const [restRemaining, setRestRemaining] = useState(0)
  const [resting, setResting] = useState(false)
  const [complete, setComplete] = useState(false)

  const [status, setStatus] = useState('idle') // idle | loading | running | error
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('START')
  const [cue, setCue] = useState('Start the session, then step into frame')
  const [formOk, setFormOk] = useState(true)
  const [cameraShifting, setCameraShifting] = useState(false)
  const [voiceEnabled, setVoiceEnabledState] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportError, setExportError] = useState('')
  // null = not yet requested/still loading, [] = requested but nothing to
  // show (no tracked reps), array = one entry per exercise.
  const [formFeedback, setFormFeedback] = useState(null)
  // A session paused by navigating away (see saveDraft/pausedDraftRef below)
  // and not yet resumed or discarded.
  const [paused, setPaused] = useState(false)
  const pausedDraftRef = useRef(null)

  function toggleVoice() {
    const next = !voiceEnabledRef.current
    voiceEnabledRef.current = next
    setVoiceEnabledState(next)
    if (!next) window.speechSynthesis?.cancel()
  }

  // Skips (doesn't interrupt) a new cue if one is already speaking, rather
  // than cancelling the in-progress utterance - avoids cutting off "go
  // lower" mid-word to say a rep number a moment later.
  function speak(text) {
    if (!voiceEnabledRef.current || !('speechSynthesis' in window)) return
    if (window.speechSynthesis.speaking) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  }

  async function handleExportPdf() {
    setExportingPdf(true)
    setExportError('')
    try {
      const exercises = completedExercisesRef.current
      const counts = formFrameCountsRef.current
      const formAccuracyPct = counts.total > 0 ? Math.round((counts.ok / counts.total) * 100) : null
      const elapsedSeconds = sessionStartedAtRef.current
        ? Math.round((Date.now() - sessionStartedAtRef.current) / 1000)
        : 0
      const minutes = Math.floor(elapsedSeconds / 60)
      const seconds = elapsedSeconds % 60
      const durationLabel = `${minutes}m ${seconds}s`

      let aiNote = ''
      if (userId && exercises.length > 0) {
        const summary = exercises
          .map((ex) => `${ex.name}: ${ex.sets}x${ex.reps}${ex.weight ? ` @ ${ex.weight}` : ''}`)
          .join('; ')
        try {
          const { reply } = await api.chat({
            user_id: userId,
            message: `I just finished a live-tracked workout: ${summary}. Form accuracy was ${formAccuracyPct ?? 'n/a'}%. Write a short (1-2 sentence) encouraging end-of-workout note for my PDF summary - no questions, no follow-up offer, just the note.`,
          })
          aiNote = reply
        } catch {
          aiNote = ''
        }
      }

      buildWorkoutPdf({ exercises, formAccuracyPct, durationLabel, aiNote })
    } catch (err) {
      setExportError(err.message || 'Could not generate the PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  function setManualExercise(value) {
    sessionRef.current.manualExercise = value
    setManualExerciseState(value)
  }

  function getCurrentItem() {
    return usingPlan ? queue[sessionRef.current.queueIndex] : null
  }
  function getCurrentConfig() {
    const item = getCurrentItem()
    return EXERCISE_CONFIGS[item ? item.configKey : sessionRef.current.manualExercise]
  }
  function getTargetReps() {
    const item = getCurrentItem()
    return item ? item.targetReps : 10
  }
  function getTargetSets() {
    const item = getCurrentItem()
    return item ? item.targetSets : 3
  }

  const config = getCurrentConfig()
  const targetReps = getTargetReps()
  const targetSets = getTargetSets()

  function resetRepState() {
    repStateRef.current = {
      state: 'START_POSITION',
      current: null,
      reachedFlexed: false,
      peakReachedAt: null,
      prevAngle: null,
    }
    setPhase('START')
  }

  async function logCompletedExercise(item) {
    completedExercisesRef.current.push({
      name: item.name,
      sets: item.targetSets,
      reps: item.targetReps,
      weight: item.targetWeight,
    })
    if (!userId) return
    try {
      await api.createLog({
        user_id: userId,
        exercise_id: item.exerciseId,
        plan_id: planId,
        sets: item.targetSets,
        reps: item.targetReps,
        weight: item.targetWeight,
      })
    } catch {
      // Logging failure shouldn't interrupt the live session itself.
    }
  }

  // Fire-and-forget from handleSetComplete() below - the completion overlay
  // renders whatever's in `formFeedback` once it resolves, but a slow/failed
  // request shouldn't block or interrupt the "Workout complete!" screen.
  async function submitFormFeedback() {
    const entries = Object.entries(repFormLogRef.current).filter(([, reps]) => reps.length > 0)
    if (!userId || entries.length === 0) {
      setFormFeedback([])
      return
    }
    const results = []
    for (const [exerciseName, reps] of entries) {
      try {
        const feedback = await api.submitLiveSessionForm({ user_id: userId, exercise_name: exerciseName, reps })
        results.push({ exerciseName, ...feedback })
      } catch {
        // Best-effort - one exercise's feedback failing shouldn't drop the rest.
      }
    }
    setFormFeedback(results)
  }

  // Saved when navigating away mid-session (see the unmount effect below) so
  // it can be offered back as a "Session paused" prompt on return, instead
  // of either losing the progress or force-finalizing a session the user
  // might still want to continue. sessionStorage (not localStorage) - scoped
  // to this tab/browser session, matching "I stepped away for a bit" rather
  // than "remember this forever."
  function saveDraft() {
    const s = sessionRef.current
    const draft = {
      version: DRAFT_VERSION,
      usingPlan,
      planId: planId ?? null,
      manualExercise: s.manualExercise,
      queueIndex: s.queueIndex,
      currentSet: s.currentSet,
      repCount: s.repCount,
      sessionStartedAt: sessionStartedAtRef.current,
      formFrameCounts: formFrameCountsRef.current,
      completedExercises: completedExercisesRef.current,
      repFormLog: repFormLogRef.current,
      pausedAt: Date.now(),
    }
    try {
      sessionStorage.setItem(draftKey(userId), JSON.stringify(draft))
    } catch {
      // Private-browsing/storage-full edge cases just mean no resume prompt
      // next time, not a crash.
    }
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey(userId))
    } catch {
      // ignore
    }
  }

  // "Discard" on the paused-session prompt - the user explicitly doesn't
  // want to continue, but whatever they already did still counts: logs the
  // partial set and submits form feedback quietly (no completion screen,
  // since they chose not to see one) rather than throwing it away.
  async function discardDraft() {
    const draft = pausedDraftRef.current
    pausedDraftRef.current = null
    setPaused(false)
    clearDraft()
    if (!draft) return

    if (draft.usingPlan && draft.repCount > 0) {
      const item = queue[draft.queueIndex]
      if (item) {
        try {
          await api.createLog({
            user_id: userId,
            exercise_id: item.exerciseId,
            plan_id: planId,
            sets: 1,
            reps: draft.repCount,
            weight: item.targetWeight,
          })
        } catch {
          // best effort
        }
      }
    }

    const entries = Object.entries(draft.repFormLog || {}).filter(([, reps]) => reps.length > 0)
    for (const [exerciseName, reps] of entries) {
      try {
        await api.submitLiveSessionForm({ user_id: userId, exercise_name: exerciseName, reps })
      } catch {
        // best effort
      }
    }
  }

  // "Stop session" - the user explicitly ending the workout (as opposed to
  // navigating away mid-session, which pauses instead - see the unmount
  // effect below). Previously this path (and the old unmount handler it was
  // shared with) never logged the current in-progress set or submitted form
  // feedback at all, and manual/no-plan mode had no other way to ever reach
  // either one - a manual practice session just cycled sets/rest forever
  // until the camera was torn down with nothing saved.
  async function finalizeSession() {
    if (sessionFinalizedRef.current) {
      stop()
      return
    }
    sessionFinalizedRef.current = true
    clearDraft()

    const s = sessionRef.current
    const item = getCurrentItem()

    // Plan mode only - manual mode has no exercise_id to log a set against.
    if (usingPlan && item && s.repCount > 0) {
      try {
        await api.createLog({
          user_id: userId,
          exercise_id: item.exerciseId,
          plan_id: planId,
          sets: 1,
          reps: s.repCount,
          weight: item.targetWeight,
        })
      } catch {
        // Logging failure shouldn't block showing whatever feedback we can.
      }
    }

    const hasTrackedReps = Object.values(repFormLogRef.current).some((reps) => reps.length > 0)
    if (completedExercisesRef.current.length > 0 || hasTrackedReps || s.repCount > 0) {
      setComplete(true)
      await submitFormFeedback()
    }

    stop()
  }

  async function handleSetComplete() {
    const item = getCurrentItem()
    const s = sessionRef.current

    if (usingPlan && s.currentSet >= item.targetSets) {
      await logCompletedExercise(item)
      if (s.queueIndex + 1 < queue.length) {
        const nextName = queue[s.queueIndex + 1].name
        speak(`${item.name} complete. Next up: ${nextName}`)
        setCue(`Nice work on ${item.name}! Next: ${nextName}`)
        s.queueIndex += 1
        s.currentSet = 1
        s.repCount = 0
        setQueueIndexState(s.queueIndex)
        setCurrentSetState(1)
        setRepCountState(0)
        resetRepState()
      } else {
        speak('Workout complete! Great job.')
        sessionFinalizedRef.current = true
        clearDraft()
        setComplete(true)
        stop()
        submitFormFeedback()
      }
      return
    }

    // Rest between sets (not after the final set of an exercise, which is
    // handled above by advancing/finishing instead).
    const rest = usingPlan ? item.restSeconds : 45
    s.currentSet += 1
    s.repCount = 0
    setCurrentSetState(s.currentSet)
    setRepCountState(0)
    resetRepState()
    s.restUntil = Date.now() + rest * 1000
    setResting(true)
    speak('Set complete! Great job.')
  }

  function completeRep(rep) {
    const s = sessionRef.current
    s.repCount += 1
    const repNumber = s.repCount
    setRepCountState(repNumber)

    // Form-correction cues take priority over the rep count - only one
    // utterance plays per rep. handleSetComplete() (called first, below)
    // takes priority over both when this rep also finishes the set, since
    // speak() skips rather than interrupts once something is already
    // speaking - "Set complete!" naturally wins over "Ten" on the last rep.
    if (repNumber >= getTargetReps()) {
      handleSetComplete()
    }

    const activeConfig = getCurrentConfig()
    const formCue = activeConfig.repFormCue(rep)
    if (formCue) {
      setCue(formCue)
      speak(formCue)
    } else {
      setCue(`Rep ${repNumber}`)
      speak(repNumberWord(repNumber))
    }

    // Same depth (repFormCue) / form (checkForm, via rep.badForm - see
    // processFrame) results already computed above, kept per-rep instead of
    // discarded so submitFormFeedback() has real data once the session ends.
    const log = repFormLogRef.current[activeConfig.label] || (repFormLogRef.current[activeConfig.label] = [])
    log.push({ rep_index: log.length, min_angle: rep.minAngle, depth_ok: !formCue, form_ok: !rep.badForm })
  }

  // START_POSITION -> IN_MOTION -> PEAK_DEPTH -> RETURN_POSITION -> (rep
  // counts) -> START_POSITION. PEAK_DEPTH requires PEAK_DWELL_MS of real
  // wall-clock time before it's allowed to advance to RETURN_POSITION - a
  // brief, jittery dip below the flexed threshold (camera flicker, an
  // incomplete rep) that recovers before the dwell is satisfied gets
  // rejected as noise (back to START_POSITION, no rep counted) rather than
  // registering.
  function processFrame(landmarks) {
    const activeConfig = getCurrentConfig()
    const result = frameAngleAndSide(landmarks, activeConfig)
    if (!result) return
    const { angle, side } = result

    const formCheck = activeConfig.checkForm(landmarks, side)
    formOkRef.current = formCheck.ok
    setFormOk(formCheck.ok)
    formFrameCountsRef.current.total += 1
    if (formCheck.ok) formFrameCountsRef.current.ok += 1

    const rs = repStateRef.current

    if (rs.state === 'START_POSITION') {
      if (angle < activeConfig.extendedAngle) {
        rs.state = 'IN_MOTION'
        rs.current = { minAngle: angle }
        rs.reachedFlexed = false
        setPhase('MOTION')
        setCue(formCheck.cue || activeConfig.downCue)
      }
    } else if (rs.state === 'IN_MOTION') {
      if (angle < rs.current.minAngle) rs.current = { minAngle: angle }
      if (angle <= activeConfig.flexedAngle) {
        rs.state = 'PEAK_DEPTH'
        rs.reachedFlexed = true
        rs.peakReachedAt = Date.now()
        setPhase('PEAK')
      } else if (angle >= activeConfig.extendedAngle) {
        // Came back up without ever reaching depth - shallow, doesn't count.
        rs.state = 'START_POSITION'
        rs.current = null
        setPhase('START')
      } else if (formCheck.cue) {
        setCue(formCheck.cue)
      }
    } else if (rs.state === 'PEAK_DEPTH') {
      if (angle < rs.current.minAngle) rs.current = { minAngle: angle }

      const dwellSatisfied = Date.now() - rs.peakReachedAt >= PEAK_DWELL_MS
      const turnedUpward = rs.prevAngle != null && angle > rs.prevAngle

      if (turnedUpward && dwellSatisfied) {
        rs.state = 'RETURN_POSITION'
        setPhase('RETURN')
        setCue(formCheck.cue || activeConfig.upCue)
      } else if (angle >= activeConfig.extendedAngle) {
        // Shot back up before satisfying the minimum dwell at depth - reject
        // as a false positive rather than count a rep.
        rs.state = 'START_POSITION'
        rs.current = null
        setPhase('START')
        setCue('Hold the bottom position a bit longer')
      } else if (formCheck.cue) {
        setCue(formCheck.cue)
      }
    } else if (rs.state === 'RETURN_POSITION') {
      if (angle >= activeConfig.extendedAngle) {
        completeRep(rs.current)
        rs.state = 'START_POSITION'
        rs.current = null
        rs.reachedFlexed = false
        setPhase('START')
      } else if (formCheck.cue) {
        setCue(formCheck.cue)
      }
    }

    // Flags the in-progress rep (if any) as having a form issue somewhere
    // during its motion - checked after the state machine above so a rep
    // freshly started this same frame (rs.current just created) is covered
    // too, not just rep already in progress before this frame.
    if (rs.current && !formCheck.ok) rs.current.badForm = true

    rs.prevAngle = angle
  }

  function drawSkeleton(landmarks) {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || !drawingUtilsRef.current) return
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Amber while the camera itself is shifting takes priority over the
    // form-correctness color - it's a different, more urgent signal ("hold
    // still", not "fix your form").
    const color = cameraShiftingRef.current ? '#fbbf24' : formOkRef.current ? '#34d399' : '#f87171'
    drawingUtilsRef.current.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color,
      lineWidth: 3,
    })
    drawingUtilsRef.current.drawLandmarks(landmarks, { color, fillColor: color, radius: 4 })
  }

  function renderLoop() {
    const video = videoRef.current
    if (video && landmarkerRef.current && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      const result = landmarkerRef.current.detectForVideo(video, performance.now())
      if (result.landmarks && result.landmarks[0]) {
        const landmarks = result.landmarks[0]
        const shiftFraction = computeShiftFraction(landmarks, prevLandmarksRef.current)
        prevLandmarksRef.current = landmarks
        const isShifting = shiftFraction > CAMERA_SHIFT_FRACTION
        cameraShiftingRef.current = isShifting
        setCameraShifting(isShifting)

        drawSkeleton(landmarks)
        const s = sessionRef.current
        if (s.restUntil && Date.now() >= s.restUntil) {
          s.restUntil = null
          setResting(false)
        }
        if (isShifting) {
          setCue('Camera shifting, please hold still')
        } else if (!s.restUntil) {
          processFrame(landmarks)
        }
      }
    }
    rafRef.current = requestAnimationFrame(renderLoop)
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    landmarkerRef.current?.close()
    landmarkerRef.current = null
    window.speechSynthesis?.cancel()
    setStatus('idle')
  }

  // `resumeDraft` (from a paused session's saveDraft(), see below) restores
  // progress instead of zeroing it out - everything else (camera/model
  // acquisition) is identical either way, since a stream+landmarker never
  // actually survives the earlier unmount that created the draft.
  async function start(resumeDraft = null) {
    setStatus('loading')
    setError('')
    setComplete(false)
    // `paused` stays true (showing the paused prompt, now mid-"Resuming…")
    // until the camera/model actually finish loading below - clearing it
    // immediately would flash a generic "Camera off" state if acquisition
    // fails, and the draft would look like it vanished even though it's
    // still safely in sessionStorage untouched.
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      })

      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      drawingUtilsRef.current = new DrawingUtils(canvasRef.current.getContext('2d'))
      resetRepState()
      lastVideoTimeRef.current = -1
      prevLandmarksRef.current = null
      cameraShiftingRef.current = false
      setCameraShifting(false)
      sessionFinalizedRef.current = false
      setFormFeedback(null)

      if (resumeDraft) {
        sessionStartedAtRef.current = resumeDraft.sessionStartedAt
        formFrameCountsRef.current = resumeDraft.formFrameCounts
        completedExercisesRef.current = resumeDraft.completedExercises
        repFormLogRef.current = resumeDraft.repFormLog
        sessionRef.current.manualExercise = resumeDraft.manualExercise
        setManualExerciseState(resumeDraft.manualExercise)
        sessionRef.current.queueIndex = resumeDraft.queueIndex
        sessionRef.current.currentSet = resumeDraft.currentSet
        sessionRef.current.repCount = resumeDraft.repCount
        setQueueIndexState(resumeDraft.queueIndex)
        setCurrentSetState(resumeDraft.currentSet)
        setRepCountState(resumeDraft.repCount)
        setCue('Welcome back - resume when ready')
        setPaused(false)
        pausedDraftRef.current = null
        clearDraft()
      } else {
        sessionStartedAtRef.current = Date.now()
        formFrameCountsRef.current = { ok: 0, total: 0 }
        completedExercisesRef.current = []
        repFormLogRef.current = {}
        sessionRef.current.queueIndex = 0
        sessionRef.current.currentSet = 1
        sessionRef.current.repCount = 0
        setQueueIndexState(0)
        setCurrentSetState(1)
        setRepCountState(0)
        setCue('Stand tall / get set, then begin when ready')
      }
      sessionRef.current.restUntil = null
      setResting(false)
      setPhase('START')
      setStatus('running')
      rafRef.current = requestAnimationFrame(renderLoop)
    } catch (err) {
      setError(err.message || 'Could not access the camera')
      setStatus('error')
    }
  }

  // Navigating away mid-session pauses (saves a resumable draft) rather than
  // discarding or force-finalizing it - streamRef.current is only set while
  // a session is actively running (refs, unlike the `status` state, are
  // always current here even in a []-effect's closure), and
  // sessionFinalizedRef guards the case where the session already ended on
  // its own (or via "Stop session") right before unmounting, which has
  // nothing left to pause.
  useEffect(() => {
    return () => {
      if (streamRef.current && !sessionFinalizedRef.current) {
        saveDraft()
      }
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Checks for a paused draft left by an earlier mount of this same page
  // (see saveDraft/the unmount effect above) - only offered back if it
  // matches the current context (same plan, or manual mode either way) and
  // actually has something in it worth resuming.
  useEffect(() => {
    if (!userId) return
    try {
      const raw = sessionStorage.getItem(draftKey(userId))
      if (!raw) return
      const draft = JSON.parse(raw)
      const contextMatches = usingPlan ? draft.usingPlan && draft.planId === planId : !draft.usingPlan
      const hasSomethingToResume =
        draft.repCount > 0 ||
        (draft.completedExercises || []).length > 0 ||
        Object.values(draft.repFormLog || {}).some((reps) => reps.length > 0)
      if (contextMatches && hasSomethingToResume) {
        pausedDraftRef.current = draft
        setPaused(true)
      } else {
        sessionStorage.removeItem(draftKey(userId))
      }
    } catch {
      try {
        sessionStorage.removeItem(draftKey(userId))
      } catch {
        // ignore
      }
    }
    // Only ever needs to run once on mount, against whatever was saved
    // before this instance existed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rest-countdown ticker, purely for the HUD display.
  useEffect(() => {
    if (!resting) return undefined
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((sessionRef.current.restUntil - Date.now()) / 1000))
      setRestRemaining(remaining)
    }, 250)
    return () => clearInterval(interval)
  }, [resting])

  return (
    <div className="card p-6 space-y-4">
      {usingPlan && (
        <div className="flex flex-wrap gap-2">
          {queue.map((item, i) => (
            <button
              key={item.planExerciseId}
              onClick={() => {
                sessionRef.current.queueIndex = i
                sessionRef.current.currentSet = 1
                sessionRef.current.repCount = 0
                sessionRef.current.restUntil = null
                setQueueIndexState(i)
                setCurrentSetState(1)
                setRepCountState(0)
                setResting(false)
                resetRepState()
              }}
              disabled={status === 'running'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                i === queueIndex ? 'bg-coral-500' : 'bg-forest-900 text-slate-400'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {!usingPlan && status !== 'running' && !paused && (
        <div>
          <label className="block text-xs text-slate-500 mb-1" htmlFor="manual-exercise">
            Exercise
          </label>
          <select
            id="manual-exercise"
            value={manualExercise}
            onChange={(e) => setManualExercise(e.target.value)}
            className="px-3 py-2 rounded-lg bg-forest-950 border border-forest-700 text-sm"
          >
            {Object.entries(EXERCISE_CONFIGS).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="text-xs text-slate-500">
          Not pose-trackable yet, skipped: {skipped.join(', ')}
        </p>
      )}

      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover -scale-x-100" />
        {status === 'running' && !complete && (
          <>
            <div className="absolute top-4 left-4 bg-forest-950/80 rounded-xl px-4 py-2">
              <span className="text-4xl font-heading font-extrabold text-coral-400 tabular-nums">
                {repCount}
              </span>
              <span className="text-xs text-slate-400 ml-1">/ {targetReps} reps</span>
              <p className="text-xs text-slate-400 mt-0.5">
                Set {currentSet}/{targetSets} · {config.label}
              </p>
            </div>
            <div className="absolute top-4 right-4 bg-forest-950/80 rounded-xl px-3 py-2 text-xs font-heading font-bold">
              <span className={cameraShifting ? 'text-amber-400' : formOk ? 'text-emerald-400' : 'text-red-400'}>
                {cameraShifting ? 'HOLD STILL' : phase}
              </span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <span
                className={`inline-block bg-forest-950/80 rounded-xl px-4 py-2 text-sm font-heading font-semibold ${
                  cameraShifting ? 'text-amber-400' : formOk ? 'text-slate-100' : 'text-red-400'
                }`}
              >
                {cameraShifting ? 'Camera shifting, please hold still' : resting ? `Resting… ${restRemaining}s` : cue}
              </span>
            </div>
          </>
        )}
        {complete && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-forest-950/90 text-center px-6 py-8 overflow-y-auto">
            <span className="text-3xl">🎉</span>
            <p className="font-heading font-bold text-lg">Workout complete!</p>
            <p className="text-sm text-slate-400">Nice work - logged to your history.</p>

            {formFeedback === null ? (
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-forest-700 border-t-coral-500 rounded-full animate-spin" />
                Checking your form…
              </p>
            ) : formFeedback.length === 0 ? (
              <p className="text-xs text-slate-500 max-w-xs">
                No completed reps to grade this session - a rep only counts once you go all the way down and
                back up. Stay fully in frame and finish the full range of motion to get form feedback.
              </p>
            ) : (
              <div className="w-full max-w-sm space-y-2 text-left">
                {formFeedback.map((f) => (
                    <div
                      key={f.exerciseName}
                      className="rounded-lg border border-forest-700 bg-forest-900/70 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-heading font-semibold">{f.exerciseName}</p>
                        <div className="flex gap-2 text-[11px] font-semibold shrink-0">
                          <span className="text-emerald-400">{f.good_depth_pct}% depth</span>
                          <span className="text-sky-400">{f.good_form_pct}% form</span>
                        </div>
                      </div>
                      {f.focus_areas.length > 0 && (
                        <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
                          {f.focus_areas.map((area, i) => (
                            <li key={i}>{area}</li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-slate-400">📈 {f.trend}</p>
                      <p className="text-xs text-coral-300">🧭 {f.overall_insight}</p>
                    </div>
                  ))}
                </div>
            )}

            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="mt-2 px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
            >
              {exportingPdf ? 'Generating PDF…' : 'Export as PDF'}
            </button>
            {exportError && <p className="text-xs text-red-400">{exportError}</p>}
          </div>
        )}
        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-forest-950/90 text-center px-6">
            <span className="text-3xl">⏸️</span>
            <p className="font-heading font-bold text-lg">Session paused</p>
            <p className="text-sm text-slate-400">
              {pausedDraftRef.current &&
                (pausedDraftRef.current.usingPlan
                  ? queue[pausedDraftRef.current.queueIndex]?.name
                  : EXERCISE_CONFIGS[pausedDraftRef.current.manualExercise]?.label) + ' - '}
              Set {pausedDraftRef.current?.currentSet}, {pausedDraftRef.current?.repCount} rep
              {pausedDraftRef.current?.repCount === 1 ? '' : 's'} so far
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => start(pausedDraftRef.current)}
                disabled={status === 'loading'}
                className="px-4 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
              >
                {status === 'loading' ? 'Resuming…' : 'Resume session'}
              </button>
              <button
                onClick={discardDraft}
                disabled={status === 'loading'}
                className="px-4 py-2 rounded-lg border border-forest-700 hover:border-red-400 disabled:opacity-50 text-sm font-heading font-semibold text-slate-300 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}
        {status !== 'running' && !complete && !paused && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
            {status === 'loading' ? 'Loading pose model…' : 'Camera off'}
          </div>
        )}
      </div>

      {!paused && (
        <div className="flex justify-center items-center gap-3">
          {status === 'running' ? (
            <button
              onClick={finalizeSession}
              className="px-5 py-2 rounded-lg bg-forest-800 hover:bg-forest-700 text-sm font-heading font-semibold"
            >
              Stop session
            </button>
          ) : (
            <button
              onClick={() => start()}
              disabled={status === 'loading'}
              className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
            >
              {status === 'loading' ? 'Starting…' : complete ? 'Start again' : 'Start live session'}
            </button>
          )}
          <button
            onClick={toggleVoice}
            aria-label={voiceEnabled ? 'Mute voice cues' : 'Unmute voice cues'}
            className="w-9 h-9 rounded-lg border border-forest-700 hover:border-coral-400 flex items-center justify-center text-slate-300 transition-colors"
          >
            {voiceEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400 mt-1 text-center">{error}</p>}
      <p className="text-xs text-slate-500 text-center">
        Pose tracking runs entirely in your browser - video never leaves your device.
        {!usingPlan && ' Launch from a plan’s "Start today’s session" to auto-log completed sets.'}
      </p>
    </div>
  )
}

function SquatVideoUpload({ userId }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await api.analyzeSquat(userId, file)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-heading font-semibold mb-1">Squat form check</h2>
      <p className="text-xs text-slate-500 mb-4">
        Upload a video of a squat set, filmed from the side or a slight angle with your full body in
        frame. Pose detection runs on the server and grades depth, knee tracking, and back angle per rep.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="flex-1 text-sm text-slate-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-forest-800 file:text-slate-200 file:text-sm"
        />
        <button
          type="submit"
          disabled={!file || loading}
          className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold whitespace-nowrap"
        >
          {loading ? 'Analyzing…' : 'Analyze video'}
        </button>
      </form>
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

      {result && (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-coral-400">{result.rep_count}</span> rep
            {result.rep_count === 1 ? '' : 's'} detected
            {result.video_duration_s ? ` over ${result.video_duration_s}s` : ''}. Ask the chat "how was my
            squat form?" for a full critique.
          </p>
          {result.rep_count === 0 ? (
            <p className="text-sm text-slate-500">
              No complete reps detected - try a side-on angle with your full body in frame and good
              lighting.
            </p>
          ) : (
            <table className="w-full text-xs text-slate-400">
              <thead>
                <tr className="text-left border-b border-forest-700">
                  <th className="py-1">Rep</th>
                  <th className="py-1">Depth</th>
                  <th className="py-1">Knee tracking</th>
                  <th className="py-1">Back angle</th>
                </tr>
              </thead>
              <tbody>
                {result.reps.map((r) => (
                  <tr key={r.rep_index} className="border-b border-forest-800">
                    <td className="py-1">{r.rep_index}</td>
                    <td className="py-1">
                      {r.depth_ok ? '✅' : '⚠️'} {r.min_knee_angle}°
                    </td>
                    <td className="py-1">
                      {r.knee_tracking_ok ? '✅' : '⚠️'} {r.knee_ankle_offset_pct}%
                    </td>
                    <td className="py-1">
                      {r.back_angle_ok ? '✅' : '⚠️'} {r.back_angle_deg}°
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
