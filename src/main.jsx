import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializePlatformBridge } from './platform/initializePlatformBridge';
import { captureRecoveryQrFromLocation } from './services/recoveryQr.js';
import './styles/app.css';
import './styles/sidebar-command-rail.css';
import './styles/mobile.css';
import './styles/beta12-ui-consistency.css';

async function startJoeAnimeDB() {
  // A Recovery QR uses the URL fragment so the secret is never sent to the
  // web server. Capture it immediately, then strip it from the address bar.
  captureRecoveryQrFromLocation();
  await initializePlatformBridge();
  createRoot(document.getElementById('root')).render(<App />);
}
startJoeAnimeDB().catch((error) => {
  console.error('JoeAnimeDB could not start:', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <main class="platformBootError">
        <section>
          <h1>JoeAnimeDB could not start</h1>
          <p>Your library was not changed. Close the app and try again.</p>
        </section>
      </main>
    `;
  }
});
