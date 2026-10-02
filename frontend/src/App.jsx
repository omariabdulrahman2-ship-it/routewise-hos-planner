import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import {
  ArrowRight,
  Clock3,
  Download,
  Fuel,
  MapPin,
  Moon,
  Navigation,
  Route,
  ShieldCheck,
  Truck,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const COLORS = {
  off_duty: "#aab6c1",
  sleeper: "#625fcb",
  driving: "#19946e",
  on_duty: "#e5a640",
};
const LABELS = {
  off_duty: "Off duty",
  sleeper: "Sleeper berth",
  driving: "Driving",
  on_duty: "On duty · not driving",
};

const hours = (minutes) => `${(minutes / 60).toFixed(2).replace(/\.00$/, "")}h`;
const shortTime = (value) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value.slice(0, 19) + "Z"));
const fullTime = (value) =>
  `${new Date(value.slice(0, 19) + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · ${shortTime(value)}`;
const dateLabel = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
const minuteOfDay = (value) =>
  Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [38, 38] });
  }, [map, points]);
  return null;
}

function RouteMap({ trip }) {
  const points = trip.route.map(([lon, lat]) => [lat, lon]);
  return (
    <MapContainer
      center={[39.5, -98.35]}
      zoom={4}
      scrollWheelZoom={false}
      className="map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline
        positions={points}
        pathOptions={{ color: "#176e60", weight: 5, opacity: 0.85 }}
      />
      {trip.stops.map((stop, index) => (
        <CircleMarker
          key={index}
          center={stop.position}
          radius={stop.type === "start" || stop.type === "dropoff" ? 9 : 7}
          pathOptions={{
            color: "white",
            weight: 3,
            fillColor:
              stop.type === "rest" || stop.type === "restart"
                ? "#625fcb"
                : stop.type === "fuel"
                  ? "#e5a640"
                  : "#176e60",
            fillOpacity: 1,
          }}
        >
          <Popup>
            <strong>{stop.label}</strong>
            <br />
            {fullTime(stop.time)} · mile {stop.mile}
          </Popup>
        </CircleMarker>
      ))}
      <FitRoute points={points} />
    </MapContainer>
  );
}

function LogGraph({ day }) {
  const width = 960,
    left = 150,
    graphW = 730,
    top = 46,
    rowH = 42;
  const statuses = ["off_duty", "sleeper", "driving", "on_duty"];
  let previous = null;
  return (
    <div className="graph-scroll">
      <svg
        viewBox={`0 0 ${width} 254`}
        className="log-svg"
        role="img"
        aria-label={`Duty status graph for ${day.date}`}
      >
        <rect
          x={left}
          y={top}
          width={graphW}
          height={rowH * 4}
          fill="white"
          stroke="#dce4e6"
        />
        {Array.from({ length: 25 }, (_, h) => (
          <g key={h}>
            <line
              x1={left + (h * graphW) / 24}
              y1={top}
              x2={left + (h * graphW) / 24}
              y2={top + rowH * 4}
              stroke={h % 2 ? "#edf0f1" : "#dce4e6"}
            />
            <text
              x={left + (h * graphW) / 24}
              y={30}
              textAnchor="middle"
              fontSize="11"
              fill="#78888d"
            >
              {h === 24 ? "24" : h.toString().padStart(2, "0")}
            </text>
          </g>
        ))}
        {statuses.map((status, i) => (
          <g key={status}>
            <line
              x1={left}
              y1={top + i * rowH}
              x2={left + graphW}
              y2={top + i * rowH}
              stroke="#dce4e6"
            />
            <text
              x={8}
              y={top + i * rowH + 25}
              fontSize="12"
              fontWeight="600"
              fill="#415258"
            >
              {i + 1}. {LABELS[status]}
            </text>
            <text
              x={948}
              y={top + i * rowH + 25}
              textAnchor="end"
              fontSize="12"
              fontWeight="700"
              fill="#203339"
            >
              {hours(day.totals_minutes[status])}
            </text>
          </g>
        ))}
        {day.segments.map((segment, index) => {
          const start = minuteOfDay(segment.start),
            end =
              index === day.segments.length - 1
                ? 1440
                : minuteOfDay(segment.end);
          const row = statuses.indexOf(segment.status),
            y = top + row * rowH + rowH / 2;
          const x1 = left + (start * graphW) / 1440,
            x2 = left + (end * graphW) / 1440;
          const connector =
            previous && previous.y !== y ? (
              <line
                x1={x1}
                y1={previous.y}
                x2={x1}
                y2={y}
                stroke="#203339"
                strokeWidth="2.8"
              />
            ) : null;
          previous = { y };
          return (
            <g key={index}>
              {connector}
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={COLORS[segment.status]}
                strokeWidth="5"
                strokeLinecap="round"
              />
            </g>
          );
        })}
        <line
          x1={left}
          y1={top + rowH * 4}
          x2={left + graphW}
          y2={top + rowH * 4}
          stroke="#dce4e6"
        />
        <text x={left} y={238} fontSize="11" fill="#78888d">
          MIDNIGHT
        </text>
        <text
          x={left + graphW / 2}
          y={238}
          textAnchor="middle"
          fontSize="11"
          fill="#78888d"
        >
          NOON
        </text>
        <text
          x={left + graphW}
          y={238}
          textAnchor="end"
          fontSize="11"
          fill="#78888d"
        >
          MIDNIGHT
        </text>
      </svg>
    </div>
  );
}

