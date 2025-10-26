// app.js

const API_BASE_URL = 'https://jennine-unaccomplished-preelectrically.ngrok-free.dev/api/';
const BACKEND_BASE_URL = API_BASE_URL.replace('/api', '');
let accessToken = null;
let refreshToken = null;
let currentUser = null;
let currentProjectId = null;
let chatSocket = null;

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
    const base = API_BASE_URL.replace(/\/+$/, '');
    const path = (endpoint || '').replace(/^\/+/, '');
    return `${base}/${path}`;
}
async function apiRequest(url, method = 'GET', body = null, requiresAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    let currentToken = localStorage.getItem('accessToken');

    if (requiresAuth) {
        if (!currentToken) {
            showError("Authentication required. Please log in."); logout(); throw new Error("Not authenticated");
        }
        headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const options = { method, headers };
    if (body) { options.body = JSON.stringify(body); }
    const fullUrl = buildFullUrl(url);

    try {
        console.log(`Making ${method} request to: ${fullUrl}`);
        let response = await fetch(fullUrl, options);

        if (response.status === 401 && requiresAuth) {
            let currentRefreshToken = localStorage.getItem('refreshToken');
            if (currentRefreshToken) {
                console.log("Token expired/invalid, refreshing...");
                const refreshed = await tryRefreshToken(currentRefreshToken);
                if (refreshed) {
                    currentToken = localStorage.getItem('accessToken');
                    headers['Authorization'] = `Bearer ${currentToken}`;
                    const retryOptions = { method, headers }; if (body) retryOptions.body = JSON.stringify(body);
                    console.log(`Retrying ${method} request to: ${fullUrl}`);
                    response = await fetch(fullUrl, retryOptions);
                } else { showError("Session expired. Log in again."); logout(); throw new Error("Token refresh failed"); }
            } else { showError("Session expired. Log in again."); logout(); throw new Error("No refresh token"); }
        }

        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); }
            catch (e) { errorData = { detail: `HTTP Error: ${response.status} ${response.statusText}` }; }
            console.error("API Error:", errorData); throw new Error(errorData.detail || errorData.error || `Request failed: ${response.statusText}`);
        }

        if (response.status === 204) { return null; }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) { return await response.json(); }
        else { return await response.text(); }

    } catch (error) {
        if (!errorDiv.textContent.includes(error.message)) { showError(`API Request Failed: ${error.message}`); }
        console.error('API Fetch Error:', error); throw error;
    }
}


// --- Authentication ---
async function login() {
    clearMessages();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    if (!username || !password) { showError("Username and Password required."); return; }
    try {
        const data = await apiRequest('token/', 'POST', { username, password }, false);
        localStorage.setItem('accessToken', data.access); localStorage.setItem('refreshToken', data.refresh);
        await fetchUserProfile(); // Fetch profile immediately after getting tokens
        showSuccess("Login successful!");
    } catch (error) { /* Handled by apiRequest */ }
}

async function register() {
    clearMessages();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const college = document.getElementById('reg-college').value;
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    if (!username || !email || !college || !password) { showError("All fields required."); return; }
    if (password !== password2) { showError("Passwords do not match."); return; }
    try {
        await apiRequest('register/', 'POST', { username, college_email: email, college_name: college, password, password2 }, false);
        showSuccess("Registration successful! Please log in."); showLoginForm();
    } catch (error) { /* Handled */ }
}

async function tryRefreshToken(tokenToRefresh) {
    if (!tokenToRefresh) return false;
    try {
        const data = await apiRequest('token/refresh/', 'POST', { refresh: tokenToRefresh }, false);
        localStorage.setItem('accessToken', data.access); // Update stored token
        console.log("Token refreshed."); return true;
    } catch (error) { console.error("Refresh token failed:", error); return false; }
}

async function fetchUserProfile() {
    try {
        const user = await apiRequest('me/', 'GET');
        if (!user || typeof user !== 'object') { throw new Error("Invalid user data received."); }
        currentUser = user; authStatusDiv.textContent = `Status: Logged in as ${user.username || 'user'}`;
        logoutButton.classList.remove('hidden'); authSection.classList.add('hidden'); mainContent.classList.remove('hidden');
        displayUserProfile(user);

        // --- Update Chat Hub Link ---
        if (chatHubLink) {
            chatHubLink.href = `${BACKEND_BASE_URL}/api/chat/`; // Set correct URL
        }

        // Load initial content now that user is confirmed
        fetchProjects(); fetchMyApplications();
    } catch (error) { console.error("Fetch profile failed, logging out.", error); logout(); }
}

function logout() {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) { chatSocket.close(); } chatSocket = null;
    accessToken = null; refreshToken = null; currentUser = null; currentProjectId = null;
    localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken');
    authStatusDiv.textContent = 'Status: Not logged in'; logoutButton.classList.add('hidden');
    authSection.classList.remove('hidden'); mainContent.classList.add('hidden');
    showLoginForm(); clearMessages(); console.log("Logged out.");
}

function checkLoginStatus() {
    accessToken = localStorage.getItem('accessToken'); refreshToken = localStorage.getItem('refreshToken');
    if (accessToken && refreshToken) { console.log("Tokens found, verifying..."); fetchUserProfile(); }
    else { console.log("No tokens, ensuring logout."); logout(); }
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
            const chatUrl = `${BACKEND_BASE_URL}/api/chat/${currentProjectId}/?token=${currentToken}`;
            console.log("Opening chat URL:", chatUrl);
            window.open(chatUrl, '_blank');
        } else {
            showError("Token not found. Log in again."); logout();
        }
    } else { showError("No project selected."); }
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
