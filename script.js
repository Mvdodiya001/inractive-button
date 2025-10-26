// app.js

const API_BASE_URL = 'https://jennine-unaccomplished-preelectrically.ngrok-free.dev/api';
let accessToken = null;
let refreshToken = null;
let currentUser = null;
let currentProjectId = null;

// DOM Elements (Keep all your existing element variables here)
const authStatusDiv = document.getElementById('auth-status');
const errorDiv = document.getElementById('error-message');
const successDiv = document.getElementById('success-message');
const logoutButton = document.getElementById('logout-button');
const authSection = document.getElementById('auth-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const mainContent = document.getElementById('main-content');
const profileSection = document.getElementById('profile-section');
const profileDetailsDiv = document.getElementById('profile-details');
const profileEditForm = document.getElementById('profile-edit-form');
const projectListSection = document.getElementById('project-list-section');
const projectsUl = document.getElementById('projects-ul');
const createProjectForm = document.getElementById('create-project-form');
const projectDetailSection = document.getElementById('project-detail-section');
const projectDetailTitle = document.getElementById('project-detail-title');
const projectDetailContent = document.getElementById('project-detail-content');
const projectActions = document.getElementById('project-actions');
const addRoleForm = document.getElementById('add-role-form');
const rolesUl = document.getElementById('roles-ul');
const teamUl = document.getElementById('team-ul');
const applicationsUl = document.getElementById('applications-ul');
const projectApplicationsDiv = document.getElementById('project-applications');
const myApplicationsSection = document.getElementById('my-applications-section');
const myApplicationsUl = document.getElementById('my-applications-ul');
const chatLinkButton = document.getElementById('chat-link-button');

// --- API Helper ---
function buildFullUrl(endpoint) {
    // Normalize base and endpoint to avoid double slashes
    const base = API_BASE_URL.replace(/\/+$/, '');     // remove trailing slashes from base
    const path = (endpoint || '').replace(/^\/+/, ''); // remove leading slashes from endpoint
    return `${base}/${path}`;
}

async function apiRequest(url, method = 'GET', body = null, requiresAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    let currentToken = localStorage.getItem('accessToken'); // Get token from storage

    if (requiresAuth) {
        if (!currentToken) {
            showError("Authentication required. Please log in.");
            logout(); // Force logout if no token
            throw new Error("Not authenticated");
        }
        headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const fullUrl = buildFullUrl(url);

    try {
        let response = await fetch(fullUrl, options);

        // Handle expired token and try to refresh ONLY if auth was required
        if (response.status === 401 && requiresAuth) {
            let currentRefreshToken = localStorage.getItem('refreshToken');
            if (currentRefreshToken) {
                console.log("Access token expired, attempting refresh...");
                const refreshed = await tryRefreshToken(currentRefreshToken); // Pass refresh token
                if (refreshed) {
                    // Update header with the NEW access token for the retry
                    currentToken = localStorage.getItem('accessToken'); // Get the newly stored token
                    headers['Authorization'] = `Bearer ${currentToken}`;
                    // Rebuild options (update headers) and retry the request
                    const retryOptions = { method, headers };
                    if (body) retryOptions.body = JSON.stringify(body);
                    response = await fetch(fullUrl, retryOptions); // Retry original request
                } else {
                    showError("Session expired. Please log in again.");
                    logout();
                    throw new Error("Token refresh failed");
                }
            } else {
                 showError("Session expired. Please log in again.");
                 logout();
                 throw new Error("No refresh token available");
            }
        }

        if (!response.ok) {
            // Try to parse error json, provide fallback message
            const errorData = await response.json().catch(() => ({ detail: `HTTP Error: ${response.status} ${response.statusText}` }));
            console.error("API Error Response:", errorData);
            // Use detail if available (DRF standard), fallback to error or generic message
            throw new Error(errorData.detail || errorData.error || `Request failed: ${response.statusText}`);
        }

         // Handle responses that might not have content (like 204 No Content from DELETE)
         if (response.status === 204) {
             return null; // Explicitly return null for No Content
         }
         const contentType = response.headers.get("content-type");
         if (contentType && contentType.includes("application/json")) {
             return await response.json(); // Only parse JSON if header indicates it
         } else {
             return await response.text(); // Return text for non-JSON responses
         }

    } catch (error) {
        // Avoid showing duplicate errors if already handled
        if (!errorDiv.textContent.includes(error.message)) {
            showError(`API Request Failed: ${error.message}`);
        }
        console.error('API Request Error:', error);
        throw error; // Re-throw
    }
}


// --- Authentication ---
async function login() {
    clearMessages();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        // Login request doesn't require auth
        const data = await apiRequest('/token/', 'POST', { username, password }, false);
        accessToken = data.access; // Store in global variable (optional, localStorage is primary)
        refreshToken = data.refresh;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        await fetchUserProfile(); // Fetch user info immediately
        showSuccess("Login successful!");
    } catch (error) { /* Error should be shown by apiRequest */ }
}

async function register() {
    clearMessages();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const college = document.getElementById('reg-college').value;
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    if (!username || !email || !college || !password) {
        showError("All fields are required for registration."); return;
    }
    if (password !== password2) { showError("Passwords do not match."); return; }

    try {
        // Register request doesn't require auth
        await apiRequest('/register/', 'POST', {
            username: username, college_email: email, college_name: college,
            password: password, password2: password2
        }, false);
        showSuccess("Registration successful! Please log in.");
        showLoginForm(); // Switch back to login form
    } catch (error) { /* Error shown by apiRequest */ }
}

async function tryRefreshToken(tokenToRefresh) {
    if (!tokenToRefresh) return false;
    try {
        // Refresh request doesn't require auth itself, uses the refresh token in body
        const data = await apiRequest('/token/refresh/', 'POST', { refresh: tokenToRefresh }, false);
        accessToken = data.access; // Update global var (optional)
        localStorage.setItem('accessToken', accessToken); // Update stored access token
        console.log("Token refreshed successfully.");
        return true;
    } catch (error) {
        console.error("Failed to refresh token:", error);
        return false; // Indicates refresh failed
    }
}

async function fetchUserProfile() {
    try {
        // Profile request requires auth
        const user = await apiRequest('/me/', 'GET');
        currentUser = user; // Store user data globally
        authStatusDiv.textContent = `Status: Logged in as ${user.username}`;
        logoutButton.classList.remove('hidden');
        authSection.classList.add('hidden');
        mainContent.classList.remove('hidden');
        displayUserProfile(user);
        // Load initial data now that we know the user
        fetchProjects();
        fetchMyApplications();
    } catch (error) {
        // If fetching profile fails (e.g., invalid/expired token after refresh failed), log out
        console.error("Failed to fetch user profile, logging out.", error);
        logout();
    }
}

function logout() {
    accessToken = null; refreshToken = null; currentUser = null; currentProjectId = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    authStatusDiv.textContent = 'Status: Not logged in';
    logoutButton.classList.add('hidden');
    authSection.classList.remove('hidden'); // Show login/register
    mainContent.classList.add('hidden'); // Hide main content
    showLoginForm(); // Default to login form
    clearMessages();
    // Close WebSocket if it's open
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.close();
    }
    chatSocket = null;
    console.log("User logged out.");
}

