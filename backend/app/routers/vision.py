import json
import os
import tempfile

from anthropic import BadRequestError
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.agent.meal_vision import analyze_meal_photo, analyze_meal_text, estimate_ingredient_macros
from app.agent.orchestrator import generate_live_session_form_feedback
from app.database import get_db
from app.vision.pose_analysis import analyze_squat_video

router = APIRouter(prefix="/vision", tags=["vision"])

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _sniff_image_media_type(data: bytes, declared: str) -> str:
    """Determines the image's real format from its magic bytes rather than
    trusting the browser-supplied Content-Type. Claude's vision API rejects a
    request outright if the declared media_type doesn't match the actual
    bytes (a strict 400, not a lenient best-effort decode) - and a browser's
    File/Blob `type` can be wrong for reasons outside this app's control
    (e.g. a canvas.toBlob() re-encode that silently produces different bytes
    than the type it was asked for, a known quirk on some browsers with
    HEIC-sourced source images). Falls back to the declared type only when
    the bytes don't match any known signature, so a real-but-unrecognized
    format still gets a chance rather than being rejected pre-emptively."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return declared


@router.post("/analyze-squat", response_model=schemas.FormAnalysisOut)
async def analyze_squat(
    user_id: int = Form(...),
    video: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    suffix = os.path.splitext(video.filename or "")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        size = 0
        while chunk := await video.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                os.unlink(tmp.name)
                raise HTTPException(status_code=413, detail="Video too large (max 100 MB)")
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        result = analyze_squat_video(tmp_path)
    except Exception as exc:  # pragma: no cover - defensive against corrupt uploads
        raise HTTPException(status_code=422, detail=f"Could not analyze video: {exc}") from exc
    finally:
        os.unlink(tmp_path)

    reps = result["reps"]
    analysis = models.FormAnalysis(
        user_id=user_id,
        exercise_name="Squat",
        rep_count=result["rep_count"],
        reps_with_good_depth=sum(1 for r in reps if r["depth_ok"]),
        reps_with_good_knee_tracking=sum(1 for r in reps if r["knee_tracking_ok"]),
        reps_with_good_back_angle=sum(1 for r in reps if r["back_angle_ok"]),
        raw_json=json.dumps(result),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return {
        "id": analysis.id,
        "analyzed_at": analysis.analyzed_at,
        "exercise_name": analysis.exercise_name,
        "rep_count": result["rep_count"],
        "video_duration_s": result["video_duration_s"],
        "reps": reps,
    }


@router.post("/analyze-meal", response_model=schemas.MealAnalysisPreviewOut)
async def analyze_meal(
    user_id: int = Form(...),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Analyzes only - does not save. The frontend shows this in a Review &
    Edit step; POST /vision/save-meal is what actually persists a record,
    with whatever the user corrected."""
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    image_bytes = await photo.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")

    media_type = _sniff_image_media_type(image_bytes, photo.content_type or "image/jpeg")
    if media_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported image type: {media_type}")

    try:
        return analyze_meal_photo(db, user_id, image_bytes, media_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except BadRequestError as exc:
        # Claude's vision API rejected the image outright (corrupt file,
        # unsupported color mode, etc.) - surface a clear, actionable message
        # instead of letting this propagate as an opaque 500.
        raise HTTPException(status_code=422, detail="Could not read this image - please try a different photo.") from exc


@router.post("/analyze-meal-text", response_model=schemas.MealAnalysisPreviewOut)
def analyze_meal_text_endpoint(payload: schemas.MealTextRequest, db: Session = Depends(get_db)):
    """Text-input twin of /analyze-meal for the Quick Log tab - same preview
    contract, no image involved. Also doesn't save."""
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Meal description can't be empty")

    try:
        return analyze_meal_text(db, payload.user_id, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/estimate-ingredient", response_model=schemas.IngredientEstimateOut)
def estimate_ingredient(payload: schemas.IngredientEstimateRequest):
    """Backs the Review & Edit modal's auto-recalculate-on-edit behavior -
    called on blur when the user changes an ingredient's name or quantity, so
    the row's (read-only) macro values and the total stay accurate without a
    manual 'Update Macros' step. No user_id - this is a stateless lookup, not
    tied to a saved meal."""
    if not payload.name.strip() or not payload.quantity.strip():
        raise HTTPException(status_code=400, detail="Ingredient name and quantity are required")
    try:
        return estimate_ingredient_macros(payload.name, payload.quantity)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/save-meal", response_model=schemas.MealAnalysisOut)
def save_meal(payload: schemas.MealSaveRequest, db: Session = Depends(get_db)):
    """Persists the final values from the Review & Edit step - whatever the
    user confirmed (edited or not), not necessarily what the model
    originally reported."""
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")

    analysis = models.MealAnalysis(
        user_id=payload.user_id,
        description=payload.description,
        estimated_calories=payload.estimated_calories,
        protein_g=payload.protein_g,
        carbs_g=payload.carbs_g,
        fat_g=payload.fat_g,
        macro_summary=payload.macro_summary,
        quick_tip=payload.quick_tip,
        timing_note=payload.timing_note,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.get("/meal-analyses/user/{user_id}", response_model=list[schemas.MealAnalysisOut])
def list_meal_analyses(user_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(models.MealAnalysis)
        .where(models.MealAnalysis.user_id == user_id)
        .order_by(models.MealAnalysis.analyzed_at.desc())
        .limit(20)
    )
    return db.scalars(stmt).all()


@router.post("/live-session-form", response_model=schemas.FormFeedbackOut)
def submit_live_session_form(payload: schemas.LiveSessionFormCreate, db: Session = Depends(get_db)):
    """Called once per exercise when a LiveSession.jsx session completes -
    persists the real per-rep depth/form pass-fail data the live pose
    tracking already computes (previously discarded after the session), then
    returns structured feedback comparing it against the user's most recent
    prior session on the same exercise."""
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not payload.reps:
        raise HTTPException(status_code=400, detail="No reps to evaluate")

    reps = [r.model_dump() for r in payload.reps]
    feedback = generate_live_session_form_feedback(db, payload.user_id, payload.exercise_name, reps)

    record = models.LiveSessionForm(
        user_id=payload.user_id,
        exercise_name=payload.exercise_name,
        rep_count=len(reps),
        reps_with_good_depth=sum(1 for r in reps if r["depth_ok"]),
        reps_with_good_form=sum(1 for r in reps if r["form_ok"]),
        raw_json=json.dumps(reps),
    )
    db.add(record)
    db.commit()

    return feedback


@router.get("/form-analyses/user/{user_id}", response_model=list[schemas.FormAnalysisOut])
def list_form_analyses(user_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(models.FormAnalysis)
        .where(models.FormAnalysis.user_id == user_id)
        .order_by(models.FormAnalysis.analyzed_at.desc())
        .limit(20)
    )
    analyses = db.scalars(stmt).all()
    out = []
    for a in analyses:
        raw = json.loads(a.raw_json)
        out.append(
            {
                "id": a.id,
                "analyzed_at": a.analyzed_at,
                "exercise_name": a.exercise_name,
                "rep_count": a.rep_count,
                "video_duration_s": raw.get("video_duration_s"),
                "reps": raw.get("reps", []),
            }
        )
    return out
