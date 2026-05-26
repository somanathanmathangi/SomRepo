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

const currencyTypeInput = document.getElementById('currencyType');
const amountInput = document.getElementById('amount');
const exchangeRateInput = document.getElementById('exchangeRate');
const amountInINRInput = document.getElementById('amountInINR');

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

let currentPage = 1;
let sortBy = 'yantriki_invoice_number';
let sortOrder = 'ASC';

let currentUserRole = null;
let currentUsername = null;

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatAuditDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function formatStatus(status) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
}

function formatStatusClass(status) {
  if (!status || status === 'pending') return 'status-pending';
  if (status === 'approved') return 'status-approved';
  if (status === 'rejected') return 'status-rejected';
  return '';
}

/* =========================
   💸 CURRENCY ENGINE
========================= */

function calculateINR() {
  if (!amountInput) return;

  const currency = currencyTypeInput?.value;
  const amount = parseFloat(amountInput.value || 0);
  const rate = parseFloat(exchangeRateInput?.value || 0);

  if (!amount) {
    amountInINRInput.value = '';
    return;
  }

  if (currency === 'INR') {
    amountInINRInput.value = amount.toFixed(2);
    if (exchangeRateInput) {
      exchangeRateInput.value = 1;
      exchangeRateInput.disabled = true;
    }
  } else {
    if (exchangeRateInput) exchangeRateInput.disabled = false;

    if (rate > 0) {
      amountInINRInput.value = (amount * rate).toFixed(2);
    } else {
      amountInINRInput.value = '';
    }
  }
}

/* ========================= */

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin'
  });

  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
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
  currentUserRole = data.role;
  currentUsername = data.username;

  document.getElementById('navUser').textContent =
    `${data.username}/${data.role}`;

  if (currentUserRole === 'admin' || currentUserRole === 'approver') {
    document.getElementById('tabRecord').style.display = 'none';
  }

  if (currentUserRole === 'guser' && travellerNameInput) {
    travellerNameInput.value = currentUsername;
  }

  return true;
}

/* =========================
   FETCH + RENDER
========================= */

async function fetchTrips(page = currentPage) {
  currentPage = page;

  const res = await apiFetch(
    `${API_URL}?page=${page}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  );

  const data = await res.json();
  renderTrips(data.trips || []);
}

function renderTrips(data) {
  tripList.innerHTML = '';

  if (!data.length) {
    tripList.innerHTML = `<tr><td colspan="10">No records</td></tr>`;
    return;
  }

  data.forEach(trip => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${esc(trip.yantrikiInvoiceNumber)}</td>
      <td>${esc(trip.customerName)}</td>
      <td>${esc(trip.customerLocation)}</td>
      <td>${esc(trip.poOrder)}</td>
      <td>${formatDateOnly(trip.poDate)}</td>
      <td>${esc(trip.travellerName)}</td>
      <td>${esc(trip.travelRoute)}</td>
      <td>${esc(trip.woNumber)}</td>
      <td>${formatDateOnly(trip.woDate)}</td>
      <td><span class="${formatStatusClass(trip.status)}">${formatStatus(trip.status)}</span></td>
      <td>${esc(trip.approvedBy || '—')}</td>
    `;

    tripList.appendChild(tr);
  });
}

/* =========================
   FORM HANDLING
========================= */

function getFormData() {
  return {
    yantrikiInvoiceNumber: yantrikiInvoiceInput.value.trim(),
    customerName: customerNameInput.value.trim(),
    customerLocation: customerLocationInput.value.trim(),
    poOrder: poOrderInput.value.trim(),
    poDate: poDateInput.value,
    travellerName: travellerNameInput.value.trim(),
    travelRoute: travelRouteInput.value.trim(),
    woNumber: woNumberInput.value.trim(),
    woDate: woDateInput.value,
    travelStartDate: travelStartDateInput.value,
    travelEndDate: travelEndDateInput.value,

    currencyType: currencyTypeInput?.value,
    amount: amountInput?.value,
    exchangeRate: exchangeRateInput?.value,
    amountInINR: amountInINRInput?.value
  };
}

/* =========================
   VALIDATION
========================= */

function validateData(data) {
  for (const k in data) {
    if (!data[k]) {
      showError('Missing required fields');
      return false;
    }
  }

  if (data.currencyType !== 'INR' && !data.exchangeRate) {
    showError('Exchange rate required for foreign currency');
    return false;
  }

  return true;
}

function showError(msg) {
  const el = document.getElementById('formError');
  el.hidden = false;
  el.textContent = msg;
}

function clearError() {
  const el = document.getElementById('formError');
  el.hidden = true;
}

/* =========================
   CREATE / UPDATE
========================= */

async function createTrip() {
  const data = getFormData();
  if (!validateData(data)) return;

  await apiFetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  resetForm();
  fetchTrips();
}

async function updateTrip() {
  const key = editingInvoiceKey.value;
  const data = getFormData();

  if (!validateData(data)) return;

  await apiFetch(`${API_URL}/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  resetForm();
  fetchTrips();
}

/* =========================
   EVENTS
========================= */

window.addEventListener('DOMContentLoaded', async () => {
  if (!(await initSession())) return;

  fetchTrips();

  currencyTypeInput?.addEventListener('change', calculateINR);
  amountInput?.addEventListener('input', calculateINR);
  exchangeRateInput?.addEventListener('input', calculateINR);
});
