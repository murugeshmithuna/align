import json
import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.vision.pose_analysis import analyze_squat_video

router = APIRouter(prefix="/vision", tags=["vision"])

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB


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
