import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AuthError,
  MissingIdentityError,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  requestPasswordRecovery,
  signup,
  updateUser,
} from '@netlify/identity';
import { Car, LayoutDashboard, LogOut, MapPin, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { ApiError, api, errorText } from './api';
import type { AppConfig, Me } from './types';
import { Field, Notice, Spinner } from './ui';
import Rider from './Rider';
import DriverView from './Driver';
import Admin from './Admin';

type Tab = 'ride' | 'drive' | 'admin';

function authMessage(e: unknown) {
  if (e instanceof MissingIdentityError) return 'Sign-in is not available yet. Please try again shortly.';
  if (e instanceof AuthError) {
    if (e.status === 401 || e.status === 400) return 'Incorrect email or password, or your email is not confirmed yet.';
    if (e.status === 403) return 'New sign-ups are closed. Contact DropIn for an invite.';
    if (e.status === 422) return 'Check your email address. Passwords need at least 8 characters.';
    return e.message;
  }
  return errorText(e);
}

function Brand() {
  return (
    <a className="brand" href="./">
      <span className="brand-mark" aria-hidden>
        <MapPin size={20} strokeWidth={2.6} />
      </span>
      Drop<span>In</span>
    </a>
  );
}

function AuthScreen({ notice }: { notice: string }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(notice);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'login') await login(email.trim(), password);
      else if (mode === 'signup') {
        const user = await signup(email.trim(), password, { full_name: name.trim() });
        if (!user.confirmedAt) {
          setInfo(`We sent a confirmation link to ${email.trim()}. Open it to finish creating your account.`);
          setMode('login');
        }
      } else {
        await requestPasswordRecovery(email.trim());
        setInfo('If that email has an account, a password reset link is on its way.');
        setMode('login');
      }
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <header className="topbar">
        <Brand />
      </header>
      <main className="landing-grid">
        <section className="hero">
          <p className="eyebrow">Rides across Ghana</p>
          <h1>
            Your ride, <em>right where you are.</em>
          </h1>
          <p className="lede">
            Book a trusted driver in Accra, Kumasi, Tarkwa, Bogoso and beyond. See your fare before you go, track your
            driver live, and pay cash or mobile money.
          </p>
          <ul className="hero-points">
            <li>
              <ShieldCheck size={18} /> Every driver is document-checked by DropIn
            </li>
            <li>
              <Wallet size={18} /> Upfront fares in cedis — no surprises
            </li>
            <li>
              <Car size={18} /> Drive with DropIn and earn on your schedule
            </li>
          </ul>
        </section>
        <section className="card auth-card" aria-labelledby="auth-title">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>
              Sign in
            </button>
            <button role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
              Create account
            </button>
          </div>
          <h2 id="auth-title" className="sr-only">
            {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Sign in'}
          </h2>
          {info && <Notice tone="success">{info}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <form onSubmit={submit} className="stack">
            {mode === 'signup' && (
              <Field label="Full name">
                <input required minLength={2} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            {mode !== 'forgot' && (
              <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
                <input
                  type="password"
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </Field>
            )}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
            </button>
          </form>
          {mode === 'login' ? (
            <button className="link" onClick={() => setMode('forgot')}>
              Forgot your password?
            </button>
          ) : mode === 'forgot' ? (
            <button className="link" onClick={() => setMode('login')}>
              Back to sign in
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen">
      <form
        className="card narrow stack"
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          try {
            await updateUser({ password });
            onDone();
          } catch (err) {
            setError(authMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Choose a new password</h2>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="New password" hint="At least 8 characters">
          <input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          Save password
        </button>
      </form>
    </div>
  );
}

function ProfileForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [name, setName] = useState(me.profile?.name || (me.user.name !== me.user.email ? me.user.name : ''));
  const [phone, setPhone] = useState(me.profile?.phone || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen">
      <form
        className="card narrow stack"
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api.put('/profile', { name, phone });
            onSaved();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="icon-bubble">
          <Smartphone size={22} />
        </span>
        <h2>Almost there</h2>
        <p className="muted">Your driver uses this to find and call you at pickup.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Your name">
          <input required minLength={2} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Ghana phone number" hint="e.g. 024 123 4567">
          <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          Continue
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTabState] = useState<Tab>(() => (localStorage.getItem('dropin-tab') as Tab) || 'ride');
  const setTab = (t: Tab) => {
    setTabState(t);
    localStorage.setItem('dropin-tab', t);
  };

  useEffect(() => {
    (async () => {
      try {
        const result = await handleAuthCallback();
        if (result?.type === 'recovery') setRecovery(true);
        if (result?.type === 'confirmation') setAuthNotice('Email confirmed. Welcome to DropIn!');
      } catch (e) {
        setAuthNotice(authMessage(e));
      }
      setSignedIn(Boolean(await getUser()));
      setReady(true);
    })();
    api.get<AppConfig>('/config').then(setConfig, e => setLoadError(errorText(e)));
    return onAuthChange((_event, user) => setSignedIn(Boolean(user)));
  }, []);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'));
      setLoadError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSignedIn(false);
        setMe(null);
      } else setLoadError(errorText(e));
    }
  }, []);

  useEffect(() => {
    if (signedIn) loadMe();
    else setMe(null);
  }, [signedIn, loadMe]);

  if (!ready) return <Spinner label="Starting DropIn" />;
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!signedIn) return <AuthScreen notice={authNotice} />;
  if (!me || !config)
    return loadError ? (
      <div className="center-screen">
        <div className="card narrow stack">
          <Notice tone="error">{loadError}</Notice>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    ) : (
      <Spinner />
    );
  if (!me.profile) return <ProfileForm me={me} onSaved={loadMe} />;

  const activeTab: Tab = tab === 'admin' && !me.user.isAdmin ? 'ride' : tab;
  const nav: [Tab, string, typeof Car][] = [
    ['ride', 'Ride', MapPin],
    ['drive', 'Drive', Car],
    ...(me.user.isAdmin ? ([['admin', 'Operations', LayoutDashboard]] as [Tab, string, typeof Car][]) : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <nav className="nav" aria-label="Main">
          {nav.map(([id, label, Icon]) => (
            <button key={id} className={activeTab === id ? 'active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="account">
          <span className="account-name">{me.profile.name}</span>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => logout().finally(() => setSignedIn(false))}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      {loadError && (
        <div className="page">
          <Notice tone="error">{loadError}</Notice>
        </div>
      )}
      {activeTab === 'ride' && <Rider me={me} config={config} />}
      {activeTab === 'drive' && <DriverView me={me} config={config} onChange={loadMe} />}
      {activeTab === 'admin' && <Admin />}
    </div>
  );
}
