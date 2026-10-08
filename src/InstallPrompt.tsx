import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [hidden, setHidden] = useState(() => standalone() || localStorage.getItem('dropin-install-dismissed') === '1');

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    localStorage.setItem('dropin-install-dismissed', '1');
    setHidden(true);
    setHelp(false);
  };

  return (
    <>
      <button
        className="btn btn-gold btn-sm install-btn"
        onClick={async () => {
          if (!deferred) return setHelp(true);
          await deferred.prompt();
          if ((await deferred.userChoice).outcome === 'accepted') setHidden(true);
          setDeferred(null);
        }}
      >
        <Download size={15} /> Install app
      </button>
      {help && (
        <div role="dialog" aria-modal="true" aria-labelledby="install-title" className="center-screen" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgb(0 0 0 / 45%)', minHeight: 0 }}>
          <section className="card narrow stack">
            <h2 id="install-title">Install DropIn</h2>
            <p>
              <strong>Android:</strong> open your browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.
            </p>
            <p>
              <strong>iPhone:</strong> open this site in Safari, tap <em>Share</em>, then <em>Add to Home Screen</em>.
            </p>
            <p className="muted small">An internet connection is needed to book and take rides.</p>
            <div className="row">
              <button autoFocus className="btn btn-primary" onClick={() => setHelp(false)}>
                Got it
              </button>
              <button className="btn btn-ghost" onClick={dismiss}>
                Don’t show again
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
