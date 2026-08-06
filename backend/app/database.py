from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_URL

DB_PATH = Path(__file__).resolve().parent.parent / "fitness_agent.db"

if DATABASE_URL:
    # Render (and most Heroku-style providers) hand out a `postgres://` URL,
    # but SQLAlchemy 2.0 + psycopg2 require the `postgresql://` scheme name -
    # rewrite defensively rather than assume whichever provider's convention.
    SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
else:
    # Local dev default - no DATABASE_URL means no Postgres configured, fall
    # back to a plain SQLite file exactly like before.
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