function checkLoginStatus() {
    // Check for tokens on initial load
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    if (accessToken && refreshToken) {
        console.log("Tokens found, attempting to fetch user profile...");
        fetchUserProfile(); // Verify tokens by fetching profile
    } else {
        console.log("No tokens found, showing login form.");
        logout(); // Ensure clean logged-out state
    }
}

// --- Profile ---
function displayUserProfile(user) {
    profileDetailsDiv.innerHTML = `
        <p><strong>Username:</strong> ${user.username}</p>
        <p><strong>Email:</strong> ${user.college_email}</p>
        <p><strong>College:</strong> ${user.college_name}</p>
        <p><strong>GitHub:</strong> ${user.github_profile || 'Not set'}</p>
        <p><strong>Skills:</strong> ${user.skills || 'Not set'}</p>
    `;
    // Pre-fill edit form
    document.getElementById('edit-github').value = user.github_profile || '';
    document.getElementById('edit-skills').value = user.skills || '';
}

async function updateProfile() {
    clearMessages();
    const github = document.getElementById('edit-github').value;
    const skills = document.getElementById('edit-skills').value;
    try {
        const updatedUser = await apiRequest('/me/', 'PATCH', { github_profile: github, skills: skills });
        currentUser = updatedUser;
        displayUserProfile(updatedUser);
        hideProfileEditForm();
        showSuccess("Profile updated successfully!");
    } catch (error) { /* Error shown by apiRequest */ }
}

