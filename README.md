# Bangalore Metro Map

Namma Metro on a real map of Bengaluru: every line and station, what's running, what's being built, and when it's expected to open.

**Live: https://arshwaraich.github.io/bangalore-metro-map/**

- Solid lines are running, dashed lines are under construction, dotted lines are approved or proposed.
- Tap a line in the panel to highlight it and see all its stations. Tap a station or line on the map for its status and estimated opening.
- Light and dark mode follow your system setting. The button in the corner switches them.

## Status (as of 3 Nov 2026)

| Line | Section | Status | Est. opening |
|---|---|---|---|
| Purple | Whitefield (Kadugodi) – Challaghatta | Running | |
| Green | Madavara – Silk Institute | Running | |
| Yellow | RV Road – Bommasandra | Running | |
| Pink | Kalena Agrahara – Tavarekere (elevated) | CMRS cleared | 13 Nov 2026 |
| Pink | Tavarekere – Nagawara (underground) | Under construction | mid-2027 |
| Blue | Central Silk Board – KR Puram (2A) | Under construction, trials | 2027 |
| Blue | KR Puram – Airport (2B) | Under construction | late 2027 |
| Orange | JP Nagar 4th Phase – Kempapura (Phase 3) | Approved | Apr 2032 |
| Orange | Hosahalli – Kadabagere (Phase 3) | Approved | Apr 2032 |
| Red | Hebbal – Sarjapur (Phase 3A) | Awaiting Union approval | 2033 |

Dates are targets from news reports and Wikipedia. They have slipped many times before, so treat them as estimates.

## How it's built

A static page with no build step and no API keys:

- [MapLibre GL](https://maplibre.org/) with [OpenFreeMap](https://openfreemap.org/) vector tiles (Positron and Dark styles), trimmed so the base map only helps you get your bearings.
- `data/lines.json`: the hand-curated part. Lines, sections, status, estimated dates, and the ordered station list for each planned section.
- `data/raw/`: cached OpenStreetMap extracts. These hold track geometry for the running lines and station positions for all lines.
- `tools/build.py` combines the two into `data/metro.geojson`. Running lines follow their real OSM track. Planned lines are drawn as a smooth curve through their mapped station positions, because most of their track isn't in OSM yet.

To update, edit `data/lines.json` (for example, flip a section's `status` to `open` when it opens), then run:

```sh
tools/fetch_osm.sh   # optional: refresh the OSM extracts
python3 tools/build.py
python3 -m http.server   # preview at http://localhost:8000
```

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL). Tiles by [OpenFreeMap](https://openfreemap.org/), with the [OpenMapTiles](https://www.openmaptiles.org/) schema.
