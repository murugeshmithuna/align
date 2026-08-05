import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { api } from '../api.js'
import { useSession } from '../context/SessionContext.jsx'

// Same model bundle used server-side for batch analysis
// (backend/app/vision/pose_analysis.py) - one model, two runtimes.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'

// Mirrors the thresholds and turning-point state machine in
// backend/app/vision/pose_analysis.py so live and batch rep-counting agree
// on what counts as a rep and how it's graded.
const STANDING_ANGLE_DEG = 160
const BOTTOM_ANGLE_DEG = 110
const GOOD_DEPTH_MAX_ANGLE = 100
const KNEE_TRACKING_MAX_OFFSET_PCT = 15
const BACK_ANGLE_MAX_DEG = 45

const LEFT_HIP = 23
const RIGHT_HIP = 24
const LEFT_KNEE = 25
const RIGHT_KNEE = 26
const LEFT_ANKLE = 27
const RIGHT_ANKLE = 28
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12

function angleDeg(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const dot = ba.x * bc.x + ba.y * bc.y
  const mag = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y)
  if (!mag) return 0
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI
}

function betterSide(landmarks, leftIdx, rightIdx) {
  return landmarks[leftIdx].visibility >= landmarks[rightIdx].visibility ? leftIdx : rightIdx
}

function frameMetrics(landmarks) {
  const hipIdx = betterSide(landmarks, LEFT_HIP, RIGHT_HIP)
  const kneeIdx = betterSide(landmarks, LEFT_KNEE, RIGHT_KNEE)
  const ankleIdx = betterSide(landmarks, LEFT_ANKLE, RIGHT_ANKLE)
  const shoulderIdx = betterSide(landmarks, LEFT_SHOULDER, RIGHT_SHOULDER)
  const hip = landmarks[hipIdx]
  const knee = landmarks[kneeIdx]
  const ankle = landmarks[ankleIdx]
  const shoulder = landmarks[shoulderIdx]

  if (Math.min(hip.visibility, knee.visibility, ankle.visibility, shoulder.visibility) < 0.5) return null

  const kneeAngle = angleDeg(hip, knee, ankle)

  const leftHip = landmarks[LEFT_HIP]
  const rightHip = landmarks[RIGHT_HIP]
  const hipWidth = Math.abs(leftHip.x - rightHip.x) || 1e-6
  const kneeAnkleOffsetPct = (Math.abs(knee.x - ankle.x) / hipWidth) * 100

  const trunk = { x: shoulder.x - hip.x, y: shoulder.y - hip.y }
  const trunkMag = Math.hypot(trunk.x, trunk.y) || 1e-6
  const dot = trunk.y * -1
  const backAngle = (Math.acos(Math.max(-1, Math.min(1, dot / trunkMag))) * 180) / Math.PI

  return { kneeAngle, kneeAnkleOffsetPct, backAngle }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.05
  window.speechSynthesis.speak(utterance)
}

function tabClass(active) {
  return `px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors ${
    active ? 'bg-coral-500' : 'bg-forest-900 text-slate-400 hover:text-slate-200'
  }`
}

export default function LiveSession() {
  const { userId } = useSession()
  const [tab, setTab] = useState('live')

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

      {tab === 'live' ? <LiveWebcamSession /> : <SquatVideoUpload userId={userId} />}
    </div>
  )
}