// --- Projects ---
async function fetchProjects() {
    clearMessages();
    projectsUl.innerHTML = '<li>Loading projects...</li>';

    // Build query params
    const search = document.getElementById('project-search').value;
    const status = document.getElementById('project-status-filter').value;
    const college = document.getElementById('project-college-filter').value;
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (college) params.append('leader__college_name', college);
    const queryString = params.toString();
    const url = `/projects/${queryString ? '?' + queryString : ''}`;

    try {
        const projects = await apiRequest(url, 'GET');
        projectsUl.innerHTML = ''; // Clear loading/previous
        if (projects.length === 0) {
            projectsUl.innerHTML = '<li>No projects found matching criteria.</li>';
        } else {
            projects.forEach(project => {
                const li = document.createElement('li');
                li.className = 'project-item';
                li.innerHTML = `
                    <strong>${project.title}</strong> (Led by: ${project.leader})<br>
                    <small>College: ${project.leader_college || 'N/A'} | Status: ${project.status}</small>
                `;
                li.onclick = () => showProjectDetail(project.id);
                projectsUl.appendChild(li);
            });
        }
    } catch (error) {
         projectsUl.innerHTML = '<li>Could not load projects.</li>';
    }
}

async function showProjectDetail(projectId) {
    clearMessages();
    currentProjectId = projectId; // Store current project ID
    projectListSection.classList.add('hidden');
    projectDetailSection.classList.remove('hidden');
    projectDetailContent.innerHTML = 'Loading project details...';
    rolesUl.innerHTML = '';
    teamUl.innerHTML = '';
    applicationsUl.innerHTML = '';
    projectApplicationsDiv.classList.add('hidden');
    projectActions.classList.add('hidden'); // Hide leader actions initially

    try {
        const project = await apiRequest(`/projects/${projectId}/`, 'GET');
        projectDetailTitle.textContent = project.title;
        projectDetailContent.innerHTML = `
            <p><strong>Leader:</strong> ${project.leader} (${project.leader_college || 'N/A'})</p>
            <p><strong>Description:</strong> ${project.description || 'None'}</p>
            <p><strong>Status:</strong> ${project.status}</p>
            <p><strong>GitHub:</strong> ${project.github_link ? `<a href="${project.github_link}" target="_blank">${project.github_link}</a>` : 'Not linked'}</p>
            <p><strong>Created:</strong> ${new Date(project.created_at).toLocaleDateString()}</p>
        `;

        // Display Roles
        if (project.roles && project.roles.length > 0) {
            project.roles.forEach(role => {
                 const li = document.createElement('li');
                 li.className = 'role-item';
                 li.innerHTML = `
                    <strong>${role.role_name}</strong><br>
                    <small>Skills: ${role.required_skills}</small><br>
                    ${project.leader === currentUser.username ? '' : `<button onclick="applyForRole(${project.id}, ${role.id})">Apply</button>`}
                 `;
                  // If leader, show button to view applications for this role
                 if (project.leader === currentUser.username) {
                     li.innerHTML += `<button class="secondary" onclick="fetchApplicationsForRole(${project.id}, ${role.id})">View Applications</button>`;
                 }
                 rolesUl.appendChild(li);
            });
        } else {
            rolesUl.innerHTML = '<li>No roles defined yet.</li>';
        }

        // Display Team Members
        if (project.team_members && project.team_members.length > 0) {
            project.team_members.forEach(member => {
                 const li = document.createElement('li');
                 li.innerHTML = `<strong>${member.user}</strong> (Joined: ${new Date(member.joined_at).toLocaleDateString()})`;
                 teamUl.appendChild(li);
            });
        } else {
            teamUl.innerHTML = '<li>No team members yet.</li>';
        }

        // Show leader actions if current user is the leader
        if (project.leader === currentUser.username) {
            projectActions.classList.remove('hidden');
        }

    } catch (error) {
        projectDetailContent.innerHTML = 'Could not load project details.';
    }
}

