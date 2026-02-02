// SEO page click tracking - uses event delegation (CSP compliant)
(function() {
  var lastClick = 0;
  var pageType = document.body.className.match(/seo-(\w+)/) ?
    'seo-' + document.body.className.match(/seo-(\w+)/)[1] : 'seo-page';

  // Detect page type from URL path
  var path = window.location.pathname;
  if (path.includes('-county.html')) pageType = 'seo-county';
  else if (path.match(/\/[a-z]{2}\/index\.html$/) || path.match(/\/[a-z]{2}\/$/)) pageType = 'seo-state';
  else if (path.includes('long-island.html') || path.includes('hudson-valley.html') ||
           path.includes('capital-region.html') || path.includes('shoreline.html')) pageType = 'seo-region';
  else if (path.match(/\/prices\/[a-z]{2}\/[^\/]+\.html$/)) pageType = 'seo-city';

  function track(id, name, action) {
    var now = Date.now();
    if (now - lastClick < 500) return;
    lastClick = now;

    var isMobile = /Mobi|Android/i.test(navigator.userAgent);
    var isAndroid = /Android/i.test(navigator.userAgent);

    fetch('https://www.gethomeheat.com/api/log-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: id,
        supplierName: name,
        action: action,
        pageSource: pageType,
        deviceType: isMobile ? 'mobile' : 'desktop',
        platform: isAndroid ? 'android' : (isMobile ? 'ios' : 'web')
      })
    }).catch(function(){});

    if (typeof gtag === 'function') {
      var eventName = action === 'call' ? 'supplier_call_click' : 'supplier_outbound_click';
      gtag('event', eventName, { supplier_id: id, supplier_name: name, page_type: pageType });
    }
  }

  // Event delegation - listen on document for clicks on tracked links
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[data-supplier-id]');
    if (!link) return;

    var id = link.getAttribute('data-supplier-id');
    var name = link.getAttribute('data-supplier-name');
    var action = link.getAttribute('data-action');

    if (id && name && action) {
      track(id, name, action);
    }
  });
})();
