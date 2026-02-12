/**
 * PWA Install Banner - Android Only
 * Shows after user has experienced value (completed search, return visit, or engagement)
 */

(function() {
  // Register service worker (required for PWA install prompt)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed - PWA features won't work
    });
  }

  let deferredPrompt = null;
  const isAndroid = /Android/i.test(navigator.userAgent);

  // Only run banner logic on Android
  if (!isAndroid) return;

  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  // Check if dismissed recently (3 days)
  function isDismissedRecently() {
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (!dismissed) return false;
    const dismissedTime = parseInt(dismissed, 10);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    return (Date.now() - dismissedTime) < threeDays;
  }

  // Track visit count
  function getVisitCount() {
    let count = parseInt(localStorage.getItem('pwa-visit-count') || '0', 10);
    return count;
  }

  function incrementVisitCount() {
    let count = getVisitCount() + 1;
    localStorage.setItem('pwa-visit-count', count.toString());
    return count;
  }

  // Capture the install prompt (don't prevent default - allows native Chrome mini-infobar as fallback)
  window.addEventListener('beforeinstallprompt', (e) => {
    // Store for custom banner, but let native UI show too
    deferredPrompt = e;

    if (typeof gtag === 'function') {
      gtag('event', 'pwa_prompt_ready', { platform: 'android' });
    }
  });

  // Create and show the banner
  function showBanner() {
    if (!deferredPrompt) return;
    if (isDismissedRecently()) return;
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner-card">
        <button class="pwa-dismiss" aria-label="Close">&times;</button>
        <div class="pwa-banner-content">
          <img src="/images/app-icon.png" alt="HomeHeat" class="pwa-icon">
          <div class="pwa-text">
            <strong>Save HomeHeat</strong>
            <span>See today's prices. Plan ahead.</span>
          </div>
        </div>
        <button class="pwa-install-btn">Add HomeHeat</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(() => {
      banner.classList.add('visible');
    });

    // Track
    if (typeof gtag === 'function') {
      gtag('event', 'pwa_banner_shown', { platform: 'android' });
    }

    // Install click
    banner.querySelector('.pwa-install-btn').addEventListener('click', async () => {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);

      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (typeof gtag === 'function') {
        gtag('event', outcome === 'accepted' ? 'pwa_installed' : 'pwa_install_declined', { platform: 'android' });
      }

      deferredPrompt = null;
    });

    // Dismiss click
    banner.querySelector('.pwa-dismiss').addEventListener('click', () => {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
      localStorage.setItem('pwa-banner-dismissed', Date.now().toString());

      if (typeof gtag === 'function') {
        gtag('event', 'pwa_banner_dismissed', { platform: 'android' });
      }
    });
  }

  // Trigger: After ZIP search (called from prices.js or other code)
  window.showPwaInstallBanner = showBanner;

  // Trigger: Return visitor (2nd+ visit) after 3 seconds
  const visitCount = incrementVisitCount();
  if (visitCount >= 2) {
    setTimeout(() => {
      showBanner();
    }, 3000);
  }

  // Trigger: First-time visitor after 15 seconds of engagement
  if (visitCount === 1) {
    setTimeout(() => {
      showBanner();
    }, 15000);
  }

  // Trigger: User scrolls back up (indicates engagement)
  let lastScrollY = 0;
  let scrollUpCount = 0;
  window.addEventListener('scroll', () => {
    if (window.scrollY < lastScrollY - 100) {
      scrollUpCount++;
      if (scrollUpCount >= 2) {
        showBanner();
      }
    }
    lastScrollY = window.scrollY;
  }, { passive: true });

  // Track successful installation
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();

    if (typeof gtag === 'function') {
      gtag('event', 'pwa_app_installed', { platform: 'android' });
    }

    // Clear dismiss so they don't see banner on other devices
    localStorage.removeItem('pwa-banner-dismissed');
  });

  // Track standalone launches
  if (window.matchMedia('(display-mode: standalone)').matches) {
    if (!sessionStorage.getItem('pwa-launch-tracked')) {
      sessionStorage.setItem('pwa-launch-tracked', 'true');
      if (typeof gtag === 'function') {
        gtag('event', 'pwa_standalone_launch', { platform: 'android' });
      }
    }
  }
})();
