import { useEffect, useState } from 'react';
import { api } from './api';
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Car,
  Clock3,
  ShieldCheck,
  Star,
  ChevronRight,
  LayoutDashboard,
  History,
  SlidersHorizontal,
  Users,
  Wallet,
  Navigation,
  Check,
  X,
  RefreshCw,
  CircleHelp,
  Download,
  Menu,
} from 'lucide-react';
import { PLACES, CARS, fareFor } from '../shared/domain';

type State = ReturnType<typeof import('../shared/domain').initialState>;
type SavedSession = { id: string; token: string };
let startPromise: Promise<any> | null = null;
function startDemo() {
  if (!startPromise)
    startPromise = (async () => {
      let saved: SavedSession | null = null;
      try {
        saved = JSON.parse(localStorage.getItem('dropin-session') || 'null');
      } catch {
        /* Start fresh if local data is invalid. */
      }
      if (saved) {
        const { data } = await api.post('/api/state', saved);
        return { ...data, session: saved };
      }
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const { data } = await api.post('/api/sessions', { token });
      const session = { id: data.id, token };
      localStorage.setItem('dropin-session', JSON.stringify(session));
      return { ...data, session };
    })().catch(e => {
      startPromise = null;
      throw e;
    });
  return startPromise;
}
const money = (n: number) => 'GH₵ ' + Number(n || 0).toFixed(2);
const placeName = (id: string) => PLACES.find(p => p.id === id)?.name || id;
const labels: Record<string, string> = {
  searching: 'Finding a driver',
  offered: 'Waiting for driver',
  accepted: 'Driver on the way',
  arrived: 'Driver has arrived',
  in_progress: 'On your way',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled',
};
function saveText(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function MapIllustration({ city, active }: { city: string; active: boolean }) {
  return (
    <div className="map" aria-label={'Illustrative map of ' + city}>
      <svg
        viewBox="0 0 820 570"
        role="img"
        aria-label="Schematic route illustration, not live navigation"
      >
        <defs>
          <pattern
            id="blocks"
            width="140"
            height="120"
            patternUnits="userSpaceOnUse"
          >
            <rect width="140" height="120" fill="#f0f1e9" />
            <rect x="13" y="12" width="110" height="88" rx="8" fill="#e6e9df" />
            <path d="M0 110H140M132 0V120" stroke="#fff" strokeWidth="12" />
          </pattern>
          <filter id="shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity=".12" />
          </filter>
        </defs>
        <rect width="820" height="570" fill="url(#blocks)" />
        <path
          d="M650 -30C580 100 730 190 695 310S760 485 730 620"
          stroke="#cae4e2"
          strokeWidth="90"
          fill="none"
        />
        <path
          d="M-30 380C150 315 240 355 360 230S590 70 830 135"
          stroke="#d9ddcf"
          strokeWidth="35"
          fill="none"
        />
        <path
          d="M-30 380C150 315 240 355 360 230S590 70 830 135"
          stroke="#fff"
          strokeWidth="24"
          fill="none"
        />
        <path
          d="M230 -30L275 200 460 430 495 610M-30 180L260 185 535 350 830 360"
          stroke="#fff"
          strokeWidth="20"
          fill="none"
        />
        <rect x="70" y="25" width="130" height="83" rx="25" fill="#d4e2c5" />
        <rect x="490" y="205" width="104" height="98" rx="26" fill="#d4e2c5" />
        <rect x="98" y="417" width="135" height="85" rx="25" fill="#d4e2c5" />
        <g
          fill="#8b9687"
          fontSize="11"
          fontFamily="sans-serif"
          letterSpacing="2"
        >
          <text x="72" y="159">
            NORTH RIDGE
          </text>
          <text x="441" y="79">
            AIRPORT AREA
          </text>
          <text x="392" y="500">
            CITY CENTRE
          </text>
          <text x="125" y="468">
            GREEN SPACE
          </text>
        </g>
        <path
          d="M350 155L350 230Q350 248 368 258L444 303Q461 312 461 332L461 399"
          stroke="#234b39"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <circle
          cx="350"
          cy="155"
          r="15"
          fill="#fff"
          stroke="#234b39"
          strokeWidth="6"
        />
        <circle
          cx="461"
          cy="399"
          r="15"
          fill="#234b39"
          stroke="#fff"
          strokeWidth="5"
        />
        <g filter="url(#shadow)">
          <rect x="250" y="103" width="201" height="36" rx="12" fill="#fff" />
          <text
            x="265"
            y="126"
            fill="#254437"
            fontSize="12"
            fontFamily="sans-serif"
          >
            Your pickup location
          </text>
        </g>
        <g transform="translate(355 277) rotate(30)" filter="url(#shadow)">
          <rect
            x="-16"
            y="-24"
            width="32"
            height="48"
            rx="10"
            fill="#fff"
            stroke="#355d47"
            strokeWidth="2"
          />
          <rect x="-11" y="-10" width="22" height="14" rx="3" fill="#b6d2c4" />
          <path
            d="M-17 -15V-7M17 -15V-7M-17 11V19M17 11V19"
            stroke="#163d2c"
            strokeWidth="4"
          />
        </g>
        <g transform="translate(184 290) rotate(-65)">
          <rect
            x="-13"
            y="-21"
            width="26"
            height="42"
            rx="8"
            fill="#fff"
            stroke="#63806b"
            strokeWidth="2"
          />
          <rect x="-8" y="-10" width="16" height="13" rx="3" fill="#c2d6cb" />
        </g>
        <g transform="translate(520 150) rotate(90)">
          <rect
            x="-13"
            y="-21"
            width="26"
            height="42"
            rx="8"
            fill="#fff"
            stroke="#63806b"
            strokeWidth="2"
          />
          <rect x="-8" y="-10" width="16" height="13" rx="3" fill="#c2d6cb" />
        </g>
      </svg>
      <div className="map-tag">
        <span className="dot" /> {city} ·{' '}
        {active ? 'Your demo route' : 'Explore your city'}
      </div>
      <div className="map-caption">
        Illustrative map · demo vehicles · no GPS tracking
      </div>
      <div className="map-info">
        <div className="round-icon">
          <ShieldCheck size={22} />
        </div>
        <div>
          <strong>A better way to move.</strong>
          <p>Built for everyday journeys in Ghana.</p>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [session, setSession] = useState<SavedSession | null>(null);
  const [role, setRole] = useState('passenger');
  const [page, setPage] = useState('book');
  const [city, setCity] = useState('Accra');
  const [pickup, setPickup] = useState('accra-mall');
  const [dropoff, setDropoff] = useState('osu');
  const [type, setType] = useState('standard');
  const [driverId, setDriverId] = useState('kwame');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [fareDraft, setFareDraft] = useState<any>(null);
  const [application, setApplication] = useState({
    name: '',
    vehicle: '',
    city: 'Accra',
  });
  function load() {
    setErr('');
    startDemo()
      .then(data => {
        setState(data.state);
        setSession(data.session);
        setFareDraft(data.state.settings);
      })
      .catch(e =>
        setErr(
          e?.response?.data?.error ||
            e.message ||
            'Could not connect. Try again.'
        )
      );
  }
  useEffect(() => {
    load();
  }, []);
  async function command(c: any, success = '') {
    if (!session) return;
    setBusy(true);
    setErr('');
    setMessage('');
    try {
      const { data } = await api.post('/api/command', {
        ...session,
        command: c,
      });
      setState(data.state);
      setMessage(success);
    } catch (e: any) {
      setErr(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          e.message ||
          'Could not save. Please retry.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!session) return;
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post('/api/state', session);
      setState(data.state);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }
  function changeCity(value: string) {
    const places = PLACES.filter(p => p.city === value);
    setCity(value);
    setPickup(places[0].id);
    setDropoff(places[1].id);
  }
  function changeRole(value: string) {
    setRole(value);
    setPage(
      value === 'passenger' ? 'book' : value === 'driver' ? 'trips' : 'overview'
    );
    setMenu(false);
    setMessage('');
    setErr('');
  }
  const rides: any[] = state?.rides || [];
  const drivers: any[] = state?.drivers || [];
  const active = rides.find(
    r => !['completed', 'cancelled'].includes(r.status)
  );
  const driver = drivers.find(d => d.id === driverId);
  const driverTrip = rides.find(
    r =>
      r.driverId === driverId && !['completed', 'cancelled'].includes(r.status)
  );
  const completed = rides.filter(r => r.status === 'completed');
  let quote: any = null;
  try {
    if (state) quote = fareFor(pickup, dropoff, type, state.settings);
  } catch {
    /* Display form guardrail below. */
  }
  const nav =
    role === 'passenger'
      ? [
          { id: 'book', title: 'Book a ride', icon: Navigation },
          { id: 'history', title: 'My rides', icon: History },
          { id: 'join', title: 'Drive with DropIn', icon: Car },
        ]
      : role === 'driver'
        ? [
            { id: 'trips', title: 'Trip requests', icon: Navigation },
            { id: 'earnings', title: 'Earnings', icon: Wallet },
            { id: 'history', title: 'Trip history', icon: History },
          ]
        : [
            { id: 'overview', title: 'Overview', icon: LayoutDashboard },
            { id: 'rides', title: 'Ride management', icon: Navigation },
            { id: 'drivers', title: 'Drivers & applicants', icon: Users },
            { id: 'fares', title: 'Fare settings', icon: SlidersHorizontal },
          ];
  function receipt(r: any) {
    saveText(
      r.id + '-receipt.txt',
      [
        'DROPIN GHANA — DEMO RECEIPT',
        r.id,
        new Date(r.createdAt).toLocaleString(),
        placeName(r.pickup) + ' → ' + placeName(r.dropoff),
        labels[r.status],
        'Estimated distance: ' + r.km + ' km',
        'Fare: ' + money(r.fare),
        'Payment: cash (simulation; no money collected)',
        'Driver: ' +
          (drivers.find(d => d.id === r.driverId)?.name || 'Unassigned'),
        'Thank you for riding with DropIn.',
      ].join('\n')
    );
  }
  function rideList(list: any[]) {
    return (
      <div className="panel">
        <div className="panel-top">
          <h3>Trip records</h3>
          <span className="muted">{list.length} trips</span>
        </div>
        {!list.length ? (
          <div className="empty">
            <History size={32} />
            <h3>Your journey starts here</h3>
            <p>Completed and cancelled rides will appear here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ride / route</th>
                  <th>Status</th>
                  <th>Fare</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.id}</strong>
                      <small>
                        {placeName(r.pickup)} → {placeName(r.dropoff)}
                      </small>
                    </td>
                    <td>
                      <span className={'badge ' + r.status}>
                        {labels[r.status]}
                      </span>
                    </td>
                    <td>{money(r.fare)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={'Download receipt ' + r.id}
                        onClick={() => receipt(r)}
                      >
                        <Download size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  function activeCard(r: any) {
    const d = drivers.find(d => d.id === r.driverId);
    return (
      <div className="panel active-ride">
        <span className="eyebrow">YOUR CURRENT RIDE · {r.id}</span>
        <h2>{labels[r.status]}</h2>
        <div className="trip-line">
          <span className="dot" />
          <strong>{placeName(r.pickup)}</strong>
          <ArrowRight size={16} />
          <strong>{placeName(r.dropoff)}</strong>
        </div>
        <div className="driver-detail">
          <div className="avatar">
            {d?.name
              .split(' ')
              .map((n: string) => n[0])
              .join('') || '?'}
          </div>
          <div>
            <strong>{d?.name || 'Looking for a matching driver'}</strong>
            <p>
              {d
                ? d.vehicle + ' · ' + d.plate
                : 'Try another car type or set a driver online.'}
            </p>
            {d && (
              <small>
                <Star size={12} fill="currentColor" /> {d.rating} · Demo driver
              </small>
            )}
          </div>
          <strong className="price">{money(r.fare)}</strong>
        </div>
        <p className="hint">
          Open the Driver view to accept and progress this demo trip. Status
          updates are manual.
        </p>
        <div className="button-row">
          {r.status === 'searching' && (
            <button
              disabled={busy}
              className="primary"
              onClick={() => command({ action: 'dispatch', id: r.id })}
            >
              Find driver again
            </button>
          )}
          {['searching', 'offered', 'accepted', 'arrived'].includes(
            r.status
          ) && (
            <button className="secondary" onClick={() => setCancelId(r.id)}>
              Cancel ride
            </button>
          )}
          <button className="text-button" disabled={busy} onClick={refresh}>
            <RefreshCw size={15} />
            Refresh status
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <header>
        <button
          className="mobile-menu icon-button"
          aria-label="Open menu"
          onClick={() => setMenu(!menu)}
        >
          <Menu size={22} />
        </button>
        <a className="brand" href="#">
          <span className="brand-symbol">
            d<span>•</span>
          </span>
          <span>
            dropin<span className="brand-country">GHANA</span>
          </span>
        </a>
        <div className="role-tabs" aria-label="App views">
          {['passenger', 'driver', 'admin'].map(r => (
            <button
              key={r}
              className={role === r ? 'selected' : ''}
              onClick={() => changeRole(r)}
            >
              {r === 'passenger'
                ? 'Passenger'
                : r === 'driver'
                  ? 'Driver'
                  : 'Admin'}
            </button>
          ))}
        </div>
        <div className="header-right">
          <span className="demo-tag">
            <span className="dot" /> Demo workspace
          </span>
          <button
            className="icon-button"
            aria-label="Help and service status"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <div className="avatar small">DO</div>
        </div>
      </header>
      <aside className={menu ? 'open' : ''}>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map(item => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => {
                setPage(item.id);
                setMenu(false);
              }}
            >
              <item.icon size={19} />
              {item.title}
              {page === item.id && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="ghana-stripe" />
          <h3>
            Made for the way
            <br />
            Ghana moves.
          </h3>
          <p>
            From early starts to
            <br />
            the last mile home.
          </p>
          <button
            onClick={() => {
              changeRole('passenger');
              setPage('join');
            }}
          >
            Become a driver <ArrowUpRight size={16} />
          </button>
        </div>
        <button
          className="reset text-button"
          onClick={() => {
            localStorage.removeItem('dropin-session');
            startPromise = null;
            setState(null);
            setSession(null);
            load();
          }}
        >
          Start a new demo
        </button>
      </aside>
      <main>
        <div className="demo-notice">
          <ShieldCheck size={16} />
          <span>
            Try the full ride experience. Demo drivers, estimated fares and
            simulated cash payments. Live services are not connected.
          </span>
          <button onClick={() => setHelp(true)}>
            Service status <ArrowUpRight size={14} />
          </button>
        </div>
        {err && (
          <div role="alert" className="alert error">
            {err}
            <button aria-label="Dismiss error" onClick={() => setErr('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {message && (
          <div role="status" className="alert success">
            <Check size={16} />
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {!state ? (
          <div className="empty">
            <h2>{err ? 'Let’s reconnect' : 'Getting your workspace ready…'}</h2>
            <button className="primary" onClick={load}>
              Retry connection
            </button>
          </div>
        ) : (
          <>
            {role === 'passenger' && page === 'book' && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      A GOOD DAY STARTS WITH A GOOD RIDE
                    </span>
                    <h1>Where are we heading?</h1>
                    <p>Your city. Your plans. A ride that fits.</p>
                  </div>
                  <label className="city-picker">
                    <MapPin size={16} />
                    <select
                      aria-label="Service city"
                      value={city}
                      onChange={e => changeCity(e.target.value)}
                    >
                      {['Accra', 'Kumasi', 'Tamale', 'Tarkwa'].map(c => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="booking-grid">
                  <section className="booking-panel">
                    {active ? (
                      activeCard(active)
                    ) : (
                      <>
                        <div className="form-head">
                          <h3>Plan your ride</h3>
                          <span className="badge soft">Ride now</span>
                        </div>
                        <div className="route-inputs">
                          <label>
                            <span className="route-dot" />
                            <div>
                              <span>PICKUP LOCATION</span>
                              <select
                                aria-label="Pickup location"
                                value={pickup}
                                onChange={e => setPickup(e.target.value)}
                              >
                                {PLACES.filter(p => p.city === city).map(p => (
                                  <option value={p.id} key={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </label>
                          <div className="connector" />
                          <label>
                            <span className="route-square" />
                            <div>
                              <span>WHERE TO?</span>
                              <select
                                aria-label="Destination"
                                value={dropoff}
                                onChange={e => setDropoff(e.target.value)}
                              >
                                {PLACES.filter(p => p.city === city).map(p => (
                                  <option value={p.id} key={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </label>
                        </div>
                        <div className="section-title">
                          <h4>Choose your ride</h4>
                          <span>Upfront estimates</span>
                        </div>
                        <div className="car-options">
                          {CARS.map(c => {
                            let q: any = null;
                            try {
                              q = fareFor(
                                pickup,
                                dropoff,
                                c.id,
                                state.settings
                              );
                            } catch {}
                            return (
                              <button
                                key={c.id}
                                onClick={() => setType(c.id)}
                                className={
                                  'car-option ' +
                                  (type === c.id ? 'chosen' : '')
                                }
                              >
                                <div className={'car-drawing ' + c.id}>
                                  <Car size={36} />
                                </div>
                                <div className="car-copy">
                                  <strong>{c.title}</strong>
                                  <span>{c.description}</span>
                                  <small>
                                    <Users size={11} /> {c.seats} seats
                                  </small>
                                </div>
                                <div className="car-price">
                                  <strong>{q ? money(q.fare) : '—'}</strong>
                                  <span>estimated fare</span>
                                </div>
                                <div className="radio">
                                  {type === c.id && <span />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="payment">
                          <Wallet size={18} />
                          <div>
                            <strong>Cash</strong>
                            <span>
                              Simulated payment · MoMo coming after setup
                            </span>
                          </div>
                          <Check size={17} />
                        </div>
                        {quote ? (
                          <div className="estimate">
                            <Clock3 size={14} />
                            {quote.minutes} min estimated trip<span>·</span>
                            {quote.km} km estimated
                          </div>
                        ) : (
                          <p className="validation">
                            Choose different pickup and destination locations.
                          </p>
                        )}
                        <button
                          disabled={busy || !quote}
                          className="primary book-button"
                          onClick={() =>
                            command(
                              {
                                action: 'book',
                                pickup,
                                dropoff,
                                type,
                                payment: 'cash',
                              },
                              'Ride requested. Switch to Driver to accept the request.'
                            )
                          }
                        >
                          <span>
                            {busy
                              ? 'Requesting…'
                              : 'Request ' +
                                (CARS.find(c => c.id === type)?.title ||
                                  'ride')}
                          </span>
                          <ArrowRight size={19} />
                        </button>
                        <p className="fine-print">
                          No real booking or payment. Demo route distance is
                          approximate.
                        </p>
                      </>
                    )}
                  </section>
                  <MapIllustration
                    city={
                      active
                        ? PLACES.find(p => p.id === active.pickup)!.city
                        : city
                    }
                    active={!!active}
                  />
                </div>
                {!active && completed[0] && !completed[0].rating && (
                  <div className="panel rating">
                    <div>
                      <strong>How was your last ride?</strong>
                      <p>
                        {completed[0].id} · {placeName(completed[0].dropoff)}
                      </p>
                    </div>
                    <div>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          aria-label={'Rate ' + n + ' stars'}
                          disabled={busy}
                          onClick={() =>
                            command(
                              {
                                action: 'rate',
                                id: completed[0].id,
                                rating: n,
                              },
                              'Thanks for your feedback.'
                            )
                          }
                        >
                          <Star size={24} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="benefits">
                  <div>
                    <ShieldCheck size={23} />
                    <div>
                      <strong>Safety comes first</strong>
                      <p>Driver verification required before launch</p>
                    </div>
                  </div>
                  <div>
                    <Wallet size={23} />
                    <div>
                      <strong>Know your fare</strong>
                      <p>See your estimate before you request</p>
                    </div>
                  </div>
                  <div>
                    <MapPin size={23} />
                    <div>
                      <strong>Local at heart</strong>
                      <p>Designed for journeys across Ghana</p>
                    </div>
                  </div>
                </div>
              </>
            )}
            {page === 'history' && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">EVERY JOURNEY IN ONE PLACE</span>
                    <h1>
                      {role === 'driver' ? 'Your trip history' : 'Your rides'}
                    </h1>
                    <p>Trip details and downloadable demo receipts.</p>
                  </div>
                </div>
                {rideList(
                  role === 'driver'
                    ? rides.filter(r => r.driverId === driverId)
                    : rides
                )}
              </>
            )}
            {role === 'passenger' && page === 'join' && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">A NEW WAY TO EARN</span>
                    <h1>Your car. Your schedule.</h1>
                    <p>Explore driving with DropIn Ghana.</p>
                  </div>
                </div>
                <div className="two-col">
                  <div className="join-hero">
                    <Car size={72} />
                    <h2>
                      Move your community
                      <br />
                      forward.
                    </h2>
                    <p>
                      Flexible hours. Transparent commission. A local platform
                      with you at the centre.
                    </p>
                    <ul>
                      <li>Valid driving licence and verified identity</li>
                      <li>Roadworthy vehicle and insurance</li>
                      <li>Vehicle inspection and onboarding</li>
                    </ul>
                    <span className="badge soft">Demo recruitment only</span>
                  </div>
                  <form
                    className="panel form-panel"
                    onSubmit={async e => {
                      e.preventDefault();
                      await command(
                        { action: 'apply', ...application },
                        'Demo application submitted. Review it in Admin → Drivers & applicants.'
                      );
                    }}
                  >
                    <h3>Try a driver application</h3>
                    <p className="muted">
                      Use sample details only. No real recruitment is active.
                    </p>
                    <label>
                      Sample driver name
                      <input
                        required
                        minLength={2}
                        maxLength={60}
                        value={application.name}
                        onChange={e =>
                          setApplication({
                            ...application,
                            name: e.target.value,
                          })
                        }
                        placeholder="e.g. Demo Driver"
                      />
                    </label>
                    <label>
                      Vehicle make and model
                      <input
                        required
                        minLength={2}
                        maxLength={60}
                        value={application.vehicle}
                        onChange={e =>
                          setApplication({
                            ...application,
                            vehicle: e.target.value,
                          })
                        }
                        placeholder="e.g. Toyota Corolla"
                      />
                    </label>
                    <label>
                      City
                      <select
                        value={application.city}
                        onChange={e =>
                          setApplication({
                            ...application,
                            city: e.target.value,
                          })
                        }
                      >
                        {['Accra', 'Kumasi', 'Tamale', 'Tarkwa'].map(c => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <button className="primary" disabled={busy}>
                      Submit demo application <ArrowRight size={17} />
                    </button>
                  </form>
                </div>
              </>
            )}
            {role === 'driver' && (
              <>
                {page !== 'history' && (
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">DRIVER WORKSPACE</span>
                      <h1>
                        {page === 'earnings'
                          ? 'Make every trip count.'
                          : 'Ready for your next trip?'}
                      </h1>
                      <p>Accept requests and manage your demo journey.</p>
                    </div>
                    <label className="driver-select">
                      Demo driver
                      <select
                        aria-label="Select demo driver"
                        value={driverId}
                        onChange={e => setDriverId(e.target.value)}
                      >
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {page === 'trips' && (
                  <>
                    <div className="panel driver-bar">
                      <div className="avatar">{driver?.name?.slice(0, 1)}</div>
                      <div>
                        <strong>{driver?.name}</strong>
                        <p>
                          {driver?.vehicle} · {driver?.city}
                        </p>
                      </div>
                      <span
                        className={
                          'badge ' + (driver?.online ? 'completed' : '')
                        }
                      >
                        {driver?.online ? 'Online' : 'Offline'}
                      </span>
                      <button
                        className="secondary"
                        disabled={busy || !!driverTrip}
                        onClick={() =>
                          command({
                            action: 'availability',
                            id: driverId,
                            online: !driver?.online,
                          })
                        }
                      >
                        {driver?.online ? 'Go offline' : 'Go online'}
                      </button>
                    </div>
                    {driverTrip ? (
                      <div className="panel form-panel">
                        <span className="eyebrow">
                          {driverTrip.id} · DEMO REQUEST
                        </span>
                        <h2>{labels[driverTrip.status]}</h2>
                        <div className="route-summary">
                          <MapPin />
                          <div>
                            <strong>{placeName(driverTrip.pickup)}</strong>
                            <p>to {placeName(driverTrip.dropoff)}</p>
                          </div>
                          <strong className="price">
                            {money(driverTrip.fare)}
                          </strong>
                        </div>
                        <div className="trip-stages">
                          {[
                            'offered',
                            'accepted',
                            'arrived',
                            'in_progress',
                            'completed',
                          ].map((s, i) => (
                            <div
                              key={s}
                              className={
                                i <=
                                [
                                  'offered',
                                  'accepted',
                                  'arrived',
                                  'in_progress',
                                  'completed',
                                ].indexOf(driverTrip.status)
                                  ? 'done'
                                  : ''
                              }
                            >
                              <span>{i + 1}</span>
                              {
                                [
                                  'Request',
                                  'Accepted',
                                  'Pickup',
                                  'On trip',
                                  'Complete',
                                ][i]
                              }
                            </div>
                          ))}
                        </div>
                        <p className="hint">
                          Demo only. Confirm each step to progress the
                          passenger’s ride status.
                        </p>
                        <div className="button-row">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              command(
                                {
                                  action: 'ride',
                                  id: driverTrip.id,
                                  driverId,
                                  status: (
                                    {
                                      offered: 'accepted',
                                      accepted: 'arrived',
                                      arrived: 'in_progress',
                                      in_progress: 'completed',
                                    } as any
                                  )[driverTrip.status],
                                },
                                driverTrip.status === 'in_progress'
                                  ? 'Trip completed. Demo earnings recorded.'
                                  : 'Ride status updated.'
                              )
                            }
                          >
                            {
                              (
                                {
                                  offered: 'Accept ride',
                                  accepted: 'Arrived at pickup',
                                  arrived: 'Start trip',
                                  in_progress: 'Complete trip',
                                } as any
                              )[driverTrip.status]
                            }
                            <ArrowRight size={17} />
                          </button>
                          {['offered', 'accepted', 'arrived'].includes(
                            driverTrip.status
                          ) && (
                            <button
                              className="secondary"
                              onClick={() => setCancelId(driverTrip.id)}
                            >
                              Cancel ride
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="panel empty">
                        <Navigation size={38} />
                        <h2>
                          {driver?.online
                            ? 'You’re ready to roll.'
                            : 'You’re currently offline.'}
                        </h2>
                        <p>
                          No assigned ride. Request a matching ride from the
                          Passenger view.
                          <br />
                          Vehicle category:{' '}
                          {CARS.find(c => c.id === driver?.type)?.title} ·{' '}
                          {driver?.city}
                        </p>
                        <button className="secondary" onClick={refresh}>
                          Refresh requests
                        </button>
                      </div>
                    )}
                  </>
                )}
                {page === 'earnings' && (
                  <>
                    <div className="stats">
                      <div>
                        <span>Net demo earnings</span>
                        <strong>
                          {money(
                            completed
                              .filter(r => r.driverId === driverId)
                              .reduce((s, r) => s + r.driverEarnings, 0)
                          )}
                        </strong>
                        <small>After the trip’s recorded commission</small>
                      </div>
                      <div>
                        <span>Completed trips</span>
                        <strong>
                          {
                            completed.filter(r => r.driverId === driverId)
                              .length
                          }
                        </strong>
                        <small>Across this demo workspace</small>
                      </div>
                      <div>
                        <span>Current commission</span>
                        <strong>{state.settings.commission}%</strong>
                        <small>Applies to newly requested rides</small>
                      </div>
                    </div>
                    {rideList(completed.filter(r => r.driverId === driverId))}
                    <p className="fine-print">
                      Earnings are simulated ledger entries. No payout or
                      payment processing.
                    </p>
                  </>
                )}
              </>
            )}
            {role === 'admin' && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">OPERATIONS · DEMO WORKSPACE</span>
                    <h1>
                      {
                        (
                          {
                            overview: 'Keep Ghana moving.',
                            rides: 'Every ride, in view.',
                            drivers: 'The people behind the wheel.',
                            fares: 'Clear fares. Fair journeys.',
                          } as any
                        )[page]
                      }
                    </h1>
                    <p>
                      Demo administration. Live admin access requires a
                      configured allowlist.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={refresh}
                  >
                    <RefreshCw size={15} />
                    Refresh
                  </button>
                </div>
                {page === 'overview' && (
                  <>
                    <div className="stats">
                      <div>
                        <span>Completed rides</span>
                        <strong>{completed.length}</strong>
                        <small>{rides.length} total demo requests</small>
                      </div>
                      <div>
                        <span>Gross demo fares</span>
                        <strong>
                          {money(completed.reduce((s, r) => s + r.fare, 0))}
                        </strong>
                        <small>Cash simulation only</small>
                      </div>
                      <div>
                        <span>Drivers online</span>
                        <strong>
                          {drivers.filter(d => d.online).length}
                          <em> / {drivers.length}</em>
                        </strong>
                        <small>Across four service cities</small>
                      </div>
                    </div>
                    <div className="two-col">
                      <div className="panel">
                        <div className="panel-top">
                          <h3>Live demo activity</h3>
                          <span className="badge soft">This workspace</span>
                        </div>
                        {active ? (
                          <div className="activity">
                            <span className="dot" />
                            <div>
                              <strong>
                                {active.id} · {labels[active.status]}
                              </strong>
                              <p>
                                {placeName(active.pickup)} →{' '}
                                {placeName(active.dropoff)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="empty">
                            <Navigation size={26} />
                            <p>
                              No active rides. Book a ride to see operations in
                              action.
                            </p>
                          </div>
                        )}
                        <button
                          className="text-button"
                          onClick={() => setPage('rides')}
                        >
                          View ride management <ArrowRight size={15} />
                        </button>
                      </div>
                      <div className="panel launch-panel">
                        <ShieldCheck size={25} />
                        <h3>Before your first live ride</h3>
                        <p>
                          Firebase, routing, approved drivers, payment
                          verification and WhatsApp are awaiting configuration.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setHelp(true)}
                        >
                          View service status <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </div>
                    {rideList(rides.slice(0, 5))}
                  </>
                )}
                {page === 'rides' && (
                  <>
                    {active && activeCard(active)}
                    {rideList(rides)}
                    <button
                      className="secondary export"
                      onClick={() =>
                        saveText(
                          'dropin-demo-rides.csv',
                          [
                            'id,pickup,dropoff,status,fare',
                            ...rides.map(r =>
                              [
                                r.id,
                                r.pickup,
                                r.dropoff,
                                r.status,
                                r.fare,
                              ].join(',')
                            ),
                          ].join('\n'),
                          'text/csv'
                        )
                      }
                    >
                      Export demo rides <Download size={16} />
                    </button>
                  </>
                )}
                {page === 'drivers' && (
                  <>
                    <div className="panel">
                      <div className="panel-top">
                        <h3>Driver applications</h3>
                        <span>
                          {
                            state.applications.filter(
                              (a: any) => a.status === 'pending'
                            ).length
                          }{' '}
                          pending
                        </span>
                      </div>
                      {!state.applications.length ? (
                        <div className="empty">
                          <p>
                            No applications. Try the form in Passenger → Drive
                            with DropIn.
                          </p>
                        </div>
                      ) : (
                        state.applications.map((a: any) => (
                          <div className="application-row" key={a.id}>
                            <div>
                              <strong>{a.name}</strong>
                              <p>
                                {a.vehicle} · {a.city}
                              </p>
                            </div>
                            <span className="badge">{a.status}</span>
                            {a.status === 'pending' && (
                              <div className="button-row">
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    command(
                                      {
                                        action: 'approve',
                                        id: a.id,
                                        approve: true,
                                      },
                                      'Demo driver approved. They start offline.'
                                    )
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    command(
                                      {
                                        action: 'approve',
                                        id: a.id,
                                        approve: false,
                                      },
                                      'Demo application rejected.'
                                    )
                                  }
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="panel">
                      <div className="panel-top">
                        <h3>Demo driver roster</h3>
                        <span>{drivers.length} drivers</span>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Driver</th>
                              <th>Vehicle</th>
                              <th>City</th>
                              <th>Availability</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drivers.map(d => (
                              <tr key={d.id}>
                                <td>
                                  <strong>{d.name}</strong>
                                  <small>{d.plate}</small>
                                </td>
                                <td>
                                  {d.vehicle}
                                  <small>
                                    {CARS.find(c => c.id === d.type)?.title}
                                  </small>
                                </td>
                                <td>{d.city}</td>
                                <td>
                                  <button
                                    className={
                                      'badge availability ' +
                                      (d.online ? 'completed' : '')
                                    }
                                    disabled={busy}
                                    onClick={() =>
                                      command({
                                        action: 'availability',
                                        id: d.id,
                                        online: !d.online,
                                      })
                                    }
                                  >
                                    {d.online ? 'Online' : 'Offline'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="fine-print">
                      Demo approval is a workflow preview; it does not verify a
                      driver’s identity or documents.
                    </p>
                  </>
                )}
                {page === 'fares' && (
                  <form
                    className="panel form-panel fares"
                    onSubmit={e => {
                      e.preventDefault();
                      command(
                        { action: 'settings', settings: fareDraft },
                        'Fare settings saved. Existing rides keep their original fare.'
                      );
                    }}
                  >
                    <h3>Set your demo pricing</h3>
                    <p className="muted">
                      Estimates use approximate distance × 1.35, not a routing
                      provider. Applies to new bookings.
                    </p>
                    {[
                      {
                        key: 'base',
                        label: 'Base fare (GH₵)',
                        min: 0,
                        max: 100,
                      },
                      {
                        key: 'perKm',
                        label: 'Per kilometre (GH₵)',
                        min: 0.1,
                        max: 50,
                      },
                      {
                        key: 'minimum',
                        label: 'Minimum fare (GH₵)',
                        min: 1,
                        max: 500,
                      },
                      {
                        key: 'commission',
                        label: 'Platform commission (%)',
                        min: 0,
                        max: 40,
                      },
                    ].map(f => (
                      <label key={f.key}>
                        {f.label}
                        <input
                          type="number"
                          required
                          min={f.min}
                          max={f.max}
                          step="0.01"
                          value={fareDraft?.[f.key] ?? ''}
                          onChange={e =>
                            setFareDraft({
                              ...fareDraft,
                              [f.key]: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                    <button className="primary" disabled={busy}>
                      Save fare settings <Check size={17} />
                    </button>
                  </form>
                )}
              </>
            )}
          </>
        )}
        <footer>
          <span>© 2026 DropIn Ghana</span>
          <span>
            Everyday journeys, a little better.{' '}
            <span className="footer-star">✦</span>
          </span>
        </footer>
      </main>
      {cancelId && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
          >
            <h2 id="cancel-title">Cancel this demo ride?</h2>
            <p>The request will close and the driver will become available.</p>
            <div className="button-row">
              <button className="secondary" onClick={() => setCancelId(null)}>
                Keep ride
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  await command(
                    { action: 'ride', id: cancelId, status: 'cancelled' },
                    'Ride cancelled.'
                  );
                  setCancelId(null);
                }}
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div
            className="modal service-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="close icon-button"
              aria-label="Close service status"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <span className="eyebrow">DROPIN GHANA</span>
            <h2 id="help-title">Service status</h2>
            <p>
              Booking, driver trip progression, ratings, recruitment and
              administration work inside your private demo workspace.
            </p>
            <div className="service-row">
              <span>Demo backend & persistence</span>
              <span className="badge completed">Connected</span>
            </div>
            {[
              'Live Firebase dispatch',
              'Road routing & GPS tracking',
              'MoMo payment processing',
              'WhatsApp Business webhook',
              'Production admin allowlist',
              'Flutter app store builds',
            ].map(s => (
              <div className="service-row" key={s}>
                <span>{s}</span>
                <span className="badge">Setup required</span>
              </div>
            ))}
            <p className="hint">
              No real ride is dispatched. The downloadable project includes the
              Firebase implementation and setup guide. AppDeploy hosts this web
              pilot; mobile builds require Flutter and your Firebase project.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              Back to workspace <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
