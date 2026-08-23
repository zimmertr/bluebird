"""Forecast smoke: which run to ask for, and what a viewport gets back.

The decoder has its own tests. What is pinned here is everything around it,
and most of it is about being honest at an edge: a run that has not finished
publishing, a window past the model's reach, and a box outside the country.
Those three are the normal states of this layer, not its failures, and each one
has to be distinguishable from "clear air".
"""

from __future__ import annotations

import zlib
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from app.main import app
from app.services import hrrr_smoke
from app.services.errors import UpstreamError
from app.services.grib import LambertGrid
from fastapi.testclient import TestClient

# A small stand-in for the CONUS grid, with HRRR's real projection parameters so
# the maths is the maths that ships, over a 60 km square in the Cascades.
GRID = LambertGrid(
    nx=20,
    ny=20,
    la1=46.8,
    lo1=-121.9,
    lad=38.5,
    lov=262.5,
    dx_m=3000.0,
    dy_m=3000.0,
    latin1=38.5,
    latin2=38.5,
    scan_mode=64,
)

CYCLE = datetime(2026, 8, 22, 12, tzinfo=timezone.utc)


def _snapshot(hours: int = 3, fill: int = 2) -> hrrr_smoke.Snapshot:
    classes = np.full((GRID.ny, GRID.nx), fill, dtype=np.uint8)
    packed = zlib.compress(classes.tobytes(), 1)
    return hrrr_smoke.Snapshot(
        fetched_at_ms=1_755_000_000_000,
        cycle=CYCLE,
        grid=GRID,
        hours={
            int((CYCLE + timedelta(hours=h)).timestamp() * 1000): packed for h in range(hours)
        },
    )


# ── Which run to ask for ──────────────────────────────────────────────────────


def test_waits_for_a_cycle_to_finish_publishing():
    """The last hour of a run lands about two hours after cycle time, so a run
    that started 30 minutes ago has no 48-hour forecast to fetch yet."""
    now = datetime(2026, 8, 22, 12, 30, tzinfo=timezone.utc)
    assert hrrr_smoke.newest_ready_cycle(now) == datetime(
        2026, 8, 22, 6, tzinfo=timezone.utc
    )


def test_takes_a_cycle_once_it_has_had_time():
    now = datetime(2026, 8, 22, 14, 45, tzinfo=timezone.utc)
    assert hrrr_smoke.newest_ready_cycle(now) == CYCLE


def test_only_the_long_cycles_are_considered():
    """HRRR runs hourly, but the runs between 00/06/12/18Z stop at 18 hours.
    Playback follows a window that can be days long, so reach wins over being
    an hour fresher."""
    for hour in range(24):
        now = datetime(2026, 8, 22, hour, 59, tzinfo=timezone.utc)
        assert hrrr_smoke.newest_ready_cycle(now).hour in hrrr_smoke.LONG_CYCLE_HOURS


# ── The index beside each file ────────────────────────────────────────────────

_INDEX = (
    "75:50000000:d=2026082212:TMP:2 m above ground:6 hour fcst:\n"
    "76:51010359:d=2026082212:MASSDEN:8 m above ground:6 hour fcst:\n"
    "77:51964485:d=2026082212:COLMD:entire atmosphere:6 hour fcst:\n"
)


def test_finds_the_field_byte_range():
    assert hrrr_smoke.field_range(_INDEX) == (51010359, 51964485)


def test_a_field_at_the_end_of_the_file_has_no_end():
    """The index gives offsets, not lengths, so the last field reads to EOF.
    That is a None rather than an error."""
    truncated = "\n".join(_INDEX.splitlines()[:2])
    assert hrrr_smoke.field_range(truncated) == (51010359, None)


def test_a_missing_field_is_an_upstream_error():
    with pytest.raises(UpstreamError):
        hrrr_smoke.field_range("75:50000000:d=2026082212:TMP:2 m above ground:6 hour fcst:\n")


def test_the_level_is_matched_not_just_the_variable():
    """MASSDEN also appears at other levels in some products, and the near-
    surface one is the only field this layer means."""
    aloft = "76:51010359:d=2026082212:MASSDEN:entire atmosphere:6 hour fcst:\n"
    with pytest.raises(UpstreamError):
        hrrr_smoke.field_range(aloft)


