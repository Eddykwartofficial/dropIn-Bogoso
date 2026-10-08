import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Car, Clock, FileUp, Navigation, Phone, Power, Wallet } from 'lucide-react';
import { api, errorText } from './api';
import MapView, { type Marker } from './MapView';
import type { AppConfig, Driver, Job, Me } from './types';
import { Badge, DOC_LABELS, Field, Notice, money, startPolling, statusTone, telLink, when } from './ui';

const LOCATION_EVERY_MS = 20_000;

function Application({ me, config, driver, onSaved }: { me: Me; config: AppConfig; driver: Driver | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: driver?.name || me.profile?.name || '',
    phone: driver?.phone || me.profile?.phone || '',
    city: driver?.city || config.cities[0],
    vehicleType: driver?.vehicleType || 'standard',
    vehicleModel: driver?.vehicleModel || '',
    vehicleColor: driver?.vehicleColor || '',
    plate: driver?.plate || '',
    licenceNumber: driver?.licenceNumber || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value })),
    required: true,
  });
  return (
    <form
      className="card stack"
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await api.post('/driver/apply', form);
          onSaved();
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{driver ? 'Update your application' : 'Drive with DropIn'}</h2>
      <p className="muted">Tell us about you and your vehicle. You’ll upload your documents next, and our team reviews every application.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid-2">
        <Field label="Full name (as on licence)">
          <input {...input('name')} autoComplete="name" />
        </Field>
        <Field label="Phone number">
          <input {...input('phone')} type="tel" inputMode="tel" autoComplete="tel" />
        </Field>
        <Field label="City">
          <select {...input('city')}>
            {config.cities.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Vehicle class">
          <select {...input('vehicleType')}>
            {config.vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.title} ({v.seats} seats)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Make and model" hint="e.g. Toyota Corolla 2015">
          <input {...input('vehicleModel')} />
        </Field>
        <Field label="Colour">
          <input {...input('vehicleColor')} />
        </Field>
        <Field label="Number plate" hint="e.g. GR 1234-22">
          <input {...input('plate')} />
        </Field>
        <Field label="Driver's licence number">
          <input {...input('licenceNumber')} />
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : driver ? 'Save and resubmit' : 'Submit details'}
      </button>
    </form>
  );
}

