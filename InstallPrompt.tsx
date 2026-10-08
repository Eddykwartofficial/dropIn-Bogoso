import { useState } from 'react';

export default function InstallPrompt() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)} style={{ position: 'fixed', right: 16, bottom: 20, zIndex: 60, background: '#244c36', color: 'white', padding: '10px 16px', borderRadius: 24 }}>Install demo</button>
    {open && <div role='dialog' aria-modal='true' aria-label='Install DropIn demo' style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0008', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ background: 'white', color: '#244c36', borderRadius: 20, padding: 24, maxWidth: 440 }}>
        <h2>Install DropIn demo</h2>
        <p>This is a demonstration. It does not dispatch real rides or collect payments.</p>
        <p>Android: open your browser menu and choose Install app or Add to Home screen.</p>
        <p>iPhone: open this site in Safari, tap Share, then Add to Home Screen.</p>
        <p>An internet connection is required to use the demo.</p>
        <button autoFocus onClick={() => setOpen(false)} style={{ padding: '10px 20px', background: '#244c36', color: 'white', borderRadius: 12 }}>Close installation help</button>
      </section>
    </div>}
  </>;
}
