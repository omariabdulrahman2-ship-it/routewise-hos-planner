import json
from datetime import datetime
from zoneinfo import ZoneInfo
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from timezonefinder import timezone_at
from .routing import RouteError, geocode, road_route
from .scheduler import plan


def health(request):
    return JsonResponse({"ok": True})


@csrf_exempt
def plan_trip(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        data = json.loads(request.body)
        names = [str(data[key]).strip() for key in ("current_location", "pickup_location", "dropoff_location")]
        if any(not name or len(name) > 180 for name in names):
            raise ValueError("Enter all three locations (up to 180 characters each).")
        cycle = float(data["cycle_used_hours"])
        if not 0 <= cycle <= 70:
            raise ValueError("Cycle hours must be between 0 and 70.")
        start = datetime.fromisoformat(data["start_at"].replace("Z", "+00:00"))
        if start.tzinfo is None:
            raise ValueError("Start time must include a time zone.")
        places = [geocode(name) for name in names]
        home_zone = timezone_at(lng=places[0]["lon"], lat=places[0]["lat"])
        if not home_zone:
            raise ValueError("Unable to determine the starting location's time zone.")
        start = start.astimezone(ZoneInfo(home_zone))
        route = road_route(places)
        if len(route["legs_miles"]) != 2 or route["miles"] < 0.01:
            raise RouteError("Choose three distinct drivable places.")
        result = plan(route, places, cycle, start)
        result["home_timezone"] = home_zone
        return JsonResponse(result)
    except (KeyError, TypeError, json.JSONDecodeError):
        return JsonResponse({"error": "Provide three locations, cycle hours and a start time."}, status=400)
    except (ValueError, RouteError) as exc:
        return JsonResponse({"error": str(exc)}, status=400)
