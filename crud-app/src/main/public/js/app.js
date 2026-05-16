const API_URL = '/api/trips';

const tripList = document.getElementById('tripList');
const editingInvoiceKey = document.getElementById('editingInvoiceKey');
const customerNameInput = document.getElementById('customerName');
const customerLocationInput = document.getElementById('customerLocation');
const poOrderInput = document.getElementById('poOrder');
const poDateInput = document.getElementById('poDate');
const travellerNameInput = document.getElementById('travellerName');
const travelRouteInput = document.getElementById('travelRoute');
const woNumberInput = document.getElementById('woNumber');
const woDateInput = document.getElementById('woDate');
const travelStartDateInput = document.getElementById('travelStartDate');
const travelEndDateInput = document.getElementById('travelEndDate');
const yantrikiInvoiceInput = document.getElementById('yantrikiInvoiceNumber');
const pkReadonlyHint = document.getElementById('pkReadonlyHint');
const addBtn = document.getElementById('addBtn');
const updateBtn = document.getElementById('updateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formTitle = document.getElementById('formTitle');
const searchInput = document.getElementById('searchInput');

const tabShowAll = document.getElementById('tabShowAll');
const tabRecord = document.getElementById('tabRecord');
const tabSearch = document.getElementById('tabSearch');

const sectionShowAll = document.getElementById('sectionShowAll');
const sectionRecord = document.getElementById('sectionRecord');
const sectionSearch = document.getElementById('sectionSearch');

const EMPTY_COLSPAN = 17;

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function formatAuditDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return '—';
  }
}

function formatStatus(status) {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatStatusClass(status) {
  if (!status || status === 'pending') return 'status-pending';
  if (status === 'approved') return 'status-approved';
  if (status === 'rejected') return 'status-rejected';
  return '';
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: options.headers
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  return res;
}

async function initSession() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!res.ok) {
    window.location.href = '/login.html';
    return false;
  }
  const data = await res.json();
  const el = document.getElementById('navUser');
  if (el) el.textContent = data.username;
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initSession())) return;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin'
        });
      } catch (e) {
        /* ignore */
      }
      window.location.href = '/login.html';
    });
  }

  fetchTrips();
  setupNavigation();
  searchInput.addEventListener('input', () => clearSearchError());
});

function setupNavigation() {
  tabShowAll.addEventListener('click', () => showSection('showAll'));
  tabRecord.addEventListener('click', () => showSection('record'));
  tabSearch.addEventListener('click', () => showSection('search'));
}

function showSection(sectionName) {
  clearError();
  clearSearchError();

  sectionShowAll.classList.add('hidden');
  sectionRecord.classList.add('hidden');
  sectionSearch.classList.add('hidden');

  tabShowAll.classList.remove('active');
  tabRecord.classList.remove('active');
  tabSearch.classList.remove('active');

  if (sectionName === 'showAll') {
    sectionShowAll.classList.remove('hidden');
    tabShowAll.classList.add('active');
    fetchTrips();
  } else if (sectionName === 'record') {
    sectionRecord.classList.remove('hidden');
    tabRecord.classList.add('active');
  } else if (sectionName === 'search') {
    sectionSearch.classList.remove('hidden');
    tabSearch.classList.add('active');
  }
}

async function fetchTrips() {
  try {
    const response = await apiFetch(API_URL);
    const trips = await response.json();
    renderTrips(trips);
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error fetching trips:', error);
  }
}

