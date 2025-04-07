// background.js - Service Worker for FocusedNinja

// --- Constants ---
const WORK_DURATION_DEFAULT = 25 * 60; // 25 minutes in seconds
const BREAK_DURATION_DEFAULT = 5 * 60;  // 5 minutes in seconds
const DEEP_WORK_DURATION_DEFAULT = 60 * 60; // 60 minutes in seconds
const SNOOZE_DURATION = 10 * 60; // 10 minutes in seconds
const USAGE_TRACK_INTERVAL = 'usageTrackInterval'; // Alarm name for tracking time
const POMODORO_ALARM_WORK = 'pomodoroWork';
const POMODORO_ALARM_BREAK = 'pomodoroBreak';
const DAILY_RESET_ALARM = 'dailyReset';
const DEEP_WORK_END_ALARM = 'deepWorkEndAlarm';
const SNOOZE_ALARM_PREFIX = 'snoozeEnd_'; // Prefix for snooze alarms

// --- Utility Functions (Background Specific) ---

// Get Domain function (can be reused from utils.js if modules are set up, otherwise duplicate)
function getDomain(urlString) {
     try {
        if (!urlString || (!urlString.startsWith('http://') && !urlString.startsWith('https://'))) {
            // Ignore non-http protocols or invalid strings
            return null;
        }
        const url = new URL(urlString);
        let hostname = url.hostname;
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        return hostname;
    } catch (e) {
        // console.error("BG: Error parsing URL:", urlString, e);
        return null;
    }
}

// Get Today's Date String (can be reused)
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}


// --- Initialization ---

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("FocusedNinja installed or updated.", details.reason);

    // Initialize storage with default values if they don't exist
    await chrome.storage.local.get(null, async (data) => {
        const defaults = {
            sites: {}, // { "domain": { category, visitLimit, timeLimit } }
            usage: {}, // { "YYYY-MM-DD": { "domain": { visits, timeSpent, lastVisitTimestamp } } }
            tasks: [], // [ { id, text, priority, completed, createdAt } ]
            pomodoro: {
                isRunning: false,
                isWork: true, // true for work, false for break
                startTime: null, // Timestamp when current interval started/resumed
                remainingTime: WORK_DURATION_DEFAULT, // Seconds remaining in current interval
                sessionsToday: 0,
                lastSessionDate: null, // YYYY-MM-DD
                settings: { // Store settings here
                    workDuration: WORK_DURATION_DEFAULT,
                    breakDuration: BREAK_DURATION_DEFAULT
                }
            },
            settings: { // General extension settings
                deepWorkActive: false,
                deepWorkEndTime: null // Timestamp when deep work ends
            },
            snoozeStatus: {} // { "domain": { snoozedUntil: timestamp, snoozeUsedToday: boolean } }
        };

        let needsUpdate = false;
        for (const key in defaults) {
            if (data[key] === undefined) {
                data[key] = defaults[key];
                needsUpdate = true;
            }
             // Ensure nested defaults (like pomodoro.settings)
            if (key === 'pomodoro' && (data[key].settings === undefined || data[key].remainingTime === undefined)) {
                data[key] = { ...defaults.pomodoro, ...data[key], settings: { ...defaults.pomodoro.settings, ...(data[key].settings || {}) } };
                if(data[key].remainingTime === undefined) data[key].remainingTime = data[key].isWork ? (data[key].settings.workDuration || WORK_DURATION_DEFAULT) : (data[key].settings.breakDuration || BREAK_DURATION_DEFAULT);
                needsUpdate = true;
            }
             if (key === 'settings' && data[key].deepWorkActive === undefined) {
                 data[key] = { ...defaults.settings, ...data[key] };
                 needsUpdate = true;
             }
        }

        if (needsUpdate) {
            await chrome.storage.local.set(data);
            console.log("Initialized default storage values.");
        }
    });

    // Set up periodic alarms
    await setupAlarms();

    console.log("Background setup complete.");
});

