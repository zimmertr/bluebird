"""Open-Meteo call accounting, in the provider's own unit.

Open-Meteo does not bill HTTP requests: per their published accounting
(open-meteo.com/en/pricing and the official "Weather Data for Multiple
Locations" post), one request costs

    weight = n_locations x max(1, days/14) x max(1, variables x models/10)

so a 50-location batch is at least 50 calls, and Bluebird Forecast's full 16-day
window makes it 50 x (16/14) = 57. The per-factor floor of 1 is inferred
from observed enforcement rather than documented (issue #180 tracks the
upstream confirmation); assuming it is the conservative choice, since
dropping it could only make us spend faster than we believe.

The model count multiplies the variable count because a request naming
several models returns one series per variable per model, and Open-Meteo
prices what comes back. Their own API-call calculator on the pricing page
takes Models beside Variables and multiplies the two (read 2026-09-12), so
this term is theirs rather than an inference of ours.

Getting this wrong is exactly how the 2026-07-29 incident happened: every
layer priced spend in HTTP requests and a 908-destination analysis turned
out to cost ~1,816 weighted calls against a 600/minute/IP budget. Any code
that talks to Open-Meteo must spend through a ratelimit.WeightedBudget using
this function, and any capacity math in docs must be written in this unit.
"""

from __future__ import annotations

from datetime import date

# Open-Meteo's free-tier ceiling for one hour, per IP address, in weighted calls:
# 600 a minute, 5,000 an hour and 10,000 a day are their published terms
# (open-meteo.com/en/terms), and only the minute bucket has been measured here
# (2026-10-21, record 0203). Published on `/api/capabilities` as
# `limits.open_meteo_hourly_calls` because the browser spends it: the web app
# fetches forecasts from the visitor's own address, so one analysis that costs
# more than this cannot finish inside the hour however it is paced (#803). The
# pod does not hold itself to it. Its pacer meters minutes, and an unkeyed
# analysis on the server path is the exception (`ratelimit/upstream.py`).
FREE_TIER_HOURLY_CALLS = 5_000


def call_weight(
    n_locations: int,
    start: date,
    end: date,
    n_variables: int,
    n_models: int = 1,
) -> float:
    """Weighted-call cost of one batched Open-Meteo request."""
    days = max(1, (end - start).days + 1)
    day_factor = max(1.0, days / 14.0)
    var_factor = max(1.0, n_variables * n_models / 10.0)
    return n_locations * day_factor * var_factor
