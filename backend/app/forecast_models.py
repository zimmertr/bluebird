"""The weather models a caller can pick, and what the picker says about each.

Apart from the request models because the table is editorial data that the
weather service and the capabilities route read on their own.
"""

from __future__ import annotations

from enum import Enum
from typing import NamedTuple


class ForecastModel(str, Enum):
    """The weather model Open-Meteo is asked for, as its own `models=` value.

    Declared best-first for this app's terrain (see `MODEL_INFO`), and that
    order is the contract: `/api/capabilities` publishes it as declared and the
    picker renders it as published.

    Four ids Open-Meteo serves are deliberately absent, each for its own
    reason (all probed 2026-08-01):

    - `best_match` is its blend, which picks per location and never reports its
      pick — the whole reason this enum exists.
    - `ecmwf_aifs025` returned an hourly array of nothing but nulls at three
      points on three continents.
    - `metno_seamless` and `knmi_seamless` are byte-identical to each other
      everywhere in North America (Rainier, Whitney and Denali, all three
      variables), so offering both offered one dataset twice — and the survivor
      matched no `ecmwf_*` or `gem_*` product either, while KNMI's own
      `knmi_harmonie_arome_europe` refuses coordinates outside Europe. Neither
      is offered: this list is ranked best-first, and a model whose North
      American provenance cannot be established has no defensible place in it.
    """

    gfs_seamless = "gfs_seamless"
    gem_seamless = "gem_seamless"
    ecmwf_ifs025 = "ecmwf_ifs025"
    gfs_hrrr = "gfs_hrrr"
    ukmo_seamless = "ukmo_seamless"
    icon_seamless = "icon_seamless"
    jma_seamless = "jma_seamless"
    meteofrance_seamless = "meteofrance_seamless"


# The seamless GFS, not raw HRRR and not ECMWF.
#
# Measured 2026-08-01 at Mount Rainier: `gfs_seamless` is byte-identical to
# `gfs_hrrr` for hours 0-45 and to `gfs_global` from hour 49, so it is HRRR's
# 3 km convection-allowing grid where HRRR exists and GFS's 16 days after it.
# That is strictly more useful here than either half alone, and unlike raw HRRR
# it has no coverage cliff: outside the HRRR grid it simply serves GFS, where
# `gfs_hrrr` would refuse the whole batch.
#
# It replaces the `best_match` blend Bluebird Forecast used to send, which chose per
# location and never said what it chose, so two adjacent peaks could be
# answered by two different models with nothing recording it. Naming one model
# is what makes a row reproducible and a shared link mean what it meant when it
# was shared. A link carrying no `model=` inherits this, which is a release
# note rather than a migration: `best_match` cannot be reproduced.
DEFAULT_FORECAST_MODEL = ForecastModel.gfs_seamless


class ModelInfo(NamedTuple):
    """One model as the picker and the calendar need it."""

    label: str
    forecast_hours: int
    # Why you would pick this one, for someone planning a trip rather than a
    # meteorologist. Two sentences: what it is best at, then what it blends in.
    #
    # The blend clause names only what is folded *into* the headline model, never
    # the headline model itself. Three of the labels here are named after one of
    # their own components — NOAA GFS is HRRR plus GFS, JMA GSM is MSM plus GSM,
    # Meteo-France ARPEGE is AROME plus ARPEGE — so listing every part makes the
    # sentence read as circular.
    #
    # It lives here rather than in the browser because the picker gets its whole
    # vocabulary from `/api/capabilities`: a model added to the enum would
    # otherwise appear with a blank line beside it.
    #
    # Grid figures are Open-Meteo's own, for the variant this app requests
    # (`*_seamless` blends a fine regional grid into a coarse global one, and
    # `ecmwf_ifs025` is the 0.25 deg open-data feed, not ECMWF's 9 km HRES).
    # Quoting the headline national model instead is the common mistake and it
    # inverts the ranking: GEM reads as a 15 km global model unless you count
    # the 2.5 km HRDPS that is the actual reason to pick it here.
    summary: str
    # The finest grid this model offers *anywhere*, in km, which for the
    # `*_seamless` blends is their regional component rather than their global
    # one. Where that grid actually lands is the summary's job, and it has to
    # be: 3 km describes NOAA GFS over North America and 13 km describes it
    # over Nepal, so the number alone would mislead half the world.
    finest_grid_km: float
    # HRRR is the only model here that is not global, and its domain is a
    # Lambert conformal grid no lat/lon box describes: Banff, Edmonton and
    # Monterrey answer, while Alaska, Hawaii, Puerto Rico, Newfoundland and
    # northern BC do not. Bluebird Forecast therefore ships no domain of its own and
    # lets Open-Meteo be the authority (see `analyze.py`); this flag exists so
    # the picker can say the model is regional before a request is spent.
    regional: bool = False
    # Serves a fine regional model for the first day or two and a coarse global
    # one after that, so one line on a chart changes model partway along and has
    # to say so.
    #
    # Published rather than derived from the `_seamless` suffix. The suffix is
    # Open-Meteo's naming habit rather than a contract: a blended product under
    # any other name would read as a single model everywhere the suffix is the
    # test, and a client has no other way to learn which is which.
    blend: bool = False


