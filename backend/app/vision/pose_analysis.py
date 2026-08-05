"""Batch squat-form analysis via MediaPipe Pose Landmarker.

Pure computation over a video file - no LLM call here. Returns numeric facts
(rep count, per-rep knee depth / knee-tracking offset / back angle, plus a
deterministic pass/fail flag per metric) for the API response and for the
`analyze_form` agent tool (`app/agent/tools.py`) to compose a conversational
critique from, mirroring how `fatigue.py` feeds `assess_injury_risk()` and
how logs feed the orchestrator's other RAG-lite tools.

Landmark indices are the standard 33-point BlazePose topology used by every
MediaPipe Pose Landmarker model bundle (verified against the official
Pose Landmarker guide, developers.google.com/edge/mediapipe/solutions/vision/
pose_landmarker): 11/12 shoulders, 23/24 hips, 25/26 knees, 27/28 ankles.
"""

from __future__ import annotations

import math
import os

import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision as mp_vision

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "pose_landmarker_lite.task")

LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28

# Knee-angle hysteresis band that drives the rep-counting state machine: a
# squat "starts" once the knee bends past STANDING_ANGLE_DEG and only
# "completes" once it locks back out past the same threshold, so noisy
# frame-to-frame jitter around one angle can't double-count a rep.
STANDING_ANGLE_DEG = 160.0
BOTTOM_ANGLE_DEG = 110.0  # roughly parallel-or-below squat depth
MIN_VISIBILITY = 0.5

# Feedback thresholds - defensible defaults, not tuned to a specific dataset.
GOOD_DEPTH_MAX_ANGLE = 100.0  # min knee angle at the bottom of the rep
KNEE_TRACKING_MAX_OFFSET_PCT = 15.0  # knee-to-ankle horizontal offset, % of hip width
BACK_ANGLE_MAX_DEG = 45.0  # trunk lean from vertical


