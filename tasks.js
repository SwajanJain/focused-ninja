// tasks.js - Logic for the Tasks section in the popup

// --- Selectors ---
const addTaskForm = document.getElementById('add-task-form');
const newTaskTextInput = document.getElementById('new-task-text');
const newTaskPrioritySelect = document.getElementById('new-task-priority');
const addTaskButton = document.getElementById('add-task-button'); // Button within the form

const highPriorityTaskList = document.getElementById('high-priority-task-list');
const mediumPriorityTaskList = document.getElementById('medium-priority-task-list');
const lowPriorityTaskList = document.getElementById('low-priority-task-list');
const completedTaskList = document.getElementById('completed-task-list');
const completedTasksTitle = document.getElementById('completed-tasks-title');


const priorityOrder = { High: 1, Medium: 2, Low: 3 }; // Used for sorting within lists if needed

// --- Rendering Function ---

/** Renders tasks categorized by priority and completion */
async function renderTaskList() {
    let { tasks = [] } = await chrome.storage.local.get('tasks');

    // Clear existing lists
    highPriorityTaskList.innerHTML = '';
    mediumPriorityTaskList.innerHTML = '';
    lowPriorityTaskList.innerHTML = '';
    completedTaskList.innerHTML = '';

    if (!Array.isArray(tasks)) {
      console.warn("Tasks data is not an array. Resetting.");
      tasks = [];
      await chrome.storage.local.set({ tasks: [] });
    }

    let highCount = 0, mediumCount = 0, lowCount = 0, completedCount = 0;

    // Optional: Sort tasks first if needed (e.g., by creation date within priority)
    // tasks.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.dataset.taskId = task.id;
        li.classList.add(`priority-${task.priority}`); // Add class for border color

        li.innerHTML = `
            <div class="task-info">
                <input type="checkbox" class="task-complete-checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}>
                <span class="task-text">${task.text}</span>
            </div>
            <div class="task-controls">
                 <button class="delete-button delete-task-button" data-task-id="${task.id}" title="Delete Task">🗑️</button>
            </div>
        `;

        if (task.completed) {
            li.classList.add('completed');
            completedTaskList.appendChild(li);
            completedCount++;
        } else {
            if (task.priority === 'High') {
                highPriorityTaskList.appendChild(li);
                highCount++;
            } else if (task.priority === 'Medium') {
                mediumPriorityTaskList.appendChild(li);
                mediumCount++;
            } else { // Low
                lowPriorityTaskList.appendChild(li);
                lowCount++;
            }
        }
    });

    // Add placeholders if lists are empty
    if (highCount === 0) highPriorityTaskList.innerHTML = '<li class="placeholder">No high priority tasks.</li>';
    if (mediumCount === 0) mediumPriorityTaskList.innerHTML = '<li class="placeholder">No medium priority tasks.</li>';
    if (lowCount === 0) lowPriorityTaskList.innerHTML = '<li class="placeholder">No low priority tasks.</li>';
    if (completedCount === 0) completedTaskList.innerHTML = '<li class="placeholder">No completed tasks.</li>';

     // Hide sections if no tasks exist (optional)
     document.getElementById('high-priority-tasks').style.display = highCount > 0 ? 'block' : 'none';
     document.getElementById('medium-priority-tasks').style.display = mediumCount > 0 ? 'block' : 'none';
     document.getElementById('low-priority-tasks').style.display = lowCount > 0 ? 'block' : 'none';
     document.getElementById('completed-tasks').style.display = completedCount > 0 ? 'block' : 'none';


    // Update completed tasks title
    completedTasksTitle.textContent = `Completed Tasks (${completedCount})`;
}

// --- Event Handlers ---

/** Handles adding a new task */
async function handleAddTaskSubmit(event) {
     event.preventDefault(); // Prevent default form submission
    const text = newTaskTextInput.value.trim();
    const priority = newTaskPrioritySelect.value;

    if (!text) return;

    const newTask = {
        id: generateId(),
        text: text,
        priority: priority,
        completed: false,
        createdAt: Date.now()
    };

    const { tasks = [] } = await chrome.storage.local.get('tasks');
     if (!Array.isArray(tasks)) tasks = [];

    tasks.push(newTask);
    await chrome.storage.local.set({ tasks });

    addTaskForm.reset(); // Clear the form
    // newTaskTextInput.value = '';
    // newTaskPrioritySelect.value = 'Medium'; // Reset priority if needed

    await renderTaskList();
    console.log("Added task:", newTask);
}

/** Handles toggling task completion */
async function handleToggleTaskComplete(event) {
    const checkbox = event.target;
    if (!checkbox.classList.contains('task-complete-checkbox')) return;

    const taskId = checkbox.dataset.taskId;
    const isCompleted = checkbox.checked;

    const { tasks = [] } = await chrome.storage.local.get('tasks');
    if (!Array.isArray(tasks)) return;

    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        tasks[taskIndex].completed = isCompleted;
        await chrome.storage.local.set({ tasks });
        await renderTaskList(); // Re-render to move task and update style
        console.log(`Toggled completion for task ${taskId} to ${isCompleted}`);
    }
}

/** Handles deleting a task */
async function handleDeleteTask(event) {
    const deleteButton = event.target.closest('.delete-task-button');
    if (!deleteButton) return;

    const taskId = deleteButton.dataset.taskId;

    if (confirm("Are you sure you want to delete this task?")) {
        let { tasks = [] } = await chrome.storage.local.get('tasks');
        if (!Array.isArray(tasks)) return;

        tasks = tasks.filter(t => t.id !== taskId);
        await chrome.storage.local.set({ tasks });
        await renderTaskList();
        console.log(`Deleted task ${taskId}`);
    }
}

// --- Initialization ---

function initTasks() {
    addTaskForm.addEventListener('submit', handleAddTaskSubmit);

    // Use event delegation on parent containers
    const taskListsContainer = document.querySelector('.task-lists');
    if (taskListsContainer) {
        taskListsContainer.addEventListener('change', handleToggleTaskComplete);
        taskListsContainer.addEventListener('click', handleDeleteTask);
    } else {
        console.error("Task lists container not found for event delegation.");
    }


    // Initial render
    renderTaskList();
}

// Add basic styling for placeholder items if needed in CSS
// .placeholder { color: #aaa; font-style: italic; background: none; box-shadow: none; border: none; padding-left: 5px;}