function LogSheet({ day, index, trip, details }) {
  const onDutySegments = day.segments.filter(
    (s, i) => i > 0 && s.label !== "Off duty" && s.label !== "Driving",
  );
  return (
    <article className="log-sheet">
      <div className="log-head">
        <div>
          <span className="eyebrow">
            DRIVER'S DAILY LOG · SHEET {String(index + 1).padStart(2, "0")}
          </span>
          <h3>{dateLabel(day.date)}</h3>
        </div>
        <span className="sheet-badge">24 HOUR RECORD</span>
      </div>
      <div className="log-fields">
        <div>
          <span>FROM</span>
          <b>
            {index === 0
              ? trip.places[0].name.split(",").slice(0, 2).join(",")
              : "En route"}
          </b>
        </div>
        <div>
          <span>TO</span>
          <b>
            {index === trip.days.length - 1
              ? trip.places[2].name.split(",").slice(0, 2).join(",")
              : "En route"}
          </b>
        </div>
        <div>
          <span>TOTAL MILES DRIVING</span>
          <b>{day.miles} mi</b>
        </div>
        <div>
          <span>HOME TERMINAL TIME</span>
          <b>{trip.home_timezone || "Origin"}</b>
        </div>
        <div>
          <span>DRIVER / CARRIER</span>
          <b>
            {[details.driver, details.carrier].filter(Boolean).join(" · ") ||
              "Not provided"}
          </b>
        </div>
        <div>
          <span>VEHICLE NUMBER</span>
          <b>{details.vehicle || "Not provided"}</b>
        </div>
        <div>
          <span>MAIN OFFICE</span>
          <b>{details.office || "Not provided"}</b>
        </div>
        <div>
          <span>SHIPPING DOCUMENT</span>
          <b>{details.shipping || "Not provided"}</b>
        </div>
      </div>
      <LogGraph day={day} />
      <div className="log-bottom">
        <div>
          <span className="field-label">REMARKS & DUTY CHANGES</span>
          {onDutySegments.length ? (
            onDutySegments.map((s, i) => (
              <p key={i}>
                <strong>{shortTime(s.start)}</strong> — {s.label}
              </p>
            ))
          ) : (
            <p>No recorded stops or duty changes.</p>
          )}
        </div>
        <div className="recap">
          <span className="field-label">DAY RECAP</span>
          <div>
            <span>Driving</span>
            <b>{hours(day.totals_minutes.driving)}</b>
          </div>
          <div>
            <span>On duty, not driving</span>
            <b>{hours(day.totals_minutes.on_duty)}</b>
          </div>
          <div>
            <span>Off duty</span>
            <b>{hours(day.totals_minutes.off_duty)}</b>
          </div>
          <div className="recap-total">
            <span>Total</span>
            <b>24h</b>
          </div>
        </div>
      </div>
    </article>
  );
}