// Re-setup alarms on browser startup
chrome.runtime.onStartup.addListener(async () => {
    console.log("Browser started, ensuring alarms are set.");
    await setupAlarms();
    // Check if Deep Work was active and expired while browser was closed
    await checkDeepWorkStatusOnStartup();
});


async function setupAlarms() {
     // Check existing alarms first to avoid duplicates/errors
    const existingAlarms = await chrome.alarms.getAll();
    const existingNames = existingAlarms.map(a => a.name);

    // 1. Usage Tracking Alarm (runs frequently)
    if (!existingNames.includes(USAGE_TRACK_INTERVAL)) {
        chrome.alarms.create(USAGE_TRACK_INTERVAL, { periodInMinutes: 0.25 }); // Every 15 seconds
        console.log("Created usage tracking alarm.");
    }

    // 2. Daily Reset Alarm (runs once a day)
    if (!existingNames.includes(DAILY_RESET_ALARM)) {
        // Set it for the next midnight
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const delayInMinutes = Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60));

        chrome.alarms.create(DAILY_RESET_ALARM, {
             when: Date.now() + delayInMinutes * 60 * 1000, // Schedule for next midnight
             periodInMinutes: 24 * 60 // Repeat daily
        });
         console.log(`Created daily reset alarm, next run in ${delayInMinutes} minutes.`);
    }

     // 3. Recreate Pomodoro/DeepWork alarms if needed (e.g., after browser restart)
     const { pomodoro, settings } = await chrome.storage.local.get(['pomodoro', 'settings']);
     if (pomodoro.isRunning && pomodoro.startTime) {
         const elapsed = (Date.now() - pomodoro.startTime) / 1000;
         const remaining = pomodoro.remainingTime - elapsed;
         if (remaining > 0) {
             const alarmName = pomodoro.isWork ? POMODORO_ALARM_WORK : POMODORO_ALARM_BREAK;
             // Clear existing just in case before creating
             await chrome.alarms.clear(alarmName);
             chrome.alarms.create(alarmName, { delayInMinutes: remaining / 60 });
             console.log(`Recreated Pomodoro alarm ${alarmName} after startup.`);
         } else {
             // Timer expired while closed, handle completion (might need more complex logic here)
             console.log("Pomodoro timer expired while browser was closed. Resetting state.");
             // Simplified: just pause it, user can restart
             await pausePomodoroTimer();
         }
     }
     if (settings.deepWorkActive && settings.deepWorkEndTime) {
         const remainingDeepWork = (settings.deepWorkEndTime - Date.now()) / 1000;
         if (remainingDeepWork > 0) {
            await chrome.alarms.clear(DEEP_WORK_END_ALARM);
            chrome.alarms.create(DEEP_WORK_END_ALARM, { delayInMinutes: remainingDeepWork / 60 });
            console.log("Recreated Deep Work end alarm after startup.");
         } else {
            await endDeepWorkMode(false); // End it if expired
         }
     }

     // Note: Snooze alarms are temporary and generally don't need recreation on startup.
     // If one was active and the browser closed, it effectively ended.
}

async function checkDeepWorkStatusOnStartup() {
     const { settings } = await chrome.storage.local.get('settings');
     if (settings.deepWorkActive && settings.deepWorkEndTime && Date.now() > settings.deepWorkEndTime) {
         console.log("Deep Work mode expired while browser was closed. Disabling.");
         await endDeepWorkMode(false); // Don't need to clear alarm as it already fired/expired
     }
}

// --- Alarm Listener ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("Alarm triggered:", alarm.name);

    if (alarm.name === USAGE_TRACK_INTERVAL) {
        await trackActiveTabTime();
    } else if (alarm.name === DAILY_RESET_ALARM) {
        await performDailyReset();
    } else if (alarm.name === POMODORO_ALARM_WORK) {
        await completeWorkSession();
    } else if (alarm.name === POMODORO_ALARM_BREAK) {
        await completeBreakSession();
    } else if (alarm.name === DEEP_WORK_END_ALARM) {
        await endDeepWorkMode(true); // Clear alarm automatically handled
    } else if (alarm.name.startsWith(SNOOZE_ALARM_PREFIX)) {
        const domain = alarm.name.substring(SNOOZE_ALARM_PREFIX.length);
        await endSnooze(domain);
    }
});