async function createProject() {
    clearMessages();
    const githubLink = document.getElementById('new-github').value;
    const title = document.getElementById('new-title').value;
    const description = document.getElementById('new-description').value;

    let body = {};
    if (githubLink) {
        body = { github_link: githubLink };
    } else if (title) {
        body = { title: title, description: description };
    } else {
        showError("You must provide either a GitHub link or a Title.");
        return;
    }

    try {
        await apiRequest('/projects/', 'POST', body);
        showSuccess("Project created successfully!");
        hideCreateProjectForm();
        fetchProjects(); // Refresh list
    } catch (error) { /* Error shown by apiRequest */ }
}

async function addRole() {
    clearMessages();
    if (!currentProjectId) return;

    const roleName = document.getElementById('new-role-name').value;
    const requiredSkills = document.getElementById('new-role-skills').value;

    if (!roleName || !requiredSkills) {
        showError("Role Name and Skills are required.");
        return;
    }

    try {
        await apiRequest(`/projects/${currentProjectId}/roles/`, 'POST', {
            role_name: roleName,
            required_skills: requiredSkills
        });
        showSuccess("Role added successfully!");
        hideAddRoleForm();
        showProjectDetail(currentProjectId); // Refresh project details
    } catch (error) { /* Error shown by apiRequest */ }
}

// --- Applications ---
async function applyForRole(projectId, roleId) {
    clearMessages();
    const proposal = prompt("Enter your proposal for this role:");
    if (!proposal) return; // User cancelled

    try {
        await apiRequest(`/projects/${projectId}/roles/${roleId}/applications/`, 'POST', { proposal });
        showSuccess("Application submitted successfully!");
        fetchMyApplications(); // Refresh user's application list
    } catch (error) { /* Error shown by apiRequest */ }
}

async function fetchMyApplications() {
    clearMessages();
    myApplicationsUl.innerHTML = '<li>Loading your applications...</li>';
    try {
        const applications = await apiRequest('/my-applications/', 'GET');
        myApplicationsUl.innerHTML = ''; // Clear loading/previous
        if (applications.length === 0) {
            myApplicationsUl.innerHTML = '<li>You have not submitted any applications yet.</li>';
        } else {
            applications.forEach(app => {
                const li = document.createElement('li');
                li.innerHTML = `
                    Applied for: <strong>${app.project_role}</strong><br>
                    Status: <strong>${app.status}</strong><br>
                    <p>Proposal: ${app.proposal}</p>
                    <small>Applied on: ${new Date(app.applied_at).toLocaleDateString()}</small>
                `;
                myApplicationsUl.appendChild(li);
            });
        }
    } catch (error) {
         myApplicationsUl.innerHTML = '<li>Could not load your applications.</li>';
    }
}

