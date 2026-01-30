/**
 * PWA Install Tracking
 * Tracks install prompts, installations, and standalone launches
 */

(function() {
  // Track when install prompt is shown
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Store the event for potential manual trigger later
    deferredPrompt = e;

    // Track prompt shown
    if (typeof gtag === 'function') {
      gtag('event', 'pwa_install_prompt', {
        platform: /Android/i.test(navigator.userAgent) ? 'android' : 'other'
      });
    }

    // Log to backend
    fetch('/api/track-pwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'install_prompt',
        platform: /Android/i.test(navigator.userAgent) ? 'android' : 'other',
        userAgent: navigator.userAgent
      })
    }).catch(() => {});

    console.log('[PWA] Install prompt available');
  });

  // Track successful installation
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;

    if (typeof gtag === 'function') {
      gtag('event', 'pwa_installed', {
        platform: /Android/i.test(navigator.userAgent) ? 'android' : 'other'
      });
    }

    // Log to backend
    fetch('/api/track-pwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'installed',
        platform: /Android/i.test(navigator.userAgent) ? 'android' : 'other',
        userAgent: navigator.userAgent
      })
    }).catch(() => {});

    console.log('[PWA] App installed successfully');
  });

  // Track standalone mode launches (opened from home screen)
  function trackStandaloneLaunch() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    if (isStandalone) {
      // Only track once per session
      if (sessionStorage.getItem('pwa-launch-tracked')) return;
      sessionStorage.setItem('pwa-launch-tracked', 'true');

      if (typeof gtag === 'function') {
        gtag('event', 'pwa_standalone_launch', {
          platform: /Android/i.test(navigator.userAgent) ? 'android' : 'ios'
        });
      }

      // Log to backend
      fetch('/api/track-pwa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'standalone_launch',
          platform: /Android/i.test(navigator.userAgent) ? 'android' : 'ios',
          userAgent: navigator.userAgent
        })
      }).catch(() => {});

      console.log('[PWA] Launched in standalone mode');
    }
  }

  // Check on load
  trackStandaloneLaunch();

  // Also track if display mode changes
  window.matchMedia('(display-mode: standalone)').addEventListener('change', trackStandaloneLaunch);
})();