# ── Density classes ───────────────────────────────────────────────────────────


def test_classifies_on_the_published_hms_thresholds():
    values = np.array([0.0, 0.5, 1.0, 9.9, 10.0, 20.9, 21.0, 900.0])
    assert hrrr_smoke.classify(values).tolist() == [0, 0, 1, 1, 2, 2, 3, 3]


def test_a_trace_value_is_not_smoke():
    """The model reports a non-zero concentration at every point on the map:
    the smallest measured in a real hour was 3.5e-10 ug/m3. Without a floor
    the whole country would draw as Light."""
    assert hrrr_smoke.classify(np.array([3.5e-10])).tolist() == [hrrr_smoke.CLASS_NONE]


# ── The lattice ───────────────────────────────────────────────────────────────


def test_lattice_is_never_finer_than_the_model():
    """A small box must not be sampled below 3 km. There is no more detail
    down there to find, only more cells."""
    lattice = hrrr_smoke.build_lattice(-121.6, 46.8, -121.5, 46.85)
    assert lattice.pitch_km >= hrrr_smoke.NATIVE_PITCH_KM
    assert lattice.cols * lattice.rows <= hrrr_smoke.MAX_CELLS


def test_a_large_box_coarsens_and_says_so():
    lattice = hrrr_smoke.build_lattice(-124.5, 42.0, -117.0, 49.0)
    assert lattice.cols * lattice.rows <= hrrr_smoke.MAX_CELLS
    assert lattice.pitch_km > hrrr_smoke.NATIVE_PITCH_KM


def test_coarsening_loops_rather_than_scaling_once():
    """Counts come out of ceil, so a lattice a few cells over the cap is not
    fixed by scaling the pitch by the ratio. Every box must land under the cap,
    not merely near it."""
    for width in (0.5, 1.0, 2.5, 5.0, 12.0, 40.0):
        lattice = hrrr_smoke.build_lattice(-121.0, 45.0, -121.0 + width, 45.0 + width)
        assert lattice.cols * lattice.rows <= hrrr_smoke.MAX_CELLS


def test_lattice_covers_exactly_the_requested_box():
    """The map draws this as an image stretched over the box, so the edges are
    the caller's rather than the model's."""
    lattice = hrrr_smoke.build_lattice(-121.9, 46.7, -121.5, 47.0)
    assert (lattice.west, lattice.south, lattice.east, lattice.north) == (
        -121.9,
        46.7,
        -121.5,
        47.0,
    )


# ── Projection and sampling ───────────────────────────────────────────────────


def test_the_first_grid_point_is_the_south_west_corner():
    """Scan mode 64 counts east and north from index zero. Getting this
    backwards would draw the country upside down."""
    col, row = hrrr_smoke.grid_indices(GRID, np.array([GRID.lo1]), np.array([GRID.la1]))
    assert (int(col[0]), int(row[0])) == (0, 0)


def test_north_and_east_increase_the_indices():
    col, row = hrrr_smoke.grid_indices(GRID, np.array([-121.5]), np.array([47.0]))
    assert col[0] > 0 and row[0] > 0


def test_cells_off_the_grid_are_not_clean_air():
    """A box the model does not cover has to stay distinguishable from a box
    it covers and finds nothing in."""
    snapshot = _snapshot()
    valid = next(iter(snapshot.hours))
    lattice = hrrr_smoke.build_lattice(-70.0, 42.0, -69.9, 42.1)
    cells = hrrr_smoke.sample(snapshot, lattice, valid)
    assert set(np.unique(cells).tolist()) == {hrrr_smoke.CLASS_OUTSIDE}


def test_cells_on_the_grid_carry_the_density():
    snapshot = _snapshot(fill=3)
    valid = next(iter(snapshot.hours))
    lattice = hrrr_smoke.build_lattice(-121.85, 46.82, -121.8, 46.86)
    cells = hrrr_smoke.sample(snapshot, lattice, valid)
    assert set(np.unique(cells).tolist()) == {3}


