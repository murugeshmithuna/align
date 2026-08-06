"""One-off seed: 7 days of realistic meal history for a given user, so the
daily/weekly nutrition review and weekly digest features have real data to
synthesize instead of hitting their empty-state fallback. Run with
DATABASE_URL pointed at the target DB:

    DATABASE_URL=... python backend/scripts/seed_meal_history.py [user_email]
"""

import sys
from datetime import datetime, time, timedelta, timezone

sys.path.insert(0, __file__.rsplit("/backend/", 1)[0] + "/backend")

from app import models
from app.database import SessionLocal

DEFAULT_EMAIL = "persistence-check@test.com"

# (hour, description, calories, protein_g, carbs_g, fat_g, macro_summary, quick_tip, timing_note)
DAY_TEMPLATE = [
    (7, "Greek yogurt with granola and blueberries", 420, 28, 52, 11,
     "High protein, moderate carbs", "Add a scoop of flax for omega-3s", "Solid pre-workout breakfast"),
    (12, "Grilled chicken burrito bowl with rice and black beans", 680, 45, 78, 18,
     "Balanced macro split", "Watch the rice portion if cutting carbs", "Good midday refuel"),
    (19, "Salmon, roasted sweet potato, and steamed broccoli", 590, 38, 44, 24,
     "Protein and healthy fats on point", "Add a citrus squeeze for vitamin C", "Great recovery-focused dinner"),
]

# Small day-to-day variation so the week doesn't look robotic.
VARIATION = [0, -40, 30, -20, 50, -60, 20]


def seed(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).one_or_none()
        if user is None:
            raise SystemExit(f"No user found with email {email!r}")

        if user.daily_calorie_target is None:
            user.daily_calorie_target = 2400
            user.daily_protein_target = 160
            user.daily_carbs_target = 250
            user.daily_fat_target = 70
            user.daily_fiber_target = 30

        today = datetime.now(timezone.utc).date()
        created = 0
        for days_ago in range(6, -1, -1):
            day = today - timedelta(days=days_ago)
            day_start = datetime.combine(day, time.min, tzinfo=timezone.utc)
            calorie_shift = VARIATION[days_ago]

            for hour, description, calories, protein, carbs, fat, macro_summary, tip, timing in DAY_TEMPLATE:
                analyzed_at = day_start.replace(hour=hour, minute=15)
                meal = models.MealAnalysis(
                    user_id=user.id,
                    analyzed_at=analyzed_at,
                    description=description,
                    estimated_calories=calories + calorie_shift,
                    protein_g=protein,
                    carbs_g=carbs,
                    fat_g=fat,
                    macro_summary=macro_summary,
                    quick_tip=tip,
                    timing_note=timing,
                )
                db.add(meal)
                created += 1

        db.commit()
        print(f"Seeded {created} meal_analyses rows for {email} (user_id={user.id}) across the last 7 days.")
    finally:
        db.close()


if __name__ == "__main__":
    seed(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL)
