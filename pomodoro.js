// pomodoro.js - Logic for the Pomodoro section (Updated for Refined UI)

// --- Selectors ---
const pomodoroTimeDisplay = document.getElementById('pomodoro-time');
const pomodoroStatusDisplay = document.getElementById('pomodoro-status');
const pomodoroSessionsDisplay = document.getElementById('pomodoro-sessions');
const startButton = document.getElementById('pomodoro-start');
const pauseButton = document.getElementById('pomodoro-pause');
const resetButton = document.getElementById('pomodoro-reset');
// NEW: Progress bar selectors
const progressBarInner = document.querySelector('.pomodoro-progress-bar-inner');

// --- Default constants in JS ---
const WORK_DURATION_DEFAULT_JS = 25 * 60;
const BREAK_DURATION_DEFAULT_JS = 5 * 60;

let timerInterval = null;

/** Updates the Pomodoro display in the popup based on data from storage */
async function updatePomodoroDisplay() {
    const { pomodoro = {} } = await chrome.storage.local.get('pomodoro');

    const safePomodoro = {
        isRunning: false, isWork: true, remainingTime: WORK_DURATION_DEFAULT_JS,
        startTime: null, sessionsToday: 0,
        settings: { workDuration: WORK_DURATION_DEFAULT_JS, breakDuration: BREAK_DURATION_DEFAULT_JS },
        ...pomodoro,
        settings: {
            workDuration: pomodoro.settings?.workDuration ?? WORK_DURATION_DEFAULT_JS,
            breakDuration: pomodoro.settings?.breakDuration ?? BREAK_DURATION_DEFAULT_JS,
        }
    };

    const { isRunning, isWork, remainingTime, sessionsToday, settings, startTime } = safePomodoro;
    const { workDuration, breakDuration } = settings;

    let displayTime;
    let currentRemainingSec = remainingTime;
    const totalDuration = isWork ? workDuration : breakDuration; // Get total duration for current phase

    // --- Calculate Time & Progress ---
    let progressPercent = 0;
    if (isRunning && startTime) {
        const elapsedSec = (Date.now() - startTime) / 1000;
        currentRemainingSec = Math.max(0, remainingTime - elapsedSec);
        displayTime = formatTime(currentRemainingSec);
        // Calculate progress
        if (totalDuration > 0) {
             progressPercent = ((totalDuration - currentRemainingSec) / totalDuration) * 100;
        }
    } else {
        const timeToShow = (!startTime && isWork) ? workDuration : remainingTime;
        displayTime = formatTime(timeToShow);
        // Calculate progress for paused/stopped state
        if (totalDuration > 0) {
             progressPercent = ((totalDuration - timeToShow) / totalDuration) * 100;
        }
    }

    // --- Update DOM Elements ---
    pomodoroTimeDisplay.textContent = displayTime;
    pomodoroStatusDisplay.textContent = isWork ? 'Focus Time' : 'Break Time'; // No "(Paused)" text needed per design
    pomodoroSessionsDisplay.textContent = sessionsToday || 0;

    // Update Progress Bar Width and Color Class
    if (progressBarInner) {
        progressBarInner.style.width = `${Math.min(100, progressPercent)}%`; // Cap at 100
        if (isWork) {
            progressBarInner.classList.remove('mode-break');
            progressBarInner.classList.add('mode-focus');
        } else {
            progressBarInner.classList.remove('mode-focus');
            progressBarInner.classList.add('mode-break');
        }
    }

    // Update Button States and Text
    if (isRunning) {
        startButton.style.display = 'none';   // Hide Start
        pauseButton.style.display = 'inline-flex'; // Show Pause (Styled Red via CSS)
        resetButton.disabled = false;      // Enable Reset when running
    } else { // Stopped or Paused
        pauseButton.style.display = 'none';   // Hide Pause
        startButton.style.display = 'inline-flex'; // Show Start (Styled Purple via CSS)
        startButton.querySelector('.btn-text').textContent = startTime ? 'Resume' : 'Start'; // Change text if paused
        resetButton.disabled = !startTime && isWork && remainingTime === workDuration; // Disable Reset only if fully stopped initially
    }
}

// --- Event Handlers for Buttons (No changes needed here) ---

function handleStart() {
    console.log("Popup: Requesting timer start/resume");
    chrome.runtime.sendMessage({ action: "startPomodoro" });
    // Minor UI update for immediate feedback (optional)
    startButton.disabled = true;
}

function handlePause() {
    console.log("Popup: Requesting timer pause");
    chrome.runtime.sendMessage({ action: "pausePomodoro" });
    // Minor UI update for immediate feedback (optional)
    pauseButton.disabled = true;
}

function handleReset() {
    console.log("Popup: Requesting timer reset");
     if (confirm("Are you sure you want to reset the timer to the beginning of the work phase?")) {
        chrome.runtime.sendMessage({ action: "resetPomodoro" });
        // updatePomodoroDisplay(); // Might cause flicker, interval will update soon
     }
}

// --- Initialization ---

function initPomodoro() {
    // Add listeners for control buttons
    startButton.addEventListener('click', handleStart);
    pauseButton.addEventListener('click', handlePause);
    resetButton.addEventListener('click', handleReset);

    // Slider listener logic is removed.

    // --- Setup the display update interval ---
    // Update display immediately on load
    updatePomodoroDisplay();
    // Clear any existing interval (if popup is reopened)
    if (timerInterval) clearInterval(timerInterval);
    // Set interval to update the display every second
    timerInterval = setInterval(updatePomodoroDisplay, 1000);

    // --- Cleanup interval when popup closes ---
    window.addEventListener('unload', () => {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
            // console.log("Popup closed, cleared Pomodoro display interval.");
        }
    });

    console.log("Pomodoro section initialized.");
}