def test_sampled_shape_matches_the_lattice():
    snapshot = _snapshot()
    valid = next(iter(snapshot.hours))
    lattice = hrrr_smoke.build_lattice(-121.9, 46.7, -121.5, 47.0)
    assert hrrr_smoke.sample(snapshot, lattice, valid).shape == (lattice.rows, lattice.cols)


def test_hours_within_is_ordered_and_inclusive():
    snapshot = _snapshot(hours=5)
    times = sorted(snapshot.hours)
    assert hrrr_smoke.hours_within(snapshot, times[1], times[3]) == times[1:4]
    assert hrrr_smoke.hours_within(snapshot, times[-1] + 1, times[-1] + 10_000) == []


# ── The route ─────────────────────────────────────────────────────────────────


@pytest.fixture
def forecast_cache(monkeypatch):
    def install(fetch):
        cache = hrrr_smoke.smoke_forecast_cache(fetch=fetch)
        monkeypatch.setattr(hrrr_smoke, "FORECAST", cache)
        return cache

    return install


def _window(snapshot: hrrr_smoke.Snapshot) -> dict[str, str]:
    times = sorted(snapshot.hours)
    return {
        "start": datetime.fromtimestamp(times[0] / 1000, timezone.utc).isoformat(),
        "end": datetime.fromtimestamp(times[-1] / 1000, timezone.utc).isoformat(),
    }


def test_route_returns_a_lattice_per_hour(forecast_cache):
    snapshot = _snapshot(hours=3, fill=1)

    async def fetch():
        return snapshot

    forecast_cache(fetch)
    with TestClient(app) as client:
        response = client.get(
            "/api/smoke/forecast",
            params={"bbox": "-121.9,46.7,-121.5,47.0", **_window(snapshot)},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["cycle"] == "2026-08-22T12:00:00Z"
    assert len(body["hours"]) == 3
    for hour in body["hours"]:
        assert len(hour["cells"]) == body["cols"] * body["rows"]
    assert body["pitch_km"] >= hrrr_smoke.NATIVE_PITCH_KM


def test_route_reports_no_hours_past_the_models_reach(forecast_cache):
    """A window beyond the run is empty rather than an error. It is the normal
    answer for a trip next weekend."""
    snapshot = _snapshot(hours=3)

    async def fetch():
        return snapshot

    forecast_cache(fetch)
    far = CYCLE + timedelta(days=6)
    with TestClient(app) as client:
        response = client.get(
            "/api/smoke/forecast",
            params={
                "bbox": "-121.9,46.7,-121.5,47.0",
                "start": far.isoformat(),
                "end": (far + timedelta(hours=6)).isoformat(),
            },
        )
    assert response.status_code == 200
    assert response.json()["hours"] == []


def test_route_rejects_a_malformed_box(forecast_cache):
    async def fetch():
        return _snapshot()

    forecast_cache(fetch)
    with TestClient(app) as client:
        response = client.get(
            "/api/smoke/forecast",
            params={"bbox": "-121.9,46.7", "start": "2026-08-22T12:00:00Z", "end": "2026-08-22T13:00:00Z"},
        )
    assert response.status_code == 422


def test_route_rejects_a_backwards_window(forecast_cache):
    async def fetch():
        return _snapshot()

    forecast_cache(fetch)
    with TestClient(app) as client:
        response = client.get(
            "/api/smoke/forecast",
            params={
                "bbox": "-121.9,46.7,-121.5,47.0",
                "start": "2026-08-22T18:00:00Z",
                "end": "2026-08-22T12:00:00Z",
            },
        )
    assert response.status_code == 422


def test_route_is_unavailable_only_when_nothing_was_ever_fetched(forecast_cache):
    async def fetch():
        raise UpstreamError("Forecast smoke is unavailable. Try again later.")

    forecast_cache(fetch)
    with TestClient(app) as client:
        response = client.get(
            "/api/smoke/forecast",
            params={
                "bbox": "-121.9,46.7,-121.5,47.0",
                "start": "2026-08-22T12:00:00Z",
                "end": "2026-08-22T13:00:00Z",
            },
        )
    assert response.status_code == 503
    assert response.headers["Retry-After"]
    assert "Try again later." in response.json()["detail"]
