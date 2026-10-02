"""A small, replaceable adapter for OSM geocoding and OSRM road routes."""
import json
import math
import os
import time
from functools import lru_cache
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

MILES_PER_METER = 0.000621371
USER_AGENT = os.getenv("MAP_USER_AGENT", "RoutewiseHOSAssessment/1.0")
_last_geocode = 0.0


class RouteError(Exception):
    pass


def fetch_json(url):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urlopen(request, timeout=18) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise RouteError("The map service is temporarily unavailable. Please try again.") from exc


@lru_cache(maxsize=512)
def geocode(name):
    # Three calls per submitted trip, never autocomplete or browser-side requests.
    global _last_geocode
    wait = 1.05 - (time.monotonic() - _last_geocode)
    if wait > 0:
        time.sleep(wait)
    _last_geocode = time.monotonic()
    query = urlencode({"q": name, "format": "jsonv2", "limit": 1, "countrycodes": "us"})
    matches = fetch_json(f"https://nominatim.openstreetmap.org/search?{query}")
    if not matches:
        raise RouteError(f"Could not find '{name}' in the United States. Try a city and state.")
    match = matches[0]
    return {"name": match["display_name"], "lat": float(match["lat"]), "lon": float(match["lon"])}


def road_route(points):
    coordinates = ";".join(f"{p['lon']},{p['lat']}" for p in points)
    url = f"https://router.project-osrm.org/route/v1/driving/{quote(coordinates, safe=';,.-')}?overview=full&geometries=geojson"
    payload = fetch_json(url)
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise RouteError("No drivable route was found between these places.")
    route = payload["routes"][0]
    return {
        "miles": route["distance"] * MILES_PER_METER,
        "legs_miles": [leg["distance"] * MILES_PER_METER for leg in route["legs"]],
        "coordinates": route["geometry"]["coordinates"],
    }


def haversine_miles(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    delta_lat, delta_lon = lat2 - lat1, lon2 - lon1
    x = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 3958.7613 * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def route_position(coordinates, mile, total_miles):
    """Interpolate a marker along the returned route; scale geometric to road miles."""
    lengths = [haversine_miles(a, b) for a, b in zip(coordinates, coordinates[1:])]
    target = max(0, min(mile / total_miles, 1)) * sum(lengths) if total_miles else 0
    for i, length in enumerate(lengths):
        if target <= length:
            fraction = target / length if length else 0
            a, b = coordinates[i], coordinates[i + 1]
            return [a[1] + fraction * (b[1] - a[1]), a[0] + fraction * (b[0] - a[0])]
        target -= length
    return [coordinates[-1][1], coordinates[-1][0]]
