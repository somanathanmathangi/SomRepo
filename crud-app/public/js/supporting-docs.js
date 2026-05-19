// This file is loaded by the cached supporting-docs.html
// Immediately redirect to sd.html (the new, uncached page)
(function () {
    var params = new URLSearchParams(window.location.search);
    var invoice = params.get('invoice');
    var target = 'sd.html';
    if (invoice) {
        target += '?invoice=' + encodeURIComponent(invoice);
    }
    // Only redirect if we're not already there
    if (!window.location.pathname.endsWith('sd.html')) {
        window.location.replace(target);
    }
})();