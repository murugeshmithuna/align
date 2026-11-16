"""First-run seed for the shared public demo account (see app/guest.py).

Only needed once, against whatever DB POST /auth/guest's first real hit
will use - every later reset is POST /auth/guest/reset, run on a schedule
(.github/workflows/reset-guest-demo.yml), which calls the exact same
reseed_guest_data() this script does. Run with DATABASE_URL pointed at the
target DB:

    DATABASE_URL=... python backend/scripts/seed_guest.py
"""

import sys

sys.path.insert(0, __file__.rsplit("/backend/", 1)[0] + "/backend")

from app.database import SessionLocal
from app.guest import reseed_guest_data

if __name__ == "__main__":
    db = SessionLocal()
    try:
        reseed_guest_data(db)
        print("Guest demo account seeded.")
    finally:
        db.close()
