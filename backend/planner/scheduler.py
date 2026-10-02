"""Trip simulation. Minutes are the unit for every HOS limit and event."""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from math import ceil

from .routing import route_position

DRIVE_LIMIT = 11 * 60
WINDOW_LIMIT = 14 * 60
BREAK_AFTER = 8 * 60
CYCLE_LIMIT = 70 * 60
SPEED_MPH = 55  # Planning estimate, not a truck-specific routing engine.


@dataclass
class State:
    now: datetime
    cycle: int
    mile: float = 0
    drive: int = 0
    since_break: int = 0
    window_start: datetime | None = None
    events: list = field(default_factory=list)

    def add(self, status, minutes, label, miles=0):
        if minutes <= 0:
            return
        event = {
            "status": status,
            "start": self.now.isoformat(),
            "end": (self.now + timedelta(minutes=minutes)).isoformat(),
            "label": label,
            "mile_start": round(self.mile, 3),
            "mile_end": round(self.mile + miles, 3),
        }
        self.events.append(event)
        if status in ("driving", "on_duty"):
            if self.window_start is None:
                self.window_start = self.now
            self.cycle += minutes
        if status == "driving":
            self.drive += minutes
            self.since_break += minutes
        elif minutes >= 30:
            self.since_break = 0
        self.now += timedelta(minutes=minutes)
        self.mile += miles

    def rest(self, minutes, label):
        self.add("off_duty", minutes, label)
        if minutes >= 10 * 60:
            self.drive = 0
            self.window_start = None
            self.since_break = 0
        if minutes >= 34 * 60:
            self.cycle = 0

    def work(self, minutes, label):
        self.add("on_duty", minutes, label)


def split_daily(events, start, end):
    """Cut events at local midnight, filling unused portions with off-duty."""
    days = []
    day = start.replace(hour=0, minute=0, second=0, microsecond=0)
    while day < end:
        next_day = day + timedelta(days=1)
        cursor = day
        segments = []
        miles = 0.0
        on_duty = 0
        for event in events:
            event_start = datetime.fromisoformat(event["start"])
            event_end = datetime.fromisoformat(event["end"])
            left, right = max(day, event_start), min(next_day, event_end)
            if right <= left:
                continue
            if cursor < left:
                segments.append({"status": "off_duty", "start": cursor.isoformat(), "end": left.isoformat(), "label": "Off duty"})
            segment = {"status": event["status"], "start": left.isoformat(), "end": right.isoformat(), "label": event["label"]}
            segments.append(segment)
            minutes = (right - left).total_seconds() / 60
            total_minutes = (event_end - event_start).total_seconds() / 60
            miles += (event["mile_end"] - event["mile_start"]) * minutes / total_minutes
            if event["status"] in ("driving", "on_duty"):
                on_duty += int(minutes)
            cursor = right
        if cursor < next_day:
            segments.append({"status": "off_duty", "start": cursor.isoformat(), "end": next_day.isoformat(), "label": "Off duty"})
        totals = {status: sum(
            int((datetime.fromisoformat(s["end"]) - datetime.fromisoformat(s["start"])).total_seconds() / 60)
            for s in segments if s["status"] == status
        ) for status in ("off_duty", "sleeper", "driving", "on_duty")}
        days.append({"date": day.date().isoformat(), "segments": segments, "totals_minutes": totals,
                     "miles": round(miles, 1)})
        day = next_day
    return days


def plan(route, places, cycle_hours, start):
    total = route["miles"]
    pickup_mile = route["legs_miles"][0]
    state = State(start, round(cycle_hours * 60))
    stops = []
    fuel_at = 1000.0

    def stop(kind, label, miles=None):
        at = state.mile if miles is None else miles
        stops.append({"type": kind, "label": label, "time": state.now.isoformat(),
                      "mile": round(at, 1), "position": route_position(route["coordinates"], at, total)})

    stop("start", "Departure: " + places[0]["name"], 0)

    def travel_to(target):
        nonlocal fuel_at
        while state.mile < target - 0.001:
            if state.cycle >= CYCLE_LIMIT:
                stop("restart", "34-hour cycle restart")
                state.rest(34 * 60, f"34-hour cycle restart · route mile {state.mile:.1f}")
                continue
            remaining_window = WINDOW_LIMIT - int((state.now - state.window_start).total_seconds() / 60) if state.window_start else WINDOW_LIMIT
            if state.drive >= DRIVE_LIMIT or remaining_window <= 0:
                stop("rest", "10-hour off-duty rest")
                state.rest(10 * 60, f"10-hour off-duty rest · route mile {state.mile:.1f}")
                continue
            if state.since_break >= BREAK_AFTER:
                stop("break", "30-minute break from driving")
                state.rest(30, f"30-minute driving break · route mile {state.mile:.1f}")
                continue
            capacity = min(DRIVE_LIMIT - state.drive, BREAK_AFTER - state.since_break,
                           CYCLE_LIMIT - state.cycle, remaining_window)
            next_miles = min(target - state.mile, capacity * SPEED_MPH / 60)
            if fuel_at <= target + 0.001:
                next_miles = min(next_miles, fuel_at - state.mile)
            if next_miles <= 0.001:
                stop("fuel", "Fuel stop")
                state.work(30, f"Fuel stop · route mile {state.mile:.1f} (30 min estimated)")
                fuel_at += 1000
                continue
            minutes = min(capacity, max(1, ceil(next_miles * 60 / SPEED_MPH)))
            state.add("driving", minutes, "Driving", next_miles)
            if state.mile >= fuel_at - 0.001 and state.mile < total - 0.001:
                stop("fuel", "Fuel stop")
                state.work(30, f"Fuel stop · route mile {state.mile:.1f} (30 min estimated)")
                fuel_at += 1000

    travel_to(pickup_mile)
    stop("pickup", "Pickup: " + places[1]["name"])
    state.work(60, "Pickup / loading · " + places[1]["name"])
    travel_to(total)
    stop("dropoff", "Drop-off: " + places[2]["name"])
    state.work(60, "Drop-off / unloading · " + places[2]["name"])
    days = split_daily(state.events, start, state.now)
    return {"distance_miles": round(total, 1), "start": start.isoformat(), "arrival": state.now.isoformat(),
            "places": places, "route": route["coordinates"], "stops": stops,
            "events": state.events, "days": days, "ending_cycle_minutes": state.cycle,
            "assumptions": ["A fresh 10-hour rest is assumed at departure.",
                "Drive time uses route miles at an estimated 55 mph; routing is not truck-specific.",
                "Fuel takes an estimated 30 minutes, counted on duty and as a driving break.",
                "Rest/fuel markers are approximate route positions, not verified truck facilities.",
                "Only aggregate cycle usage was provided; no prior 8-day history can be reconstructed. At 70 hours the plan conservatively takes a 34-hour restart."]}