function LiveWebcamSession() {
  const videoRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const repStateRef = useRef({ state: 'standing', current: null, reachedBottom: false, prevAngle: null })

  const [status, setStatus] = useState('idle') // idle | loading | running | error
  const [error, setError] = useState('')
  const [repCount, setRepCount] = useState(0)
  const [cue, setCue] = useState('Start the session, then step into frame')

  function completeRep(rep) {
    setRepCount((n) => n + 1)
    const depthOk = rep.minKneeAngle <= GOOD_DEPTH_MAX_ANGLE
    const kneeOk = rep.kneeAnkleOffsetPct <= KNEE_TRACKING_MAX_OFFSET_PCT
    const backOk = rep.backAngle <= BACK_ANGLE_MAX_DEG

    if (!depthOk) {
      setCue('Go deeper next rep')
      speak('Go deeper')
    } else if (!kneeOk) {
      setCue('Push your knees out')
      speak('Knees out')
    } else if (!backOk) {
      setCue('Keep your chest up')
      speak('Chest up')
    } else {
      setCue('Good rep!')
      speak('Good rep')
    }
  }

  function processFrame(metrics) {
    if (!metrics) return
    const rs = repStateRef.current
    const angle = metrics.kneeAngle

    if (rs.state === 'standing') {
      if (angle < STANDING_ANGLE_DEG) {
        rs.state = 'descending'
        rs.current = { minKneeAngle: angle, ...metrics }
        rs.reachedBottom = angle <= BOTTOM_ANGLE_DEG
        setCue('Keep descending')
      }
    } else if (rs.state === 'descending') {
      if (angle < rs.current.minKneeAngle) rs.current = { minKneeAngle: angle, ...metrics }
      if (angle <= BOTTOM_ANGLE_DEG) rs.reachedBottom = true

      const turnedUpward = rs.reachedBottom && rs.prevAngle != null && angle > rs.prevAngle
      if (turnedUpward) {
        rs.state = 'ascending'
        setCue('Drive up!')
      } else if (angle >= STANDING_ANGLE_DEG) {
        completeRep(rs.current)
        rs.state = 'standing'
        rs.current = null
        rs.reachedBottom = false
      }
    } else if (rs.state === 'ascending' && angle >= STANDING_ANGLE_DEG) {
      completeRep(rs.current)
      rs.state = 'standing'
      rs.current = null
      rs.reachedBottom = false
    }

    rs.prevAngle = angle
  }

  function renderLoop() {
    const video = videoRef.current
    if (video && landmarkerRef.current && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      const result = landmarkerRef.current.detectForVideo(video, performance.now())
      if (result.landmarks && result.landmarks[0]) {
        processFrame(frameMetrics(result.landmarks[0]))
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

  async function start() {
    setStatus('loading')
    setError('')
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

      repStateRef.current = { state: 'standing', current: null, reachedBottom: false, prevAngle: null }
      lastVideoTimeRef.current = -1
      setRepCount(0)
      setCue('Stand tall, then squat when ready')
      setStatus('running')
      rafRef.current = requestAnimationFrame(renderLoop)
    } catch (err) {
      setError(err.message || 'Could not access the camera')
      setStatus('error')
    }
  }

  useEffect(() => stop, []) // release camera/model on unmount or tab switch

  return (
    <div className="card p-6">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" playsInline muted />
        {status === 'running' && (
          <>
            <div className="absolute top-4 left-4 bg-forest-950/80 rounded-xl px-4 py-2">
              <span className="text-4xl font-heading font-extrabold text-coral-400 tabular-nums">
                {repCount}
              </span>
              <span className="text-xs text-slate-400 ml-1">reps</span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <span className="inline-block bg-forest-950/80 rounded-xl px-4 py-2 text-sm font-heading font-semibold text-slate-100">
                {cue}
              </span>
            </div>
          </>
        )}
        {status !== 'running' && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
            {status === 'loading' ? 'Loading pose model…' : 'Camera off'}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-center gap-3">
        {status === 'running' ? (
          <button
            onClick={stop}
            className="px-5 py-2 rounded-lg bg-forest-800 hover:bg-forest-700 text-sm font-heading font-semibold"
          >
            Stop session
          </button>
        ) : (
          <button
            onClick={start}
            disabled={status === 'loading'}
            className="px-5 py-2 rounded-lg bg-coral-500 hover:bg-coral-600 disabled:opacity-50 text-sm font-heading font-semibold"
          >
            {status === 'loading' ? 'Starting…' : 'Start live session'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}
      <p className="text-xs text-slate-500 mt-3 text-center">
        Pose tracking runs entirely in your browser - video never leaves your device.
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
