import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Car, Crosshair, MapPin, Phone, Search, Smartphone, Star, X } from 'lucide-react';
import { api, errorText } from './api';
import MapView, { type Marker } from './MapView';
import type { AppConfig, Me, Place, Ride, VehicleType } from './types';
import { Badge, Notice, PAYMENT_LABELS, STATUS_LABELS, money, startPolling, statusTone, telLink, when } from './ui';

type Result = { placeId: string; main: string; secondary: string; address?: string; lat?: number; lng?: number };
type Quote = { route: { km: number; minutes: number; estimated: boolean }; prices: { vehicleType: VehicleType; fare: number }[] };
const ACTIVE = ['searching', 'offered', 'accepted', 'arrived', 'in_progress'];
const STEPS = ['searching', 'accepted', 'arrived', 'in_progress', 'completed'];

const newSessionToken = () => crypto.randomUUID();

function LocationField({
  label,
  kind,
  value,
  focused,
  onFocus,
  onSelect,
  onClear,
  config,
  near,
}: {
  label: string;
  kind: 'pickup' | 'dropoff';
  value: Place | null;
  focused: boolean;
  onFocus: () => void;
  onSelect: (p: Place) => void;
  onClear: () => void;
  config: AppConfig;
  near?: { lat: number; lng: number };
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const token = useRef(newSessionToken());
  const live = config.mapsProvider === 'google';

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) return setResults([]);
      setBusy(true);
      setError('');
      try {
        const { results } = await api.post('/places/search', { input: q, sessionToken: token.current, near });
        setResults(results);
        if (!results.length) setError('No matches. Try another name or tap the map.');
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [near]
  );

  // Google supports type-ahead; OpenStreetMap is searched only when the rider asks, per its usage policy.
  useEffect(() => {
    if (!live || !focused) return;
    const t = setTimeout(() => search(text), 350);
    return () => clearTimeout(t);
  }, [text, live, focused, search]);

  async function choose(r: Result) {
    setResults([]);
    setText('');
    if (r.lat !== undefined && r.lng !== undefined) return onSelect({ address: r.address || r.main, lat: r.lat, lng: r.lng });
    try {
      const { place } = await api.post('/places/details', { placeId: r.placeId, sessionToken: token.current });
      token.current = newSessionToken();
      onSelect(place);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className={`loc ${focused ? 'loc-focused' : ''}`}>
      <span className={`loc-dot loc-${kind}`} aria-hidden />
      {value ? (
        <button className="loc-value" onClick={onFocus} aria-label={`${label}: ${value.address}. Tap the map to move it.`}>
          <span className="loc-label">{label}</span>
          <span className="loc-address">{value.address}</span>
        </button>
      ) : (
        <form
          className="loc-form"
          onSubmit={e => {
            e.preventDefault();
            search(text);
          }}
        >
          <span className="loc-label">{label}</span>
          <input
            value={text}
            onFocus={onFocus}
            onChange={e => setText(e.target.value)}
            placeholder={kind === 'pickup' ? 'Where should we pick you up?' : 'Where to?'}
            aria-label={label}
          />
        </form>
      )}
      {value ? (
        <button className="icon-btn" aria-label={`Clear ${label}`} onClick={onClear}>
          <X size={16} />
        </button>
      ) : (
        !live && (
          <button className="icon-btn" aria-label={`Search ${label}`} onClick={() => search(text)} disabled={busy}>
            <Search size={16} />
          </button>
        )
      )}
      {focused && !value && (results.length > 0 || error || busy) && (
        <ul className="suggestions">
          {busy && <li className="muted">Searching…</li>}
          {error && !busy && <li className="muted">{error}</li>}
          {results.map(r => (
            <li key={r.placeId}>
              <button onClick={() => choose(r)}>
                <MapPin size={15} />
                <span>
                  <strong>{r.main}</strong>
                  <small>{r.secondary}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Booking({ config, onBooked }: { config: AppConfig; onBooked: (r: Ride) => void }) {
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [focus, setFocus] = useState<'pickup' | 'dropoff'>('pickup');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>('standard');
  const [payment, setPayment] = useState<'cash' | 'momo'>('cash');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const set = (kind: 'pickup' | 'dropoff', p: Place | null) => {
    if (kind === 'pickup') {
      setPickup(p);
      if (p && !dropoff) setFocus('dropoff');
    } else setDropoff(p);
  };

  async function pin(p: { lat: number; lng: number }, kind = focus) {
    setError('');
    try {
      const { address, inGhana } = await api.post('/places/reverse', p);
      if (!inGhana) return setError('DropIn operates inside Ghana. Choose a point in Ghana.');
      set(kind, { address, ...p });
    } catch (e) {
      setError(errorText(e));
    }
  }

  function locate() {
    if (!navigator.geolocation) return setError('Your browser cannot share location. Search or tap the map instead.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        pin({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'pickup');
      },
      () => {
        setLocating(false);
        setError('We could not get your location. Search or tap the map instead.');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  useEffect(() => {
    setQuote(null);
    if (!pickup || !dropoff) return;
    let stale = false;
    api
      .post<Quote>('/quote', { pickup, dropoff })
      .then(q => !stale && setQuote(q))
      .catch(e => !stale && setError(errorText(e)));
    return () => {
      stale = true;
    };
  }, [pickup, dropoff]);

  async function request() {
    setBusy(true);
    setError('');
    try {
      const { ride } = await api.post('/rides', { pickup, dropoff, vehicleType: vehicle, paymentMethod: payment });
      onBooked(ride);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const markers = useMemo(() => {
    const m: Marker[] = [];
    if (pickup) m.push({ ...pickup, kind: 'pickup', label: 'Pickup' });
    if (dropoff) m.push({ ...dropoff, kind: 'dropoff', label: 'Drop-off' });
    return m;
  }, [pickup, dropoff]);

  const fare = quote?.prices.find(p => p.vehicleType === vehicle)?.fare;

  return (
    <div className="ride-layout">
      <MapView markers={markers} onPick={p => pin(p)} />
      <aside className="panel">
        <h1 className="panel-title">Where are you going?</h1>
        {!config.acceptingRides && <Notice tone="warn">DropIn is not taking new ride requests right now.</Notice>}
        <div className="locs">
          <LocationField
            label="Pickup"
            kind="pickup"
            value={pickup}
            focused={focus === 'pickup'}
            onFocus={() => setFocus('pickup')}
            onSelect={p => set('pickup', p)}
            onClear={() => {
              setPickup(null);
              setFocus('pickup');
            }}
            config={config}
          />
          <LocationField
            label="Drop-off"
            kind="dropoff"
            value={dropoff}
            focused={focus === 'dropoff'}
            onFocus={() => setFocus('dropoff')}
            onSelect={p => set('dropoff', p)}
            onClear={() => {
              setDropoff(null);
              setFocus('dropoff');
            }}
            config={config}
            near={pickup || undefined}
          />
        </div>
        <div className="row-between">
          <button className="btn btn-ghost btn-sm" onClick={locate} disabled={locating}>
            <Crosshair size={15} /> {locating ? 'Locating…' : 'Use my location'}
          </button>
          <span className="muted small">
            Tap the map to set {focus === 'pickup' ? 'pickup' : 'drop-off'}
          </span>
        </div>
        {error && <Notice tone="error">{error}</Notice>}

        {pickup && dropoff && !quote && !error && <p className="muted">Calculating fares…</p>}
        {quote && (
          <>
            <p className="muted small">
              About {quote.route.km} km · {quote.route.minutes} min{quote.route.estimated && ' (estimated)'}
            </p>
            <div className="vehicles" role="radiogroup" aria-label="Ride type">
              {config.vehicles.map(v => {
                const price = quote.prices.find(p => p.vehicleType === v.id)?.fare;
                return (
                  <button
                    key={v.id}
                    role="radio"
                    aria-checked={vehicle === v.id}
                    className={`vehicle ${vehicle === v.id ? 'selected' : ''}`}
                    onClick={() => setVehicle(v.id)}
                  >
                    <Car size={26} />
                    <span className="vehicle-text">
                      <strong>{v.title}</strong>
                      <small>
                        {v.description} · {v.seats} seats
                      </small>
                    </span>
                    <strong>{money(price)}</strong>
                  </button>
                );
              })}
            </div>
            <div className="pay-toggle" role="radiogroup" aria-label="Payment">
              <button role="radio" aria-checked={payment === 'cash'} className={payment === 'cash' ? 'selected' : ''} onClick={() => setPayment('cash')}>
                <Banknote size={17} /> Cash
              </button>
              <button
                role="radio"
                aria-checked={payment === 'momo'}
                className={payment === 'momo' ? 'selected' : ''}
                onClick={() => setPayment('momo')}
                disabled={!config.momoAvailable}
                title={config.momoAvailable ? undefined : 'Mobile money is not available yet'}
              >
                <Smartphone size={17} /> Mobile money
              </button>
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || !config.acceptingRides} onClick={request}>
              {busy ? 'Requesting…' : `Request ${config.vehicles.find(v => v.id === vehicle)?.title} · ${money(fare)}`}
            </button>
          </>
        )}
      </aside>
    </div>
  );
}

function Stars({ value, onRate }: { value: number | null; onRate: (n: number) => void }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Rate your driver">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onRate(n)}>
          <Star size={30} fill={value && n <= value ? '#e8b931' : 'none'} color={value && n <= value ? '#c99a17' : '#9aa79f'} />
        </button>
      ))}
    </div>
  );
}

function ActiveRide({ ride, setRide, onDone }: { ride: Ride; setRide: (r: Ride) => void; onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = ACTIVE.includes(ride.status);

  useEffect(() => {
    if (!active) return;
    return startPolling(() => {
      api.get(`/rides/${ride.id}`).then(d => setRide(d.ride), () => {});
    }, 4000);
  }, [active, ride.id, setRide]);

  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      const d = await api.post(path, body);
      if (d.url) window.location.href = d.url;
      else if (d.ride) setRide(d.ride);
      else if (d.paid) setRide((await api.get(`/rides/${ride.id}`)).ride);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const markers = useMemo(() => {
    const m: Marker[] = [
      { lat: ride.pickupLat, lng: ride.pickupLng, kind: 'pickup', label: 'Pickup' },
      { lat: ride.dropoffLat, lng: ride.dropoffLng, kind: 'dropoff', label: 'Drop-off' },
    ];
    if (ride.driver?.lat != null && ride.driver.lng != null)
      m.push({ lat: ride.driver.lat, lng: ride.driver.lng, kind: 'driver', label: ride.driver.name });
    return m;
  }, [ride]);

  const step = STEPS.indexOf(ride.status === 'offered' ? 'searching' : ride.status);
  const unpaidMomo = ride.status === 'completed' && ride.paymentMethod === 'momo' && ride.paymentStatus !== 'paid';

  return (
    <div className="ride-layout">
      <MapView markers={markers} />
      <aside className="panel">
        <div className="row-between">
          <h1 className="panel-title">{STATUS_LABELS[ride.status]}</h1>
          {(ride.status === 'searching' || ride.status === 'offered') && <span className="pulse" aria-hidden />}
        </div>
        {ride.status !== 'cancelled' && (
          <ol className="steps" aria-label="Trip progress">
            {['Requested', 'Driver assigned', 'Driver arrived', 'On trip', 'Done'].map((s, i) => (
              <li key={s} className={i <= step ? 'done' : ''}>
                {s}
              </li>
            ))}
          </ol>
        )}
        {ride.status === 'cancelled' && <Notice tone="warn">{ride.cancelReason || 'This ride was cancelled.'}</Notice>}
        {(ride.status === 'searching' || ride.status === 'offered') && (
          <p className="muted">We’re contacting the nearest available drivers. This usually takes under a minute.</p>
        )}
        {ride.status === 'arrived' && <Notice tone="success">Your driver is waiting at the pickup point.</Notice>}

        {ride.driver && (
          <div className="driver-card">
            <span className="avatar">{ride.driver.name.slice(0, 1)}</span>
            <div>
              <strong>{ride.driver.name}</strong>
              <p className="muted small">
                {ride.driver.vehicleColor} {ride.driver.vehicleModel}
              </p>
              <span className="plate">{ride.driver.plate}</span>
            </div>
            {ride.driver.phone && active && (
              <a className="btn btn-ghost btn-sm" href={telLink(ride.driver.phone)}>
                <Phone size={15} /> Call
              </a>
            )}
          </div>
        )}

        <dl className="trip-summary">
          <div>
            <dt>
              <span className="loc-dot loc-pickup" /> Pickup
            </dt>
            <dd>{ride.pickupAddress}</dd>
          </div>
          <div>
            <dt>
              <span className="loc-dot loc-dropoff" /> Drop-off
            </dt>
            <dd>{ride.dropoffAddress}</dd>
          </div>
          <div>
            <dt>Fare</dt>
            <dd>
              <strong>{money(ride.fare)}</strong> · {ride.paymentMethod === 'momo' ? 'Mobile money' : 'Cash'}
            </dd>
          </div>
        </dl>

        {error && <Notice tone="error">{error}</Notice>}

        {ride.status === 'completed' && (
          <div className="stack">
            {unpaidMomo ? (
              <button className="btn btn-gold btn-block btn-lg" disabled={busy} onClick={() => act(`/rides/${ride.id}/pay`)}>
                <Smartphone size={18} /> Pay {money(ride.fare)} with mobile money
              </button>
            ) : ride.paymentMethod === 'cash' && ride.paymentStatus === 'unpaid' ? (
              <Notice tone="info">Please pay your driver {money(ride.fare)} in cash.</Notice>
            ) : (
              <Notice tone="success">{PAYMENT_LABELS[ride.paymentStatus]} — thank you for riding with DropIn.</Notice>
            )}
            {ride.paymentStatus === 'pending' && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(`/rides/${ride.id}/verify-payment`)}>
                I’ve paid — check again
              </button>
            )}
            <p className="field-label">How was your trip?</p>
            <Stars value={ride.riderRating} onRate={n => act(`/rides/${ride.id}/rate`, { rating: n })} />
          </div>
        )}

        {['searching', 'offered', 'accepted', 'arrived'].includes(ride.status) && (
          <button
            className="btn btn-danger-ghost btn-block"
            disabled={busy}
            onClick={() => confirm('Cancel this ride?') && act(`/rides/${ride.id}/cancel`)}
          >
            Cancel ride
          </button>
        )}
        {!active && (
          <button className="btn btn-primary btn-block" onClick={onDone}>
            Book another ride
          </button>
        )}
      </aside>
    </div>
  );
}

function History({ rides, onOpen }: { rides: Ride[]; onOpen: (r: Ride) => void }) {
  if (!rides.length) return null;
  return (
    <section className="page">
      <h2 className="section-title">Your trips</h2>
      <ul className="list">
        {rides.map(r => (
          <li key={r.id}>
            <button className="list-row" onClick={() => onOpen(r)}>
              <span>
                <strong>{r.dropoffAddress.split(',')[0]}</strong>
                <small className="muted">
                  {when(r.createdAt)} · from {r.pickupAddress.split(',')[0]}
                </small>
              </span>
              <span className="list-right">
                <strong>{money(r.fare)}</strong>
                <Badge tone={statusTone(r.status)}>{STATUS_LABELS[r.status].replace('Finding you a driver', 'Searching')}</Badge>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Rider({ me, config }: { me: Me; config: AppConfig }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [history, setHistory] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadHistory = useCallback(() => api.get('/rides').then(d => setHistory(d.rides)), []);

  useEffect(() => {
    (async () => {
      try {
        const paid = new URLSearchParams(location.search).get('paid');
        if (paid && /^\d+$/.test(paid)) {
          window.history.replaceState(null, '', location.pathname);
          const d = await api.post(`/rides/${paid}/verify-payment`);
          setRide(d.ride);
          setNotice(d.ride.paymentStatus === 'paid' ? 'Payment received. Thank you!' : 'We are still confirming your payment.');
        } else if (me.activeRideId) {
          setRide((await api.get(`/rides/${me.activeRideId}`)).ride);
        }
        const { rides } = await api.get('/rides');
        setHistory(rides);
        // Bring back a just-finished trip that still needs payment or a rating.
        const last: Ride | undefined = rides[0];
        if (
          !paid &&
          !me.activeRideId &&
          last?.status === 'completed' &&
          last.completedAt &&
          Date.now() - new Date(last.completedAt).getTime() < 3 * 3600_000 &&
          (!last.riderRating || (last.paymentMethod === 'momo' && last.paymentStatus !== 'paid'))
        )
          setRide(last);
      } catch (e) {
        setNotice(errorText(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [me.activeRideId]);

  const update = useCallback((r: Ride) => setRide(r), []);

  if (loading) return <div className="page muted">Loading…</div>;
  return (
    <>
      {notice && (
        <div className="page">
          <Notice tone="info">{notice}</Notice>
        </div>
      )}
      {ride ? (
        <ActiveRide
          ride={ride}
          setRide={update}
          onDone={() => {
            setRide(null);
            setNotice('');
            loadHistory();
          }}
        />
      ) : (
        <Booking config={config} onBooked={r => setRide(r)} />
      )}
      {!ride && <History rides={history} onOpen={setRide} />}
    </>
  );
}
