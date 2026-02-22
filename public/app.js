const state = {
  token: localStorage.getItem('slsp_token') || '',
  user: JSON.parse(localStorage.getItem('slsp_user') || 'null'),
  stores: [],
  storesMap: null,
  ownerMap: null,
  ownerMarker: null,
  markersByStoreId: new Map(),
  selectedStoreId: '',
  selectedMarkerId: '',
  storeSearchTimer: null
};

const toastEl = document.getElementById('toast');
const userDisplays = [...document.querySelectorAll('#user-display')];

const ROLE_HOME_PATHS = {
  customer: '/stores.html',
  owner: '/stores.html',
  admin: '/admin.html'
};

const PROTECTED_PAGE_RULES = {
  '/owner.html': ['owner'],
  '/admin.html': ['admin'],
  '/admin-dashboard.html': ['admin'],
  '/admin-stores.html': ['admin'],
  '/admin-users.html': ['admin'],
  '/admin-reviews.html': ['admin'],
  '/admin-metadata.html': ['admin']
};

const ADMIN_RESTRICTED_PATHS = new Set(['/stores.html', '/owner.html']);
const AUTH_LOGIN_PATH = '/auth.html?mode=login';

const DEFAULT_MARKER_STYLE = {
  radius: 8,
  color: '#1565c0',
  weight: 2,
  fillColor: '#2c8be5',
  fillOpacity: 0.9
};

const ACTIVE_MARKER_STYLE = {
  radius: 10,
  color: '#b34700',
  weight: 2,
  fillColor: '#ff8f1f',
  fillOpacity: 0.95
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showToast(message, kind = 'success') {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = `toast show ${kind}`;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 2300);
}

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('slsp_token', token || '');
  localStorage.setItem('slsp_user', JSON.stringify(user || null));
  renderUser();
}

function renderUser() {
  const text = state.user ? `${state.user.name} (${state.user.role})` : 'None';
  userDisplays.forEach((el) => {
    el.textContent = text;
  });
  document.querySelectorAll('[data-header-user-display]').forEach((el) => {
    el.textContent = text;
  });
  renderHeaderAuthActions();
  renderRoleAwareNavigation();
}

function ensureHeaderAuthActions() {
  const topNav = document.querySelector('.top-nav');
  if (!topNav || topNav.querySelector('[data-header-auth-actions]')) {
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'header-auth-actions';
  actions.setAttribute('data-header-auth-actions', 'true');
  actions.innerHTML = `
    <div class="button-row header-auth-buttons">
      <button type="button" class="secondary small" data-header-auth-action="login">Login</button>
      <button type="button" class="secondary small" data-header-auth-action="logout">Logout</button>
    </div>
    <p class="header-user-line"><strong>Current user:</strong> <span data-header-user-display>None</span></p>
  `;

  topNav.appendChild(actions);
}

function renderHeaderAuthActions() {
  const isLoggedIn = Boolean(state.user);
  document.querySelectorAll('[data-header-auth-action="login"]').forEach((button) => {
    button.hidden = isLoggedIn;
  });
  document.querySelectorAll('[data-header-auth-action="logout"]').forEach((button) => {
    button.hidden = !isLoggedIn;
  });
}

function logoutAndRedirectToLogin() {
  setSession('', null);
  showToast('Logged out. Redirecting to Authentication page.');
  loadMyNotifications();
  setTimeout(() => {
    redirectTo(AUTH_LOGIN_PATH);
  }, 320);
}

function initializeHeaderAuthActions() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-header-auth-action]');
    if (!button) return;

    const action = String(button.dataset.headerAuthAction || '');
    if (action === 'login') {
      redirectTo(AUTH_LOGIN_PATH);
      return;
    }
    if (action === 'logout') {
      logoutAndRedirectToLogin();
    }
  });
}

function renderRoleAwareNavigation() {
  const isAdmin = normalizeRole(state.user?.role) === 'admin';
  document.querySelectorAll('a.nav-link').forEach((link) => {
    const href = String(link.getAttribute('href') || '').toLowerCase();
    if (ADMIN_RESTRICTED_PATHS.has(href)) {
      link.hidden = isAdmin;
    }
  });
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_HOME_PATHS, role) ? role : '';
}

function getRoleHomePath(role) {
  return ROLE_HOME_PATHS[normalizeRole(role)] || '/stores.html';
}

function canRoleAccessPath(pathname, role) {
  const normalizedPath = String(pathname || '').toLowerCase();
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'admin' && ADMIN_RESTRICTED_PATHS.has(normalizedPath)) {
    return false;
  }

  const requiredRoles = PROTECTED_PAGE_RULES[normalizedPath];
  if (!requiredRoles) {
    return true;
  }
  return requiredRoles.includes(normalizedRole);
}

function getSafeNextPath(role) {
  const params = new URLSearchParams(window.location.search);
  const nextPath = params.get('next');
  if (!nextPath || !nextPath.startsWith('/')) {
    return '';
  }
  if (!canRoleAccessPath(nextPath, role)) {
    return '';
  }
  return nextPath;
}

function redirectTo(path) {
  if (!path || window.location.pathname === path) {
    return;
  }
  window.location.assign(path);
}

function redirectToAuth(nextPath = window.location.pathname) {
  redirectTo(`/auth.html?next=${encodeURIComponent(nextPath)}`);
}

function redirectAfterAuthSuccess() {
  const role = normalizeRole(state.user?.role);
  if (!role) {
    return;
  }
  const nextPath = getSafeNextPath(role);
  redirectTo(nextPath || getRoleHomePath(role));
}

function enforceAdminRestrictedPage(pathname = window.location.pathname) {
  const normalizedPath = String(pathname || '').toLowerCase();
  const normalizedRole = normalizeRole(state.user?.role);

  if (normalizedRole !== 'admin' || !ADMIN_RESTRICTED_PATHS.has(normalizedPath)) {
    return true;
  }

  showToast('Admin must logout to access this page.', 'error');
  setTimeout(() => redirectTo(getRoleHomePath(normalizedRole)), 450);
  return false;
}

