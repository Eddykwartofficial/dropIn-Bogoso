import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { api, errorText } from './api';
import type { DocumentInfo, Driver } from './types';
import { Badge, DOC_LABELS, Field, Notice, PAYMENT_LABELS, STATUS_LABELS, money, startPolling, statusTone, when } from './ui';

type AdminRide = {
  id: number;
  status: keyof typeof STATUS_LABELS;
  riderName: string;
  riderPhone: string;
  driverName: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
};
type Settings = {
  base: number;
  perKm: number;
  perMinute: number;
  minimum: number;
  commission: number;
  searchRadiusKm: number;
  momoEnabled: boolean;
  acceptingRides: boolean;
};
type Overview = {
  stats: { completed: number; cancelled: number; gross: number; commission: number; active: number; driversOnline: number; driversPending: number };
  drivers: (Omit<Driver, 'documents'> & { documents: DocumentInfo[] })[];
  rides: AdminRide[];
  settings: Settings;
  integrations: { paystack: boolean; maps: boolean };
};

function DriverRow({ d, onDone }: { d: Overview['drivers'][number]; onDone: () => void }) {
  const [note, setNote] = useState(d.reviewNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const complete = d.documents.every(x => x.id);
  async function review(status: string) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/drivers/${encodeURIComponent(d.userId)}/review`, { status, note });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="card stack driver-review">
      <div className="row-between">
        <span>
          <strong>{d.name}</strong> <span className="muted small">· {d.city} · applied {when(d.createdAt)}</span>
        </span>
        <span className="row">
          {d.online && <Badge tone="green">Online</Badge>}
          <Badge tone={statusTone(d.status)}>{d.status}</Badge>
        </span>
      </div>
      <p className="small">
        {d.phone} · {d.email}
        <br />
        {d.vehicleColor} {d.vehicleModel} ({d.vehicleType}) · <span className="plate">{d.plate}</span> · Licence {d.licenceNumber}
      </p>
      <div className="doc-links">
        {d.documents.map(doc =>
          doc.id ? (
            <a key={doc.kind} href={`/api/admin/documents/${doc.id}`} target="_blank" rel="noreferrer" className="chip">
              {DOC_LABELS[doc.kind]} <ExternalLink size={12} />
            </a>
          ) : (
            <span key={doc.kind} className="chip chip-missing">
              {DOC_LABELS[doc.kind]} missing
            </span>
          )
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row wrap">
        <input className="grow" placeholder="Note to driver (shown on rejection or suspension)" value={note} onChange={e => setNote(e.target.value)} aria-label={`Note for ${d.name}`} />
        {d.status !== 'approved' && (
          <button className="btn btn-primary btn-sm" disabled={busy || !complete} title={complete ? undefined : 'All four documents are required'} onClick={() => review('approved')}>
            Approve
          </button>
        )}
        {d.status === 'pending' && (
          <button className="btn btn-danger-ghost btn-sm" disabled={busy} onClick={() => review('rejected')}>
            Request changes
          </button>
        )}
        {d.status === 'approved' && (
          <button className="btn btn-danger-ghost btn-sm" disabled={busy} onClick={() => confirm(`Suspend ${d.name}?`) && review('suspended')}>
            Suspend
          </button>
        )}
      </div>
    </li>
  );
}

function SettingsForm({ initial, integrations, onSaved }: { initial: Settings; integrations: Overview['integrations']; onSaved: () => void }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const numField = (k: keyof Settings, label: string, step = '0.1') => (
    <Field label={label}>
      <input type="number" step={step} min="0" value={String(s[k])} onChange={e => setS({ ...s, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <form
      className="card stack"
      onSubmit={async e => {
        e.preventDefault();
        try {
          await api.put('/admin/settings', s);
          setMsg({ tone: 'success', text: 'Settings saved. New fares apply to new requests.' });
          onSaved();
        } catch (err) {
          setMsg({ tone: 'error', text: errorText(err) });
        }
      }}
    >
      <h2>Pricing & service</h2>
      <div className="grid-3">
        {numField('base', 'Base fare (GH₵)')}
        {numField('perKm', 'Per km (GH₵)')}
        {numField('perMinute', 'Per minute (GH₵)')}
        {numField('minimum', 'Minimum fare (GH₵)')}
        {numField('commission', 'Commission (%)', '1')}
        {numField('searchRadiusKm', 'Driver search radius (km)', '1')}
      </div>
      <label className="check">
        <input type="checkbox" checked={s.acceptingRides} onChange={e => setS({ ...s, acceptingRides: e.target.checked })} />
        Accepting new ride requests
      </label>
      <label className="check">
        <input type="checkbox" checked={s.momoEnabled} onChange={e => setS({ ...s, momoEnabled: e.target.checked })} />
        Offer mobile money (Paystack)
      </label>
      {s.momoEnabled && !integrations.paystack && (
        <Notice tone="warn">Mobile money stays hidden from riders until the PAYSTACK_SECRET_KEY environment variable is set.</Notice>
      )}
      <p className="muted small">
        Address search: {integrations.maps ? 'Google Maps' : 'OpenStreetMap (set GOOGLE_MAPS_API_KEY for Google search and traffic-aware routes)'}.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn btn-primary">Save settings</button>
    </form>
  );
}

export default function Admin() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    try {
      setData(await api.get('/admin/overview'));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
    return startPolling(load, 15000);
  }, [load]);

  async function rideAction(id: number, action: 'cancel' | 'settle') {
    if (!confirm(action === 'cancel' ? `Cancel ride #${id}?` : `Mark ride #${id} as paid?`)) return;
    try {
      await api.post(`/admin/rides/${id}/${action}`);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (!data) return <div className="page">{error ? <Notice tone="error">{error}</Notice> : <p className="muted">Loading…</p>}</div>;
  const { stats } = data;
  const drivers = filter === 'pending' ? data.drivers.filter(d => d.status === 'pending') : data.drivers;

  return (
    <div className="page stack">
      <div className="row-between">
        <h1 className="panel-title">Operations</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="stats stats-wide">
        <div>
          <small>Active rides</small>
          <strong>{stats.active}</strong>
        </div>
        <div>
          <small>Drivers online</small>
          <strong>{stats.driversOnline}</strong>
        </div>
        <div>
          <small>Awaiting review</small>
          <strong>{stats.driversPending}</strong>
        </div>
        <div>
          <small>Trips today</small>
          <strong>{stats.completed}</strong>
        </div>
        <div>
          <small>Fares today</small>
          <strong>{money(stats.gross)}</strong>
        </div>
        <div>
          <small>Commission today</small>
          <strong>{money(stats.commission)}</strong>
        </div>
      </div>

      <section className="stack">
        <div className="row-between">
          <h2 className="section-title">Drivers</h2>
          <div className="tabs tabs-sm" role="tablist">
            <button role="tab" aria-selected={filter === 'pending'} onClick={() => setFilter('pending')}>
              Awaiting review ({stats.driversPending})
            </button>
            <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
              All ({data.drivers.length})
            </button>
          </div>
        </div>
        {drivers.length ? (
          <ul className="stack plain">
            {drivers.map(d => (
              <DriverRow key={`${d.userId}:${d.status}`} d={d} onDone={load} />
            ))}
          </ul>
        ) : (
          <p className="muted">No drivers here.</p>
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Recent rides</h2>
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Requested</th>
                <th>Rider</th>
                <th>Driver</th>
                <th>Route</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rides.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{when(r.createdAt)}</td>
                  <td>
                    {r.riderName}
                    <br />
                    <small className="muted">{r.riderPhone}</small>
                  </td>
                  <td>{r.driverName || '—'}</td>
                  <td className="route-cell">
                    {r.pickupAddress.split(',')[0]} → {r.dropoffAddress.split(',')[0]}
                  </td>
                  <td>{money(r.fare)}</td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{r.status.replace('_', ' ')}</Badge>
                  </td>
                  <td>
                    {r.paymentMethod === 'momo' ? 'MoMo' : 'Cash'} · {PAYMENT_LABELS[r.paymentStatus] || r.paymentStatus}
                  </td>
                  <td>
                    {['searching', 'offered', 'accepted', 'arrived', 'in_progress'].includes(r.status) && (
                      <button className="btn btn-danger-ghost btn-xs" onClick={() => rideAction(r.id, 'cancel')}>
                        Cancel
                      </button>
                    )}
                    {r.status === 'completed' && ['unpaid', 'pending'].includes(r.paymentStatus) && (
                      <button className="btn btn-ghost btn-xs" onClick={() => rideAction(r.id, 'settle')}>
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!data.rides.length && (
                <tr>
                  <td colSpan={9} className="muted">
                    No rides yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <SettingsForm initial={data.settings} integrations={data.integrations} onSaved={load} />
    </div>
  );
}
