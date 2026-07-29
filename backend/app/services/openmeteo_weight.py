"""Open-Meteo call accounting, in the provider's own unit.

Open-Meteo does not bill HTTP requests: per their published accounting
(open-meteo.com/en/pricing and the official "Weather Data for Multiple
Locations" post), one request costs

    weight = n_locations x max(1, days/14) x max(1, variables/10)

so a 50-location batch is at least 50 calls, and Bluebird's full 16-day
window makes it 50 x (16/14) = 57. The per-factor floor of 1 is inferred
from observed enforcement rather than documented (issue #180 tracks the
upstream confirmation); assuming it is the conservative choice, since
dropping it could only make us spend faster than we believe.

Getting this wrong is exactly how the 2026-07-29 incident happened: every
layer priced spend in HTTP requests and a 908-destination analysis turned
out to cost ~1,816 weighted calls against a 600/minute/IP budget. Any code
that talks to Open-Meteo must spend through a ratelimit.WeightedBudget using
this function, and any capacity math in docs must be written in this unit.
"""

from __future__ import annotations

from datetime import date


def call_weight(n_locations: int, start: date, end: date, n_variables: int) -> float:
    """Weighted-call cost of one batched Open-Meteo request."""
    days = max(1, (end - start).days + 1)
    day_factor = max(1.0, days / 14.0)
    var_factor = max(1.0, n_variables / 10.0)
    return n_locations * day_factor * var_factor
