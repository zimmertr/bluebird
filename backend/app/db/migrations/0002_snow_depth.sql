-- A year of daily snow depth (#849), so a window in the past reads the depth
-- of its own days. Written by services/snow_history.py, one pod at a time
-- under the refresh lock; read by the snow depth route and the analyze routes.

-- One row per SNODAS cell per month: the cell's depth on each day of the
-- month in millimetres, as the file carries it, element 1 the 1st. Null is a
-- day not filled yet, a day whose file was refused or missing, or no data at
-- that cell. `cell` is row * 8192 + column of the unmasked grid, whose shape
-- the writer checks against every file. Only cells holding a place are kept:
-- 181,417 of them on 2026-11-12, about 350 MB a year.
CREATE TABLE snow_depth_days (
    cell integer NOT NULL,
    month date NOT NULL,
    depth_mm smallint[] NOT NULL,
    PRIMARY KEY (cell, month)
) WITH (fillfactor = 90);

-- The days the writer has dealt with, so it neither downloads one twice nor
-- loops on one NSIDC never published. `outcome` is `filled`, `refused` (the
-- file failed its checks) or `missing` (NSIDC answered 404 for a past day).
CREATE TABLE snow_depth_filled (
    day date PRIMARY KEY,
    outcome text NOT NULL CHECK (outcome IN ('filled', 'refused', 'missing')),
    filled_at timestamptz NOT NULL DEFAULT now()
);
