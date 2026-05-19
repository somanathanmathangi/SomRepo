const API_URL = '/api/trips';

let currentUser = null;
let currentRejectInvoice = null;

// Utility functions
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

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: options.headers
    });
    if (res.status === 401) {
        window.location.href = '/approver-login.html';
        throw new Error('Unauthorized');
    }
    return res;
}

// Session initialization
async function initSession() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
            window.location.href = '/approver-login.html';
            return false;
        }
        const data = await res.json();
        currentUser = data;
        document.getElementById('navUser').textContent = `${data.username}/${data.role}`;
        document.getElementById('userRole').textContent = '';
        return true;
    } catch (err) {
        window.location.href = '/approver-login.html';
        return false;
    }
}

// Navigation
function setupNavigation() {
    document.getElementById('tabPending').addEventListener('click', () => showSection('pending'));
    document.getElementById('tabAll').addEventListener('click', () => showSection('all'));
    document.getElementById('tabSearch').addEventListener('click', () => showSection('search'));
}

function showSection(sectionName) {
    // Hide all sections
    document.getElementById('sectionPending').classList.add('hidden');
    document.getElementById('sectionAll').classList.add('hidden');
    document.getElementById('sectionSearch').classList.add('hidden');

    // Remove active from all tabs
    document.getElementById('tabPending').classList.remove('active');
    document.getElementById('tabAll').classList.remove('active');
    document.getElementById('tabSearch').classList.remove('active');

    // Show selected section
    if (sectionName === 'pending') {
        document.getElementById('sectionPending').classList.remove('hidden');
        document.getElementById('tabPending').classList.add('active');
        fetchPendingTrips();
    } else if (sectionName === 'all') {
        document.getElementById('sectionAll').classList.remove('hidden');
        document.getElementById('tabAll').classList.add('active');
        fetchAllTrips();
    } else if (sectionName === 'search') {
        document.getElementById('sectionSearch').classList.remove('hidden');
        document.getElementById('tabSearch').classList.add('active');
    }
}

// Fetch pending trips
async function fetchPendingTrips() {
    try {
        const response = await apiFetch(`${API_URL}/pending`);
        const trips = await response.json();
        renderPendingTrips(trips);
    } catch (error) {
        if (error.message === 'Unauthorized') return;
        console.error('Error fetching pending trips:', error);
    }
}

// Fetch all trips
async function fetchAllTrips() {
    try {
        const response = await apiFetch(API_URL);
        const trips = await response.json();
        renderAllTrips(trips);
    } catch (error) {
        if (error.message === 'Unauthorized') return;
        console.error('Error fetching trips:', error);
    }
}

