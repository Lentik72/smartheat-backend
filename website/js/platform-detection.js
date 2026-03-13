/**
 * Platform Detection - Show/hide elements by device context
 *
 * Classes:
 * - .ios-only: Shown on iOS, hidden on Android + Desktop
 * - .android-only: Hidden by default, shown on Android
 * - .desktop-only: Hidden by default, shown on Desktop
 * - .hide-on-android: Visible by default, hidden only on Android
 *     Use for App Store CTAs that should show on iOS + Desktop
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
    var iosElements = document.querySelectorAll('.ios-only');
    var androidElements = document.querySelectorAll('.android-only');
    var desktopElements = document.querySelectorAll('.desktop-only');
    var hideOnAndroid = document.querySelectorAll('.hide-on-android');

    if (isAndroid()) {
      iosElements.forEach(function(el) { el.style.display = 'none'; });
      hideOnAndroid.forEach(function(el) { el.style.display = 'none'; });
      androidElements.forEach(function(el) { el.style.display = ''; });
      desktopElements.forEach(function(el) { el.style.display = 'none'; });
    } else if (isIOS()) {
      androidElements.forEach(function(el) { el.style.display = 'none'; });
      desktopElements.forEach(function(el) { el.style.display = 'none'; });
    } else {
      // Desktop — ios-only hidden, hide-on-android stays visible
      document.body.classList.add('platform-desktop');
      iosElements.forEach(function(el) { el.style.display = 'none'; });
      androidElements.forEach(function(el) { el.style.display = 'none'; });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPlatformStyles);
  } else {
    applyPlatformStyles();
  }
})();
