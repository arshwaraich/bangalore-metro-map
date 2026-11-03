#!/usr/bin/env python3
"""Build data/metro.geojson from data/lines.json + cached OSM extracts in data/raw/.

Open lines take their track geometry from OSM route relations. Planned lines
are drawn as a smooth curve through their (OSM-mapped) station positions,
since most of their track isn't in OSM yet.
"""
import json, math, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

SHORT = {
    "Nadaprabhu Kempegowda Station, Majestic": "Majestic",
    "Dr. B. R. Ambedkar Station, Vidhana Soudha": "Vidhana Soudha",
    "Sir M. Visvesvaraya Stn., Central College": "Central College",
    "Krantivira Sangolli Rayanna Railway Station": "KSR Railway Station",
    "Sri Balagangadharanatha Swamiji Station, Hosahalli": "Hosahalli",
    "Mahakavi Kuvempu Road": "Kuvempu Road",
    "Infosys Foundation Konappana Agrahara": "Konappana Agrahara",
    "Delta Electronics Bommasandra": "Bommasandra",
    "Mantri Square Sampige Road": "Sampige Road",
    "Krishna Rajendra Market": "KR Market",
    "Rashtreeya Vidyalaya Road": "RV Road",
    "Pantharapalya - Nayandahalli": "Nayandahalli",
    "Krishnarajapura": "KR Puram",
    "Krishnarajapuram": "KR Puram",
    "Mahatma Gandhi Road": "MG Road",
    "Embassy Tech Village Kadubeesanahalli": "Kadubeesanahalli",
    "Bagmane DRDO Sports Complex": "DRDO Sports Complex",
    "Rashtriya Military School": "Rashtriya Military School",
    "Jaya Prakash Nagar": "JP Nagar",
}
# Planned stations that are interchanges with a differently named station.
ALIAS = {"Agara": "Agara Lake", "KR Circle": "Central College", "Mysuru Road": "Mysore Road"}
# OSM colour tags used on each line's stations
COLOURS = {"pink": {"pink", "#ff49a7"}, "blue": {"blue"}, "orange": {"orange"}, "red": {"red"}}
MERGE_M = 350


def norm(s):
    s = re.sub(r"\((u/c|proposed)\)", "", s, flags=re.I)
    s = re.sub(r"metro station", "", s, flags=re.I)
    return re.sub(r"[^a-z0-9]", "", s.lower())


def dist(a, b):
    # metres, equirectangular is plenty at city scale
    lat = math.radians((a[1] + b[1]) / 2)
    dx = math.radians(b[0] - a[0]) * math.cos(lat)
    dy = math.radians(b[1] - a[1])
    return 6371000 * math.hypot(dx, dy)


def seg_dist(p, a, b):
    lat = math.radians(p[1])
    k = math.cos(lat)
    ax, ay, bx, by, px, py = a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return dist(p, ((ax + t * dx) / k, ay + t * dy))


def catmull(pts, n=10):
    """Centripetal-ish Catmull-Rom through pts (lon,lat), n samples per span."""
    if len(pts) < 3:
        return pts
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in range(2)))
    out.append(pts[-1])
    return out


def prio(lines, terminal):
    """Label priority, 0 = placed first: open interchanges, then interchanges, termini, the rest."""
    n_open = sum(v["status"] == "open" for _, v in lines)
    if n_open >= 2: return 0
    if len(lines) > 1: return 1 if n_open else 3
    if n_open: return 2 if terminal else 4
    return 3 if terminal else 5


def r6(c):
    return [round(c[0], 6), round(c[1], 6)]


