// home.js - Logic for the Home section in the popup

// --- Selectors for new elements ---
const addSiteForm = document.getElementById('add-site-form');
const newSiteUrlInput = document.getElementById('new-site-url');
const newSiteCategorySelect = document.getElementById('new-site-category');
const newSiteVisitLimitInput = document.getElementById('new-site-visit-limit');
const newSiteTimeLimitInput = document.getElementById('new-site-time-limit');
const addSiteButton = document.getElementById('add-site-button'); // Button within the form

const productiveSiteList = document.getElementById('productive-site-list');
const unproductiveSiteList = document.getElementById('unproductive-site-list');
const neutralSiteList = document.getElementById('neutral-site-list');

const deepWorkToggle = document.getElementById('deep-work-toggle'); // Toggle remains the same ID

// --- Rendering Function ---

/** Renders the categorized lists of tracked sites with progress */
async function renderSiteList() {
    const { sites = {}, usage = {} } = await chrome.storage.local.get(['sites', 'usage']);
    const today = getTodayDateString();
    const todayUsage = usage[today] || {};

    // Clear existing lists
    productiveSiteList.innerHTML = '';
    unproductiveSiteList.innerHTML = '';
    neutralSiteList.innerHTML = '';

    let productiveCount = 0;
    let unproductiveCount = 0;
    let neutralCount = 0;

    // Sort domains alphabetically for consistent display within categories
    const sortedDomains = Object.keys(sites).sort();

    for (const domain of sortedDomains) {
        const siteData = sites[domain];
        const domainUsage = todayUsage[domain] || { visits: 0, timeSpent: 0 };
        const li = document.createElement('li');

        // Determine limits text
        let limitsText = 'No limits set';
        const limitsParts = [];
        if (siteData.visitLimit) limitsParts.push(`Visits: ${siteData.visitLimit}/day`);
        if (siteData.timeLimit) limitsParts.push(`Time: ${siteData.timeLimit / 60} min/day`);
        if (limitsParts.length > 0) limitsText = limitsParts.join(' - ');

        // Determine usage text
        const usageText = `${domainUsage.visits} visits - ${formatDuration(domainUsage.timeSpent)} spent`;

        // Calculate progress
        let visitProgress = 0;
        let timeProgress = 0;
        if (siteData.visitLimit && siteData.visitLimit > 0) {
             visitProgress = Math.min(100, (domainUsage.visits / siteData.visitLimit) * 100);
        }
        if (siteData.timeLimit && siteData.timeLimit > 0) {
            timeProgress = Math.min(100, (domainUsage.timeSpent / siteData.timeLimit) * 100);
        }

        // Create list item content
        li.innerHTML = `
            <div class="site-info">
                <strong>${domain}</strong>
                <div class="limits">${limitsText}</div>
                <div class="usage">${usageText}</div>
                 ${(siteData.visitLimit || siteData.timeLimit) ? `
                 <div class="progress-section">
                    ${siteData.visitLimit ? `
                    <div class="progress-item">
                        <label><span>Visits</span><span>${domainUsage.visits} / ${siteData.visitLimit}</span></label>
                        <progress value="${domainUsage.visits}" max="${siteData.visitLimit}">${visitProgress}%</progress>
                    </div>
                    ` : ''}
                    ${siteData.timeLimit ? `
                     <div class="progress-item">
                         <label><span>Time Spent</span><span>${formatDuration(domainUsage.timeSpent)} / ${formatDuration(siteData.timeLimit)}</span></label>
                         <progress value="${domainUsage.timeSpent}" max="${siteData.timeLimit}">${timeProgress}%</progress>
                     </div>
                     ` : ''}
                 </div>
                 ` : ''}
            </div>
            <div class="site-controls">
                 <!-- Add controls back here if needed (like category change or limit edit inline) -->
                 <button class="delete-button delete-site-button" data-domain="${domain}" title="Delete Site">🗑️</button>
                 <!-- Using emoji temporarily, replace with icon font or SVG -->
            </div>
        `;

        // Append to the correct list based on category
        if (siteData.category === 'Productive') {
            productiveSiteList.appendChild(li);
            productiveCount++;
        } else if (siteData.category === 'Unproductive') {
            unproductiveSiteList.appendChild(li);
            unproductiveCount++;
        } else {
            neutralSiteList.appendChild(li);
            neutralCount++;
        }
    }

    // Add placeholder if a list is empty
    if (productiveCount === 0) productiveSiteList.innerHTML = '<li>No productive sites added.</li>';
    if (unproductiveCount === 0) unproductiveSiteList.innerHTML = '<li>No unproductive sites added.</li>';
    if (neutralCount === 0) neutralSiteList.innerHTML = '<li>No neutral sites added.</li>';

    // Hide category sections if empty (optional)
    document.getElementById('productive-sites').style.display = productiveCount > 0 ? 'block' : 'none';
    document.getElementById('unproductive-sites').style.display = unproductiveCount > 0 ? 'block' : 'none';
    document.getElementById('neutral-sites').style.display = neutralCount > 0 ? 'block' : 'none';
}


