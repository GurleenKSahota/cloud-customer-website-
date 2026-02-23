// --- State ---
let authToken = null;
let cognitoConfig = null;
let authSession = null; // for NEW_PASSWORD_REQUIRED challenge
let selectedStoreId = null;
let allProducts = [];
let currentInventory = [];

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
});

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
          <button class="btn-save" onclick="saveQuantity(${item.productId})">Save</button>
        </div>
      </td>
      <td>
        <button class="btn-danger" onclick="removeProduct(${item.productId}, '${escapeHtml(item.name)}')">Remove</button>
      </td>
    `;
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

// --- Utils ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
