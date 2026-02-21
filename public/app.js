const state = {
  token: localStorage.getItem('slsp_token') || '',
  user: JSON.parse(localStorage.getItem('slsp_user') || 'null')
};

const toastEl = document.getElementById('toast');
const userDisplay = document.getElementById('user-display');
const pendingList = document.getElementById('pending-list');
const storesList = document.getElementById('stores-list');
const dashboardOutput = document.getElementById('dashboard-output');

function showToast(message, kind = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${kind}`;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 2200);
}

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('slsp_token', token || '');
  localStorage.setItem('slsp_user', JSON.stringify(user || null));
  renderUser();
}

function renderUser() {
  if (!state.user) {
    userDisplay.textContent = 'None';
    return;
  }
  userDisplay.textContent = `${state.user.name} (${state.user.role})`;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(payload?.message || 'Request failed');
  }
  return payload;
}

function formToObject(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [k, v] of data.entries()) {
    obj[k] = typeof v === 'string' ? v.trim() : v;
  }
  return obj;
}

function initializeTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('is-active'));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.add('hidden'));
      button.classList.add('is-active');
      document.getElementById(button.dataset.panel).classList.remove('hidden');
    });
  });
}

document.getElementById('register-panel').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = formToObject(event.currentTarget);

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setSession(data.token, data.user);
    event.currentTarget.reset();
    showToast('Registration successful. You are now signed in.');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('login-panel').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = formToObject(event.currentTarget);

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setSession(data.token, data.user);
    event.currentTarget.reset();
    showToast('Logged in successfully.');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  setSession('', null);
  showToast('Logged out.');
});

document.getElementById('search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const params = new URLSearchParams();

  for (const [key, value] of data.entries()) {
    if (!value) continue;
    if (key === 'openNow' || key === 'topRated') {
      params.set(key, 'true');
    } else {
      params.set(key, value.trim());
    }
  }

  try {
    const stores = await api(`/api/stores?${params.toString()}`);
    storesList.innerHTML = stores.length
      ? stores
          .map(
            (store) => `
              <li>
                <div class="row">
                  <strong>${store.storeName}</strong>
                  <span>${store.category || 'General'}</span>
                </div>
                <div>${store.city || ''}, ${store.state || ''}</div>
              </li>`
          )
          .join('')
      : '<li>No approved stores found for this filter.</li>';
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('store-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = formToObject(event.currentTarget);

  try {
    await api('/api/stores', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    showToast('Store submitted for review.');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('dashboard-btn').addEventListener('click', async () => {
  try {
    const dashboard = await api('/api/admin/dashboard');
    dashboardOutput.textContent = JSON.stringify(dashboard, null, 2);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

async function loadPending() {
  try {
    const stores = await api('/api/admin/stores/pending');
    pendingList.innerHTML = stores.length
      ? stores
          .map(
            (store) => `
              <li>
                <div class="row">
                  <strong>${store.storeName}</strong>
                  <span>${store.city || ''}, ${store.state || ''}</span>
                </div>
                <div class="row">
                  <small>Status: ${store.status}</small>
                  <div>
                    <button class="small" data-id="${store._id}" data-action="approve">Approve</button>
                    <button class="small secondary" data-id="${store._id}" data-action="reject">Reject</button>
                  </div>
                </div>
              </li>`
          )
          .join('')
      : '<li>No pending stores right now.</li>';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

document.getElementById('pending-btn').addEventListener('click', loadPending);

pendingList.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-id]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  try {
    await api(`/api/admin/stores/${id}/${action}`, { method: 'PATCH' });
    showToast(`Store ${action}d.`);
    loadPending();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

initializeTabs();
renderUser();