function enforcePageRoleAccess(allowedRoles, pagePath) {
  if (!state.user) {
    showToast('Please login first.', 'error');
    setTimeout(() => redirectToAuth(pagePath), 450);
    return false;
  }

  const normalizedRole = normalizeRole(state.user.role);
  if (!allowedRoles.includes(normalizedRole)) {
    showToast(`Access denied for ${normalizedRole || 'current'} role. Redirecting...`, 'error');
    setTimeout(() => redirectTo(getRoleHomePath(normalizedRole)), 450);
    return false;
  }

  return true;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.path = path;
    error.method = String(options.method || 'GET').toUpperCase();
    throw error;
  }
  return payload;
}

function formToObject(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [key, value] of data.entries()) {
    obj[key] = typeof value === 'string' ? value.trim() : value;
  }
  return obj;
}

function initializeTabs() {
  const tabs = document.querySelectorAll('.tab');
  if (!tabs.length) return;

  tabs.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.panel));
  });
}

function activateTab(panelId) {
  const tabs = document.querySelectorAll('.tab');
  if (!tabs.length) return;

  tabs.forEach((tab) => tab.classList.remove('is-active'));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.add('hidden'));

  const targetTab = [...tabs].find((button) => button.dataset.panel === panelId);
  if (!targetTab) {
    return;
  }

  targetTab.classList.add('is-active');
  document.getElementById(panelId)?.classList.remove('hidden');
}

