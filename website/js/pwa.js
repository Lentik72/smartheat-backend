/**
 * PWA Install Banner - Android Only
 * Shows after user has experienced value (completed search, return visit, or engagement)
 */

(function() {
  let deferredPrompt = null;
  const isAndroid = /Android/i.test(navigator.userAgent);

  // Only run on Android
  if (!isAndroid) return;

  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  // Check if dismissed recently (7 days)
  function isDismissedRecently() {
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (!dismissed) return false;
    const dismissedTime = parseInt(dismissed, 10);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - dismissedTime) < sevenDays;
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

  // Capture the install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
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
            <span>Quick access — no App Store needed</span>
          </div>
        </div>
        <button class="pwa-install-btn">Add to Home Screen</button>
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

  // Trigger: First-time visitor after 45 seconds of engagement
  if (visitCount === 1) {
    setTimeout(() => {
      showBanner();
    }, 45000);
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