def main():
    cfg = json.loads((ROOT / "data" / "lines.json").read_text())
    ops = {r["id"]: r for r in json.loads((RAW / "ops.json").read_text())["elements"]}
    nodes = [e for e in json.loads((RAW / "st.json").read_text())["elements"] if "name" in e.get("tags", {})]
    open_nodes = [n for n in nodes if n["tags"].get("station") == "subway" and n["tags"].get("railway") == "station"
                  and "proposed" not in n["tags"]["name"].lower()]

    features, stations = [], []  # stations: dicts with name, coord, lines{id: status}
    rank = {"open": 0, "soon": 1, "construction": 2, "approved": 3, "proposed": 4}

    def add_station(name, coord, line_id, status, section):
        name = SHORT.get(name, re.sub(r"\s*\((u/c|Proposed)\)", "", name).strip())
        for s in stations:
            d = dist(s["coord"], coord)
            if d < 120 or (d < MERGE_M and norm(s["name"]) == norm(name)) or (d < 900 and norm(s["name"]) == norm(name) and line_id not in s["lines"]):
                prev = s["lines"].get(line_id)
                if prev is None or rank[status] < rank[prev["status"]]:
                    s["lines"][line_id] = {"status": status, "section": section}
                if status == "open" and not any(v["status"] == "open" for k, v in s["lines"].items() if k != line_id):
                    s["coord"] = coord  # prefer the built station's position
                return s
        s = {"name": name, "coord": coord, "lines": {line_id: {"status": status, "section": section}}}
        stations.append(s)
        return s

    def find(name, near=None, colour=None):
        n = norm(SHORT.get(name, name))
        cands = [x for x in nodes if norm(SHORT.get(x["tags"]["name"], x["tags"]["name"])) == n]
        if not cands:
            cands = [x for x in nodes if n in norm(x["tags"]["name"]) or norm(x["tags"]["name"]) in n and len(norm(x["tags"]["name"])) > 4]
        if not cands:
            sys.exit(f"no OSM node for station {name!r}")
        def score(x):
            c = (x["lon"], x["lat"])
            sc = 0
            if colour and (x["tags"].get("colour") or "").lower() in COLOURS.get(colour, {colour}):
                sc -= 1e6
            if near:
                sc += dist(near, c)
            return sc
        best = min(cands, key=score)
        return (best["lon"], best["lat"])

    for line in cfg["lines"]:
        for sec in line["sections"]:
            props = {"kind": "line", "line": line["id"], "lineName": line["name"], "color": line["color"],
                     "section": sec["name"], "status": sec["status"],
                     **{k: sec[k] for k in ("eta", "etaNote", "opened") if k in sec}}
            if "osmRelation" in sec:
                rel = ops[sec["osmRelation"]]
                parts = [[(p["lon"], p["lat"]) for p in m["geometry"]]
                         for m in rel["members"] if m["type"] == "way" and m["role"] in ("", "forward", "backward")]
                features.append({"type": "Feature", "properties": props,
                                 "geometry": {"type": "MultiLineString", "coordinates": [[r6(c) for c in p] for p in parts]}})
                segs = [(p[i], p[i + 1]) for p in parts for i in range(len(p) - 1)]
                for n in open_nodes:
                    c = (n["lon"], n["lat"])
                    if min(seg_dist(c, a, b) for a, b in segs) < 200:
                        add_station(n["tags"]["name"], c, line["id"], "open", sec["name"])
                continue
            # planned section
            coords, names = [], []
            for nm in sec["stations"]:
                c = find(nm, near=coords[-1] if coords else None, colour=line["id"])
                # snap to an existing station of the same name (interchanges / shared termini)
                for s in stations:
                    if (norm(s["name"]) == norm(SHORT.get(nm, nm)) and dist(s["coord"], c) < 900) or dist(s["coord"], c) < 120:
                        c = tuple(s["coord"]); break
                    if nm in ALIAS and s["name"] == ALIAS[nm]:
                        c = tuple(s["coord"]); nm = s["name"]; break
                coords.append(c); names.append(nm)
            if sec.get("order") == "greedy":
                order, rest = [0], list(range(1, len(coords)))
                while rest:
                    i = min(rest, key=lambda j: dist(coords[order[-1]], coords[j]))
                    order.append(i); rest.remove(i)
                coords = [coords[i] for i in order]
                names = [names[i] for i in order]
            print(sec["name"], "→", " / ".join(names), file=sys.stderr)
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": "LineString", "coordinates": [r6(c) for c in catmull(coords)]}})
            for nm, c in zip(names, coords):
                add_station(nm, c, line["id"], sec["status"], sec["name"])

    colour = {l["id"]: l["color"] for l in cfg["lines"]}
    terminals = {n.strip() for l in cfg["lines"] for sec in l["sections"]
                 for n in re.sub(r"\s*\(.*\)$", "", sec["name"]).split(" – ")}
    for s in stations:
        lines = sorted(s["lines"].items(), key=lambda kv: rank[kv[1]["status"]])
        inter, planned = len(lines) > 1, lines[0][1]["status"] != "open"
        major = inter or s["name"] in terminals
        features.append({"type": "Feature", "properties": {
            "kind": "station", "name": s["name"],
            "status": lines[0][1]["status"], "planned": planned, "inter": inter, "major": major,
            "color": colour[lines[0][0]], "lineIds": "," + ",".join(k for k, _ in lines) + ",",
            "prio": prio(lines, s["name"] in terminals),
            "lines": [{"line": k, **v} for k, v in lines]},
            "geometry": {"type": "Point", "coordinates": r6(s["coord"])}})

    out = {"type": "FeatureCollection", "asOf": cfg["asOf"],
           "lines": [{k: l[k] for k in ("id", "name", "color")} | {"sections": [
               {k: s[k] for k in ("name", "status", "eta", "etaNote", "opened") if k in s} for s in l["sections"]]}
               for l in cfg["lines"]],
           "features": features}
    (ROOT / "data" / "metro.geojson").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{sum(f['properties']['kind'] == 'station' for f in features)} stations", file=sys.stderr)


if __name__ == "__main__":
    main()
