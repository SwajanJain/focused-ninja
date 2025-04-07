document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('url');
    const reason = urlParams.get('reason');
    const domain = urlParams.get('domain'); // Domain passed from background

    const reasonElement = document.getElementById('blocked-reason');
    const urlElement = document.getElementById('original-url');
    const snoozeButton = document.getElementById('snooze-button');
    const snoozeStatusElement = document.getElementById('snooze-status');
    const goBackButton = document.getElementById('go-back-link');

    if (reason) {
        reasonElement.textContent = `Reason: ${decodeURIComponent(reason)}`;
    }
    if (originalUrl) {
        const decodedUrl = decodeURIComponent(originalUrl);
        urlElement.textContent = decodedUrl.length > 60 ? decodedUrl.substring(0, 57) + '...' : decodedUrl; // Truncate long URLs
    }

    // Enable snooze button only if a valid domain was passed
    if (domain) {
        snoozeButton.disabled = false;
    } else {
         snoozeStatusElement.textContent = 'Cannot determine domain to snooze.';
    }

    snoozeButton.addEventListener('click', async () => {
        if (!domain) return;

        snoozeButton.disabled = true; // Disable immediately
        snoozeStatusElement.textContent = 'Requesting snooze...';

        try {
            const response = await chrome.runtime.sendMessage({
                action: "activateSnooze",
                domain: domain
            });

            if (response && response.success) {
                snoozeStatusElement.textContent = 'Snooze activated! Redirecting back...';
                // Redirect back to the original URL after a short delay
                setTimeout(() => {
                    window.location.href = decodeURIComponent(originalUrl || ''); // Go back to original URL
                }, 1500); // Wait 1.5 seconds
            } else {
                snoozeStatusElement.textContent = response?.error || 'Snooze failed. Limit might be reached for today.';
                // Re-enable button slightly later if failed? Maybe not, as the state in background determines usability.
                 // Keep it disabled to reflect the attempt failed due to usage limit.
            }
        } catch (error) {
            console.error("Error sending snooze message:", error);
            snoozeStatusElement.textContent = 'Error activating snooze. Is the extension active?';
            // Consider re-enabling the button after error?
            // snoozeButton.disabled = false;
        }
    });

    goBackButton.addEventListener('click', (e) => {
        e.preventDefault();
        history.back(); // Try to go back in history
    });

    // Check initial snooze status on load (in case snooze is already active or used)
     async function checkInitialSnoozeStatus() {
        if (!domain) return;
        try {
             const { snoozeStatus = {} } = await chrome.storage.local.get('snoozeStatus');
             const domainSnooze = snoozeStatus[domain];
             if (domainSnooze?.snoozeUsedToday) {
                 snoozeButton.disabled = true;
                 snoozeStatusElement.textContent = 'Snooze already used for this site today.';
             }
              // If already snoozed (e.g., user manually navigated back to blocked page)
             if (domainSnooze?.snoozedUntil && Date.now() < domainSnooze.snoozedUntil) {
                 snoozeButton.disabled = true;
                 snoozeStatusElement.textContent = 'Snooze is currently active.';
                 // Maybe offer to redirect immediately?
                 // window.location.href = decodeURIComponent(originalUrl || '');
             }

        } catch (error) {
            console.error("Error checking initial snooze status:", error);
        }
    }

     checkInitialSnoozeStatus();

});