function fillSelect(selectEl, values, placeholderLabel) {
  if (!selectEl) return;
  const normalizedValues = [...new Set(values.filter(Boolean))];
  const currentValue = selectEl.value;
  const options = [`<option value="">${escapeHtml(placeholderLabel)}</option>`]
    .concat(
      normalizedValues.map(
        (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    )
    .join('');

  selectEl.innerHTML = options;
  if (currentValue && normalizedValues.includes(currentValue)) {
    selectEl.value = currentValue;
  }
}

async function loadCitiesByState(stateName, citySelect, placeholder = 'All Cities') {
  if (!citySelect) return;
  if (!stateName) {
    fillSelect(citySelect, [], placeholder);
    return;
  }

  const cities = await api(`/api/meta/cities?state=${encodeURIComponent(stateName)}`);
  fillSelect(citySelect, cities, placeholder);
}

async function loadMetaFilters({
  stateSelect,
  citySelect,
  categorySelect,
  statePlaceholder = 'All States',
  cityPlaceholder = 'All Cities',
  categoryPlaceholder = 'All Categories'
}) {
  const [states, categories] = await Promise.all([
    api('/api/meta/states'),
    api('/api/meta/categories')
  ]);

  fillSelect(stateSelect, states, statePlaceholder);
  fillSelect(citySelect, [], cityPlaceholder);
  fillSelect(categorySelect, categories, categoryPlaceholder);
}

function parseCoordinates(store) {
  const coords = store?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function metersToKm(meters) {
  return `${(Number(meters) / 1000).toFixed(2)} km`;
}

function getDirectionsUrl(store) {
  const coords = parseCoordinates(store);
  if (coords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    store.fullAddress || `${store.city || ''}, ${store.state || ''}`
  )}`;
}

function renderNotifications(notifications) {
  const listEl = document.getElementById('notification-list');
  if (!listEl) return;

  if (!state.user) {
    listEl.innerHTML = '<li>Login to view notifications.</li>';
    return;
  }

  if (!notifications.length) {
    listEl.innerHTML = '<li>No notifications found.</li>';
    return;
  }

  listEl.innerHTML = notifications
    .map(
      (item) => `
        <li class="${item.isRead ? '' : 'unread-item'}">
          <div class="row">
            <strong>${escapeHtml(item.title || 'Notification')}</strong>
            <small>${item.isRead ? 'Read' : 'Unread'}</small>
          </div>
          <div>${escapeHtml(item.message || '')}</div>
          <div class="row">
            <small>${new Date(item.createdAt).toLocaleString()}</small>
            ${item.isRead ? '' : `<button class="small secondary" data-notification-id="${escapeHtml(item._id)}">Mark Read</button>`}
          </div>
        </li>`
    )
    .join('');
}

async function loadMyNotifications() {
  if (!state.user) {
    renderNotifications([]);
    return;
  }

  try {
    const notifications = await api('/api/notifications/me?limit=20');
    renderNotifications(notifications);
  } catch {
    renderNotifications([]);
  }
}

function initializeAuthPage() {
  const queryParams = new URLSearchParams(window.location.search);
  const mode = queryParams.get('mode');
  if (mode === 'login') {
    activateTab('login-panel');
  } else if (mode === 'register') {
    activateTab('register-panel');
  }

  const registerForm = document.getElementById('register-panel');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = formToObject(form);

      try {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setSession(data.token, data.user);
        form.reset();
        showToast('Registration successful. Redirecting...');
        loadMyNotifications();
        setTimeout(() => redirectAfterAuthSuccess(), 450);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  const loginForm = document.getElementById('login-panel');
  if (loginForm) {
    const loginRoleSelect = loginForm.querySelector('select[name="role"]');
    const nextPath = queryParams.get('next');
    if (loginRoleSelect && nextPath === '/owner.html') {
      loginRoleSelect.value = 'owner';
    } else if (loginRoleSelect && nextPath === '/admin.html') {
      loginRoleSelect.value = 'admin';
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = formToObject(form);

      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setSession(data.token, data.user);
        form.reset();
        showToast('Logged in successfully. Redirecting...');
        loadMyNotifications();
        setTimeout(() => redirectAfterAuthSuccess(), 450);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  const refreshNotificationsBtn = document.getElementById('refresh-notifications-btn');
  refreshNotificationsBtn?.addEventListener('click', () => {
    loadMyNotifications();
  });

  const markAllReadBtn = document.getElementById('mark-all-read-btn');
  markAllReadBtn?.addEventListener('click', async () => {
    if (!state.user) {
      showToast('Login first.', 'error');
      return;
    }
    try {
      await api('/api/notifications/read-all', { method: 'PATCH' });
      showToast('All notifications marked as read.');
      loadMyNotifications();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  const notificationList = document.getElementById('notification-list');
  notificationList?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-notification-id]');
    if (!button) return;
    try {
      await api(`/api/notifications/${button.dataset.notificationId}/read`, {
        method: 'PATCH'
      });
      loadMyNotifications();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  loadMyNotifications();
}

function initializeStoreMap() {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('stores-map');
  if (!mapEl) return;

  state.storesMap = L.map(mapEl).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.storesMap);
}

function clearStoreMarkers() {
  if (!state.storesMap) return;
  state.markersByStoreId.forEach((marker) => marker.remove());
  state.markersByStoreId.clear();
  state.selectedMarkerId = '';
}

function highlightStoreMarker(storeId) {
  state.markersByStoreId.forEach((marker, id) => {
    marker.setStyle(id === storeId ? ACTIVE_MARKER_STYLE : DEFAULT_MARKER_STYLE);
  });
  state.selectedMarkerId = storeId || '';
}

function renderStoreList(stores) {
  const storesList = document.getElementById('stores-list');
  const summaryEl = document.getElementById('results-summary');
  if (!storesList) return;

  if (!stores.length) {
    storesList.innerHTML = '<li>No approved stores found.</li>';
    if (summaryEl) summaryEl.textContent = 'No stores matched your filters.';
    return;
  }

  storesList.innerHTML = stores
    .map((store) => {
      const isSelected = state.selectedStoreId === store._id;
      const distance = store.distanceMeters
        ? `<small>${metersToKm(store.distanceMeters)}</small>`
        : '';
      return `
        <li data-store-id="${escapeHtml(store._id)}" class="${isSelected ? 'selected-item' : ''}">
          <div class="row">
            <strong>${escapeHtml(store.storeName)}</strong>
            <span>${escapeHtml(store.category || 'General')}</span>
          </div>
          <div>${escapeHtml(store.city || '')}, ${escapeHtml(store.state || '')}</div>
          <div class="row">
            <small>Rating: ${Number(store.ratingAverage || 0).toFixed(1)} (${store.ratingCount || 0})</small>
            ${distance}
          </div>
        </li>`;
    })
    .join('');

  if (summaryEl) {
    summaryEl.textContent = `${stores.length} store(s) loaded`;
  }
}

function renderStoreMarkers(stores) {
  if (!state.storesMap) return;
  clearStoreMarkers();

  const bounds = [];
  stores.forEach((store) => {
    const coords = parseCoordinates(store);
    if (!coords) return;

    const marker = L.circleMarker([coords.lat, coords.lng], DEFAULT_MARKER_STYLE).addTo(
      state.storesMap
    );
    marker.bindPopup(
      `<strong>${escapeHtml(store.storeName)}</strong><br>${escapeHtml(store.city || '')}, ${escapeHtml(store.state || '')}`
    );
    marker.on('click', () => loadStoreDetail(store._id));
    state.markersByStoreId.set(store._id, marker);
    bounds.push([coords.lat, coords.lng]);
  });

  if (bounds.length) {
    state.storesMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
  }
}

function renderStoreDetail(store) {
  const detailEl = document.getElementById('store-detail');
  if (!detailEl) return;

  const imageHtml =
    Array.isArray(store.images) && store.images.length
      ? store.images
          .map(
            (url) =>
              `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Photo</a>`
          )
          .join(' | ')
      : 'No photos';

  const reviewsHtml = store.reviews?.length
    ? `<ul class="reviews-list">${store.reviews
        .map(
          (review) =>
            `<li><strong>${escapeHtml(
              review.customer?.name || 'Customer'
            )}</strong>: ${Number(review.rating).toFixed(1)} / 5${
              review.comment ? ` - ${escapeHtml(review.comment)}` : ''
            }</li>`
        )
        .join('')}</ul>`
    : '<p class="hint">No approved reviews yet.</p>';

  const reviewFormHtml =
    state.user?.role === 'customer'
      ? `
      <form id="review-form" class="inline-form">
        <input type="number" step="1" min="1" max="5" name="rating" placeholder="Rating 1-5" required />
        <input name="comment" placeholder="Write a short review" />
        <button type="submit">Submit Review</button>
      </form>`
      : '';

  const favoriteButton =
    state.user?.role === 'customer'
      ? `<button id="favorite-btn" class="secondary" data-favorite="${
          store.isFavorite ? 'remove' : 'add'
        }">${store.isFavorite ? 'Remove Favorite' : 'Save to Favorite'}</button>`
      : '';

  detailEl.innerHTML = `
    <h3>${escapeHtml(store.storeName)}</h3>
    <div class="detail-grid">
      <div><strong>Category:</strong> ${escapeHtml(store.category || 'General')}</div>
      <div><strong>Address:</strong> ${escapeHtml(store.fullAddress || 'N/A')}</div>
      <div><strong>Phone:</strong> ${escapeHtml(store.phone || 'N/A')}</div>
      <div><strong>Owner:</strong> ${escapeHtml(store.ownerName || 'N/A')}</div>
      <div><strong>Open Hours:</strong> ${escapeHtml(store.openingTime || '--')} - ${escapeHtml(
    store.closingTime || '--'
  )}</div>
      <div><strong>Rating:</strong> ${Number(store.ratingAverage || 0).toFixed(1)} (${
    store.ratingCount || 0
  })</div>
      <div><strong>Photos:</strong> ${imageHtml}</div>
      <div><strong>Description:</strong> ${escapeHtml(store.description || 'N/A')}</div>
    </div>
    <div class="button-row" style="margin-top:0.8rem">
      <a href="${getDirectionsUrl(
        store
      )}" target="_blank" rel="noreferrer"><button type="button" class="secondary">Get Direction</button></a>
      ${favoriteButton}
    </div>
    <h4>Ratings & Reviews</h4>
    ${reviewFormHtml}
    ${reviewsHtml}
  `;
}

async function loadStoreDetail(storeId) {
  try {
    state.selectedStoreId = storeId;
    const store = await api(`/api/stores/${storeId}`);
    renderStoreDetail(store);
    renderStoreList(state.stores);
    highlightStoreMarker(storeId);

    const marker = state.markersByStoreId.get(storeId);
    const coords = parseCoordinates(store);
    if (coords && state.storesMap) {
      state.storesMap.setView([coords.lat, coords.lng], 15);
      marker?.openPopup();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function buildSearchParamsFromForm(searchForm) {
  const data = new FormData(searchForm);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (!value) continue;
    if (key === 'openNow' || key === 'topRated' || key === 'nearestFirst') {
      params.set(key, 'true');
    } else {
      params.set(key, String(value).trim());
    }
  }
  return params;
}

async function runStoreSearch({ autoSelectFirst = false } = {}) {
  const searchForm = document.getElementById('search-form');
  if (!searchForm) return;

  const params = buildSearchParamsFromForm(searchForm);
  const stores = await api(`/api/stores?${params.toString()}`);
  state.stores = stores;
  if (!stores.find((item) => item._id === state.selectedStoreId)) {
    state.selectedStoreId = '';
  }

  renderStoreList(stores);
  renderStoreMarkers(stores);
  if (state.selectedStoreId) {
    highlightStoreMarker(state.selectedStoreId);
  }

  if (autoSelectFirst && stores.length === 1) {
    await loadStoreDetail(stores[0]._id);
  }
}

function scheduleStoreSearch(options = {}, delay = 350) {
  clearTimeout(state.storeSearchTimer);
  state.storeSearchTimer = setTimeout(() => {
    runStoreSearch(options).catch((error) => showToast(error.message, 'error'));
  }, delay);
}

async function detectCurrentLocation({ latInput, lngInput, onSuccess }) {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported on this browser.', 'error');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;
      if (onSuccess) onSuccess(Number(lat), Number(lng));
      showToast('Location detected.');
    },
    () => showToast('Unable to detect location.', 'error'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function initializeStorePage() {
  const searchForm = document.getElementById('search-form');
  if (!searchForm) return;
  if (!enforceAdminRestrictedPage('/stores.html')) return;

  initializeStoreMap();

  const stateSelect = document.getElementById('state-filter');
  const citySelect = document.getElementById('city-filter');
  const categorySelect = document.getElementById('category-filter');
  const nearestLatInput = document.getElementById('nearest-lat');
  const nearestLngInput = document.getElementById('nearest-lng');
  const detectBtn = document.getElementById('detect-location-btn');
  const favoritesBtn = document.getElementById('my-favorites-btn');
  const storesList = document.getElementById('stores-list');
  const detailEl = document.getElementById('store-detail');
  const queryInput = searchForm.querySelector('input[name="q"]');
  const filterCheckboxes = [...searchForm.querySelectorAll('input[type="checkbox"]')];

  loadMetaFilters({ stateSelect, citySelect, categorySelect }).catch((error) => {
    showToast(error.message, 'error');
  });

  stateSelect?.addEventListener('change', async () => {
    try {
      await loadCitiesByState(stateSelect.value, citySelect, 'All Cities');
      scheduleStoreSearch({}, 120);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  citySelect?.addEventListener('change', () => {
    scheduleStoreSearch({}, 120);
  });

  categorySelect?.addEventListener('change', () => {
    scheduleStoreSearch({}, 120);
  });

  queryInput?.addEventListener('input', () => {
    scheduleStoreSearch({}, 360);
  });

  filterCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      scheduleStoreSearch({}, 150);
    });
  });

  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await runStoreSearch({ autoSelectFirst: true });
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  detectBtn?.addEventListener('click', () => {
    detectCurrentLocation({
      latInput: nearestLatInput,
      lngInput: nearestLngInput,
      onSuccess: (lat, lng) => {
        const nearestCheckbox = searchForm.querySelector('input[name="nearestFirst"]');
        if (nearestCheckbox) nearestCheckbox.checked = true;
        if (state.storesMap) {
          state.storesMap.setView([lat, lng], 13);
        }
        runStoreSearch().catch((error) => showToast(error.message, 'error'));
      }
    });
  });

  favoritesBtn?.addEventListener('click', async () => {
    if (!state.user || state.user.role !== 'customer') {
      showToast('Login as customer to view favorites.', 'error');
      return;
    }
    try {
      const favorites = await api('/api/favorites/me');
      state.stores = favorites;
      state.selectedStoreId = '';
      renderStoreList(favorites);
      renderStoreMarkers(favorites);
      showToast('Loaded favorite stores.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  storesList?.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-store-id]');
    if (!li) return;
    loadStoreDetail(li.dataset.storeId);
  });

  detailEl?.addEventListener('click', async (event) => {
    const favoriteBtn = event.target.closest('#favorite-btn');
    if (!favoriteBtn || !state.selectedStoreId) return;
    if (!state.user || state.user.role !== 'customer') {
      showToast('Only customers can use favorites.', 'error');
      return;
    }

    try {
      if (favoriteBtn.dataset.favorite === 'remove') {
        await api(`/api/favorites/${state.selectedStoreId}`, { method: 'DELETE' });
        showToast('Removed from favorites.');
      } else {
        await api(`/api/favorites/${state.selectedStoreId}`, { method: 'POST' });
        showToast('Added to favorites.');
      }
      await loadStoreDetail(state.selectedStoreId);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  detailEl?.addEventListener('submit', async (event) => {
    const form = event.target;
    if (form.id !== 'review-form') return;
    event.preventDefault();
    if (!state.selectedStoreId) return;

    const payload = formToObject(form);
    try {
      await api(`/api/reviews/${state.selectedStoreId}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Review submitted for moderation.');
      form.reset();
      await loadStoreDetail(state.selectedStoreId);
      loadMyNotifications();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  runStoreSearch().catch(() => {});
}

function initializeOwnerMap(latInput, lngInput) {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById('owner-map');
  if (!mapEl) return;

  state.ownerMap = L.map(mapEl).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.ownerMap);

  state.ownerMarker = L.marker([20.5937, 78.9629], { draggable: true }).addTo(state.ownerMap);
  latInput.value = '20.593700';
  lngInput.value = '78.962900';

  state.ownerMarker.on('dragend', () => {
    const pos = state.ownerMarker.getLatLng();
    latInput.value = pos.lat.toFixed(6);
    lngInput.value = pos.lng.toFixed(6);
  });

  state.ownerMap.on('click', (event) => {
    state.ownerMarker.setLatLng(event.latlng);
    latInput.value = event.latlng.lat.toFixed(6);
    lngInput.value = event.latlng.lng.toFixed(6);
  });
}

function updateOwnerMarkerFromInputs(latInput, lngInput) {
  const lat = Number(latInput.value);
  const lng = Number(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !state.ownerMap || !state.ownerMarker) {
    return;
  }
  state.ownerMarker.setLatLng([lat, lng]);
  state.ownerMap.setView([lat, lng], 13);
}

async function loadOwnerStores(listEl) {
  try {
    const stores = await api('/api/stores/mine');
    listEl.innerHTML = stores.length
      ? stores
          .map(
            (store) => `
              <li>
                <div class="row">
                  <strong>${escapeHtml(store.storeName)}</strong>
                  <span>${escapeHtml(store.city || '')}, ${escapeHtml(store.state || '')}</span>
                </div>
                <div class="row">
                  <small>Status: ${escapeHtml(store.status || 'Pending')}</small>
                  <small>Category: ${escapeHtml(store.category || 'General')}</small>
                </div>
              </li>`
          )
          .join('')
      : '<li>No stores submitted yet.</li>';
  } catch {
    listEl.innerHTML = '<li>Login as owner to view your stores.</li>';
  }
}

function prefillOwnerForm(storeForm) {
  if (!storeForm || !state.user) return;
  const ownerNameInput = storeForm.querySelector('input[name="ownerName"]');
  const emailInput = storeForm.querySelector('input[name="email"]');
  if (ownerNameInput && !ownerNameInput.value) {
    ownerNameInput.value = state.user.name || '';
  }
  if (emailInput && !emailInput.value) {
    emailInput.value = state.user.email || '';
  }
}

function initializeOwnerPage() {
  const storeForm = document.getElementById('store-form');
  if (!storeForm) return;
  if (!enforceAdminRestrictedPage('/owner.html')) return;
  if (!enforcePageRoleAccess(['owner'], '/owner.html')) return;

  const stateSelect = document.getElementById('owner-state');
  const citySelect = document.getElementById('owner-city');
  const categorySelect = document.getElementById('owner-category');
  const latInput = document.getElementById('owner-latitude');
  const lngInput = document.getElementById('owner-longitude');
  const detectBtn = document.getElementById('owner-detect-location');
  const ownerStoreList = document.getElementById('owner-store-list');

  loadMetaFilters({
    stateSelect,
    citySelect,
    categorySelect,
    statePlaceholder: 'Select State',
    cityPlaceholder: 'Select City',
    categoryPlaceholder: 'Select Category'
  }).catch((error) => showToast(error.message, 'error'));

  stateSelect?.addEventListener('change', async () => {
    try {
      await loadCitiesByState(stateSelect.value, citySelect, 'Select City');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  initializeOwnerMap(latInput, lngInput);
  prefillOwnerForm(storeForm);

  latInput?.addEventListener('input', () => updateOwnerMarkerFromInputs(latInput, lngInput));
  lngInput?.addEventListener('input', () => updateOwnerMarkerFromInputs(latInput, lngInput));

  detectBtn?.addEventListener('click', () => {
    detectCurrentLocation({
      latInput,
      lngInput,
      onSuccess: (lat, lng) => {
        if (state.ownerMap && state.ownerMarker) {
          state.ownerMarker.setLatLng([lat, lng]);
          state.ownerMap.setView([lat, lng], 14);
        }
      }
    });
  });

  storeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formToObject(form);

    try {
      await api('/api/stores', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      form.reset();
      prefillOwnerForm(storeForm);
      showToast('Store submitted. Waiting for admin approval.');
      loadOwnerStores(ownerStoreList);
      loadMyNotifications();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  loadOwnerStores(ownerStoreList);
}

function monthLabel(value) {
  if (!value || !value.includes('-')) return value || '';
  const [year, month] = value.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
}

function drawGrowthChart(monthlyGrowth) {
  const canvas = document.getElementById('growth-chart');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!monthlyGrowth?.length) {
    ctx.fillStyle = '#6f7a8c';
    ctx.font = '14px Manrope, sans-serif';
    ctx.fillText('No growth data', 20, 30);
    return;
  }

  const padding = 40;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;
  const maxValue = Math.max(
    1,
    ...monthlyGrowth.map((item) => Math.max(item.stores || 0, item.customers || 0))
  );

  function pointAt(index, value) {
    const x = padding + (chartW / Math.max(monthlyGrowth.length - 1, 1)) * index;
    const y = padding + chartH - (value / maxValue) * chartH;
    return { x, y };
  }

  ctx.strokeStyle = '#d7dee9';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + chartW, y);
    ctx.stroke();
  }

  const series = [
    { key: 'stores', color: '#0f78d4', label: 'Stores' },
    { key: 'customers', color: '#de6c19', label: 'Customers' }
  ];

  series.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    monthlyGrowth.forEach((point, index) => {
      const p = pointAt(index, point[item.key] || 0);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.fillStyle = item.color;
    monthlyGrowth.forEach((point, index) => {
      const p = pointAt(index, point[item.key] || 0);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.fillStyle = '#203047';
  ctx.font = '12px Manrope, sans-serif';
  monthlyGrowth.forEach((item, index) => {
    const p = pointAt(index, 0);
    ctx.fillText(monthLabel(item.month), p.x - 18, h - 12);
  });

  ctx.fillStyle = '#0f78d4';
  ctx.fillRect(padding, 10, 14, 4);
  ctx.fillStyle = '#203047';
  ctx.fillText('Stores', padding + 20, 16);

  ctx.fillStyle = '#de6c19';
  ctx.fillRect(padding + 82, 10, 14, 4);
  ctx.fillStyle = '#203047';
  ctx.fillText('Customers', padding + 102, 16);
}

function setTextById(id, value, fallback = '--') {
  const element = document.getElementById(id);
  if (!element) return;
  const finalValue = value ?? fallback;
  element.textContent =
    typeof finalValue === 'number' ? finalValue.toLocaleString() : String(finalValue);
}

function renderDashboard(dashboard) {
  setTextById('metric-total-stores', dashboard.totalStores);
  setTextById('metric-active-stores', dashboard.activeStores);
  setTextById('metric-pending-stores', dashboard.pendingStores);
  setTextById('metric-total-customers', dashboard.totalCustomers);
  setTextById('metric-total-owners', dashboard.totalOwners);
  setTextById('metric-search-count', dashboard.searchesCount);
  setTextById('metric-approved-reviews', dashboard.approvedReviews ?? dashboard.totalReviews);
  setTextById('metric-pending-reviews', dashboard.pendingReviews);
  setTextById('metric-blocked-stores', dashboard.blockedStores);

  setTextById(
    'highlight-most-searched-city',
    dashboard.mostSearchedCity
      ? `${dashboard.mostSearchedCity.city} (${dashboard.mostSearchedCity.count})`
      : 'No search data'
  );

  setTextById(
    'highlight-most-viewed-store',
    dashboard.mostViewedStore
      ? `${dashboard.mostViewedStore.storeName} (${dashboard.mostViewedStore.viewCount} views)`
      : 'No store view data'
  );

  const topCategoriesEl = document.getElementById('top-categories-list');
  if (topCategoriesEl) {
    const categories = dashboard.topCategories || [];
    topCategoriesEl.innerHTML = categories.length
      ? categories
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.category)}</strong><span>${Number(
                item.count || 0
              ).toLocaleString()}</span></li>`
          )
          .join('')
      : '<li>No category data</li>';
  }

  drawGrowthChart(dashboard.monthlyGrowth || []);
}

async function loadPendingStores() {
  const pendingList = document.getElementById('pending-list');
  if (!pendingList) return;

  const stores = await api('/api/admin/stores/pending');
  pendingList.innerHTML = stores.length
    ? stores
        .map(
          (store) => `
            <li>
              <div class="row">
                <strong>${escapeHtml(store.storeName)}</strong>
                <span>${escapeHtml(store.city || '')}, ${escapeHtml(store.state || '')}</span>
              </div>
              <div class="row">
                <small>Status: ${escapeHtml(store.status || 'Pending')}</small>
                <div class="button-row">
                  <button class="small" data-store-id="${escapeHtml(store._id)}" data-store-action="approve">Approve</button>
                  <button class="small secondary" data-store-id="${escapeHtml(store._id)}" data-store-action="reject">Reject</button>
                  <button class="small secondary" data-store-id="${escapeHtml(store._id)}" data-store-action="block">Block</button>
                </div>
              </div>
            </li>`
        )
        .join('')
    : '<li>No pending stores right now.</li>';
}

function buildStoreActions(store) {
  const actions = [];
  if (store.status !== 'Approved') actions.push('approve');
  if (store.status !== 'Rejected') actions.push('reject');
  actions.push(store.isBlocked ? 'unblock' : 'block');
  return actions;
}

async function loadAllStores() {
  const allStoresList = document.getElementById('all-stores-list');
  if (!allStoresList) return;

  const stores = await api('/api/admin/stores');
  allStoresList.innerHTML = stores.length
    ? stores
        .map((store) => {
          const actions = buildStoreActions(store)
            .map(
              (action) =>
                `<button class="small ${
                  action === 'approve' ? '' : 'secondary'
                }" data-store-id="${escapeHtml(store._id)}" data-store-action="${action}">${
                  action.charAt(0).toUpperCase() + action.slice(1)
                }</button>`
            )
            .join('');

          return `
            <li>
              <div class="row">
                <strong>${escapeHtml(store.storeName)}</strong>
                <span>${escapeHtml(store.city || '')}, ${escapeHtml(store.state || '')}</span>
              </div>
              <div class="row">
                <small>Status: ${escapeHtml(store.status || 'Pending')}</small>
                <small>Blocked: ${store.isBlocked ? 'Yes' : 'No'}</small>
              </div>
              <div class="button-row">${actions}</div>
            </li>`;
        })
        .join('')
    : '<li>No stores found.</li>';
}

async function loadUsers() {
  const usersList = document.getElementById('users-list');
  if (!usersList) return;

  const users = await api('/api/admin/users');
  usersList.innerHTML = users.length
    ? users
        .map(
          (user) => `
            <li>
              <div class="row">
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.role)}</span>
              </div>
              <div>${escapeHtml(user.email)}</div>
              <div class="row">
                <small>Blocked: ${user.isBlocked ? 'Yes' : 'No'}</small>
                <div class="button-row">
                  ${
                    user.role === 'owner'
                      ? `<button class="small secondary" data-user-id="${escapeHtml(
                          user._id
                        )}" data-user-action="reset-password">Reset Password</button>`
                      : ''
                  }
                  <button class="small ${
                    user.isBlocked ? '' : 'secondary'
                  }" data-user-id="${escapeHtml(user._id)}" data-user-action="${
                    user.isBlocked ? 'unblock' : 'block'
                  }">${user.isBlocked ? 'Unblock' : 'Block'}</button>
                </div>
              </div>
            </li>`
        )
        .join('')
    : '<li>No users found.</li>';
}

async function loadPendingReviews() {
  const reviewList = document.getElementById('pending-reviews-list');
  if (!reviewList) return;

  const reviews = await api('/api/admin/reviews/pending');
  reviewList.innerHTML = reviews.length
    ? reviews
        .map(
          (review) => `
            <li>
              <div class="row">
                <strong>${escapeHtml(review.store?.storeName || 'Store')}</strong>
                <span>Rating: ${Number(review.rating || 0).toFixed(1)}</span>
              </div>
              <div>${escapeHtml(review.comment || 'No comment')}</div>
              <div class="row">
                <small>By: ${escapeHtml(review.customer?.name || 'Customer')}</small>
                <div class="button-row">
                  <button class="small" data-review-id="${escapeHtml(
                    review._id
                  )}" data-review-status="Approved">Approve</button>
                  <button class="small secondary" data-review-id="${escapeHtml(
                    review._id
                  )}" data-review-status="Rejected">Reject</button>
                </div>
              </div>
            </li>`
        )
        .join('')
    : '<li>No pending reviews.</li>';
}

function isRouteNotFoundError(error) {
  const message = String(error?.message || '');
  return (
    error?.status === 404 ||
    error?.status === 405 ||
    /route not found/i.test(message) ||
    /cannot (patch|delete|put|post)/i.test(message) ||
    /request failed \((404|405)\)/i.test(message)
  );
}

async function updateAdminCategory(categoryId, payload) {
  try {
    await api(`/api/admin/categories/${categoryId}/update`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!isRouteNotFoundError(error)) throw error;
    await api(`/api/admin/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }
}

async function deleteAdminCategory(categoryId) {
  try {
    await api(`/api/admin/categories/${categoryId}/delete`, { method: 'POST' });
  } catch (error) {
    if (!isRouteNotFoundError(error)) throw error;
    await api(`/api/admin/categories/${categoryId}`, { method: 'DELETE' });
  }
}

async function updateAdminLocation(locationId, payload) {
  try {
    await api(`/api/admin/locations/${locationId}/update`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!isRouteNotFoundError(error)) throw error;
    await api(`/api/admin/locations/${locationId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }
}

async function deleteAdminLocation(locationId) {
  try {
    await api(`/api/admin/locations/${locationId}/delete`, { method: 'POST' });
  } catch (error) {
    if (!isRouteNotFoundError(error)) throw error;
    await api(`/api/admin/locations/${locationId}`, { method: 'DELETE' });
  }
}

async function loadAdminCategories() {
  const categoryList = document.getElementById('category-list');
  if (!categoryList) return;

  const categories = await api('/api/admin/categories');
  categoryList.innerHTML = categories.length
    ? categories
        .map(
          (item) => `
            <li>
              <div class="row">
                <strong>${escapeHtml(item.name)}</strong>
                <div class="button-row">
                  <button
                    type="button"
                    class="small secondary"
                    data-category-id="${escapeHtml(item._id)}"
                    data-category-action="start-edit"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="small danger"
                    data-category-id="${escapeHtml(item._id)}"
                    data-category-name="${escapeHtml(item.name)}"
                    data-category-action="delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <form
                class="inline-form metadata-edit-form hidden"
                data-category-edit-form
                data-category-id="${escapeHtml(item._id)}"
              >
                <input
                  name="name"
                  value="${escapeHtml(item.name)}"
                  placeholder="Category name"
                  required
                />
                <button type="submit" class="small">Save</button>
                <button
                  type="button"
                  class="small secondary"
                  data-category-id="${escapeHtml(item._id)}"
                  data-category-action="cancel-edit"
                >
                  Cancel
                </button>
              </form>
            </li>`
        )
        .join('')
    : '<li>No categories found.</li>';
}

async function loadAdminLocations() {
  const locationList = document.getElementById('location-list');
  if (!locationList) return;

  const locations = await api('/api/admin/locations');
  locationList.innerHTML = locations.length
    ? locations
        .map(
          (item) => `
            <li>
              <div class="row">
                <strong>${escapeHtml(item.state)} - ${escapeHtml(item.city)}</strong>
                <div class="button-row">
                  <button
                    type="button"
                    class="small secondary"
                    data-location-id="${escapeHtml(item._id)}"
                    data-location-action="start-edit"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="small danger"
                    data-location-id="${escapeHtml(item._id)}"
                    data-location-state="${escapeHtml(item.state)}"
                    data-location-city="${escapeHtml(item.city)}"
                    data-location-action="delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <form
                class="inline-form metadata-edit-form hidden"
                data-location-edit-form
                data-location-id="${escapeHtml(item._id)}"
              >
                <input
                  name="state"
                  value="${escapeHtml(item.state)}"
                  placeholder="State"
                  required
                />
                <input
                  name="city"
                  value="${escapeHtml(item.city)}"
                  placeholder="City"
                  required
                />
                <button type="submit" class="small">Save</button>
                <button
                  type="button"
                  class="small secondary"
                  data-location-id="${escapeHtml(item._id)}"
                  data-location-action="cancel-edit"
                >
                  Cancel
                </button>
              </form>
            </li>`
        )
        .join('')
    : '<li>No locations found.</li>';
}

async function runStoreAction(storeId, action) {
  await api(`/api/admin/stores/${storeId}/${action}`, { method: 'PATCH' });
}

function toPastTense(action) {
  const mapping = {
    approve: 'approved',
    reject: 'rejected',
    block: 'blocked',
    unblock: 'unblocked'
  };
  return mapping[action] || action;
}

function initializeAdminPage() {
  const pathname = String(window.location.pathname || '').toLowerCase();
  const adminPages = new Set([
    '/admin.html',
    '/admin-dashboard.html',
    '/admin-stores.html',
    '/admin-users.html',
    '/admin-reviews.html',
    '/admin-metadata.html'
  ]);
  if (!adminPages.has(pathname)) return;
  if (!enforcePageRoleAccess(['admin'], pathname)) return;

  const dashboardBtn = document.getElementById('dashboard-btn');
  const pendingBtn = document.getElementById('pending-btn');
  const allStoresBtn = document.getElementById('all-stores-btn');
  const usersBtn = document.getElementById('users-btn');
  const pendingReviewsBtn = document.getElementById('pending-reviews-btn');
  const pendingList = document.getElementById('pending-list');
  const allStoresList = document.getElementById('all-stores-list');
  const usersList = document.getElementById('users-list');
  const pendingReviewsList = document.getElementById('pending-reviews-list');
  const categoryForm = document.getElementById('category-form');
  const locationForm = document.getElementById('location-form');
  const categoryList = document.getElementById('category-list');
  const locationList = document.getElementById('location-list');

  dashboardBtn?.addEventListener('click', async () => {
    try {
      const dashboard = await api('/api/admin/dashboard');
      renderDashboard(dashboard);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  pendingBtn?.addEventListener('click', async () => {
    try {
      await loadPendingStores();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  allStoresBtn?.addEventListener('click', async () => {
    try {
      await loadAllStores();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  usersBtn?.addEventListener('click', async () => {
    try {
      await loadUsers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  pendingReviewsBtn?.addEventListener('click', async () => {
    try {
      await loadPendingReviews();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  function wireStoreListActions(container, afterAction) {
    container?.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-store-id]');
      if (!btn) return;
      try {
        await runStoreAction(btn.dataset.storeId, btn.dataset.storeAction);
        showToast(`Store ${toPastTense(btn.dataset.storeAction)}.`);
        await afterAction();
        loadMyNotifications();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  wireStoreListActions(pendingList, loadPendingStores);
  wireStoreListActions(allStoresList, loadAllStores);

  usersList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-user-id]');
    if (!btn) return;

    const userId = btn.dataset.userId;
    const userAction = btn.dataset.userAction;
    if (!userId || !userAction) return;

    try {
      if (userAction === 'reset-password') {
        const isConfirmed = window.confirm('Reset password for this owner?');
        if (!isConfirmed) return;

        const payload = await api(`/api/admin/users/${userId}/reset-password`, {
          method: 'PATCH'
        });
        showToast('Owner password reset.');
        if (payload?.temporaryPassword) {
          window.prompt('Temporary password (copy now):', payload.temporaryPassword);
        }
      } else {
        await api(`/api/admin/users/${userId}/${userAction}`, {
          method: 'PATCH'
        });
        showToast(`User ${userAction}ed.`);
      }
      await loadUsers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  pendingReviewsList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-review-id]');
    if (!btn) return;
    try {
      await api(`/api/admin/reviews/${btn.dataset.reviewId}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ status: btn.dataset.reviewStatus })
      });
      showToast(`Review ${btn.dataset.reviewStatus.toLowerCase()}.`);
      await loadPendingReviews();
      loadMyNotifications();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  categoryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formToObject(form);
    try {
      await api('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      form.reset();
      showToast('Category added.');
      await loadAdminCategories();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  locationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formToObject(form);
    try {
      await api('/api/admin/locations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      form.reset();
      showToast('Location added.');
      await loadAdminLocations();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  categoryList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-category-id]');
    if (!btn) return;

    const { categoryId, categoryAction, categoryName } = btn.dataset;
    if (!categoryId || !categoryAction) return;
    const rowItem = btn.closest('li');

    try {
      if (categoryAction === 'start-edit') {
        categoryList
          .querySelectorAll('form[data-category-edit-form]')
          .forEach((formEl) => formEl.classList.add('hidden'));
        const editForm = rowItem?.querySelector('form[data-category-edit-form]');
        editForm?.classList.remove('hidden');
        editForm?.querySelector('input[name="name"]')?.focus();
      } else if (categoryAction === 'cancel-edit') {
        rowItem?.querySelector('form[data-category-edit-form]')?.classList.add('hidden');
      } else if (categoryAction === 'delete') {
        const isConfirmed = window.confirm(`Delete category "${categoryName || ''}"?`);
        if (!isConfirmed) return;
        await deleteAdminCategory(categoryId);
        showToast('Category deleted.');
        await loadAdminCategories();
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  categoryList?.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-category-edit-form]');
    if (!form) return;
    event.preventDefault();

    const categoryId = form.dataset.categoryId;
    const payload = formToObject(form);
    const name = String(payload.name || '').trim();
    if (!name || !categoryId) {
      showToast('Category name is required.', 'error');
      return;
    }

    try {
      await updateAdminCategory(categoryId, { name });
      showToast('Category updated.');
      await loadAdminCategories();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  locationList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-location-id]');
    if (!btn) return;

    const { locationId, locationAction, locationState, locationCity } = btn.dataset;
    if (!locationId || !locationAction) return;
    const rowItem = btn.closest('li');

    try {
      if (locationAction === 'start-edit') {
        locationList
          .querySelectorAll('form[data-location-edit-form]')
          .forEach((formEl) => formEl.classList.add('hidden'));
        const editForm = rowItem?.querySelector('form[data-location-edit-form]');
        editForm?.classList.remove('hidden');
        editForm?.querySelector('input[name="state"]')?.focus();
      } else if (locationAction === 'cancel-edit') {
        rowItem?.querySelector('form[data-location-edit-form]')?.classList.add('hidden');
      } else if (locationAction === 'delete') {
        const isConfirmed = window.confirm(
          `Delete location "${locationState || ''} - ${locationCity || ''}"?`
        );
        if (!isConfirmed) return;
        await deleteAdminLocation(locationId);
        showToast('Location deleted.');
        await loadAdminLocations();
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  locationList?.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-location-edit-form]');
    if (!form) return;
    event.preventDefault();

    const locationId = form.dataset.locationId;
    const payload = formToObject(form);
    const stateName = String(payload.state || '').trim();
    const cityName = String(payload.city || '').trim();
    if (!stateName || !cityName || !locationId) {
      showToast('Both state and city are required.', 'error');
      return;
    }

    try {
      await updateAdminLocation(locationId, { state: stateName, city: cityName });
      showToast('Location updated.');
      await loadAdminLocations();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  if (dashboardBtn || document.getElementById('metric-total-stores')) {
    api('/api/admin/dashboard')
      .then(renderDashboard)
      .catch((error) => showToast(error.message, 'error'));
  }
  if (pendingList) {
    loadPendingStores().catch((error) => showToast(error.message, 'error'));
  }
  if (allStoresList) {
    loadAllStores().catch((error) => showToast(error.message, 'error'));
  }
  if (usersList) {
    loadUsers().catch((error) => showToast(error.message, 'error'));
  }
  if (pendingReviewsList) {
    loadPendingReviews().catch((error) => showToast(error.message, 'error'));
  }
  if (categoryList || categoryForm) {
    loadAdminCategories().catch((error) => showToast(error.message, 'error'));
  }
  if (locationList || locationForm) {
    loadAdminLocations().catch((error) => showToast(error.message, 'error'));
  }
}

initializeTabs();
ensureHeaderAuthActions();
initializeHeaderAuthActions();
renderUser();
initializeAuthPage();
initializeStorePage();
initializeOwnerPage();
initializeAdminPage();