# How many hours ahead of *now* each model still has data for, as a floor, and
# the order the picker offers them in.
#
# THE ORDER IS EDITORIAL, not derived. It ranks these models for the terrain
# this app is built for — Pacific Northwest alpine — and dict order is the
# contract: `/api/capabilities` publishes as declared rather than sorting, so
# changing this list changes the picker. Reach is deliberately NOT the sort key;
# grid spacing over the Cascades matters more than a fourteenth day does.
#
# The ranking, and why, measured 2026-08-01 at Rainier/Baker/Whitney:
#
#   1 GFS       HRRR 3 km to h45, then GFS 25 km to 16 d. Best all-rounder and
#               the default: high resolution when it matters, reach when it
#               does not, and no coverage cliff.
#   2 GEM       HRDPS 2.5 km to h45, RDPS 10 km to h81, then GEM 15 km. FINER
#               than GFS short-range and far finer at days 2-3.5, which over the
#               North Cascades is the window that decides a trip. Second only
#               because it stops at ~9 days. At Whitney HRDPS drops out and it
#               starts at RDPS, so the edge is genuinely a northern one.
#   3 ECMWF     Best global medium-range skill by reputation. The right answer
#               for "which weekend", but ~25 km cannot see a valley.
#   4 HRRR      The best-understood mountain physics here, and largely redundant
#               now: GFS above already serves it for the first two days. Kept
#               for callers who need to know the number is purely HRRR.
#   5 UKMO      Finest global grid on the list (~10 km). Short reach for it.
#   6 ICON      ~13 km global; its European nests do not reach us. Earned its
#               place as the dissenter in issue #230 — it read 0.004 in where
#               ECMWF and GFS both read 0.000.
#   7 JMA       ~20 km, tuned for the western Pacific. Harmless, no edge here.
#   8 ARPEGE    A stretched grid, finest over France and deliberately coarsest
#               on the far side of the world. Worst resolution here and the
#               shortest reach of any global model on the list.
#
# The HOURS are floors, not measurements. A model's usable lead shrinks by the
# hour as its last run ages and jumps back up when the next one lands, so the
# published value has to sit under the trough rather than on any single reading.
# Probed at 47.42648,-120.85892 with `forecast_days=16`, counting non-null
# hours; each floor drops the measurement to the run cycle below it:
#
#   model                  measured   floor
#   gfs_seamless           384        384   (bounded by the request, not the model)
#   ecmwf_ifs025           349, 342   336
#   jma_seamless           253        240
#   gem_seamless           241        216
#   icon_seamless          181        168
#   ukmo_seamless          157        144
#   meteofrance_seamless   103         72
#   gfs_hrrr                49,  42    42
#
# Being wrong high costs a calendar day that answers with nothing; being wrong
# low costs a day of real forecast. Re-probe before moving any of them.
MODEL_INFO: dict[ForecastModel, ModelInfo] = {
    ForecastModel.gfs_seamless: ModelInfo(
        "NOAA GFS",
        384,
        "The longest reach, and fine detail across the US. Works anywhere."
        " Blends in the HRRR model.",
        3,
        blend=True,
    ),
    ForecastModel.gem_seamless: ModelInfo(
        "ECCC GEM",
        216,
        "The most detail over Canada and the northern US, and coarse"
        " elsewhere. Blends in the HRDPS and RDPS models.",
        2.5,
        blend=True,
    ),
    ForecastModel.ecmwf_ifs025: ModelInfo(
        "ECMWF IFS",
        336,
        "The most reliable for choosing which weekend to go. Too coarse"
        " to tell one valley from the next.",
        25,
    ),
    ForecastModel.gfs_hrrr: ModelInfo(
        "NOAA HRRR",
        42,
        "The most detail over the US for the next 48 hours. Already"
        " inside NOAA GFS, which reaches further.",
        3,
        regional=True,
    ),
    ForecastModel.ukmo_seamless: ModelInfo(
        "UK Met Office",
        144,
        "The most detail over the UK and Ireland, and coarse elsewhere."
        " Blends in the UKV model.",
        2,
        blend=True,
    ),
    ForecastModel.icon_seamless: ModelInfo(
        "DWD ICON",
        168,
        "The most detail over Germany and the Alps, and coarse"
        " elsewhere. Blends in the ICON-D2 and ICON-EU models.",
        2,
        blend=True,
    ),
    ForecastModel.jma_seamless: ModelInfo(
        "JMA GSM",
        240,
        "The most detail over Japan and Korea, and coarse elsewhere."
        " Blends in the MSM model.",
        5,
        blend=True,
    ),
    ForecastModel.meteofrance_seamless: ModelInfo(
        "Meteo-France ARPEGE",
        72,
        "The most detail over France, and coarse elsewhere. Blends in"
        " the AROME model.",
        2.5,
        blend=True,
    ),
}
