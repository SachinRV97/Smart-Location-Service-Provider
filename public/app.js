const state = {
  token: localStorage.getItem('slsp_token') || '',
  user: JSON.parse(localStorage.getItem('slsp_user') || 'null'),
  stores: [],
  storesMap: null,
  ownerMap: null,
  ownerMarker: null,
  markersByStoreId: new Map(),
  selectedStoreId: ''
};

const toastEl = document.getElementById('toast');
const userDisplays = [...document.querySelectorAll('#user-display')];

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
  const text = state.user ? `${state.user.name} (${state.user.role})` : 'None';
  userDisplays.forEach((el) => {
    el.textContent = text;
  });
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
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
  const tabs = document.querySelectorAll('.tab');
  if (!tabs.length) return;

  tabs.forEach((button) => {
    button.addEventListener('click', () => {
      tabs.forEach((tab) => tab.classList.remove('is-active'));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.add('hidden'));
      button.classList.add('is-active');
      document.getElementById(button.dataset.panel)?.classList.remove('hidden');
    });
  });
}

function fillSelect(selectEl, values, placeholderLabel) {
  if (!selectEl) return;
  const currentValue = selectEl.value;
  const options = [`<option value="">${escapeHtml(placeholderLabel)}</option>`]
    .concat(
      values.map(
        (value) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    )
    .join('');

  selectEl.innerHTML = options;
  if (currentValue && values.includes(currentValue)) {
    selectEl.value = currentValue;
  }
}

async function loadCitiesByState(stateName, citySelect) {
  if (!citySelect) return;
  if (!stateName) {
    fillSelect(citySelect, [], 'All Cities');
    return;
  }
  const cities = await api(`/api/meta/cities?state=${encodeURIComponent(stateName)}`);
  fillSelect(citySelect, cities, 'All Cities');
}

async function loadMetaFilters({ stateSelect, citySelect, categorySelect, statePlaceholder = 'All States', cityPlaceholder = 'All Cities' }) {
  const [states, categories] = await Promise.all([
    api('/api/meta/states'),
    api('/api/meta/categories')
  ]);

  fillSelect(stateSelect, states, statePlaceholder);
  fillSelect(citySelect, [], cityPlaceholder);
  fillSelect(categorySelect, categories, 'All Categories');
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
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.fullAddress || `${store.city}, ${store.state}`)}`;
}

function initializeAuthPage() {
  const registerForm = document.getElementById('register-panel');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = formToObject(event.currentTarget);

      try {
        const data = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setSession(data.token, data.user);
        event.currentTarget.reset();
        showToast('Registration successful.');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  const loginForm = document.getElementById('login-panel');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
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
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      setSession('', null);
      showToast('Logged out.');
    });
  }
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
      const distance = store.distanceMeters ? `<small>${metersToKm(store.distanceMeters)}</small>` : '';
      return `
        <li data-store-id="${escapeHtml(store._id)}">
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

function clearStoreMarkers() {
  if (!state.storesMap) return;
  state.markersByStoreId.forEach((marker) => marker.remove());
  state.markersByStoreId.clear();
}