// --- Usage Tracking Logic ---

let activeTabId = null;
let activeTabDomain = null;
let lastTrackTime = Date.now();

// Update active tab info when tab is activated or updated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // Track time spent on the *previous* tab before switching
    await trackActiveTabTime(); // Record final time for the old tab

    activeTabId = activeInfo.tabId;
    try {
        const tab = await chrome.tabs.get(activeTabId);
        activeTabDomain = getDomain(tab.url);
    } catch (e) {
        // console.warn("Could not get tab info on activation:", e);
        activeTabDomain = null; // Tab might be closed or inaccessible
    }
    lastTrackTime = Date.now(); // Reset timer for the new tab
    // console.log(`Activated tab: ${activeTabId}, Domain: ${activeTabDomain}`);
});

// Update domain when URL changes within the same tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Check if the update is for the currently active tab and the URL changed
     if (tabId === activeTabId && changeInfo.url && tab.active) {
        // Track time for the previous domain before URL change
        await trackActiveTabTime();

        activeTabDomain = getDomain(changeInfo.url); // Update domain
        lastTrackTime = Date.now(); // Reset timer
         // console.log(`Updated active tab URL: ${activeTabId}, New Domain: ${activeTabDomain}`);

         // Also trigger visit count increment here or in onCommitted
     }
});


// Track time spent on the active tab (called by alarm)
async function trackActiveTabTime() {
    if (activeTabId === null || activeTabDomain === null) {
        // console.log("No active tab/domain to track.");
        lastTrackTime = Date.now(); // Keep lastTrackTime updated even if not tracking
        return;
    }

     // Check if the browser window is focused - prevents tracking when user is away
     // Requires the "windows" permission, which we didn't request. Add it if needed.
     // For now, we track whenever the browser is open and a tab is active.
     /*
     try {
        const [window] = await chrome.windows.getLastFocused({ populate: false });
        if (!window || !window.focused) {
            // console.log("Window not focused, pausing tracking.");
            lastTrackTime = Date.now(); // Reset timer, don't accumulate time
            return;
        }
     } catch (e) { console.error("Error checking window focus:", e); }
     */


    const now = Date.now();
    const timeDelta = (now - lastTrackTime) / 1000; // Time difference in seconds
    lastTrackTime = now; // Update last track time

    if (timeDelta <= 0) return; // No time passed or clock issue


    const { sites = {}, usage = {} } = await chrome.storage.local.get(['sites', 'usage']);
    const today = getTodayDateString();

    // Only track time for sites configured in the 'sites' object
    if (sites[activeTabDomain]) {
        if (!usage[today]) usage[today] = {};
        if (!usage[today][activeTabDomain]) {
            usage[today][activeTabDomain] = { visits: 0, timeSpent: 0, lastVisitTimestamp: 0 };
        }

        usage[today][activeTabDomain].timeSpent += timeDelta;
        // console.log(`Tracked ${timeDelta.toFixed(1)}s for ${activeTabDomain}. Total: ${usage[today][activeTabDomain].timeSpent.toFixed(1)}s`);

        // Update storage, but maybe batch updates later if performance is an issue
        await chrome.storage.local.set({ usage });
    } else {
        // console.log(`Domain ${activeTabDomain} not in tracked sites list.`);
    }
}


// --- Website Blocking Logic ---

