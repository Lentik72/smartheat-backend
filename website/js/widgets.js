/**
 * HomeHeat Widgets - Unified Widget System
 * Handles: iOS Floating Icon, Desktop QR Widget, Android PWA Banner
 *
 * All widgets have:
 * - 7-day dismiss memory via localStorage
 * - Full analytics tracking (shown, dismissed, click)
 * - Proper device detection
 * - Clean, accessible markup
 */

(function() {
  'use strict';

  // ============================================
  // DEVICE DETECTION
  // ============================================

  var ua = navigator.userAgent;
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua);
  var isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  var isDesktop = !isMobile;

  // Check if running as installed PWA
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  function isDismissedRecently(key) {
    var dismissed = localStorage.getItem(key);
    if (!dismissed) return false;
    var sevenDays = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - parseInt(dismissed, 10)) < sevenDays;
  }

  function setDismissed(key) {
    localStorage.setItem(key, Date.now().toString());
  }

  function track(eventName, params) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params || {});
    }
  }

  // Get asset path based on current page location
  // Calculates how many directories deep we are from root
  function getAssetPath() {
    var path = window.location.pathname;
    var segments = path.split('/').filter(Boolean);

    // If the last segment looks like a file (has extension), don't count it as a dir
    if (segments.length > 0) {
      var last = segments[segments.length - 1];
      if (last.includes('.')) {
        segments = segments.slice(0, -1);
      }
    }

    // Return ../ for each directory level
    return segments.length > 0 ? '../'.repeat(segments.length) : '';
  }

  // ============================================
  // iOS FLOATING APP ICON
  // Shows on iOS mobile devices after scrolling
  // ============================================

  function initFloatingIcon() {
    // Only show on iOS mobile, not if already installed
    if (!isIOS || !isMobile || isStandalone) return;
    if (isDismissedRecently('floating-icon-dismissed')) return;

    var wrapper = document.getElementById('floating-app-wrapper');
    if (!wrapper) return;

    var icon = wrapper.querySelector('.floating-app-icon');
    var dismissBtn = wrapper.querySelector('.floating-app-dismiss');
    var hasShownTracking = false;

    // Show after scrolling down
    function checkScroll() {
      if (window.scrollY > 300) {
        if (!wrapper.classList.contains('visible')) {
          wrapper.classList.add('visible');
          if (!hasShownTracking) {
            hasShownTracking = true;
            track('floating_icon_shown', { device: 'ios' });
          }
        }
      } else {
        wrapper.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', checkScroll, { passive: true });

    // Dismiss button
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        setDismissed('floating-icon-dismissed');
        wrapper.style.display = 'none';
        track('floating_icon_dismissed', { device: 'ios' });
      });
    }

    // Click on icon - they're going to install
    if (icon) {
      icon.addEventListener('click', function() {
        setDismissed('floating-icon-dismissed');
        track('floating_icon_click', { device: 'ios' });
      });
    }
  }

  // ============================================
  // DESKTOP QR WIDGET
  // Shows on desktop to encourage mobile app download
  // ============================================

  function initQRWidget() {
    // Only show on desktop
    if (!isDesktop) return;
    if (isDismissedRecently('qr-widget-dismissed')) return;
    if (document.getElementById('qr-widget')) return;

    var assetPath = getAssetPath();

    var widget = document.createElement('div');
    widget.id = 'qr-widget';
    widget.className = 'qr-widget';
    widget.innerHTML =
      '<button class="qr-dismiss" aria-label="Dismiss">&times;</button>' +
      '<a href="https://apps.apple.com/us/app/homeheat/id6747320571" target="_blank" class="qr-content">' +
        '<img src="' + assetPath + 'images/app-icon.png" alt="HomeHeat" class="qr-app-icon">' +
        '<div class="qr-text">' +
          '<strong>Track your tank from your phone</strong>' +
          '<span>Scan with your iPhone camera to download free</span>' +
        '</div>' +
        '<img src="' + assetPath + 'images/qr-appstore.png" alt="QR Code" class="qr-code">' +
      '</a>';

    document.body.appendChild(widget);

    // Track shown
    track('qr_widget_shown', { device: 'desktop' });

    // Dismiss button
    widget.querySelector('.qr-dismiss').addEventListener('click', function() {
      setDismissed('qr-widget-dismissed');
      widget.style.opacity = '0';
      setTimeout(function() { widget.remove(); }, 300);
      track('qr_widget_dismissed', { device: 'desktop' });
    });

    // Click tracking
    widget.querySelector('.qr-content').addEventListener('click', function() {
      track('qr_widget_click', { device: 'desktop' });
    });
  }

  // ============================================
  // ANDROID HANDLING
  // Hide iOS elements, show Android elements
  // ============================================

  function initAndroidHandling() {
    if (isAndroid) {
      // Hide iOS-only elements
      document.querySelectorAll('.ios-only').forEach(function(el) {
        el.style.display = 'none';
      });
      // Show Android-only elements
      document.querySelectorAll('.android-only').forEach(function(el) {
        el.style.display = 'block';
      });
    } else {
      // Hide Android-only elements on non-Android
      document.querySelectorAll('.android-only').forEach(function(el) {
        el.style.display = 'none';
      });
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    // Handle Android/iOS visibility first
    initAndroidHandling();

    // Initialize floating icon for iOS
    initFloatingIcon();

    // Initialize QR widget for desktop (with delay for better UX)
    setTimeout(initQRWidget, 2000);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external use if needed
  window.HomeHeatWidgets = {
    track: track,
    isDismissedRecently: isDismissedRecently,
    setDismissed: setDismissed
  };
})();
