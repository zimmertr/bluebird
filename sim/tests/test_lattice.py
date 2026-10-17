"""The shared geography: stable, injective names, ids that never collide."""

from __future__ import annotations

import pytest

from app import lattice


def test_names_are_injective_on_a_64_by_32_block():
    # A box on cell edges holds exactly its cells' peaks, since a peak never
    # leaves its own cell.
    south, west = 46.0, -122.1
    peaks = lattice.peaks_in_bbox(south, west, south + 64 * 0.02, west + 32 * 0.03)
    assert len(peaks) == 64 * 32
    assert len({p.name for p in peaks}) == len(peaks)


def test_a_place_is_the_same_from_any_box():
    big = {p.osm_id: p for p in lattice.peaks_in_bbox(46.0, -122.0, 47.0, -121.0)}
    small = lattice.peaks_in_bbox(46.3, -121.7, 46.5, -121.4)
    assert small and all(big[p.osm_id] == p for p in small)


def test_half_open_boxes_split_without_overlap():
    whole = lattice.peaks_in_bbox(46.0, -122.0, 46.5, -121.5)
    west = lattice.peaks_in_bbox(46.0, -122.0, 46.5, -121.75)
    east = lattice.peaks_in_bbox(46.0, -121.75, 46.5, -121.5)
    assert sorted(p.osm_id for p in west + east) == sorted(p.osm_id for p in whole)


def test_ids_never_collide_across_kinds():
    box = (46.0, -122.0, 47.0, -121.0)
    nodes = [p.osm_id for p in lattice.peaks_in_bbox(*box) + lattice.unnamed_peaks_in_bbox(*box)]
    nodes += [t.osm_id for t in lattice.trailheads_in_bbox(*box)]
    nodes += [c.osm_id for c in lattice.crags_in_bbox(*box)]
    nodes += [t.osm_id for t in lattice.towns_in_bbox(*box)]
    assert len(nodes) == len(set(nodes))
    ways = [lake.osm_id for lake in lattice.lakes_in_bbox(*box)]
    assert len(ways) == len(set(ways))


def test_named_summits_stand_900_to_3400_m():
    peaks = lattice.peaks_in_bbox(40.0, -125.0, 42.0, -121.0)
    assert all(900 <= p.elevation_m <= 3400 for p in peaks)
    assert all(p.name for p in peaks)
    assert all(p.name is None for p in lattice.unnamed_peaks_in_bbox(40.0, -125.0, 40.2, -124.8))


def test_every_kind_is_named_for_what_it_is():
    box = (46.0, -122.0, 47.0, -121.0)
    assert all(lake.name.endswith(" Lake") for lake in lattice.lakes_in_bbox(*box))
    assert all(t.name.endswith(" Trailhead") for t in lattice.trailheads_in_bbox(*box))
    assert all(c.name.endswith(" Wall") for c in lattice.crags_in_bbox(*box))
    assert {t.kind for t in lattice.towns_in_bbox(40.0, -125.0, 48.0, -115.0)} == {"town", "village"}


def test_the_nearest_peak_inside_the_radius():
    peak = lattice.peaks_in_bbox(46.3, -121.7, 46.5, -121.4)[0]
    assert lattice.nearest_peak(peak.lat + 0.0003, peak.lon, 150) == peak
    # Half a cell from any named peak there is still an unnamed one near, so
    # leave those out to see the miss.
    assert lattice.nearest_peak(peak.lat + 0.0003, peak.lon, 1, include_unnamed=False) is None


def test_point_in_ring():
    ring = [(46.0, -122.0), (46.0, -121.0), (47.0, -121.0), (47.0, -122.0), (46.0, -122.0)]
    assert lattice.point_in_ring(46.5, -121.5, ring)
    assert not lattice.point_in_ring(47.5, -121.5, ring)
    assert not lattice.point_in_ring(46.5, -120.5, ring)


@pytest.mark.parametrize("stride", [2, 4, 8])
def test_a_stride_thins_without_moving_anything(stride):
    full = {p.osm_id: p for p in lattice.peaks_in_bbox(46.0, -122.0, 47.0, -121.0)}
    thin = lattice.peaks_in_bbox(46.0, -122.0, 47.0, -121.0, stride=stride)
    assert thin and len(thin) < len(full) and all(full[p.osm_id] == p for p in thin)
