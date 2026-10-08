import type { ReactNode } from 'react';
import type { RideStatus } from './types';

export const money = (n: number | null | undefined) => `GH₵ ${Number(n || 0).toFixed(2)}`;

export const STATUS_LABELS: Record<RideStatus, string> = {
  searching: 'Finding you a driver',
  offered: 'Waiting for a driver to accept',
  accepted: 'Driver is on the way',
  arrived: 'Your driver has arrived',
  in_progress: 'On trip',
  completed: 'Trip completed',
  cancelled: 'Cancelled',
};

export const DOC_LABELS: Record<string, string> = {
  licence: "Driver's licence",
  identity: 'Ghana Card (ID)',
  insurance: 'Vehicle insurance',
  roadworthiness: 'Roadworthy certificate',
};

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  pending: 'Payment pending',
  paid: 'Paid by MoMo',
  cash_collected: 'Cash collected',
};

export const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`notice notice-${tone}`}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Badge({ tone, children }: { tone: 'green' | 'gold' | 'red' | 'grey'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const statusTone = (s: string): 'green' | 'gold' | 'red' | 'grey' =>
  s === 'completed' || s === 'approved' || s === 'paid' || s === 'cash_collected'
    ? 'green'
    : s === 'cancelled' || s === 'rejected' || s === 'suspended'
      ? 'red'
      : s === 'pending' || s === 'searching' || s === 'offered' || s === 'unpaid'
        ? 'gold'
        : 'grey';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

/** Calls fn every `ms`, skipping ticks while the tab is hidden and catching up when it returns. */
export function startPolling(fn: () => void, ms: number) {
  const tick = () => {
    if (document.visibilityState === 'visible') fn();
  };
  const id = window.setInterval(tick, ms);
  document.addEventListener('visibilitychange', tick);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', tick);
  };
}

export const telLink = (phone: string) => `tel:${phone.replace(/^0/, '+233')}`;
