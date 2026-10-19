"""Shared setup for the fill's suite (#760).

The suite runs inside the fill image's test stage (`make test-fill`), where
fill.py and rules.py sit side by side in /app, the app's migrations in
/app/migrations and services/http.py in /app/testdata. From a checkout the
same files are found at their places in the repository.

The database tests need TEST_DATABASE_URL, a PostgreSQL with PostGIS that the
suite may create databases on (backend/tests/db/Dockerfile builds one), and
skip without it. Each test gets a database of its own, copied from a template
that has the app's migrations applied the way app/db/__init__.py applies them.
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
IMAGE_ROOT = HERE.parent
REPO_ROOT = HERE.parent.parent

if (IMAGE_ROOT / "rules.py").exists():
    sys.path.insert(0, str(IMAGE_ROOT))
    MIGRATIONS = IMAGE_ROOT / "migrations"
    HTTP_PY = IMAGE_ROOT / "testdata" / "http.py"
else:
    sys.path.insert(0, str(REPO_ROOT / "fill"))
    sys.path.insert(0, str(REPO_ROOT / "backend" / "app" / "services" / "osm"))
    MIGRATIONS = REPO_ROOT / "backend" / "app" / "db" / "migrations"
    HTTP_PY = REPO_ROOT / "backend" / "app" / "services" / "http.py"


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "db: needs TEST_DATABASE_URL")


def _connect(dsn: str):  # type: ignore[no-untyped-def]
    import psycopg2

    conn = psycopg2.connect(dsn, connect_timeout=5)
    conn.autocommit = True
    return conn


def dsn_for(url: str, dbname: str) -> str:
    from psycopg2.extensions import make_dsn

    return make_dsn(url, dbname=dbname)


@pytest.fixture(scope="session")
def admin_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    import psycopg2

    # The database container answers on TCP only once its init scripts finish.
    deadline = time.monotonic() + 90
    while True:
        try:
            _connect(url).close()
            return url
        except psycopg2.OperationalError:
            if time.monotonic() > deadline:
                raise
            time.sleep(1)


def apply_migrations(dsn: str) -> None:
    """The app's migrations, the way app/db/__init__.py `migrate` applies them."""
    conn = _connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
        for path in sorted(MIGRATIONS.glob("*.sql")):
            number = int(path.name.split("_", 1)[0])
            conn.autocommit = False
            with conn.cursor() as cur:
                cur.execute(path.read_text())
                cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (number,))
            conn.commit()
            conn.autocommit = True
    finally:
        conn.close()


@pytest.fixture(scope="session")
def template(admin_url: str) -> Iterator[str]:
    name = f"fill_template_{os.getpid()}"
    admin = _connect(admin_url)
    with admin.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {name}")
        cur.execute(f"CREATE DATABASE {name}")
        cur.execute(
            "DO $$ BEGIN CREATE ROLE fill_reader NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$"
        )
    apply_migrations(dsn_for(admin_url, name))
    yield name
    with admin.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
    admin.close()


def _fresh(admin_url: str, template: str | None) -> Iterator[str]:
    name = f"fill_test_{uuid.uuid4().hex[:10]}"
    admin = _connect(admin_url)
    with admin.cursor() as cur:
        cur.execute(f"CREATE DATABASE {name}" + (f" TEMPLATE {template}" if template else ""))
    try:
        yield dsn_for(admin_url, name)
    finally:
        with admin.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
        admin.close()


@pytest.fixture
def database(admin_url: str, template: str) -> Iterator[str]:
    """A DSN for a database of this test's own, with the app's schema in it."""
    yield from _fresh(admin_url, template)


@pytest.fixture
def bare_database(admin_url: str) -> Iterator[str]:
    """A DSN for an empty database: one no app pod has migrated yet."""
    yield from _fresh(admin_url, None)