// Use webNavigation API for reliable interception before page load
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // Ignore navigation within the same document (e.g., hash changes) or subframes
    if (details.frameId !== 0 || details.url.startsWith('chrome://') || details.url.startsWith('about:')) {
        return;
    }

    const domain = getDomain(details.url);
    if (!domain) return; // Invalid URL

    const data = await chrome.storage.local.get(['sites', 'usage', 'pomodoro', 'settings', 'snoozeStatus']);
    const sites = data.sites || {};
    const usage = data.usage || {};
    const pomodoro = data.pomodoro || {};
    const settings = data.settings || {};
    const snoozeStatus = data.snoozeStatus || {};
    const today = getTodayDateString();
    const siteConfig = sites[domain];

    // --- Check Snooze Status First ---
    const domainSnooze = snoozeStatus[domain];
    if (domainSnooze && domainSnooze.snoozedUntil && Date.now() < domainSnooze.snoozedUntil) {
        console.log(`Domain ${domain} is snoozed. Allowing access.`);
        return; // Snooze active, allow navigation
    }

    let blockReason = null; // Store reason for blocking

    // --- Check 1: Deep Work Mode ---
    if (settings.deepWorkActive && siteConfig && siteConfig.category === 'Unproductive') {
        blockReason = "Deep Work mode is active.";
    }

    // --- Check 2: Pomodoro Work Session ---
    else if (pomodoro.isRunning && pomodoro.isWork && siteConfig && siteConfig.category === 'Unproductive') {
         blockReason = "Pomodoro work session is active.";
    }

    // --- Check 3: Usage Limits (only if not already blocked by modes) ---
    else if (siteConfig) {
        const todayUsage = usage[today]?.[domain] || { visits: 0, timeSpent: 0, lastVisitTimestamp: 0 };

        // Increment visit count on navigation attempt (before checking limit)
        // We need to be careful not to double-count if multiple events fire for one navigation.
        // onCommitted might be slightly better for visit counting. Let's stick to onBeforeNavigate for blocking check first.
        // We will increment the visit count *after* confirming it's not blocked by limits.

        // Check Time Limit
        if (siteConfig.timeLimit !== null && todayUsage.timeSpent >= siteConfig.timeLimit) {
            blockReason = `Time limit (${siteConfig.timeLimit / 60} min) reached.`;
        }
        // Check Visit Limit (check before incrementing for the current visit)
        else if (siteConfig.visitLimit !== null && todayUsage.visits >= siteConfig.visitLimit) {
             blockReason = `Visit limit (${siteConfig.visitLimit}) reached.`;
        }
    }


    // --- Perform Blocking ---
    if (blockReason) {
        console.log(`Blocking ${domain} (Reason: ${blockReason}). Redirecting tab ${details.tabId}.`);
        try {
            // Redirect to the custom blocked page
             const blockedPageUrl = chrome.runtime.getURL('blocked.html');
             const redirectUrl = `${blockedPageUrl}?url=${encodeURIComponent(details.url)}&reason=${encodeURIComponent(blockReason)}&domain=${encodeURIComponent(domain)}`;

             await chrome.tabs.update(details.tabId, { url: redirectUrl });
             console.log(`Redirected tab ${details.tabId} to blocked page.`);
        } catch (e) {
            console.error(`Error redirecting tab ${details.tabId}:`, e);
            // Fallback if update fails (e.g., tab closed): maybe just log.
        }
    } else {
        // --- If not blocked, increment visit count ---
        // This is tricky: onBeforeNavigate fires early. Incrementing here might overcount if the navigation fails.
        // onCommitted is generally better for *confirming* a navigation happened.
        // Let's move visit incrementing to onCommitted.
        // console.log(`Allowing navigation to ${domain}`);
    }
});


// Use onCommitted to increment visit count *after* navigation has started
chrome.webNavigation.onCommitted.addListener(async (details) => {
    // Only count top-level frame navigations of type "typed", "link", "auto_bookmark", "form_submit"
    // Exclude "reload", "back_forward", "keyword", "keyword_generated" to avoid inflating counts? Optional refinement.
    const validTransitions = ["typed", "link", "auto_bookmark", "form_submit"];
    if (details.frameId !== 0 || !validTransitions.includes(details.transitionType)) {
        return;
    }

    const domain = getDomain(details.url);
    if (!domain) return;

    const { sites = {}, usage = {} } = await chrome.storage.local.get(['sites', 'usage']);
    const today = getTodayDateString();

    // Only increment visits for tracked sites
    if (sites[domain]) {
        if (!usage[today]) usage[today] = {};
        if (!usage[today][domain]) {
            usage[today][domain] = { visits: 0, timeSpent: 0, lastVisitTimestamp: 0 };
        }

        // Avoid incrementing if the URL is our blocked page (prevents counting the redirect itself)
        if (details.url.includes(chrome.runtime.getURL('blocked.html'))) {
            return;
        }


        usage[today][domain].visits += 1;
        usage[today][domain].lastVisitTimestamp = details.timeStamp; // Use event timestamp
        console.log(`Incremented visit count for ${domain} to ${usage[today][domain].visits}`);

        await chrome.storage.local.set({ usage });
    }
});


