import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializePlatformBridge } from './platform/initializePlatformBridge';
import { captureRecoveryQrFromLocation } from './services/recoveryQr.js';
import { initializeTvFocusManager, primeTvLayoutMode } from './tv/tvFocusManager';
import { recordStartupTiming, startupTasksAreSettled } from './services/startupPerformance';
import './styles/app.css';
import './styles/sidebar-command-rail.css';
import './styles/mobile.css';
import './styles/beta12-ui-consistency.css';
import './styles/tv-focus.css';

const STARTUP_SPLASH_MIN_MS = 2500;
const STARTUP_SPLASH_MAX_MS = 4500;

function dismissStartupSplashWhenReady() {
  const splash = document.getElementById('startup-splash');
  if (!splash) return;

  const startedAt = Number(globalThis.__JOEANIME_SPLASH_STARTED_AT__ || 0);
  const elapsed = () => (globalThis.performance?.now?.() ?? Date.now()) - startedAt;

  const finish = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      splash.classList.add('isLeaving');
      document.body?.classList.remove('tvBootMode');
      window.setTimeout(() => splash.remove(), 200);
    }));
  };

  const waitForHome = () => {
    const shell = document.querySelector('.shell');
    const homeReady = shell
      && shell.getAttribute('aria-busy') !== 'true'
      && startupTasksAreSettled();
    if (homeReady || elapsed() >= STARTUP_SPLASH_MAX_MS) {
      finish();
      return;
    }
    window.setTimeout(waitForHome, 100);
  };

  window.setTimeout(waitForHome, Math.max(0, STARTUP_SPLASH_MIN_MS - elapsed()));
}

async function startJoeAnimeDB() {
  globalThis.__JOEANIME_STARTUP_STARTED_AT__ = globalThis.performance?.now?.() ?? Date.now();
  // Keep Android TV in its compact layout before any asynchronous platform or
  // database work can produce the first React paint.
  primeTvLayoutMode();

  // Install D-pad capture before any native bridge call. Some Android TV
  // devices take a noticeable amount of time to answer Capacitor app-info,
  // and remote input must never wait for that metadata.
  const focusStartedAt = globalThis.performance?.now?.() ?? Date.now();
  initializeTvFocusManager();
  recordStartupTiming(
    'focusManagerInitialization',
    (globalThis.performance?.now?.() ?? Date.now()) - focusStartedAt
  );

  // A Recovery QR uses the URL fragment so the secret is never sent to the
  // web server. Capture it immediately, then strip it from the address bar.
  captureRecoveryQrFromLocation();
  initializePlatformBridge();
  createRoot(document.getElementById('root')).render(<App />);
  dismissStartupSplashWhenReady();
}
startJoeAnimeDB().catch((error) => {
  console.error('JoeAnimeDB could not start:', error);
  document.getElementById('startup-splash')?.remove();
  document.body?.classList.remove('tvBootMode');
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
