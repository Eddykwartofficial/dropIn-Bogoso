import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import InstallPrompt from './InstallPrompt';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <InstallPrompt />
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => {
      console.warn('Offline page unavailable; DropIn still works online.');
    });
  });
}