// --- Daily Reset Logic ---

async function performDailyReset() {
    console.log("Performing daily reset...");
    const today = getTodayDateString();
    const { usage = {}, pomodoro = {}, snoozeStatus = {} } = await chrome.storage.local.get(['usage', 'pomodoro', 'snoozeStatus']);

    // 1. Clear yesterday's usage data (or keep historical if needed - clearing for now)
    // A more robust approach would be to prune old dates, not just clear all but today.
    const newUsage = {};
    if (usage[today]) {
        newUsage[today] = usage[today]; // Keep today's data if reset runs mid-day
    }

    // 2. Reset Pomodoro session count if date changed
    if (pomodoro.lastSessionDate !== today) {
        pomodoro.sessionsToday = 0;
        pomodoro.lastSessionDate = today; // Update the date marker
    }

    // 3. Reset daily snooze usage flags
    const newSnoozeStatus = {};
    for (const domain in snoozeStatus) {
        // Keep existing snooze timers running, but reset the 'used today' flag
         newSnoozeStatus[domain] = { ...snoozeStatus[domain], snoozeUsedToday: false };
         // Optional: Clear expired snooze timers entirely
         if (newSnoozeStatus[domain].snoozedUntil && Date.now() > newSnoozeStatus[domain].snoozedUntil) {
             delete newSnoozeStatus[domain];
         }
    }


    await chrome.storage.local.set({
        usage: newUsage,
        pomodoro: pomodoro,
        snoozeStatus: newSnoozeStatus
     });

    console.log("Daily reset complete. Usage cleared, Pomodoro sessions reset (if needed), Snooze flags reset.");
}

// --- Pomodoro Timer Logic ---

async function startPomodoroTimer() {
    let { pomodoro } = await chrome.storage.local.get('pomodoro');

    if (pomodoro.isRunning) {
        console.log("Pomodoro timer already running.");
        return; // Already running
    }

     // Clear any previous alarms just in case
     await chrome.alarms.clear(POMODORO_ALARM_WORK);
     await chrome.alarms.clear(POMODORO_ALARM_BREAK);

    pomodoro.isRunning = true;
    pomodoro.startTime = Date.now(); // Record start/resume time

    // If remainingTime is 0 or less (e.g., after a reset or completion), set to default for current phase
    const workDuration = pomodoro.settings?.workDuration || WORK_DURATION_DEFAULT;
    const breakDuration = pomodoro.settings?.breakDuration || BREAK_DURATION_DEFAULT;
     if (!pomodoro.remainingTime || pomodoro.remainingTime <= 0) {
         pomodoro.remainingTime = pomodoro.isWork ? workDuration : breakDuration;
     }


    const alarmName = pomodoro.isWork ? POMODORO_ALARM_WORK : POMODORO_ALARM_BREAK;
    const delayMinutes = pomodoro.remainingTime / 60;

    chrome.alarms.create(alarmName, { delayInMinutes: delayMinutes });

    await chrome.storage.local.set({ pomodoro });
    console.log(`Pomodoro timer started/resumed (${pomodoro.isWork ? 'Work' : 'Break'}). Alarm ${alarmName} set for ${delayMinutes.toFixed(2)} min.`);
}