def _angle_deg(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    """Angle at vertex b formed by rays b->a and b->c, in degrees."""
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    dot = ba[0] * bc[0] + ba[1] * bc[1]
    mag = math.hypot(*ba) * math.hypot(*bc)
    if mag == 0:
        return 0.0
    cos_angle = max(-1.0, min(1.0, dot / mag))
    return math.degrees(math.acos(cos_angle))


def _better_side(landmarks, idx_left: int, idx_right: int) -> int:
    """Picks whichever side's landmark is more visible in this frame."""
    left, right = landmarks[idx_left], landmarks[idx_right]
    return idx_left if left.visibility >= right.visibility else idx_right


def _frame_metrics(landmarks) -> dict | None:
    hip_idx = _better_side(landmarks, LEFT_HIP, RIGHT_HIP)
    knee_idx = _better_side(landmarks, LEFT_KNEE, RIGHT_KNEE)
    ankle_idx = _better_side(landmarks, LEFT_ANKLE, RIGHT_ANKLE)
    shoulder_idx = _better_side(landmarks, LEFT_SHOULDER, RIGHT_SHOULDER)

    hip, knee, ankle, shoulder = landmarks[hip_idx], landmarks[knee_idx], landmarks[ankle_idx], landmarks[shoulder_idx]
    if min(hip.visibility, knee.visibility, ankle.visibility, shoulder.visibility) < MIN_VISIBILITY:
        return None

    knee_angle = _angle_deg((hip.x, hip.y), (knee.x, knee.y), (ankle.x, ankle.y))

    left_hip, right_hip = landmarks[LEFT_HIP], landmarks[RIGHT_HIP]
    hip_width = abs(left_hip.x - right_hip.x) or 1e-6
    knee_ankle_offset_pct = abs(knee.x - ankle.x) / hip_width * 100

    # Trunk lean from vertical: 0 deg = upright, larger = more forward lean.
    trunk_vec = (shoulder.x - hip.x, shoulder.y - hip.y)
    vertical_vec = (0.0, -1.0)
    dot = trunk_vec[0] * vertical_vec[0] + trunk_vec[1] * vertical_vec[1]
    mag = math.hypot(*trunk_vec) or 1e-6
    back_angle = math.degrees(math.acos(max(-1.0, min(1.0, dot / mag))))

    return {"knee_angle": knee_angle, "knee_ankle_offset_pct": knee_ankle_offset_pct, "back_angle": back_angle}


def segment_reps(frame_metrics_sequence: list[dict | None]) -> list[dict]:
    """Pure state machine over a per-frame metrics sequence (each item is
    `_frame_metrics()`'s output, or None for a frame with no usable
    landmarks) -> one dict per completed rep. Split out from video I/O so the
    rep-counting logic itself is unit-testable without a model or a video file.

    Depth tracking continues past the BOTTOM_ANGLE_DEG threshold until the
    angle actually turns and starts increasing again (a real local minimum) -
    stopping the moment the threshold is first crossed would record the
    crossing angle rather than the true bottom of the squat, since real
    descents keep going for several more frames after crossing it. A squat
    that comes back up without ever reaching that threshold still counts as
    a (shallow) rep attempt - `depth_ok` downstream is what flags it.
    """
    reps: list[dict] = []
    state = "standing"
    current_rep: dict | None = None
    reached_bottom_threshold = False
    prev_angle: float | None = None

    for metrics in frame_metrics_sequence:
        if metrics is None:
            continue
        angle = metrics["knee_angle"]

        if state == "standing":
            if angle < STANDING_ANGLE_DEG:
                state = "descending"
                current_rep = {"min_knee_angle": angle, **metrics}
                reached_bottom_threshold = angle <= BOTTOM_ANGLE_DEG
        elif state == "descending":
            if angle < current_rep["min_knee_angle"]:
                current_rep = {"min_knee_angle": angle, **metrics}
            if angle <= BOTTOM_ANGLE_DEG:
                reached_bottom_threshold = True

            turned_upward = reached_bottom_threshold and prev_angle is not None and angle > prev_angle
            if turned_upward:
                state = "ascending"
            elif angle >= STANDING_ANGLE_DEG:
                # Came back up without ever reaching bottom depth.
                reps.append(current_rep)
                current_rep = None
                state = "standing"
                reached_bottom_threshold = False
        elif state == "ascending" and angle >= STANDING_ANGLE_DEG:
            reps.append(current_rep)
            current_rep = None
            state = "standing"
            reached_bottom_threshold = False

        prev_angle = angle

    return reps


def _rep_result(rep: dict, index: int) -> dict:
    return {
        "rep_index": index + 1,
        "min_knee_angle": round(rep["min_knee_angle"], 1),
        "knee_ankle_offset_pct": round(rep["knee_ankle_offset_pct"], 1),
        "back_angle_deg": round(rep["back_angle"], 1),
        "depth_ok": rep["min_knee_angle"] <= GOOD_DEPTH_MAX_ANGLE,
        "knee_tracking_ok": rep["knee_ankle_offset_pct"] <= KNEE_TRACKING_MAX_OFFSET_PCT,
        "back_angle_ok": rep["back_angle"] <= BACK_ANGLE_MAX_DEG,
    }


def analyze_squat_video(video_path: str) -> dict:
    """Runs pose detection over every frame of the video and segments it into
    reps via a knee-angle state machine. Returns pure numeric facts - no
    natural-language feedback - plus a deterministic flag per metric per rep."""
    base_options = mp.tasks.BaseOptions(model_asset_path=_MODEL_PATH)
    options = mp_vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
    )

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = 0
    frame_metrics_sequence: list[dict | None] = []

    with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            timestamp_ms = int(frame_count * (1000.0 / fps))
            frame_count += 1

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if not result.pose_landmarks:
                frame_metrics_sequence.append(None)
                continue
            frame_metrics_sequence.append(_frame_metrics(result.pose_landmarks[0]))

    cap.release()
    video_duration_s = round(frame_count / fps, 1) if fps else None

    reps = segment_reps(frame_metrics_sequence)
    rep_results = [_rep_result(rep, i) for i, rep in enumerate(reps)]

    return {
        "rep_count": len(rep_results),
        "video_duration_s": video_duration_s,
        "reps": rep_results,
    }
