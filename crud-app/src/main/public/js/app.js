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

const EMPTY_COLSPAN = 20;
let currentPage = 1;
let sortBy = 'yantriki_invoice_number';
let sortOrder = 'ASC';

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
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || ('HTTP Error: ' + res.status));
  }
  return res;
}

let currentUserRole = null;
let currentUsername = null;

async function initSession() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!res.ok) {
    window.location.href = '/login.html';
    return false;
  }
  const data = await res.json();
  currentUserRole = data.role;
  currentUsername = data.username;
  console.log('Main Dashboard: Current User Role detected as:', currentUserRole);
  const el = document.getElementById('navUser');
  if (el) el.textContent = `${data.username}/${data.role}`;

  // Hide Create Trip option (Record Trip tab) for Admin/Approver roles
  if (currentUserRole && (currentUserRole.toLowerCase() === 'admin' || currentUserRole.toLowerCase() === 'approver')) {
    const recordTab = document.getElementById('tabRecord');
    if (recordTab) recordTab.style.display = 'none';
  }

  // Auto-populate traveller name with username if the role is guser
  if (currentUserRole && currentUserRole.toLowerCase() === 'guser') {
    if (travellerNameInput) travellerNameInput.value = currentUsername || '';
  }

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
  setupSorting();
  searchInput.addEventListener('input', () => clearSearchError());
});

function setupSorting() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (sortBy === col) {
        sortOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        sortBy = col;
        sortOrder = 'ASC';
      }
      fetchTrips();
    });
  });
}

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

async function fetchTrips(page = currentPage) {
  currentPage = page;
  try {
    const response = await apiFetch(`${API_URL}?page=${currentPage}&sortBy=${sortBy}&sortOrder=${sortOrder}`);
    const data = await response.json();
    renderTrips(data.trips);
    renderPagination(data.pagination);
  } catch (err) {
    if (err.message === 'Unauthorized') return;
    console.error('Error fetching trips:', err);
  }
}

function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container) return;
  container.innerHTML = '';
  if (pagination.pages <= 1) return;

  const nav = document.createElement('nav');
  nav.className = 'pagination-nav';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Previous';
  prevBtn.disabled = pagination.page === 1;
  prevBtn.onclick = () => fetchTrips(pagination.page - 1);
  nav.appendChild(prevBtn);

  const info = document.createElement('span');
  info.textContent = `Page ${pagination.page} of ${pagination.pages}`;
  nav.appendChild(info);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.disabled = pagination.page === pagination.pages;
  nextBtn.onclick = () => fetchTrips(pagination.page + 1);
  nav.appendChild(nextBtn);

  container.appendChild(nav);
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
    renderTrips(results, true);
    
    // Clear pagination container during search since search displays all matched records flatly
    const paginationContainer = document.getElementById('pagination');
    if (paginationContainer) paginationContainer.innerHTML = '';

    sectionShowAll.classList.remove('hidden');
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error searching:', error);
    showSearchError(error.message);
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

    if (fileInput && fileInput.files.length > 0) {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        formData.append(key, data[key]);
      });
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

