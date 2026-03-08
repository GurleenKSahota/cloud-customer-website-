// --- State ---
let authToken = null;
let cognitoConfig = null;
let authSession = null; // for NEW_PASSWORD_REQUIRED challenge
let selectedStoreId = null;
let allProducts = [];
let currentInventory = [];
let currentTab = 'inventory';

// --- Init ---
window.addEventListener('DOMContentLoaded', async () => {
    // Fetch Cognito config from server
    const res = await fetch('/api/config');
    cognitoConfig = await res.json();

    // Check for stored token
    const stored = sessionStorage.getItem('authToken');
    if (stored) {
        authToken = stored;
        showDashboard();
    }

    // Event listeners
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('new-password-form').addEventListener('submit', handleNewPassword);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('store-select').addEventListener('change', handleStoreChange);
    document.getElementById('add-product-btn').addEventListener('click', openAddModal);
    document.getElementById('close-modal-btn').addEventListener('click', closeAddModal);
    document.getElementById('confirm-add-btn').addEventListener('click', handleAddProduct);

    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Reports tab listeners
    document.getElementById('schedule-form').addEventListener('submit', handleCreateSchedule);
    document.getElementById('schedule-filter-type').addEventListener('change', handleFilterTypeChange);
    document.getElementById('refresh-schedules-btn').addEventListener('click', loadSchedules);
    document.getElementById('close-report-modal-btn').addEventListener('click', closeReportModal);
});

// --- Tab Navigation ---
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');

    document.getElementById('inventory-tab').style.display = tab === 'inventory' ? 'block' : 'none';
    document.getElementById('reports-tab').style.display = tab === 'reports' ? 'block' : 'none';

    if (tab === 'reports') {
        loadSchedules();
    }
}

// --- Auth: Login ---
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
        const response = await cognitoAuth('USER_PASSWORD_AUTH', {
            USERNAME: email,
            PASSWORD: password,
        });

        if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            // First login — show new password form
            authSession = response.Session;
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('new-password-form').style.display = 'block';
            return;
        }

        if (response.AuthenticationResult) {
            authToken = response.AuthenticationResult.IdToken;
            sessionStorage.setItem('authToken', authToken);
            showDashboard();
        }
    } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
    }
}

// --- Auth: Set new password (first login) ---
async function handleNewPassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('new-password-error');
    errorEl.textContent = '';

    if (newPass !== confirmPass) {
        errorEl.textContent = 'Passwords do not match';
        return;
    }

    try {
        const response = await cognitoChallengeResponse('NEW_PASSWORD_REQUIRED', {
            USERNAME: document.getElementById('login-email').value,
            NEW_PASSWORD: newPass,
        });

        if (response.AuthenticationResult) {
            authToken = response.AuthenticationResult.IdToken;
            sessionStorage.setItem('authToken', authToken);
            showDashboard();
        }
    } catch (err) {
        errorEl.textContent = err.message || 'Failed to set new password';
    }
}

// --- Auth: Logout ---
function handleLogout() {
    authToken = null;
    sessionStorage.removeItem('authToken');
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('new-password-form').style.display = 'none';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

// --- Cognito API calls (using InitiateAuth and RespondToAuthChallenge) ---
async function cognitoAuth(authFlow, authParams) {
    const res = await fetch(
        `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
            },
            body: JSON.stringify({
                AuthFlow: authFlow,
                ClientId: cognitoConfig.clientId,
                AuthParameters: authParams,
            }),
        }
    );

    const data = await res.json();
    if (data.__type && data.message) {
        throw new Error(data.message);
    }
    return data;
}

async function cognitoChallengeResponse(challengeName, responses) {
    const res = await fetch(
        `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
            },
            body: JSON.stringify({
                ChallengeName: challengeName,
                ClientId: cognitoConfig.clientId,
                Session: authSession,
                ChallengeResponses: responses,
            }),
        }
    );

    const data = await res.json();
    if (data.__type && data.message) {
        throw new Error(data.message);
    }
    return data;
}

// --- Dashboard ---
async function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    // Decode token to show user email
    try {
        const payload = JSON.parse(atob(authToken.split('.')[1]));
        document.getElementById('user-email').textContent = payload.email || payload['cognito:username'] || 'Employee';
    } catch (e) {
        document.getElementById('user-email').textContent = 'Employee';
    }

    // Load stores
    await loadStores();
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            ...(options.headers || {}),
        },
    });

    if (res.status === 401) {
        handleLogout();
        alert('Session expired. Please log in again.');
        throw new Error('Unauthorized');
    }

    return res;
}