// Render pending trips
function renderPendingTrips(data) {
    const tbody = document.getElementById('pendingList');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No pending trips awaiting approval.</td></tr>';
        return;
    }

    data.forEach((trip) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="cell-mono">${esc(trip.yantrikiInvoiceNumber)}</td>
            <td>${esc(trip.customerName)}</td>
            <td>${esc(trip.customerLocation)}</td>
            <td>${esc(trip.poOrder)}</td>
            <td>${esc(trip.travellerName)}</td>
            <td>${formatDateOnly(trip.travelStartDate)} → ${formatDateOnly(trip.travelEndDate)}</td>
            <td>${esc(trip.createdBy || '—')}</td>
            <td>${formatAuditDate(trip.createdDate)}</td>
    <td><a href="sd.html?invoice=${encodeURIComponent(trip.yantrikiInvoiceNumber)}" class="file-link" title="View supporting documents">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Show Docs
            </a></td>
            <td class="approval-actions">
                <button type="button" class="btn btn-approve btn-sm" onclick="approveTrip('${esc(trip.yantrikiInvoiceNumber)}')" ${trip.docCount === 0 ? 'disabled title="Requires supporting documents" style="opacity: 0.5; cursor: not-allowed;"' : ''}>Approve</button>
                <button type="button" class="btn btn-reject btn-sm" onclick="openRejectModal('${esc(trip.yantrikiInvoiceNumber)}')" ${trip.docCount === 0 ? 'disabled title="Requires supporting documents" style="opacity: 0.5; cursor: not-allowed;"' : ''}>Reject</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render all trips
function renderAllTrips(data) {
    const tbody = document.getElementById('allTripsList');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No trip records found.</td></tr>';
        return;
    }

    data.forEach((trip) => {
        const statusClass = `status-${trip.status}`;
        const statusText = trip.status ? trip.status.charAt(0).toUpperCase() + trip.status.slice(1) : 'Pending';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="cell-mono">${esc(trip.yantrikiInvoiceNumber)}</td>
            <td>${esc(trip.customerName)}</td>
            <td>${esc(trip.customerLocation)}</td>
            <td>${esc(trip.poOrder)}</td>
            <td>${esc(trip.travellerName)}</td>
            <td>${formatDateOnly(trip.travelStartDate)} → ${formatDateOnly(trip.travelEndDate)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${trip.approvedBy ? esc(trip.approvedBy) : '—'}</td>
    <td><a href="sd.html?invoice=${encodeURIComponent(trip.yantrikiInvoiceNumber)}" class="file-link" title="View supporting documents">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Show Docs
            </a></td>
            <td class="approval-actions">
                <button type="button" class="btn btn-approve btn-sm" onclick="approveTrip('${esc(trip.yantrikiInvoiceNumber)}')"${trip.status !== 'pending' ? ' disabled style="opacity: 0.5; cursor: not-allowed;"' : (trip.docCount === 0 ? ' disabled title="Requires supporting documents" style="opacity: 0.5; cursor: not-allowed;"' : '')}>Approve</button>
                <button type="button" class="btn btn-reject btn-sm" onclick="openRejectModal('${esc(trip.yantrikiInvoiceNumber)}')"${trip.status !== 'pending' ? ' disabled style="opacity: 0.5; cursor: not-allowed;"' : (trip.docCount === 0 ? ' disabled title="Requires supporting documents" style="opacity: 0.5; cursor: not-allowed;"' : '')}>Reject</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Approve trip
async function approveTrip(invoice) {
    if (!confirm('Are you sure you want to approve this trip?')) {
        return;
    }

    try {
        const response = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/approve`, {
            method: 'POST'
        });

        const result = await response.json();
        if (response.ok) {
            alert('Trip approved successfully!');
            fetchPendingTrips();
        } else {
            alert(result.error || 'Failed to approve trip.');
        }
    } catch (error) {
        if (error.message === 'Unauthorized') return;
        console.error('Error approving trip:', error);
        alert('Error approving trip.');
    }
}

// Reject trip modal functions
function openRejectModal(invoice) {
    currentRejectInvoice = invoice;
    document.getElementById('rejectModal').classList.add('active');
    document.getElementById('rejectionReason').value = '';
    document.getElementById('rejectionReason').focus();
}

function closeRejectModal() {
    document.getElementById('rejectModal').classList.remove('active');
    currentRejectInvoice = null;
}

// Confirm rejection
document.addEventListener('DOMContentLoaded', async () => {
    if (!(await initSession())) return;

    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });
        } catch (e) {
            /* ignore */
        }
        window.location.href = '/approver-login.html';
    });

    // Setup navigation
    setupNavigation();

    // Load pending trips by default
    fetchPendingTrips();

    // Setup search
    document.getElementById('searchInput').addEventListener('input', () => clearSearchError());

    // Confirm reject button
    document.getElementById('confirmRejectBtn').addEventListener('click', async () => {
        if (!currentRejectInvoice) return;

        const reason = document.getElementById('rejectionReason').value.trim();

        try {
            const response = await apiFetch(`${API_URL}/${encodeURIComponent(currentRejectInvoice)}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'No reason provided' })
            });

            const result = await response.json();
            if (response.ok) {
                closeRejectModal();
                alert('Trip rejected.');
                fetchPendingTrips();
            } else {
                alert(result.error || 'Failed to reject trip.');
            }
        } catch (error) {
            if (error.message === 'Unauthorized') return;
            console.error('Error rejecting trip:', error);
            alert('Error rejecting trip.');
        }
    });
});

// Search functionality
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
    document.getElementById('searchInput').value = '';
    showSection('pending');
}

async function searchTrips() {
    const keyword = document.getElementById('searchInput').value.trim();
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
        renderAllTrips(results);
        showSection('all');
    } catch (error) {
        if (error.message === 'Unauthorized') return;
        console.error('Error searching:', error);
        showSearchError('Search failed. Please try again.');
    }
}