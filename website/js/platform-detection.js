/**
 * Platform Detection - Show/hide iOS vs Android elements
 *
 * Classes:
 * - .ios-only: Shown by default, hidden on Android
 * - .android-only: Hidden by default (style="display:none"), shown on Android
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

    if (isAndroid()) {
      // Hide iOS elements, show Android elements
      iosElements.forEach(el => el.style.display = 'none');
      androidElements.forEach(el => el.style.display = '');
    } else if (isIOS()) {
      // Ensure iOS elements are visible (default)
      iosElements.forEach(el => {
        if (el.style.display === 'none') el.style.display = '';
      });
    }
    // Desktop: show iOS elements (App Store links) as default
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPlatformStyles);
  } else {
    applyPlatformStyles();
  }
})();
