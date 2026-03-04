/**
 * Platform Detection - Show/hide iOS vs Android vs Desktop elements
 *
 * Classes:
 * - .ios-only: Shown on iOS, hidden on Android + Desktop
 * - .android-only: Hidden by default, shown on Android
 * - .desktop-only: Hidden by default, shown on Desktop
 *
 * CSS-first detection runs before paint (inline script in <head>).
 * This JS is a fallback for pages without the inline script.
 */
(function() {
  'use strict';

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function applyPlatformStyles() {
    const iosElements = document.querySelectorAll('.ios-only');
    const androidElements = document.querySelectorAll('.android-only');
    const desktopElements = document.querySelectorAll('.desktop-only');

    if (isAndroid()) {
      iosElements.forEach(el => el.style.display = 'none');
      androidElements.forEach(el => el.style.display = '');
      desktopElements.forEach(el => el.style.display = 'none');
    } else if (isIOS()) {
      androidElements.forEach(el => el.style.display = 'none');
      desktopElements.forEach(el => el.style.display = 'none');
    } else {
      // Desktop
      iosElements.forEach(el => el.style.display = 'none');
      androidElements.forEach(el => el.style.display = 'none');
      desktopElements.forEach(el => el.style.display = '');
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPlatformStyles);
  } else {
    applyPlatformStyles();
  }
})();
