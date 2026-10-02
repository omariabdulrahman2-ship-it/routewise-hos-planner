from datetime import datetime, timezone
from unittest.mock import patch
from django.test import SimpleTestCase
from .scheduler import plan


def fixture(miles, pickup=20):
    return ({"miles": miles, "legs_miles": [pickup, miles - pickup],
             "coordinates": [[-87.6, 41.8], [-85, 40], [-84, 39], [-83, 38]]},
            [{"name": name, "lat": lat, "lon": lon} for name, lat, lon in
             [("Chicago, IL", 41.8, -87.6), ("Indianapolis, IN", 40, -85), ("Atlanta, GA", 38, -83)]])


class SchedulerTests(SimpleTestCase):
    def generate(self, miles, pickup=20, cycle=0):
        route, places = fixture(miles, pickup)
        return plan(route, places, cycle, datetime(2026, 10, 1, 6, 0, tzinfo=timezone.utc))

    def test_short_trip_has_two_work_stops_and_full_day_grid(self):
        trip = self.generate(100)
        self.assertEqual([s["type"] for s in trip["stops"]], ["start", "pickup", "dropoff"])
        self.assertEqual(sum(trip["days"][0]["totals_minutes"].values()), 1440)
        self.assertEqual(sum(e["status"] == "driving" for e in trip["events"]), 2)

    def test_long_trip_has_breaks_rest_fuel_and_multiple_days(self):
        trip = self.generate(2200, pickup=100)
        self.assertGreater(len(trip["days"]), 2)
        self.assertEqual(sum(s["type"] == "fuel" for s in trip["stops"]), 2)
        self.assertGreater(sum(s["type"] == "rest" for s in trip["stops"]), 0)
        for day in trip["days"]:
            self.assertEqual(sum(day["totals_minutes"].values()), 1440)
        for event in trip["events"]:
            if event["status"] == "driving":
                self.assertLessEqual((datetime.fromisoformat(event["end"]) - datetime.fromisoformat(event["start"])).total_seconds(), 8 * 3600)

    def test_cycle_exhaustion_uses_34_hour_restart(self):
        trip = self.generate(100, cycle=70)
        self.assertEqual(trip["stops"][1]["type"], "restart")
        self.assertEqual(trip["events"][0]["status"], "off_duty")
        self.assertEqual(len(trip["days"]), 2)

    def test_on_duty_pickup_resets_driving_break(self):
        trip = self.generate(700, pickup=440)
        pickup = next(e for e in trip["events"] if e["label"].startswith("Pickup / loading"))
        self.assertIsNotNone(pickup)
        self.assertEqual(sum(s["type"] == "break" for s in trip["stops"]), 0)

    @patch("planner.views.road_route")
    @patch("planner.views.geocode")
    def test_api_returns_plan(self, geocode, road_route):
        route, places = fixture(100)
        geocode.side_effect = places
        road_route.return_value = route
        response = self.client.post("/api/plan/", data='{"current_location":"Chicago, IL","pickup_location":"Indianapolis, IN","dropoff_location":"Atlanta, GA","cycle_used_hours":0,"start_at":"2026-10-01T06:00:00+00:00"}', content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["days"])

    def test_api_rejects_invalid_cycle(self):
        response = self.client.post("/api/plan/", data='{"current_location":"Chicago","pickup_location":"Indy","dropoff_location":"Atlanta","cycle_used_hours":71,"start_at":"2026-10-01T06:00:00+00:00"}', content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_cors_preflight_is_limited_to_configured_origin(self):
        good = self.client.options("/api/plan/", HTTP_ORIGIN="http://localhost:5173")
        bad = self.client.options("/api/plan/", HTTP_ORIGIN="https://untrusted.example")
        self.assertEqual(good.status_code, 204)
        self.assertEqual(good["Access-Control-Allow-Origin"], "http://localhost:5173")
        self.assertNotIn("Access-Control-Allow-Origin", bad)
