// popup.js - Main script for the popup

document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // --- Tab Switching ---
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Deactivate current active elements
            document.querySelector('.tab-button.active')?.classList.remove('active');
            document.querySelector('.tab-content.active')?.classList.remove('active');

            // Activate clicked tab and content
            button.classList.add('active');
            const targetContent = document.getElementById(`${targetTab}-section`);
            if (targetContent) {
                targetContent.classList.add('active');
            } else {
                 console.error(`Tab content for '${targetTab}' not found.`);
            }

             // Optional: Re-initialize or refresh content if needed when switching tabs
             // For instance, ensure lists/states are up-to-date if they could change
             // while the popup is open but the tab is hidden.
            if (targetTab === 'home') {
                renderSiteList(); // Re-render sites as usage might change
                loadDeepWorkState();
            } else if (targetTab === 'tasks') {
                 renderTaskList(); // Re-render tasks
            } else if (targetTab === 'pomodoro') {
                 updatePomodoroDisplay(); // Ensure Pomodoro display is current
            }
        });
    });

    // --- Initialize Functionality ---
    // Ensure utility functions are available if not using modules
    if (typeof generateId !== 'function') {
         console.warn("Utils functions might not be loaded globally.");
    }

    initHome();
    initTasks();
    initPomodoro(); // This starts its own display interval

    // --- Listen for Storage Changes ---
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            console.log("Popup detected storage change:", changes);
            const activeTabContent = document.querySelector('.tab-content.active');
            if (!activeTabContent) return; // Do nothing if popup isn't fully loaded/visible

            const activeTabId = activeTabContent.id;

            // Update relevant parts of the UI based on which tab is active
            if (activeTabId === 'home-section' && (changes.sites || changes.usage)) {
                 console.log("Updating Home (sites/usage)");
                 renderSiteList();
             }
            if (activeTabId === 'home-section' && changes.settings) {
                console.log("Updating Home (settings - deep work)");
                loadDeepWorkState();
            }
             if (activeTabId === 'tasks-section' && changes.tasks) {
                 console.log("Updating Tasks");
                 renderTaskList();
             }
             // Pomodoro updates are handled by its interval, but we could force an update
             if (activeTabId === 'pomodoro-section' && changes.pomodoro) {
                  console.log("Updating Pomodoro Display due to storage change");
                  updatePomodoroDisplay();
             }
        }
    });

    console.log("FocusedNinja Popup Initialized");
});