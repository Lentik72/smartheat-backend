/**
 * PWA Install Tracking
 * Defers install prompt until user has experienced value (completed a search)
 */

(function() {
  let deferredPrompt = null;
  const platform = /Android/i.test(navigator.userAgent) ? 'android' : 'other';

  // Capture the install prompt but DON'T show it yet
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome from showing the prompt automatically
    e.preventDefault();
    deferredPrompt = e;

    // Track that prompt is available (but not shown yet)
    if (typeof gtag === 'function') {
      gtag('event', 'pwa_prompt_ready', { platform });
    }

    console.log('[PWA] Install prompt captured and deferred');
  });

  // Show install banner after user has felt value
  window.showPwaInstallBanner = function() {
    // Only show on Android and if we have a deferred prompt
    if (!deferredPrompt || platform !== 'android') return;

    // Don't show if already dismissed this session
    if (sessionStorage.getItem('pwa-banner-dismissed')) return;

    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Create banner - card style, honest messaging
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner-card">
        <button id="pwa-dismiss-btn" class="pwa-dismiss-btn" aria-label="Close">&times;</button>
        <div class="pwa-banner-header">
          <img src="/images/app-icon-small.png" alt="HomeHeat" class="pwa-app-icon">
          <div>
            <strong>Add to Home Screen</strong>
          </div>
        </div>
        <p class="pwa-banner-desc">Check local heating oil prices with one tap — no typing, no searching.</p>
        <button id="pwa-install-btn" class="pwa-install-btn">Add to Home Screen</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Track banner shown
    if (typeof gtag === 'function') {
      gtag('event', 'pwa_install_prompt', { platform });
    }
    fetch('/api/track-pwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'install_prompt', platform })
    }).catch(() => {});

    console.log('[PWA] Install banner shown');

    // Install button click
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      banner.remove();
      deferredPrompt.prompt();

      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User choice:', outcome);

      if (outcome === 'accepted') {
        if (typeof gtag === 'function') {
          gtag('event', 'pwa_install_accepted', { platform });
        }
      } else {
        if (typeof gtag === 'function') {
          gtag('event', 'pwa_install_dismissed', { platform });
        }
      }

      deferredPrompt = null;
    });

    // Dismiss button click
    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
      banner.remove();
      sessionStorage.setItem('pwa-banner-dismissed', 'true');

      if (typeof gtag === 'function') {
        gtag('event', 'pwa_banner_dismissed', { platform });
      }

      console.log('[PWA] Banner dismissed');
    });
  };

  // Track successful installation
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;

    // Remove banner if still showing
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();

    if (typeof gtag === 'function') {
      gtag('event', 'pwa_installed', { platform });
    }

    fetch('/api/track-pwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'installed', platform })
    }).catch(() => {});

    console.log('[PWA] App installed successfully');
  });

  // Track standalone mode launches (opened from home screen)
  function trackStandaloneLaunch() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    if (isStandalone) {
      if (sessionStorage.getItem('pwa-launch-tracked')) return;
      sessionStorage.setItem('pwa-launch-tracked', 'true');

      const launchPlatform = /Android/i.test(navigator.userAgent) ? 'android' : 'ios';

      if (typeof gtag === 'function') {
        gtag('event', 'pwa_standalone_launch', { platform: launchPlatform });
      }

      fetch('/api/track-pwa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'standalone_launch', platform: launchPlatform })
      }).catch(() => {});

      console.log('[PWA] Launched in standalone mode');
    }
  }

  trackStandaloneLaunch();
  window.matchMedia('(display-mode: standalone)').addEventListener('change', trackStandaloneLaunch);
})();