function Documents({ driver, onChange }: { driver: Driver; onChange: () => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function upload(kind: string, file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Files must be 5 MB or smaller.');
    setBusy(kind);
    setError('');
    const body = new FormData();
    body.append('file', file);
    try {
      await api.post(`/driver/documents/${kind}`, body);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  const missing = driver.documents.filter(d => !d.id).length;
  return (
    <section className="card stack">
      <div className="row-between">
        <h2>Documents</h2>
        <Badge tone={missing ? 'gold' : 'green'}>{missing ? `${missing} missing` : 'All uploaded'}</Badge>
      </div>
      <p className="muted small">Clear photos or PDFs, up to 5 MB each. Only DropIn operators can view them.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="docs">
        {driver.documents.map(d => (
          <li key={d.kind}>
            <span>
              <strong>{DOC_LABELS[d.kind] || d.kind}</strong>
              <small className="muted">{d.id ? `${d.filename} · ${when(d.uploadedAt)}` : 'Not uploaded'}</small>
            </span>
            <label className={`btn btn-sm ${d.id ? 'btn-ghost' : 'btn-primary'}`}>
              <FileUp size={15} /> {busy === d.kind ? 'Uploading…' : d.id ? 'Replace' : 'Upload'}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,application/pdf"
                disabled={Boolean(busy)}
                onChange={e => {
                  upload(d.kind, e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Countdown({ until, offset }: { until: string; offset: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((new Date(until).getTime() - (now + offset)) / 1000));
  return <span className="countdown">{left}s</span>;
}

function JobPanel({ job, offset, onUpdate }: { job: Job; offset: number; onUpdate: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act(action: string) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/driver/jobs/${job.id}/${action}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      onUpdate();
    }
  }
  const target = job.status === 'in_progress' ? { lat: job.dropoffLat, lng: job.dropoffLng } : { lat: job.pickupLat, lng: job.pickupLng };
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;

  return (
    <section className={`card stack job job-${job.status}`}>
      {job.status === 'offered' ? (
        <div className="row-between">
          <h2>New ride request</h2>
          {job.offerExpiresAt && <Countdown until={job.offerExpiresAt} offset={offset} />}
        </div>
      ) : (
        <div className="row-between">
          <h2>
            {
              {
                accepted: 'Head to pickup',
                arrived: 'Waiting for rider',
                in_progress: 'On trip',
                completed: 'Collect cash',
              }[job.status as string]
            }
          </h2>
          <strong className="earn">{money(job.driverEarnings)}</strong>
        </div>
      )}
      <dl className="trip-summary">
        <div>
          <dt>
            <span className="loc-dot loc-pickup" /> Pickup
          </dt>
          <dd>{job.pickupAddress}</dd>
        </div>
        <div>
          <dt>
            <span className="loc-dot loc-dropoff" /> Drop-off
          </dt>
          <dd>{job.dropoffAddress}</dd>
        </div>
        <div>
          <dt>Trip</dt>
          <dd>
            {job.distanceKm} km · ~{job.durationMin} min · fare {money(job.fare)} ({job.paymentMethod === 'momo' ? 'MoMo' : 'cash'})
          </dd>
        </div>
        <div>
          <dt>Rider</dt>
          <dd>
            {job.riderName}
            {job.riderPhone && (
              <>
                {' · '}
                <a href={telLink(job.riderPhone)}>
                  <Phone size={13} /> {job.riderPhone}
                </a>
              </>
            )}
          </dd>
        </div>
      </dl>
      {error && <Notice tone="error">{error}</Notice>}
      {job.status === 'offered' && (
        <div className="grid-2">
          <button className="btn btn-ghost" disabled={busy} onClick={() => act('decline')}>
            Decline
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => act('accept')}>
            Accept · earn {money(job.driverEarnings)}
          </button>
        </div>
      )}
      {['accepted', 'arrived', 'in_progress'].includes(job.status) && (
        <a className="btn btn-ghost" href={navUrl} target="_blank" rel="noreferrer">
          <Navigation size={16} /> Navigate to {job.status === 'in_progress' ? 'drop-off' : 'pickup'}
        </a>
      )}
      {job.status === 'accepted' && (
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => act('arrive')}>
          I’ve arrived at pickup
        </button>
      )}
      {job.status === 'arrived' && (
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => act('start')}>
          Rider is in — start trip
        </button>
      )}
      {job.status === 'in_progress' && (
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => confirm('Complete this trip?') && act('complete')}>
          Complete trip
        </button>
      )}
      {job.status === 'completed' && (
        <>
          <Notice tone="info">Collect {money(job.fare)} in cash from {job.riderName}.</Notice>
          <button className="btn btn-gold btn-lg" disabled={busy} onClick={() => act('cash')}>
            I’ve collected {money(job.fare)}
          </button>
        </>
      )}
      {(job.status === 'accepted' || job.status === 'arrived') && (
        <button
          className="btn btn-danger-ghost btn-sm"
          disabled={busy}
          onClick={() => confirm('Hand this trip back? DropIn will find the rider another driver.') && act('release')}
        >
          I can’t make this pickup
        </button>
      )}
    </section>
  );
}

function Earnings({ refreshKey }: { refreshKey: number }) {
  const [trips, setTrips] = useState<Job[]>([]);
  useEffect(() => {
    api.get('/driver/trips').then(d => setTrips(d.trips), () => {});
  }, [refreshKey]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today.getTime() - 6 * 86400_000);
  const sum = (from: Date) =>
    trips.filter(t => t.completedAt && new Date(t.completedAt) >= from).reduce((a, t) => a + t.driverEarnings, 0);
  return (
    <section className="card stack">
      <h2>
        <Wallet size={18} /> Earnings
      </h2>
      <div className="stats">
        <div>
          <small>Today</small>
          <strong>{money(sum(today))}</strong>
        </div>
        <div>
          <small>Last 7 days</small>
          <strong>{money(sum(week))}</strong>
        </div>
        <div>
          <small>Trips</small>
          <strong>{trips.length}</strong>
        </div>
      </div>
      <p className="muted small">Your share after DropIn commission. Payouts for mobile money trips are settled by DropIn.</p>
      {trips.length > 0 && (
        <ul className="list compact">
          {trips.slice(0, 10).map(t => (
            <li key={t.id} className="list-row">
              <span>
                <strong>{t.dropoffAddress.split(',')[0]}</strong>
                <small className="muted">{when(t.completedAt)}</small>
              </span>
              <span className="list-right">
                <strong>{money(t.driverEarnings)}</strong>
                <Badge tone={statusTone(t.paymentStatus)}>{t.paymentMethod === 'momo' ? 'MoMo' : 'Cash'}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Dashboard({ initial, onChange }: { initial: Driver; onChange: () => void }) {
  const [driver, setDriver] = useState(initial);
  const [job, setJob] = useState<Job | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(initial.lat != null ? { lat: initial.lat, lng: initial.lng! } : null);
  const [tripsKey, setTripsKey] = useState(0);
  const lastSent = useRef(0);
  const lastStatus = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.get('/driver');
      setDriver(d.driver);
      setJob(d.job);
      setOffset(new Date(d.serverTime).getTime() - Date.now());
      const status = d.job ? `${d.job.id}:${d.job.status}` : null;
      if (d.job?.status === 'offered' && lastStatus.current !== status) navigator.vibrate?.([300, 150, 300]);
      if (lastStatus.current && lastStatus.current !== status) setTripsKey(k => k + 1);
      lastStatus.current = status;
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    return startPolling(refresh, 4000);
  }, [refresh]);

  // If an operator changes the account status, reload so the right screen shows.
  useEffect(() => {
    if (driver.status !== 'approved' && driver.status !== 'suspended') onChange();
  }, [driver.status, onChange]);

  // Share position while online so dispatch can match nearby riders.
  useEffect(() => {
    if (!driver.online || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        if (Date.now() - lastSent.current < LOCATION_EVERY_MS) return;
        lastSent.current = Date.now();
        api.post('/driver/location', p).catch(() => {});
      },
      () => setError('Location access is needed to stay online. Allow location for this site.'),
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l), () => {});
    return () => {
      navigator.geolocation.clearWatch(watch);
      lock?.release().catch(() => {});
    };
  }, [driver.online]);

  function toggle() {
    setError('');
    if (driver.online) {
      setBusy(true);
      api
        .post('/driver/online', { online: false })
        .then(d => setDriver(d.driver), e => setError(errorText(e)))
        .finally(() => setBusy(false));
      return;
    }
    if (!navigator.geolocation) return setError('This device cannot share location, which is needed to receive rides.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        lastSent.current = Date.now();
        try {
          const d = await api.post('/driver/online', { online: true, ...p });
          setDriver(d.driver);
          setJob(d.job);
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setError('Allow location access so DropIn can send you nearby ride requests.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const markers = useMemo(() => {
    const m: Marker[] = [];
    if (me) m.push({ ...me, kind: 'me', label: 'You' });
    if (job) {
      m.push({ lat: job.pickupLat, lng: job.pickupLng, kind: 'pickup', label: 'Pickup' });
      m.push({ lat: job.dropoffLat, lng: job.dropoffLng, kind: 'dropoff', label: 'Drop-off' });
    }
    return m;
  }, [me, job]);

  if (driver.status === 'suspended')
    return (
      <div className="page">
        <Notice tone="error">Your driver account is suspended. {driver.reviewNote} Contact DropIn support for help.</Notice>
      </div>
    );
  if (driver.status !== 'approved') return null;

  return (
    <div className="ride-layout">
      <MapView markers={markers} />
      <aside className="panel">
        <div className={`online-card ${driver.online ? 'is-online' : ''}`}>
          <div>
            <strong>{driver.online ? 'You’re online' : 'You’re offline'}</strong>
            <small>
              {driver.online
                ? job
                  ? 'Finish this trip to get the next one.'
                  : 'Waiting for ride requests nearby…'
                : `${driver.vehicleColor} ${driver.vehicleModel} · ${driver.plate}`}
            </small>
          </div>
          <button className={`btn ${driver.online ? 'btn-ghost' : 'btn-gold'}`} onClick={toggle} disabled={busy || (driver.online && Boolean(job && job.status !== 'completed'))}>
            <Power size={16} /> {busy ? '…' : driver.online ? 'Go offline' : 'Go online'}
          </button>
        </div>
        {driver.online && !job && (
          <p className="muted small">
            <Clock size={13} /> Keep DropIn open on screen while online. Offers you don’t answer in time switch you offline.
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {job && <JobPanel job={job} offset={offset} onUpdate={refresh} />}
        <Earnings refreshKey={tripsKey} />
      </aside>
    </div>
  );
}

export default function DriverView({ me, config, onChange }: { me: Me; config: AppConfig; onChange: () => void }) {
  const driver = me.driver;
  const [editing, setEditing] = useState(false);

  // Pick up the operator's decision without a manual reload.
  useEffect(() => {
    if (driver?.status !== 'pending') return;
    return startPolling(onChange, 30_000);
  }, [driver?.status, onChange]);

  if (driver?.status === 'approved' || driver?.status === 'suspended') return <Dashboard initial={driver} onChange={onChange} />;

  return (
    <div className="page narrow-page stack">
      {!driver || editing ? (
        <Application
          me={me}
          config={config}
          driver={driver}
          onSaved={() => {
            setEditing(false);
            onChange();
          }}
        />
      ) : (
        <>
          <section className="card stack">
            <div className="row-between">
              <h2>
                <Car size={20} /> Your application
              </h2>
              <Badge tone={statusTone(driver.status)}>{driver.status === 'pending' ? 'Under review' : 'Changes needed'}</Badge>
            </div>
            {driver.status === 'rejected' ? (
              <Notice tone="error">
                {driver.reviewNote || 'Your application needs changes.'} Update your details or documents to resubmit.
              </Notice>
            ) : driver.documents.some(d => !d.id) ? (
              <Notice tone="warn">Upload all four documents so we can review your application.</Notice>
            ) : (
              <Notice tone="success">
                <BadgeCheck size={16} /> Thanks! Our team is reviewing your documents. You can start driving once approved.
              </Notice>
            )}
            <p>
              <strong>{driver.name}</strong> · {driver.phone} · {driver.city}
              <br />
              {driver.vehicleColor} {driver.vehicleModel} · <span className="plate">{driver.plate}</span>
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              Edit details
            </button>
          </section>
          <Documents driver={driver} onChange={onChange} />
        </>
      )}
    </div>
  );
}
