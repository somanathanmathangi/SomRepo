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

function formatDateOnly(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
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

  const el = document.getElementById('navUser');
  if (el) el.textContent = `${data.username}/${data.role}`;

  if (currentUserRole && (currentUserRole.toLowerCase() === 'admin' || currentUserRole.toLowerCase() === 'approver')) {
    const recordTab = document.getElementById('tabRecord');
    if (recordTab) recordTab.style.display = 'none';
  }

  if (currentUserRole && currentUserRole.toLowerCase() === 'guser') {
    if (travellerNameInput) travellerNameInput.value = currentUsername || '';
  }

  return true;
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

function renderTrips(data, isSearch = false) {
  tripList.innerHTML = '';
  if (data.length === 0) {
    tripList.innerHTML = `<tr><td colspan="${EMPTY_COLSPAN}" class="table-empty">No records found.</td></tr>`;
    return;
  }

  data.forEach((trip) => {
    const tr = document.createElement('tr');
    const inv = trip.yantrikiInvoiceNumber;

    const statusClass = formatStatusClass(trip.status);
    const statusText = formatStatus(trip.status);

    const isApproverOrAdmin = currentUserRole && (currentUserRole.toLowerCase() === 'approver' || currentUserRole.toLowerCase() === 'admin');

    tr.innerHTML = `
      <td class="cell-mono">${esc(inv)}</td>
      <td>${esc(trip.customerName)}</td>
      <td>${esc(trip.customerLocation)}</td>
      <td>${esc(trip.poOrder)}</td>
      <td>${formatDateOnly(trip.poDate)}</td>
      <td>${esc(trip.travellerName)}</td>
      <td>${esc(trip.travelRoute)}</td>
      <td>${esc(trip.woNumber)}</td>
      <td>${formatDateOnly(trip.woDate)}</td>
      <td>${formatDateOnly(trip.woStartDate)}</td>
      <td>${formatDateOnly(trip.woEndDate)}</td>
      <td>${formatDateOnly(trip.travelStartDate)}</td>
      <td>${formatDateOnly(trip.travelEndDate)}</td>
      <td>${esc(trip.createdBy || '—')}</td>
      <td>${formatAuditDate(trip.createdDate)}</td>
      <td>${esc(trip.updatedBy || '—')}</td>
      <td>${formatAuditDate(trip.updatedDate)}</td>
      <td>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </td>
      <td>${esc(trip.approvedBy || '—')}</td>
    `;

    tripList.appendChild(tr);
  });
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

function validateData(data) {
  clearError();
  for (const key of Object.keys(data)) {
    if (!data[key]) {
      showError('Missing required fields');
      return false;
    }
  }
  return true;
}

window.addEventListener('DOMContentLoaded', async () => {
  if (!(await initSession())) return;
  fetchTrips();
});