async function pausePomodoroTimer() {
    let { pomodoro } = await chrome.storage.local.get('pomodoro');

    if (!pomodoro.isRunning) {
         console.log("Pomodoro timer is not running, cannot pause.");
        return; // Not running
    }

    // Clear the active alarm
    const alarmName = pomodoro.isWork ? POMODORO_ALARM_WORK : POMODORO_ALARM_BREAK;
    await chrome.alarms.clear(alarmName);

    // Calculate remaining time when paused
    const elapsed = (Date.now() - pomodoro.startTime) / 1000; // seconds
    pomodoro.remainingTime = Math.max(0, pomodoro.remainingTime - elapsed); // Ensure non-negative

    pomodoro.isRunning = false;
    pomodoro.startTime = null; // Clear start time as it's paused

    await chrome.storage.local.set({ pomodoro });
    console.log(`Pomodoro timer paused (${pomodoro.isWork ? 'Work' : 'Break'}). Remaining: ${pomodoro.remainingTime.toFixed(1)}s`);
}

async function resetPomodoroTimer() {
     let { pomodoro } = await chrome.storage.local.get('pomodoro');
     const workDuration = pomodoro.settings?.workDuration || WORK_DURATION_DEFAULT;

     // Clear any active alarms
     await chrome.alarms.clear(POMODORO_ALARM_WORK);
     await chrome.alarms.clear(POMODORO_ALARM_BREAK);

     pomodoro.isRunning = false;
     pomodoro.isWork = true; // Reset to work phase
     pomodoro.startTime = null;
     pomodoro.remainingTime = workDuration; // Reset to full work duration

     await chrome.storage.local.set({ pomodoro });
     console.log("Pomodoro timer reset to initial work state.");
}

async function completeWorkSession() {
    console.log("Pomodoro work session completed.");
    let { pomodoro } = await chrome.storage.local.get('pomodoro');
    const breakDuration = pomodoro.settings?.breakDuration || BREAK_DURATION_DEFAULT;
    const today = getTodayDateString();

    // Increment session count
     if (pomodoro.lastSessionDate !== today) {
         pomodoro.sessionsToday = 1; // First session of the day
         pomodoro.lastSessionDate = today;
     } else {
         pomodoro.sessionsToday += 1;
     }

    // Switch to break
    pomodoro.isWork = false;
    pomodoro.isRunning = true; // Immediately start the break
    pomodoro.startTime = Date.now();
    pomodoro.remainingTime = breakDuration;

    // Set break alarm
    chrome.alarms.create(POMODORO_ALARM_BREAK, { delayInMinutes: breakDuration / 60 });

    await chrome.storage.local.set({ pomodoro });
    console.log(`Starting break session. Sessions today: ${pomodoro.sessionsToday}. Break alarm set.`);

    // Optional: Send notification
    // chrome.notifications.create(...); // Requires "notifications" permission
}

async function completeBreakSession() {
     console.log("Pomodoro break session completed.");
     let { pomodoro } = await chrome.storage.local.get('pomodoro');
     const workDuration = pomodoro.settings?.workDuration || WORK_DURATION_DEFAULT;

     // Switch back to work
     pomodoro.isWork = true;
     pomodoro.isRunning = true; // Immediately start next work session
     pomodoro.startTime = Date.now();
     pomodoro.remainingTime = workDuration;

     // Set work alarm
     chrome.alarms.create(POMODORO_ALARM_WORK, { delayInMinutes: workDuration / 60 });

     await chrome.storage.local.set({ pomodoro });
     console.log("Starting next work session. Work alarm set.");

     // Optional: Send notification
     // chrome.notifications.create(...);
}


// --- Deep Work Mode Logic ---

async function toggleDeepWorkMode(enable) {
    let { settings } = await chrome.storage.local.get('settings');

    if (enable) {
        if (settings.deepWorkActive) {
             console.log("Deep work already active.");
             return; // Already active
        }
        const endTime = Date.now() + DEEP_WORK_DURATION_DEFAULT * 1000;
        settings.deepWorkActive = true;
        settings.deepWorkEndTime = endTime;

        // Set alarm to automatically end deep work
        await chrome.alarms.clear(DEEP_WORK_END_ALARM); // Clear previous if any
        chrome.alarms.create(DEEP_WORK_END_ALARM, { when: endTime });

        await chrome.storage.local.set({ settings });
        console.log(`Deep Work mode ACTIVATED. Ends at ${new Date(endTime).toLocaleTimeString()}. Alarm set.`);

    } else {
       await endDeepWorkMode(true); // Call the common end function, clear alarm
    }
}

