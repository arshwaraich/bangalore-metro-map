#!/usr/bin/env bash
# Refresh the cached OpenStreetMap extracts in data/raw/ (Overpass API), then run tools/build.py.
set -euo pipefail
cd "$(dirname "$0")/../data/raw"
q() {
  for i in 1 2 3 4 5; do
    curl -s -4 -m 120 -A "bangalore-metro-map" -o "$2.tmp" \
      --data-urlencode "data=[out:json][timeout:90];$1" https://overpass-api.de/api/interpreter
    grep -q '"elements"' "$2.tmp" && { mv "$2.tmp" "$2"; echo "ok $2"; return; }
    sleep $((i * 5))
  done
  echo "failed $2" >&2; return 1
}
BB='(12.7,77.3,13.3,77.85)'
# operational route relations: Purple, Green, Yellow (one direction each is enough)
q 'relation(id:1798771,1798772,19421927);out geom;' ops.json
# every metro station node, built or planned
q "(node[\"station\"=\"subway\"]$BB;node[\"construction:railway\"=\"station\"]$BB;node[\"proposed:railway\"=\"station\"]$BB;node[\"railway\"~\"construction|proposed\"]$BB;);out;" st.json