function clearSearchError() {
  const el = document.getElementById('searchError');
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

function showSearchError(message) {
  const el = document.getElementById('searchError');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearSearchAndFetch() {
  clearSearchError();
  searchInput.value = '';
  fetchTrips();
}

async function searchTrips() {
  const keyword = searchInput.value.trim();
  if (!keyword) {
    showSearchError('Please enter a search term. This field is required.');
    return;
  }
  clearSearchError();
  try {
    const response = await apiFetch(
      `${API_URL}/search?keyword=${encodeURIComponent(keyword)}`
    );
    const results = await response.json();
    renderTrips(results);
    sectionShowAll.classList.remove('hidden');
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error searching:', error);
    showSearchError('Search failed. Please try again.');
  }
}

function setPkFieldReadonly(isEdit) {
  yantrikiInvoiceInput.readOnly = isEdit;
  pkReadonlyHint.classList.toggle('hidden', !isEdit);
}

async function createTrip() {
  const data = getFormData();
  if (!validateData(data)) return;

  try {
    const fileInput = document.getElementById('tripFile');

    // If a file is selected, use FormData to send both data and file together
    if (fileInput && fileInput.files.length > 0) {
      const formData = new FormData();
      // Add all trip data fields
      Object.keys(data).forEach(key => {
        formData.append(key, data[key]);
      });
      // Add the file
      formData.append('file', fileInput.files[0]);

      const response = await apiFetch(API_URL, {
        method: 'POST',
        body: formData
      });

      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        resetForm();
        showSection('showAll');
      } else {
        showError(result.error || 'Failed to add trip.');
      }
    } else {
      // No file, send as JSON
      const response = await apiFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        resetForm();
        showSection('showAll');
      } else {
        showError(result.error || 'Failed to add trip.');
      }
    }
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error creating trip:', error);
    showError('Network error: ' + error.message);
  }
}

