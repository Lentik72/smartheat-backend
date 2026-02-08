/**
 * 404 Page - Track page not found events
 */
if (typeof gtag === 'function') {
    gtag('event', 'page_not_found', {
        page_path: window.location.pathname,
        referrer: document.referrer
    });
}