function renderStoreMarkers(stores) {
  if (!state.storesMap) return;
  clearStoreMarkers();

  const bounds = [];
  stores.forEach((store) => {
    const coords = parseCoordinates(store);
    if (!coords) return;

    const marker = L.marker([coords.lat, coords.lng]).addTo(state.storesMap);
    marker.bindPopup(`<strong>${escapeHtml(store.storeName)}</strong><br>${escapeHtml(store.city || '')}, ${escapeHtml(store.state || '')}`);
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

  const imageHtml = Array.isArray(store.images) && store.images.length
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
          (review) => `<li><strong>${escapeHtml(review.customer?.name || 'Customer')}</strong>: ${Number(review.rating).toFixed(1)} / 5${review.comment ? ` - ${escapeHtml(review.comment)}` : ''}</li>`
        )
        .join('')}</ul>`
    : '<p class="hint">No approved reviews yet.</p>';

  const reviewFormHtml = state.user?.role === 'customer'
    ? `
      <form id="review-form" class="inline-form">
        <input type="number" step="1" min="1" max="5" name="rating" placeholder="Rating 1-5" required />
        <input name="comment" placeholder="Write a short review" />
        <button type="submit">Submit Review</button>
      </form>`
    : '';

  const favoriteButton = state.user?.role === 'customer'
    ? `<button id="favorite-btn" class="secondary" data-favorite="${store.isFavorite ? 'remove' : 'add'}">${store.isFavorite ? 'Remove Favorite' : 'Save to Favorite'}</button>`
    : '';

  detailEl.innerHTML = `
    <h3>${escapeHtml(store.storeName)}</h3>
    <div class="detail-grid">
      <div><strong>Category:</strong> ${escapeHtml(store.category || 'General')}</div>
      <div><strong>Address:</strong> ${escapeHtml(store.fullAddress || 'N/A')}</div>
      <div><strong>Phone:</strong> ${escapeHtml(store.phone || 'N/A')}</div>
      <div><strong>Owner:</strong> ${escapeHtml(store.ownerName || 'N/A')}</div>
      <div><strong>Open Hours:</strong> ${escapeHtml(store.openingTime || '--')} - ${escapeHtml(store.closingTime || '--')}</div>
      <div><strong>Rating:</strong> ${Number(store.ratingAverage || 0).toFixed(1)} (${store.ratingCount || 0})</div>
      <div><strong>Photos:</strong> ${imageHtml}</div>
      <div><strong>Description:</strong> ${escapeHtml(store.description || 'N/A')}</div>
    </div>
    <div class="button-row" style="margin-top: 0.8rem;">
      <a href="tel:${escapeHtml(store.phone || '')}"><button type="button">Call Now</button></a>
      <a href="${getDirectionsUrl(store)}" target="_blank" rel="noreferrer"><button type="button" class="secondary">Get Direction</button></a>
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
    const coords = parseCoordinates(store);
    if (coords && state.storesMap) {
      state.storesMap.setView([coords.lat, coords.lng], 14);
      const marker = state.markersByStoreId.get(storeId);
      if (marker) marker.openPopup();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function runStoreSearch() {
  const searchForm = document.getElementById('search-form');
  if (!searchForm) return;

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

  const stores = await api(`/api/stores?${params.toString()}`);
  state.stores = stores;
  renderStoreList(stores);
  renderStoreMarkers(stores);
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

  loadMetaFilters({ stateSelect, citySelect, categorySelect }).catch((error) => {
    showToast(error.message, 'error');
  });

  stateSelect?.addEventListener('change', async () => {
    try {
      await loadCitiesByState(stateSelect.value, citySelect);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await runStoreSearch();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  detectBtn?.addEventListener('click', () => {
    detectCurrentLocation({
      latInput: nearestLatInput,
      lngInput: nearestLngInput,
      onSuccess: (lat, lng) => {
        if (state.storesMap) {
          state.storesMap.setView([lat, lng], 13);
        }
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
      renderStoreList(favorites);
      renderStoreMarkers(favorites);
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
    if (event.target.id !== 'review-form') return;
    event.preventDefault();
    if (!state.selectedStoreId) return;

    const payload = formToObject(event.target);
    try {
      await api(`/api/reviews/${state.selectedStoreId}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Review submitted for moderation.');
      event.target.reset();
      await loadStoreDetail(state.selectedStoreId);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
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
  state.ownerMarker.on('dragend', () => {
    const pos = state.ownerMarker.getLatLng();
    latInput.value = pos.lat.toFixed(6);
    lngInput.value = pos.lng.toFixed(6);
  });
}

function updateOwnerMarkerFromInputs(latInput, lngInput) {
  const lat = Number(latInput.value);
  const lng = Number(lngInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !state.ownerMap || !state.ownerMarker) return;
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
  } catch (error) {
    listEl.innerHTML = '<li>Login as owner to view your stores.</li>';
  }
}

function initializeOwnerPage() {
  const storeForm = document.getElementById('store-form');
  if (!storeForm) return;

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
    cityPlaceholder: 'Select City'
  }).catch((error) => {
    showToast(error.message, 'error');
  });

  stateSelect?.addEventListener('change', async () => {
    try {
      await loadCitiesByState(stateSelect.value, citySelect);
      citySelect.querySelector('option').textContent = 'Select City';
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  initializeOwnerMap(latInput, lngInput);

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
    const payload = formToObject(event.currentTarget);

    try {
      await api('/api/stores', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      event.currentTarget.reset();
      showToast('Store submitted. Waiting for admin approval.');
      loadOwnerStores(ownerStoreList);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  loadOwnerStores(ownerStoreList);
}

function renderDashboard(dashboard) {
  const output = document.getElementById('dashboard-output');
  if (!output) return;
  output.textContent = JSON.stringify(dashboard, null, 2);
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
                  <button class="small" data-id="${escapeHtml(store._id)}" data-action="approve">Approve</button>
                  <button class="small secondary" data-id="${escapeHtml(store._id)}" data-action="reject">Reject</button>
                  <button class="small secondary" data-id="${escapeHtml(store._id)}" data-action="block">Block</button>
                </div>
              </div>
            </li>`
        )
        .join('')
    : '<li>No pending stores right now.</li>';
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
                <button class="small ${user.isBlocked ? '' : 'secondary'}" data-user-id="${escapeHtml(user._id)}" data-user-action="${user.isBlocked ? 'unblock' : 'block'}">${user.isBlocked ? 'Unblock' : 'Block'}</button>
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
                  <button class="small" data-review-id="${escapeHtml(review._id)}" data-review-status="Approved">Approve</button>
                  <button class="small secondary" data-review-id="${escapeHtml(review._id)}" data-review-status="Rejected">Reject</button>
                </div>
              </div>
            </li>`
        )
        .join('')
    : '<li>No pending reviews.</li>';
}

async function loadAdminCategories() {
  const categoryList = document.getElementById('category-list');
  if (!categoryList) return;

  const categories = await api('/api/admin/categories');
  categoryList.innerHTML = categories.length
    ? categories.map((item) => `<li>${escapeHtml(item.name)}</li>`).join('')
    : '<li>No categories found.</li>';
}

async function loadAdminLocations() {
  const locationList = document.getElementById('location-list');
  if (!locationList) return;

  const locations = await api('/api/admin/locations');
  locationList.innerHTML = locations.length
    ? locations
        .map((item) => `<li>${escapeHtml(item.state)} - ${escapeHtml(item.city)}</li>`)
        .join('')
    : '<li>No locations found.</li>';
}

function initializeAdminPage() {
  const dashboardBtn = document.getElementById('dashboard-btn');
  const pendingBtn = document.getElementById('pending-btn');
  const usersBtn = document.getElementById('users-btn');
  const pendingReviewsBtn = document.getElementById('pending-reviews-btn');
  const pendingList = document.getElementById('pending-list');
  const usersList = document.getElementById('users-list');
  const pendingReviewsList = document.getElementById('pending-reviews-list');
  const categoryForm = document.getElementById('category-form');
  const locationForm = document.getElementById('location-form');

  if (!dashboardBtn) return;

  dashboardBtn.addEventListener('click', async () => {
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

  pendingList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-id]');
    if (!btn) return;

    try {
      await api(`/api/admin/stores/${btn.dataset.id}/${btn.dataset.action}`, { method: 'PATCH' });
      showToast(`Store ${btn.dataset.action}d.`);
      await loadPendingStores();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  usersList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-user-id]');
    if (!btn) return;
    try {
      await api(`/api/admin/users/${btn.dataset.userId}/${btn.dataset.userAction}`, { method: 'PATCH' });
      showToast(`User ${btn.dataset.userAction}ed.`);
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
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  categoryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    try {
      await api('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      event.currentTarget.reset();
      showToast('Category added.');
      await loadAdminCategories();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  locationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    try {
      await api('/api/admin/locations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      event.currentTarget.reset();
      showToast('Location added.');
      await loadAdminLocations();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  Promise.all([loadAdminCategories(), loadAdminLocations()]).catch(() => {});
}

initializeTabs();
renderUser();
initializeAuthPage();
initializeStorePage();
initializeOwnerPage();
initializeAdminPage();
