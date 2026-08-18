from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_PATH

Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DATABASE_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_missing_columns():
    """`create_all` only ever creates missing *tables*, so a column added to
    an existing model would stay missing forever on an already-deployed DB
    (the `backend_db` volume outlives every rebuild). Adds any nullable
    column the models declare but the table doesn't have yet - a NOT NULL
    one is left alone deliberately, since that needs a real backfill
    decision rather than a silent ALTER."""
    with engine.begin() as conn:
        for table in Base.metadata.tables.values():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info('{table.name}')")}
            if not existing:
                continue
            for column in table.columns:
                if column.name in existing or not column.nullable:
                    continue
                type_sql = column.type.compile(engine.dialect)
                conn.exec_driver_sql(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {type_sql}')


def init_db():
    from . import models  # noqa: F401 - ensures models are registered before create_all

    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