function App() {
  const [form, setForm] = useState({
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    cycle_used_hours: "0",
  });
  const [trip, setTrip] = useState(null);
  const [details, setDetails] = useState({
    driver: "",
    carrier: "",
    vehicle: "",
    office: "",
    shipping: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const logsRef = useRef(null);
  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }
  function changeDetails(e) {
    setDetails({ ...details, [e.target.name]: e.target.value });
  }
  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const start = new Date();
    const offset = -start.getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    const pad = (n) => String(Math.abs(n)).padStart(2, "0");
    const localTime = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    try {
      const response = await fetch(`${API}/api/plan/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, start_at: localTime }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to calculate this route.");
      setTrip(data);
      setTimeout(
        () =>
          document
            .querySelector("#results")
            ?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <header className="topbar">
        <div className="shell nav">
          <a href="#top" className="brand">
            <span className="brand-mark">
              <Navigation size={18} />
            </span>
            routewise<span className="brand-dot">.</span>
          </a>
          <div className="nav-right">
            <span className="nav-caption">HOURS OF SERVICE PLANNER</span>
            <span className="nav-pill">
              <span /> PLANNING TOOL
            </span>
          </div>
        </div>
      </header>
      <main id="top">
        <section className="hero">
          <div className="shell hero-inner">
            <div>
              <div className="hero-kicker">
                <span className="kicker-line" /> THE ROAD AHEAD, MADE CLEAR
              </div>
              <h1>
                Plan the route.
                <br />
                <em>Respect the clock.</em>
              </h1>
              <p>
                Turn a trip into a clear route, compliant rest plan, and daily
                duty-status logs — all in one place.
              </p>
              <div className="hero-chips">
                <span>
                  <ShieldCheck size={16} /> HOS-aware planning
                </span>
                <span>
                  <Route size={16} /> Route & stops
                </span>
                <span>
                  <Clock3 size={16} /> Daily logs
                </span>
              </div>
            </div>
            <div className="hero-decoration">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="road-line">
                <span />
                <span />
                <span />
              </div>
              <div className="hero-card">
                <span>READY FOR THE ROAD</span>
                <Truck size={46} />
                <b>70 hr / 8 day</b>
                <small>Property-carrying driver</small>
              </div>
            </div>
          </div>
        </section>
        <section className="shell workspace">
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 / TRIP DETAILS</span>
              <h2>Where are you headed?</h2>
              <p>
                Enter your route and current cycle use. We'll map out the rest.
              </p>
            </div>
          </div>
          <form className="trip-form" onSubmit={submit}>
            <div className="input-grid">
              <label>
                <span>
                  <MapPin size={17} /> Current location
                </span>
                <input
                  name="current_location"
                  value={form.current_location}
                  onChange={change}
                  placeholder="e.g. Chicago, IL"
                  required
                />
              </label>
              <label>
                <span>
                  <MapPin size={17} /> Pickup location
                </span>
                <input
                  name="pickup_location"
                  value={form.pickup_location}
                  onChange={change}
                  placeholder="e.g. Indianapolis, IN"
                  required
                />
              </label>
              <label>
                <span>
                  <MapPin size={17} /> Drop-off location
                </span>
                <input
                  name="dropoff_location"
                  value={form.dropoff_location}
                  onChange={change}
                  placeholder="e.g. Atlanta, GA"
                  required
                />
              </label>
              <label>
                <span>
                  <Clock3 size={17} /> Current cycle used
                </span>
                <div className="hours-input">
                  <input
                    name="cycle_used_hours"
                    type="number"
                    min="0"
                    max="70"
                    step="0.25"
                    value={form.cycle_used_hours}
                    onChange={change}
                    required
                  />
                  <span>hours / 70</span>
                </div>
              </label>
            </div>
            <details className="extra-fields">
              <summary>
                Optional log-sheet details{" "}
                <span>Driver, vehicle and carrier</span>
              </summary>
              <div className="input-grid">
                <label>
                  <span>Driver name</span>
                  <input
                    name="driver"
                    value={details.driver}
                    onChange={changeDetails}
                    placeholder="e.g. John Doe"
                  />
                </label>
                <label>
                  <span>Carrier name</span>
                  <input
                    name="carrier"
                    value={details.carrier}
                    onChange={changeDetails}
                    placeholder="Company name"
                  />
                </label>
                <label>
                  <span>Vehicle number</span>
                  <input
                    name="vehicle"
                    value={details.vehicle}
                    onChange={changeDetails}
                    placeholder="Truck / trailer ID"
                  />
                </label>
                <label>
                  <span>Main office</span>
                  <input
                    name="office"
                    value={details.office}
                    onChange={changeDetails}
                    placeholder="City, state"
                  />
                </label>
                <label>
                  <span>Shipping document</span>
                  <input
                    name="shipping"
                    value={details.shipping}
                    onChange={changeDetails}
                    placeholder="Reference number"
                  />
                </label>
              </div>
            </details>
            <div className="form-footer">
              <span>
                US locations · property-carrying · 70 hr / 8 day cycle
              </span>
              <button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle size={18} className="spin" /> Planning your
                    trip
                  </>
                ) : (
                  <>
                    Generate trip plan <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
          </form>
          {trip && (
            <section id="results" className="results">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">02 / YOUR ROUTE</span>
                  <h2>Trip overview</h2>
                  <p>Estimated route, rest periods, and duty changes.</p>
                </div>
                <button
                  className="subtle-button"
                  onClick={() =>
                    logsRef.current?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  View daily logs <ArrowRight size={16} />
                </button>
              </div>
              <div className="summary-grid">
                <div>
                  <span>TOTAL DISTANCE</span>
                  <b>
                    {trip.distance_miles.toLocaleString()} <small>miles</small>
                  </b>
                </div>
                <div>
                  <span>ESTIMATED ARRIVAL</span>
                  <b>{fullTime(trip.arrival)}</b>
                </div>
                <div>
                  <span>REST & BREAKS</span>
                  <b>
                    {
                      trip.stops.filter((s) =>
                        ["rest", "restart", "break"].includes(s.type),
                      ).length
                    }{" "}
                    <small>planned</small>
                  </b>
                </div>
                <div>
                  <span>LOG SHEETS</span>
                  <b>
                    {trip.days.length} <small>days</small>
                  </b>
                </div>
              </div>
              <div className="route-layout">
                <div className="map-card">
                  <div className="card-header">
                    <div>
                      <span className="eyebrow">LIVE ROUTE</span>
                      <h3>On the map</h3>
                    </div>
                    <span className="live-badge">
                      <span /> ROUTE PREVIEW
                    </span>
                  </div>
                  <RouteMap trip={trip} />
                  <div className="map-caption">
                    Markers show approximate route positions; verify safe, legal
                    places to stop.
                  </div>
                </div>
                <div className="timeline-card">
                  <div className="card-header">
                    <div>
                      <span className="eyebrow">STOP-BY-STOP</span>
                      <h3>Trip timeline</h3>
                    </div>
                    <span className="stop-count">
                      {trip.stops.length} stops
                    </span>
                  </div>
                  <div className="timeline">
                    {trip.stops.map((stop, index) => (
                      <div className="stop" key={index}>
                        <span className={`stop-icon ${stop.type}`}>
                          {stop.type === "fuel" ? (
                            <Fuel size={16} />
                          ) : stop.type === "rest" ||
                            stop.type === "restart" ? (
                            <Moon size={16} />
                          ) : (
                            <MapPin size={16} />
                          )}
                        </span>
                        <div>
                          <strong>{stop.label}</strong>
                          <small>
                            {fullTime(stop.time)} · mile {stop.mile}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="assumptions">
                <AlertCircle size={18} />
                <div>
                  <b>Planning assumptions</b>
                  <p>
                    {trip.assumptions.join(" ")} This is a trip-planning
                    demonstration, not an official ELD or certified compliance
                    record.
                  </p>
                </div>
              </div>
            </section>
          )}
          {trip && (
            <section className="logs-section" ref={logsRef}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">03 / DUTY RECORDS</span>
                  <h2>Daily log sheets</h2>
                  <p>One 24-hour grid for each calendar day of your trip.</p>
                </div>
                <button
                  className="subtle-button"
                  onClick={() => window.print()}
                >
                  <Download size={16} /> Print logs
                </button>
              </div>
              <div className="logs">
                {trip.days.map((day, index) => (
                  <LogSheet
                    day={day}
                    trip={trip}
                    details={details}
                    index={index}
                    key={day.date}
                  />
                ))}
              </div>
            </section>
          )}
          {!trip && (
            <div className="empty-note">
              <div className="empty-icon">
                <Route size={28} />
              </div>
              <h3>Your route starts here</h3>
              <p>
                Enter your trip details above to see a route map, planned stops,
                and daily log sheets.
              </p>
            </div>
          )}
        </section>
      </main>
      <footer>
        <div className="shell footer-inner">
          <a href="#top" className="brand">
            <span className="brand-mark">
              <Navigation size={17} />
            </span>
            routewise<span className="brand-dot">.</span>
          </a>
          <span>Made for better planning, not legal certification.</span>
          <span>© OpenStreetMap contributors</span>
        </div>
      </footer>
    </>
  );
}

export default App;