async function fetchApplicationsForRole(projectId, roleId) {
    clearMessages();
    projectApplicationsDiv.classList.remove('hidden');
    applicationsUl.innerHTML = '<li>Loading applications for this role...</li>';

    try {
        const applications = await apiRequest(`/projects/${projectId}/roles/${roleId}/applications/`, 'GET');
        applicationsUl.innerHTML = ''; // Clear loading/previous
        if (applications.length === 0) {
            applicationsUl.innerHTML = '<li>No applications received for this role yet.</li>';
        } else {
            applications.forEach(app => {
                 const li = document.createElement('li');
                 li.className = 'app-item';
                 li.innerHTML = `
                     <strong>Applicant:</strong> ${app.applicant}<br>
                     <strong>Status:</strong> ${app.status}<br>
                     <p>Proposal: ${app.proposal}</p>
                     <small>Applied on: ${new Date(app.applied_at).toLocaleDateString()}</small><br>
                     ${app.status === 'PENDING' ? `
                         <button onclick="approveApplication(${projectId}, ${roleId}, ${app.id})">Approve</button>
                         <button class="secondary" onclick="rejectApplication(${projectId}, ${roleId}, ${app.id})">Reject</button>
                     ` : ''}
                 `;
                 applicationsUl.appendChild(li);
            });
        }
    } catch (error) {
        applicationsUl.innerHTML = '<li>Could not load applications.</li>';
    }
}

async function approveApplication(projectId, roleId, applicationId) {
    clearMessages();
    try {
        await apiRequest(`/projects/${projectId}/roles/${roleId}/applications/${applicationId}/approve/`, 'POST');
        showSuccess("Application approved!");
        // Refresh both the applications for the role and the main project details (to update team members)
        fetchApplicationsForRole(projectId, roleId);
        showProjectDetail(projectId);
    } catch (error) { /* Error shown by apiRequest */ }
}

async function rejectApplication(projectId, roleId, applicationId) {
    clearMessages();
    try {
        await apiRequest(`/projects/${projectId}/roles/${roleId}/applications/${applicationId}/reject/`, 'POST');
        showSuccess("Application rejected.");
        fetchApplicationsForRole(projectId, roleId); // Refresh application list
    } catch (error) { /* Error shown by apiRequest */ }
}

// --- Chat ---
function goToChat() {
    if (currentProjectId) {
        const currentToken = localStorage.getItem('accessToken');
        if (currentToken) {
            const chatUrl = `http://127.0.0.1:8000/api/chat/${currentProjectId}/?token=${currentToken}`;
            console.log("Opening chat URL:", chatUrl);
            window.open(chatUrl, '_blank'); 
        } else {
            showError("Cannot open chat. Access token not found. Please log in again.");
            logout();
        }
    } else {
        showError("No project selected to open chat for.");
    }
}

// --- UI Helpers ---
function showLoginForm() { registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); }
function showRegisterForm() { loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); }
function showProfileEditForm() { profileEditForm.classList.remove('hidden'); }
function hideProfileEditForm() { profileEditForm.classList.add('hidden'); }
function showCreateProjectForm() { createProjectForm.classList.remove('hidden'); }
function hideCreateProjectForm() { createProjectForm.classList.add('hidden'); }
function showAddRoleForm() { addRoleForm.classList.remove('hidden'); }
function hideAddRoleForm() { addRoleForm.classList.add('hidden'); }
function showProjectList() { projectDetailSection.classList.add('hidden'); projectListSection.classList.remove('hidden'); currentProjectId = null; }

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    successDiv.classList.add('hidden');
}
function showSuccess(message) {
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    errorDiv.classList.add('hidden');
}
function clearMessages() {
    errorDiv.textContent = '';
    errorDiv.classList.add('hidden');
    successDiv.textContent = '';
    successDiv.classList.add('hidden');
}

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', checkLoginStatus);


this  code  is  correct  or  not  