// --- Event Handlers ---

/** Handles adding a new site via the form */
async function handleAddSiteSubmit(event) {
    event.preventDefault(); // Prevent default form submission

    const url = newSiteUrlInput.value.trim();
    if (!url) return;

    const domain = getDomain(url);
    if (!domain) {
        alert("Invalid URL or domain could not be extracted.");
        return;
    }

    const category = newSiteCategorySelect.value;
    const visitLimitRaw = newSiteVisitLimitInput.value.trim();
    const timeLimitRaw = newSiteTimeLimitInput.value.trim();

    const visitLimit = visitLimitRaw ? parseInt(visitLimitRaw, 10) : null;
    const timeLimitMinutes = timeLimitRaw ? parseInt(timeLimitRaw, 10) : null;
    const timeLimitSeconds = timeLimitMinutes ? timeLimitMinutes * 60 : null;

    if (visitLimit !== null && (isNaN(visitLimit) || visitLimit <= 0)) {
         alert("Visit Limit must be a positive number.");
         return;
    }
     if (timeLimitMinutes !== null && (isNaN(timeLimitMinutes) || timeLimitMinutes <= 0)) {
         alert("Time Limit must be a positive number of minutes.");
         return;
     }


    const { sites = {} } = await chrome.storage.local.get('sites');
    if (sites[domain]) {
        alert(`${domain} is already being tracked. You can edit limits below or delete and re-add.`);
        return;
    }

    // Add new site
    sites[domain] = {
        category: category,
        visitLimit: visitLimit,
        timeLimit: timeLimitSeconds // Store time limit in seconds
    };

    await chrome.storage.local.set({ sites });

    // Clear the form
    addSiteForm.reset(); // Resets all form fields
    // newSiteUrlInput.value = '';
    // newSiteCategorySelect.value = 'Unproductive'; // Reset to default if needed
    // newSiteVisitLimitInput.value = '';
    // newSiteTimeLimitInput.value = '';

    await renderSiteList(); // Re-render the list
    console.log(`Added site: ${domain}`);
}

/** Handles deleting a site */
async function handleDeleteSite(event) {
    // Use closest to find the button if icon inside button is clicked
    const deleteButton = event.target.closest('.delete-site-button');
    if (!deleteButton) return;

    const domain = deleteButton.dataset.domain;
    if (!domain) return;

    if (confirm(`Are you sure you want to stop tracking ${domain}?`)) {
        const { sites = {} } = await chrome.storage.local.get('sites');
        delete sites[domain];
        await chrome.storage.local.set({ sites });
        await renderSiteList(); // Re-render
        console.log(`Deleted site: ${domain}`);
    }
}

/** Handles toggling Deep Work mode */
async function handleDeepWorkToggle() {
    const isEnabled = deepWorkToggle.checked;
    chrome.runtime.sendMessage({
        action: "toggleDeepWork",
        enable: isEnabled
    });
    console.log(`Deep Work mode toggled: ${isEnabled}`);
}

/** Loads the current state of Deep Work toggle */
async function loadDeepWorkState() {
    const { settings = {} } = await chrome.storage.local.get('settings');
    deepWorkToggle.checked = settings.deepWorkActive || false;
}


// --- Initialization ---

function initHome() {
    addSiteForm.addEventListener('submit', handleAddSiteSubmit);

    // Use event delegation on parent lists for delete buttons
    productiveSiteList.addEventListener('click', handleDeleteSite);
    unproductiveSiteList.addEventListener('click', handleDeleteSite);
    neutralSiteList.addEventListener('click', handleDeleteSite);

    deepWorkToggle.addEventListener('change', handleDeepWorkToggle);

    // Initial rendering
    renderSiteList();
    loadDeepWorkState();
}