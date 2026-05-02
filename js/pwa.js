'use strict';

// ============================================================
//  SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// ============================================================
//  INSTALL BANNER
// ============================================================
let deferredPrompt = null;

function createBanner() {
  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <span class="pwa-banner-text">📲 Installa l'app sulla home screen</span>
    <div class="pwa-banner-actions">
      <button id="btn-pwa-install" class="btn btn-primary btn-sm">Installa</button>
      <button id="btn-pwa-dismiss" class="btn btn-ghost btn-sm">✕</button>
    </div>`;
  document.body.appendChild(banner);

  document.getElementById('btn-pwa-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.remove();
    if (outcome === 'accepted') localStorage.setItem('pwa-installed', '1');
  });

  document.getElementById('btn-pwa-dismiss').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('pwa-dismissed', Date.now().toString());
  });

  return banner;
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;

  // Don't show if already installed or dismissed within 7 days
  if (localStorage.getItem('pwa-installed')) return;
  const dismissed = parseInt(localStorage.getItem('pwa-dismissed') || '0', 10);
  if (Date.now() - dismissed < 7 * 24 * 3600 * 1000) return;

  createBanner();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  localStorage.setItem('pwa-installed', '1');
  document.getElementById('pwa-banner')?.remove();
});