async function updateTrip() {
  const key = editingInvoiceKey.value;
  const data = getFormData();
  if (!validateData(data)) return;
  if (!key) {
    showError('Nothing to update.');
    return;
  }

  try {
    const response = await apiFetch(
      `${API_URL}/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }
    );

    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      resetForm();
      showSection('showAll');
    } else {
      showError(result.error || 'Failed to update trip.');
    }
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error updating trip:', error);
    showError('Network error: ' + error.message);
  }
}

async function deleteTrip(invoiceKey) {
  if (
    !confirm(
      'Delete this trip? It will disappear from the list; deleted by and date are stored for audit.'
    )
  )
    return;
  try {
    const response = await apiFetch(
      `${API_URL}/${encodeURIComponent(invoiceKey)}`,
      { method: 'DELETE' }
    );
    if (response.ok) {
      fetchTrips();
    } else {
      const err = await response.json().catch(() => ({}));
      alert(err.error || 'Delete failed.');
    }
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error deleting trip:', error);
  }
}

function renderTrips(data) {
  tripList.innerHTML = '';
  if (data.length === 0) {
    tripList.innerHTML = `<tr><td colspan="${EMPTY_COLSPAN}" class="table-empty">No trip records found.</td></tr>`;
    return;
  }
  data.forEach((trip) => {
    const tr = document.createElement('tr');
    const inv = trip.yantrikiInvoiceNumber;

    // Status badge
    const statusClass = formatStatusClass(trip.status);
    const statusText = formatStatus(trip.status);
    const statusBadge = `<span class="status-badge ${statusClass}">${statusText}</span>`;

    // File download link
    const fileLink = trip.fileName
      ? `<a href="${API_URL}/${encodeURIComponent(inv)}/file" class="file-download-link" download>📎 ${esc(trip.fileName)}</a>`
      : '—';

    // Rejection reason
    const rejectionReason = trip.status === 'rejected' && trip.rejectionReason
      ? `<br><span class="rejection-reason">Reason: ${esc(trip.rejectionReason)}</span>`
      : '';

    tr.innerHTML = `
            <td class="cell-mono">${esc(inv)}</td>
            <td>${esc(trip.customerName)}</td>
            <td>${esc(trip.customerLocation)}</td>
            <td>${esc(trip.poOrder)}</td>
            <td>${esc(trip.poDate)}</td>
            <td>${esc(trip.travellerName)}</td>
            <td>${esc(trip.travelRoute)}</td>
            <td>${esc(trip.woNumber)}</td>
            <td>${esc(trip.woDate)}</td>
            <td>${esc(trip.travelStartDate)}</td>
            <td>${esc(trip.travelEndDate)}</td>
            <td>${esc(trip.createdBy || '—')}</td>
            <td>${esc(formatAuditDate(trip.createdDate))}</td>
            <td>${esc(trip.updatedBy || '—')}</td>
            <td>${esc(formatAuditDate(trip.updatedDate))}</td>
            <td>${fileLink}</td>
            <td class="actions">
                <button type="button" class="btn btn-edit">Edit</button>
                <button type="button" class="btn btn-delete">Delete</button>
            </td>
        `;

    tr.querySelector('.btn-edit').addEventListener('click', () => editTrip(trip));
    tr
      .querySelector('.btn-delete')
      .addEventListener('click', () => deleteTrip(inv));

    tripList.appendChild(tr);
  });
}

function editTrip(trip) {
  editingInvoiceKey.value = trip.yantrikiInvoiceNumber;
  customerNameInput.value = trip.customerName || '';
  customerLocationInput.value = trip.customerLocation || '';
  poOrderInput.value = trip.poOrder || '';
  poDateInput.value = trip.poDate || '';
  travellerNameInput.value = trip.travellerName || '';
  travelRouteInput.value = trip.travelRoute || '';
  woNumberInput.value = trip.woNumber || '';
  woDateInput.value = trip.woDate || '';
  travelStartDateInput.value = trip.travelStartDate || '';
  travelEndDateInput.value = trip.travelEndDate || '';
  yantrikiInvoiceInput.value = trip.yantrikiInvoiceNumber || '';

  setPkFieldReadonly(true);
  formTitle.textContent = `Update Trip — ${trip.yantrikiInvoiceNumber}`;
  addBtn.style.display = 'none';
  updateBtn.style.display = 'inline-block';
  cancelBtn.style.display = 'inline-block';

  showSection('record');
}

function resetForm() {
  clearError();
  editingInvoiceKey.value = '';
  customerNameInput.value = '';
  customerLocationInput.value = '';
  poOrderInput.value = '';
  poDateInput.value = '';
  travellerNameInput.value = '';
  travelRouteInput.value = '';
  woNumberInput.value = '';
  woDateInput.value = '';
  travelStartDateInput.value = '';
  travelEndDateInput.value = '';
  yantrikiInvoiceInput.value = '';

  // Clear file input
  const fileInput = document.getElementById('tripFile');
  if (fileInput) fileInput.value = '';

  setPkFieldReadonly(false);
  formTitle.textContent = 'Record New Trip';
  addBtn.style.display = 'inline-block';
  updateBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
}

function getFormData() {
  return {
    yantrikiInvoiceNumber: yantrikiInvoiceInput.value.trim(),
    customerName: customerNameInput.value.trim(),
    customerLocation: customerLocationInput.value.trim(),
    poOrder: poOrderInput.value.trim(),
    poDate: poDateInput.value.trim(),
    travellerName: travellerNameInput.value.trim(),
    travelRoute: travelRouteInput.value.trim(),
    woNumber: woNumberInput.value.trim(),
    woDate: woDateInput.value.trim(),
    travelStartDate: travelStartDateInput.value.trim(),
    travelEndDate: travelEndDateInput.value.trim()
  };
}

function showError(message) {
  const errDiv = document.getElementById('formError');
  errDiv.textContent = message;
  errDiv.hidden = false;
}

function clearError() {
  const errDiv = document.getElementById('formError');
  errDiv.hidden = true;
  errDiv.textContent = '';
}

function parseDateOnly(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function validateData(data) {
  clearError();
  const labels = {
    customerName: 'Customer Name',
    customerLocation: 'Customer Location',
    poOrder: 'PO Order',
    poDate: 'PO Date',
    travellerName: 'Traveller Name',
    travelRoute: 'Travel Route',
    woNumber: 'WO Number',
    woDate: 'WO Date',
    travelStartDate: 'Travel Start Date',
    travelEndDate: 'Travel End Date',
    yantrikiInvoiceNumber: 'Yantriki Invoice Number'
  };

  const missing = [];
  for (const key of Object.keys(labels)) {
    if (!data[key]) missing.push(labels[key]);
  }
  if (missing.length) {
    const list = missing.join(', ');
    showError(
      missing.length === 1
        ? `Please fill in the required field: ${list}.`
        : `Please fill in all required fields. Missing: ${list}.`
    );
    return false;
  }

  const poD = parseDateOnly(data.poDate);
  const woD = parseDateOnly(data.woDate);
  const startD = parseDateOnly(data.travelStartDate);
  const endD = parseDateOnly(data.travelEndDate);

  if (!poD) {
    showError('PO Date is not a valid date.');
    return false;
  }
  if (!woD) {
    showError('WO Date is not a valid date.');
    return false;
  }
  if (!startD) {
    showError('Travel Start Date is not a valid date.');
    return false;
  }
  if (!endD) {
    showError('Travel End Date is not a valid date.');
    return false;
  }

  if (endD < startD) {
    showError('Travel End Date must be on or after Travel Start Date.');
    return false;
  }

  return true;
}