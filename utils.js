// General utility functions

/**
 * Extracts the root domain from a URL.
 * Handles www. and basic subdomains.
 * @param {string} urlString - The URL to parse.
 * @returns {string|null} The root domain or null if invalid.
 */
function getDomain(urlString) {
    try {
        // Add protocol if missing for URL constructor
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = 'https://' + urlString; // Assume https
        }
        const url = new URL(urlString);
        let hostname = url.hostname;
        // Remove 'www.' prefix
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        // Basic handling for common subdomains (e.g., m., mobile.) - adjust if needed
        // This is simple; a more robust solution might use public suffix lists
        // For this scope, just removing 'www.' is often sufficient for the request.
        return hostname;
    } catch (e) {
        console.error("Error parsing URL:", urlString, e);
        return null; // Return null for invalid URLs
    }
}

/**
 * Formats seconds into MM:SS format.
 * @param {number} totalSeconds - The total seconds.
 * @returns {string} Formatted time string.
 */
function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return "00:00";
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats seconds into a human-readable duration (e.g., 1h 15m, 30m, 5m 10s).
 * @param {number} totalSeconds - The total seconds.
 * @returns {string} Human-readable duration string.
 */
function formatDuration(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds <= 0) {
        return "0s";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && hours === 0) parts.push(`${seconds}s`); // Show seconds only if less than an hour total

    return parts.length > 0 ? parts.join(' ') : "0s";
}

/**
 * Generates a simple unique ID.
 * @returns {string} A unique ID string.
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Gets the current date as YYYY-MM-DD.
 * @returns {string} Today's date string.
 */
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// Make functions available if using modules (though for simple script concatenation, this isn't strictly needed)
// export { getDomain, formatTime, formatDuration, generateId, getTodayDateString };