// --- Stores ---
async function loadStores() {
    try {
        const res = await apiFetch('/api/stores');
        const stores = await res.json();
        const select = document.getElementById('store-select');
        select.innerHTML = '<option value="">Choose a store...</option>';
        stores.forEach(store => {
            const opt = document.createElement('option');
            opt.value = store.id;
            opt.textContent = `${store.name} — ${store.streetAddress}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load stores:', err);
    }
}

async function handleStoreChange(e) {
    selectedStoreId = e.target.value ? parseInt(e.target.value) : null;
    const section = document.getElementById('inventory-section');

    if (selectedStoreId) {
        const selectedOption = e.target.options[e.target.selectedIndex];
        document.getElementById('store-name').textContent = selectedOption.textContent.split(' — ')[0];
        section.style.display = 'block';
        await loadInventory();
    } else {
        section.style.display = 'none';
    }
}

// --- Inventory ---
async function loadInventory() {
    try {
        const res = await apiFetch(`/api/stores/${selectedStoreId}/inventory`);
        currentInventory = await res.json();
        renderInventory();
    } catch (err) {
        console.error('Failed to load inventory:', err);
    }
}

function renderInventory() {
    const tbody = document.getElementById('inventory-body');
    const emptyMsg = document.getElementById('inventory-empty');
    tbody.innerHTML = '';

    if (currentInventory.length === 0) {
        emptyMsg.style.display = 'block';
        document.getElementById('inventory-table').style.display = 'none';
        return;
    }

    emptyMsg.style.display = 'none';
    document.getElementById('inventory-table').style.display = 'table';

    currentInventory.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td><code>${escapeHtml(item.barcode)}</code></td>
      <td>$${parseFloat(item.price).toFixed(2)}</td>
      <td>
        <div class="qty-control">
          <input type="number" min="0" value="${item.quantity}" 
                 id="qty-${item.productId}" class="qty-input">
          <button class="btn-save" data-product-id="${item.productId}">Save</button>
        </div>
      </td>
      <td>
        <button class="btn-danger" data-product-id="${item.productId}" data-product-name="${escapeHtml(item.name)}">Remove</button>
      </td>
    `;
        // Attach event listeners directly to avoid inline handler escaping issues
        tr.querySelector('.btn-save').addEventListener('click', () => saveQuantity(item.productId));
        tr.querySelector('.btn-danger').addEventListener('click', () => removeProduct(item.productId, item.name));
        tbody.appendChild(tr);
    });
}

// --- Edit Quantity ---
async function saveQuantity(productId) {
    const input = document.getElementById(`qty-${productId}`);
    const quantity = parseInt(input.value);

    if (isNaN(quantity) || quantity < 0) {
        alert('Quantity must be a non-negative number.');
        return;
    }

    try {
        const res = await apiFetch(`/api/stores/${selectedStoreId}/inventory/${productId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity }),
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Failed to update quantity');
            return;
        }

        // Briefly flash the row green
        input.closest('tr').classList.add('row-saved');
        setTimeout(() => input.closest('tr').classList.remove('row-saved'), 800);

        await loadInventory();
    } catch (err) {
        console.error('Error saving quantity:', err);
    }
}

// --- Remove Product ---
async function removeProduct(productId, productName) {
    if (!confirm(`Remove "${productName}" from this store's inventory?`)) return;

    try {
        const res = await apiFetch(`/api/stores/${selectedStoreId}/inventory/${productId}`, {
            method: 'DELETE',
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Failed to remove product');
            return;
        }

        await loadInventory();
    } catch (err) {
        console.error('Error removing product:', err);
    }
}

// --- Add Product Modal ---
async function openAddModal() {
    const modal = document.getElementById('add-product-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('add-error').textContent = '';
    document.getElementById('initial-quantity').value = '0';

    // Load all products and filter out already-stocked ones
    try {
        const res = await apiFetch('/api/products');
        allProducts = await res.json();

        const stockedIds = new Set(currentInventory.map(i => i.productId));
        const available = allProducts.filter(p => !stockedIds.has(p.id));

        const select = document.getElementById('product-select');
        select.innerHTML = '<option value="">Select a product...</option>';
        available.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (${p.barcode}) — $${parseFloat(p.price).toFixed(2)}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load products:', err);
    }
}

function closeAddModal() {
    document.getElementById('add-product-modal').style.display = 'none';
    document.body.style.overflow = '';
}

async function handleAddProduct() {
    const productId = document.getElementById('product-select').value;
    const quantity = document.getElementById('initial-quantity').value;
    const errorEl = document.getElementById('add-error');
    errorEl.textContent = '';

    if (!productId) {
        errorEl.textContent = 'Please select a product';
        return;
    }

    try {
        const res = await apiFetch(`/api/stores/${selectedStoreId}/inventory`, {
            method: 'POST',
            body: JSON.stringify({ productId: parseInt(productId), quantity: parseInt(quantity || 0) }),
        });

        if (!res.ok) {
            const err = await res.json();
            errorEl.textContent = err.error || 'Failed to add product';
            return;
        }

        closeAddModal();
        await loadInventory();
    } catch (err) {
        console.error('Error adding product:', err);
        errorEl.textContent = 'Failed to add product';
    }
}

// ============================================================
// Report Scheduling
// ============================================================

// --- Filter type change handler ---
async function handleFilterTypeChange() {
    const filterType = document.getElementById('schedule-filter-type').value;
    const filterGroup = document.getElementById('filter-value-group');
    const filterSelect = document.getElementById('schedule-filter-value');
    const filterLabel = document.getElementById('filter-value-label');

    if (!filterType) {
        filterGroup.style.display = 'none';
        return;
    }

    filterGroup.style.display = 'block';
    filterSelect.innerHTML = '<option value="">Loading...</option>';

    try {
        if (filterType === 'store') {
            filterLabel.textContent = 'Select Store';
            const res = await apiFetch('/api/stores');
            const stores = await res.json();
            filterSelect.innerHTML = '<option value="">Select a store...</option>';
            stores.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                filterSelect.appendChild(opt);
            });
        } else if (filterType === 'category') {
            filterLabel.textContent = 'Select Category';
            const res = await apiFetch('/api/categories');
            const categories = await res.json();
            filterSelect.innerHTML = '<option value="">Select a category...</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                filterSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Failed to load filter options:', err);
        filterSelect.innerHTML = '<option value="">Error loading options</option>';
    }
}

// --- Create Schedule ---
async function handleCreateSchedule(e) {
    e.preventDefault();
    const errorEl = document.getElementById('schedule-error');
    const successEl = document.getElementById('schedule-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    const lookbackWindow = document.getElementById('schedule-lookback').value;
    const frequency = document.getElementById('schedule-frequency').value;
    const filterType = document.getElementById('schedule-filter-type').value;
    const filterValue = document.getElementById('schedule-filter-value').value;

    if (filterType && !filterValue) {
        errorEl.textContent = 'Please select a filter value';
        return;
    }

    try {
        const body = { lookbackWindow, frequency };
        if (filterType) {
            body.filterType = filterType;
            body.filterValue = filterValue;
        }

        const res = await apiFetch('/api/schedules', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.json();
            errorEl.textContent = err.error || 'Failed to create schedule';
            return;
        }

        successEl.textContent = '✓ Schedule created! First report will generate shortly.';
        setTimeout(() => { successEl.textContent = ''; }, 4000);

        // Reset form
        document.getElementById('schedule-filter-type').value = '';
        document.getElementById('filter-value-group').style.display = 'none';

        // Refresh list
        await loadSchedules();
    } catch (err) {
        console.error('Error creating schedule:', err);
        errorEl.textContent = 'Failed to create schedule';
    }
}

// --- Load Schedules ---
async function loadSchedules() {
    try {
        const res = await apiFetch('/api/schedules');
        const schedules = await res.json();

        const container = document.getElementById('schedules-list');
        const emptyMsg = document.getElementById('schedules-empty');
        container.innerHTML = '';

        if (schedules.length === 0) {
            emptyMsg.style.display = 'block';
            return;
        }
        emptyMsg.style.display = 'none';

        schedules.forEach(schedule => {
            const card = document.createElement('div');
            card.className = 'schedule-card';

            const lookbackLabel = { hour: 'Previous Hour', day: 'Previous Day', week: 'Previous Week' }[schedule.lookbackWindow] || schedule.lookbackWindow;
            const freqLabel = { minute: 'Every Minute', hour: 'Every Hour', day: 'Every Day' }[schedule.frequency] || schedule.frequency;

            let filterLabel = 'All Stores & Categories';
            if (schedule.filterType === 'store') {
                filterLabel = `Store #${schedule.filterValue}`;
            } else if (schedule.filterType === 'category') {
                filterLabel = `Category: ${schedule.filterValue}`;
            }

            const lastRunText = schedule.lastRunAt
                ? new Date(schedule.lastRunAt).toLocaleString()
                : 'Not yet';

            card.innerHTML = `
                <div class="schedule-info">
                    <div class="schedule-meta">
                        <span class="schedule-badge">${freqLabel}</span>
                        <span class="schedule-badge badge-secondary">${lookbackLabel}</span>
                        <span class="schedule-badge badge-tertiary">${filterLabel}</span>
                    </div>
                    <div class="schedule-details">
                        <span>Reports: <strong>${schedule.reportCount}</strong></span>
                        <span class="separator">•</span>
                        <span>Last run: ${lastRunText}</span>
                        <span class="separator">•</span>
                        <span>Created: ${new Date(schedule.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="schedule-actions">
                    <button class="btn-view-reports" data-schedule-id="${schedule.id}">View Reports</button>
                    <button class="btn-danger btn-delete-schedule" data-schedule-id="${schedule.id}">Delete</button>
                </div>
            `;

            card.querySelector('.btn-view-reports').addEventListener('click', () => {
                toggleReports(schedule.id, card);
            });

            card.querySelector('.btn-delete-schedule').addEventListener('click', () => {
                deleteSchedule(schedule.id);
            });

            container.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load schedules:', err);
    }
}

// --- Toggle Reports list for a schedule ---
async function toggleReports(scheduleId, card) {
    // Check if reports are already showing
    const existingList = card.querySelector('.reports-list');
    if (existingList) {
        existingList.remove();
        return;
    }

    try {
        const res = await apiFetch(`/api/schedules/${scheduleId}/reports`);
        const reports = await res.json();

        const listDiv = document.createElement('div');
        listDiv.className = 'reports-list';

        if (reports.length === 0) {
            listDiv.innerHTML = '<p class="reports-empty">No reports generated yet. Check back in a minute.</p>';
        } else {
            reports.forEach(report => {
                const item = document.createElement('div');
                item.className = 'report-item';
                const start = new Date(report.reportStart).toLocaleString();
                const end = new Date(report.reportEnd).toLocaleString();
                const generated = new Date(report.generatedAt).toLocaleString();

                item.innerHTML = `
                    <div class="report-item-info">
                        <span class="report-window">${start} → ${end}</span>
                        <span class="report-generated">Generated: ${generated}</span>
                    </div>
                    <div class="report-item-actions">
                        <button class="btn-view" data-report-id="${report.id}">View</button>
                        <a href="/api/reports/${report.id}/download" class="btn-download" id="download-report-${report.id}">Download</a>
                    </div>
                `;

                // Add auth header for download link
                item.querySelector('.btn-download').addEventListener('click', (e) => {
                    e.preventDefault();
                    downloadReport(report.id);
                });

                item.querySelector('.btn-view').addEventListener('click', () => {
                    viewReport(report.id, start, end);
                });

                listDiv.appendChild(item);
            });
        }

        card.appendChild(listDiv);
    } catch (err) {
        console.error('Failed to load reports:', err);
    }
}

// --- Delete Schedule ---
async function deleteSchedule(scheduleId) {
    if (!confirm('Delete this schedule and all its reports?')) return;

    try {
        const res = await apiFetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Failed to delete schedule');
            return;
        }
        await loadSchedules();
    } catch (err) {
        console.error('Error deleting schedule:', err);
    }
}

// --- Download Report ---
async function downloadReport(reportId) {
    try {
        const res = await apiFetch(`/api/reports/${reportId}/download`);
        if (!res.ok) {
            alert('Failed to download report');
            return;
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${reportId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error downloading report:', err);
    }
}

// --- View Report in Modal ---
async function viewReport(reportId, startLabel, endLabel) {
    try {
        const res = await apiFetch(`/api/reports/${reportId}/download`);
        if (!res.ok) {
            alert('Failed to load report');
            return;
        }

        const csvText = await res.text();
        const lines = csvText.trim().split('\n');
        const tbody = document.getElementById('report-preview-body');
        const emptyMsg = document.getElementById('report-preview-empty');
        const table = document.getElementById('report-preview-table');
        tbody.innerHTML = '';

        document.getElementById('report-modal-title').textContent = `Report: ${startLabel} → ${endLabel}`;

        // Set up download button
        const downloadBtn = document.getElementById('report-download-btn');
        downloadBtn.onclick = () => downloadReport(reportId);

        if (lines.length <= 1) {
            // Only header or empty
            table.style.display = 'none';
            emptyMsg.style.display = 'block';
        } else {
            table.style.display = 'table';
            emptyMsg.style.display = 'none';

            // Skip header line
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;

                // Simple CSV parse (handles quoted fields)
                const parts = parseCSVLine(line);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><code>${escapeHtml(parts[0] || '')}</code></td>
                    <td>${escapeHtml(parts[1] || '')}</td>
                    <td>${parts[2] || '0'}</td>
                    <td>$${parseFloat(parts[3] || 0).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            }
        }

        document.getElementById('report-modal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (err) {
        console.error('Error viewing report:', err);
    }
}

function closeReportModal() {
    document.getElementById('report-modal').style.display = 'none';
    document.body.style.overflow = '';
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// --- Utils ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