// Central function to end deep work mode
async function endDeepWorkMode(clearAlarm) {
    let { settings } = await chrome.storage.local.get('settings');
     if (!settings.deepWorkActive) {
         // console.log("Deep work is not active.");
         return; // Not active
     }

     settings.deepWorkActive = false;
     settings.deepWorkEndTime = null;

     if (clearAlarm) {
         await chrome.alarms.clear(DEEP_WORK_END_ALARM);
     }

     await chrome.storage.local.set({ settings });
     console.log("Deep Work mode DEACTIVATED.");
}


// --- Snooze Logic ---

async function activateSnooze(domain) {
     console.log(`Attempting to activate snooze for ${domain}`);
     const { snoozeStatus = {} } = await chrome.storage.local.get('snoozeStatus');
     const today = getTodayDateString(); // Ensure we are comparing against today

     // Check if snooze was already used today for this domain
     const domainSnooze = snoozeStatus[domain] || {};
     if (domainSnooze.snoozeUsedToday) {
         console.log(`Snooze already used for ${domain} today.`);
         // Optional: Send message back to blocked page indicating failure?
         return false; // Indicate failure
     }

     // Activate snooze
     const snoozedUntil = Date.now() + SNOOZE_DURATION * 1000;
     snoozeStatus[domain] = {
         snoozedUntil: snoozedUntil,
         snoozeUsedToday: true // Mark as used for today
     };

     // Set an alarm to clear the snooze status (optional, but good practice)
     const alarmName = SNOOZE_ALARM_PREFIX + domain;
     await chrome.alarms.clear(alarmName); // Clear previous if any
     chrome.alarms.create(alarmName, { when: snoozedUntil });

     await chrome.storage.local.set({ snoozeStatus });
     console.log(`Snooze activated for ${domain} until ${new Date(snoozedUntil).toLocaleTimeString()}. Alarm ${alarmName} set.`);
     return true; // Indicate success
}

async function endSnooze(domain) {
    const { snoozeStatus = {} } = await chrome.storage.local.get('snoozeStatus');
    if (snoozeStatus[domain] && snoozeStatus[domain].snoozedUntil) {
        // Only clear the 'until' timestamp, keep 'usedToday' flag until daily reset
        snoozeStatus[domain].snoozedUntil = null;
        await chrome.storage.local.set({ snoozeStatus });
        console.log(`Snooze ended for ${domain}.`);
    }
    // No need to clear the alarm here, as this function is triggered BY the alarm.
}


// --- Message Listener (from Popup or Content Scripts) ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("BG: Received message:", message.action, "from", sender.tab ? "content script" : "popup/blocked page");

    // Use a flag to indicate if sendResponse will be called asynchronously
    let willRespondAsync = false;

    switch (message.action) {
        // Pomodoro Actions
        case "startPomodoro":
            startPomodoroTimer().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
            willRespondAsync = true;
            break;
        case "pausePomodoro":
            pausePomodoroTimer().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
            willRespondAsync = true;
            break;
        case "resetPomodoro":
            resetPomodoroTimer().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
            willRespondAsync = true;
            break;

        // Deep Work Action
        case "toggleDeepWork":
            toggleDeepWorkMode(message.enable).then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
             willRespondAsync = true;
            break;

         // Snooze Action (from blocked.js)
         case "activateSnooze":
             if (message.domain) {
                 activateSnooze(message.domain)
                     .then(success => sendResponse({ success: success }))
                     .catch(e => sendResponse({ success: false, error: e.message }));
                 willRespondAsync = true;
             } else {
                 sendResponse({ success: false, error: "Domain not provided for snooze." });
             }
             break;


        // Add more actions as needed...

        default:
            console.log("BG: Unknown action received:", message.action);
            sendResponse({ success: false, error: "Unknown action" });
            break;
    }

    // Return true to indicate that sendResponse will be called asynchronously
    return willRespondAsync;
});