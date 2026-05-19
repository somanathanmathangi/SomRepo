(function () {
    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let idleTimer;

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(showExpiryMessage, TIMEOUT_MS);
    }

    function showExpiryMessage() {
        alert("Session is about to expire");
        // Logout user from backend and redirect
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .finally(() => {
                if (window.location.pathname.includes('approver')) {
                    window.location.href = '/approver-login.html';
                } else {
                    window.location.href = '/login.html';
                }
            });
    }

    // Set up event listeners to detect user activity
    const activityEvents = ['mousemove', 'keypress', 'mousedown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => {
        document.addEventListener(event, resetIdleTimer, true);
    });

    // Start the timer initially
    resetIdleTimer();
})();
