-- The shared cache's first schema (#760). Each table says what it holds and
-- who writes it; app/db/__init__.py applies this once, under a lock.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Every peak, lake, trailhead and crag the app keeps, worldwide: written by
-- the planet fill (fill/fill.py, which builds a copy and swaps it in) and the
-- daily update (services/places/update.py); read by discovery, the pasted
-- coordinate lookup and the map's markers. `name` is null only for a summit
-- kept for its elevation; `rank` orders same-named neighbours (rules.preference).
CREATE TABLE places (
    osm_type text NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
    osm_id bigint NOT NULL,
    kind text NOT NULL CHECK (kind IN ('peak', 'trailhead', 'lake', 'crag')),
    name text,
    ele_ft real,
    rank smallint NOT NULL DEFAULT 0,
    geom geometry(Point, 4326) NOT NULL,
    PRIMARY KEY (osm_type, osm_id)
);
CREATE INDEX places_geom ON places USING gist (geom);

-- Where the places table stands against OpenStreetMap: one row. `filled_at`
-- is null until a fill has completed, and nothing reads the table before it.
-- `rules_version` is rules.RULES_VERSION at the fill; `sequence` the last
-- daily change file applied.
CREATE TABLE osm_state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    filled_at timestamptz,
    planet_timestamp timestamptz,
    rules_version integer,
    sequence bigint,
    updated_at timestamptz
);
INSERT INTO osm_state (id) VALUES (true);

-- Shapes a change file edited without carrying all their points; the update
-- asks Overpass for them by id, oldest first, until one answer places them.
CREATE TABLE places_pending (
    osm_type text NOT NULL CHECK (osm_type IN ('way', 'relation')),
    osm_id bigint NOT NULL,
    queued_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (osm_type, osm_id)
);

-- The overlay snapshots, one row per source, as gzipped JSON. Written by the
-- pod holding the source's refresh lock; every pod loads a newer row.
CREATE TABLE snapshots (
    source text PRIMARY KEY,
    fetched_at timestamptz NOT NULL,
    body bytea NOT NULL
);

-- When each source last refreshed and when it is next due, shared so the
-- doubling backoff after a failure holds across pods.
CREATE TABLE refresh_state (
    source text PRIMARY KEY,
    last_attempt timestamptz,
    last_success timestamptz,
    next_due timestamptz NOT NULL DEFAULT now(),
    failures integer NOT NULL DEFAULT 0,
    last_error text,
    retry_after_s integer
);

-- Counters that only matter for the next minute or so. Unlogged: not written
-- to the WAL, so they are cheap to write on every request and lost in a crash,
-- which costs one minute of slightly looser limits.
CREATE UNLOGGED TABLE rate_buckets (
    bucket text NOT NULL,
    key text NOT NULL,
    tokens double precision NOT NULL,
    updated timestamptz NOT NULL,
    PRIMARY KEY (bucket, key)
);

CREATE UNLOGGED TABLE gates (
    name text PRIMARY KEY,
    next_free timestamptz NOT NULL
);

CREATE UNLOGGED TABLE weight_bookings (
    budget text NOT NULL,
    start_at timestamptz NOT NULL,
    leaves_at timestamptz NOT NULL,
    weight double precision NOT NULL
);
CREATE INDEX weight_bookings_budget ON weight_bookings (budget, leaves_at);

CREATE UNLOGGED TABLE geocode_cache (
    key text PRIMARY KEY,
    body jsonb NOT NULL,
    expires_at timestamptz NOT NULL
);