async function approveTrip(invoice) {
  if (!confirm('Are you sure you want to approve this trip?')) return;
  try {
    const response = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/approve`, {
      method: 'POST'
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      alert('Trip approved successfully!');
      fetchTrips();
    } else {
      alert(result.error || 'Failed to approve trip.');
    }
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error approving trip:', error);
    alert('Error approving trip.');
  }
}

async function rejectTrip(invoice) {
  const reason = prompt('Please provide a reason for rejection:');
  if (reason === null) return;
  try {
    const response = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || 'No reason provided' })
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      alert('Trip rejected.');
      fetchTrips();
    } else {
      alert(result.error || 'Failed to reject trip.');
    }
  } catch (error) {
    if (error.message === 'Unauthorized') return;
    console.error('Error rejecting trip:', error);
    alert('Error rejecting trip.');
  }
}

function renderTrips(data, isSearch = false) {
  tripList.innerHTML = '';
  if (data.length === 0) {
    const emptyMsg = isSearch ? " No reacord for the selected criteria" : "No trip records found.";
    tripList.innerHTML = `<tr><td colspan="${EMPTY_COLSPAN}" class="table-empty">${emptyMsg}</td></tr>`;
    return;
  }
  data.forEach((trip) => {
    const tr = document.createElement('tr');
    const inv = trip.yantrikiInvoiceNumber;

    const statusClass = formatStatusClass(trip.status);
    const statusText = formatStatus(trip.status);
    const statusBadge = `<span class="status-badge ${statusClass}">${statusText}</span>`;

    const docLink = `<a href="supporting-docs.html?invoice=${encodeURIComponent(inv)}" class="file-download-link" title="View supporting documents">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      Show Supporting Docs
    </a>`;

    const rejectionReason = trip.status === 'rejected' && trip.rejectionReason
      ? `<br><span class="rejection-reason">Reason: ${esc(trip.rejectionReason)}</span>`
      : '';

    const isApproverOrAdmin = currentUserRole && (currentUserRole.toLowerCase() === 'approver' || currentUserRole.toLowerCase() === 'admin');

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
            <td>${esc(trip.woStartDate || '—')}</td>
            <td>${esc(trip.woEndDate || '—')}</td>
            <td>${esc(trip.travelStartDate)}</td>
            <td>${esc(trip.travelEndDate)}</td>
            <td>${esc(trip.createdBy || '—')}</td>
            <td>${esc(formatAuditDate(trip.createdDate))}</td>
            <td>${esc(trip.updatedBy || '—')}</td>
            <td>${esc(formatAuditDate(trip.updatedDate))}</td>
            <td>${docLink}</td>
            <td>${statusBadge}${rejectionReason}</td>
            <td>${esc(trip.approvedBy || '—')}</td>
            <td class="actions">
                ${isApproverOrAdmin ? `
                <button type="button" class="btn btn-approve btn-sm" data-action="approve" ${trip.status && trip.status !== 'pending' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : (trip.docCount === 0 ? 'disabled title="Requires supporting documents" style="opacity: 0.5; cursor: not-allowed;"' : '')}>Approve</button>
                <button type="button" class="btn btn-reject btn-sm" data-action="reject" ${trip.status && trip.status !== 'pending' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : (trip.docCount === 0 ? 'disabled title="Requires supporting documents" style="opacity: 0.5; cursor: not-allowed;"' : '')}>Reject</button>
                ` : `
                <button type="button" class="btn btn-edit" ${(trip.status && trip.status.toLowerCase() === 'approved') || trip.submittedForApproval ? `disabled style="opacity: 0.5; cursor: not-allowed;" title="${trip.status && trip.status.toLowerCase() === 'approved' ? 'Approved records cannot be edited' : 'Submitted records cannot be edited'}"` : ''}>Edit</button>
                <button type="button" class="btn btn-delete" ${(trip.status && trip.status.toLowerCase() === 'approved') || trip.submittedForApproval ? `disabled style="opacity: 0.5; cursor: not-allowed;" title="${trip.status && trip.status.toLowerCase() === 'approved' ? 'Approved records cannot be deleted' : 'Submitted records cannot be deleted'}"` : ''}>Delete</button>
                `}
            </td>
        `;

    if (isApproverOrAdmin) {
      tr.querySelector('[data-action="approve"]').addEventListener('click', () => approveTrip(inv));
      tr.querySelector('[data-action="reject"]').addEventListener('click', () => rejectTrip(inv));
    } else {
      if ((trip.status && trip.status.toLowerCase() === 'approved') || trip.submittedForApproval) {
        // Do not bind click handlers for approved/submitted records
      } else {
        tr.querySelector('.btn-edit').addEventListener('click', () => editTrip(trip));
        tr.querySelector('.btn-delete').addEventListener('click', () => deleteTrip(inv));
      }
    }

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
  travelEndDateInput.value = trip.travelEndDate;
  yantrikiInvoiceInput.value = trip.yantrikiInvoiceNumber;
  document.getElementById('woStartDate').value = trip.woStartDate || '';
  document.getElementById('woEndDate').value = trip.woEndDate || '';
  editingInvoiceKey.value = trip.yantrikiInvoiceNumber;
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
  document.getElementById('woStartDate').value = '';
  document.getElementById('woEndDate').value = '';

  // Clear file input
  const fileInput = document.getElementById('tripFile');
  if (fileInput) fileInput.value = '';

  // Auto-populate traveller name with username if the role is guser
  if (currentUserRole && currentUserRole.toLowerCase() === 'guser') {
    if (travellerNameInput) travellerNameInput.value = currentUsername || '';
  }

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
    travelEndDate: travelEndDateInput.value.trim(),
    woStartDate: document.getElementById('woStartDate').value.trim(),
    woEndDate: document.getElementById('woEndDate').value.trim()
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
    yantrikiInvoiceNumber: 'Yantriki Invoice Number',
    woStartDate: 'WO Start Date',
    woEndDate: 'WO End Date'
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
  const woStartD = parseDateOnly(data.woStartDate);
  const woEndD = parseDateOnly(data.woEndDate);

  if (!poD || !woD || !startD || !endD || !woStartD || !woEndD) {
    showError('One or more date fields are invalid.');
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startD > today) {
    showError('Travel Start Date should not be a future date.');
    return false;
  }

  if (endD <= startD) {
    showError('Travel End Date should be greater than Travel Start Date.');
    return false;
  }

  if (woStartD > woEndD) {
    showError('WO Start Date should not be greater than WO End Date.');
    return false;
  }

  return true;
}