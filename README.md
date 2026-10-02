# Routewise — HOS Trip Planner

A Django + React assessment app that turns three US locations and current 70-hour cycle use into a mapped route, HOS-aware trip events, and printable 24-hour duty-status grids.

## Run locally

Requirements: Python 3.11+ and Node.js 20+.

Terminal A:

```bash
cd backend
python -m venv .venv
# On Windows: .venv\Scripts\activate
# On macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```

Terminal B:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to Django during development. The backend has no database-dependent feature; migrations are unnecessary for this assessment.

## Test

```bash
cd backend
python manage.py test
cd ../frontend
npm run build
```

## API

`POST /api/plan/` with JSON:

```json
{
  "current_location": "Chicago, IL",
  "pickup_location": "Indianapolis, IN",
  "dropoff_location": "Atlanta, GA",
  "cycle_used_hours": 12.5,
  "start_at": "2026-10-01T08:00:00-05:00"
}
```

The response includes route geometry, distance, timed events, map markers, daily segments, and status totals. `start_at` is the current instant from the browser; the backend translates it into the starting location's IANA home-terminal time zone.

## Deployment

Deploy `backend/` as a Python web service, for example on a WSGI-capable host. Use build command `pip install -r requirements.txt` and start command `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`. Configure:

- `DJANGO_SECRET_KEY`: a long random value.
- `DJANGO_ALLOWED_HOSTS`: your backend hostname, without `https://`.
- `CORS_ALLOWED_ORIGINS`: the exact frontend origin, for example `https://your-app.vercel.app`.
- `MAP_USER_AGENT`: a descriptive application identifier with your contact or website.
- `DJANGO_SECURE_HSTS=true`: only after HTTPS is confirmed end-to-end.

Deploy `frontend/` as a Vite site, for example on Vercel, using build command `npm run build`, output directory `dist`, and environment variable `VITE_API_URL=https://your-backend.example.com`. Redeploy the frontend after changing a `VITE_` variable. Check that the backend host can reach OSM Nominatim and the OSRM demo service. Do not submit until a real route works from the hosted version.

## Assumptions and boundaries

- Property-carrying driver, 70 hours in 8 days, no adverse driving conditions.
- Fresh 10 consecutive hours off-duty before departure; no prior-day duty details are provided.
- A 30-minute non-driving break after 8 cumulative driving hours; driving is limited to 11 hours within a 14-hour window. Pickup/drop-off each take one hour on-duty, not driving.
- Road distance comes from OSRM's driving route. Time is estimated at 55 mph; this is not a truck-specific map or a traffic forecast.
- Fuel once at least every 1,000 miles, with an estimated 30 minutes on duty per fill. It counts as a non-driving break.
- When the supplied 70-hour balance is exhausted, a conservative 34-hour restart is inserted. A single cumulative hours number cannot reveal when earlier work rolls off the 8-day window.
- Rest/fuel pins are approximate points along the route, **not verified parking, truck stops, or legal stopping places**.
- The paper-grid display and print view are planning illustrations, **not a certified ELD or legally complete duty-status record**. Optional carrier/driver/vehicle data is supplied by the user; no signature is fabricated.
- The 2022 FMCSA guide supplied with the assessment is the source for the baseline HOS logic. Short-haul, split sleeper, personal conveyance, yard moves, adverse weather, DST transitions and state-specific rules are outside this assessment implementation.
- Public community map endpoints have usage policies and no uptime guarantee. For higher-traffic production use, substitute managed or self-hosted geocoding/routing services.

## Structure

- `backend/planner/routing.py`: geocoding, routing, and map-position interpolation.
- `backend/planner/scheduler.py`: deterministic event scheduling and 24-hour log slicing.
- `backend/planner/views.py`: input validation and API response.
- `frontend/src/App.jsx`: form, map, timeline, log-sheet rendering.

## Assessment handoff

Submit the hosted frontend URL, the GitHub repository URL, and a 3–5-minute Loom. Suggested demo: enter a trip, explain the map and stops, show two daily logs, highlight the scheduler test cases and state the assumptions above.
