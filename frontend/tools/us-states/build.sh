#!/bin/sh
# Rebuilds frontend/src/utils/usStateOutlines.json, the fifty state outlines a
# crag's Mountain Project search is narrowed by (usStates.ts). Run from
# anywhere; it needs Docker and the network, and nothing installed locally.
#
# The borders between two states are what decide a lookup, so they keep 250 m;
# a coast only has to keep a cliff on the right side of the sea, so it keeps
# 1 km, and Alaska's and Hawaii's 3 km, which halves Alaska's share of the
# file. The two line sets are simplified apart and rebuilt into polygons, each
# piece named by the original state its interior point falls in.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../../src/utils/usStateOutlines.json"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

curl -sSf -o "$WORK/cb.zip" https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip
mkdir "$WORK/shp"
unzip -q "$WORK/cb.zip" -d "$WORK/shp"

docker run --rm -v "$WORK:/work" -v "$HERE:/tool:ro" node:26-alpine sh -euc '
  cd /tmp
  npm install --silent --no-audit --no-fund --ignore-scripts mapshaper@0.7.95 >/dev/null
  ms() { node_modules/.bin/mapshaper "$@" -quiet; }
  SRC=/work/shp/cb_2024_us_state_500k.shp
  STATES="+STATEFP <= 56 && NAME != \"District of Columbia\""
  ms $SRC -filter "$STATES" -filter-fields NAME -o /work/orig.json format=geojson
  ms $SRC -filter "$STATES" -filter-islands min-area=5km2 -simplify dp interval=250 \
    -lines -filter "TYPE==\"inner\"" -o /work/inner.json format=geojson
  ms $SRC -filter "$STATES" -filter-islands min-area=5km2 \
    -simplify dp variable interval="NAME==\"Alaska\" || NAME==\"Hawaii\" ? 3000 : 1000" \
    -lines -filter "TYPE==\"outer\"" -o /work/outer.json format=geojson
  ms -i /work/inner.json /work/outer.json combine-files -merge-layers force \
    -polygons -each "pid=this.id" -o /work/polys.json format=geojson
  ms -i /work/polys.json -points inner -o /work/pp.json format=geojson
  ms -i /work/pp.json /work/orig.json combine-files -join target=pp source=orig fields=NAME \
    -o /work/ppn.json format=geojson target=pp
  ms -i /work/polys.json -join /work/ppn.json keys=pid,pid fields=NAME -filter "NAME != null" \
    -dissolve NAME -o /work/states.topojson format=topojson quantization=400000
  node /tool/compact.mjs /work/states.topojson > /work/usStateOutlines.json
'
cp "$WORK/usStateOutlines.json" "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
