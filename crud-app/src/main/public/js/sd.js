const API_URL = '/api/trips';

let currentTrip = null;
let docs = [];
let isReadOnly = false;
let currentUserRole = null;

function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function formatDateOnly(d) {
    if (!d) return '—';
    try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d;
        return dt.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return d; }
}

function getInvoiceFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('invoice');
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
    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok) { window.location.href = '/login.html'; return false; }
        const data = await res.json();
        currentUserRole = data.role;
        console.log('Supporting Docs: Current User Role detected as:', currentUserRole);
        document.getElementById('navUser').textContent = `${data.username}/${data.role}`;
        return true;
    } catch { window.location.href = '/login.html'; return false; }
}

async function loadTrip() {
    const invoice = getInvoiceFromUrl();
    if (!invoice) {
        document.getElementById('tripInfo').textContent = 'Error: No trip invoice number provided.';
        return;
    }
    try {
        const res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}`);
        currentTrip = await res.json();
        document.getElementById('tripInfo').textContent = `Trip: ${esc(currentTrip.yantrikiInvoiceNumber)} — ${esc(currentTrip.customerName)}`;

        const statusEl = document.getElementById('sdTripStatus');
        statusEl.textContent = currentTrip.status ? currentTrip.status.charAt(0).toUpperCase() + currentTrip.status.slice(1) : 'Pending';
        statusEl.className = `status-badge status-${currentTrip.status || 'pending'}`;

        isReadOnly = currentTrip.status === 'approved' || currentTrip.submittedForApproval;
        const isApproverOnly = currentUserRole && currentUserRole.toLowerCase() === 'approver';
        const submitBtn = document.getElementById('sdSubmitApprovalBtn');
        if (isReadOnly || isApproverOnly) {
            if (isReadOnly) {
                const banner = document.getElementById('sdReadonlyBanner');
                banner.classList.remove('hidden');
                banner.textContent = currentTrip.status === 'approved'
                    ? '🔒 This trip has been approved. Documents are in read-only mode.'
                    : '🔒 This trip has been submitted for approval. Documents are in read-only mode.';
            } else {
                document.getElementById('sdReadonlyBanner').classList.add('hidden');
            }
            document.getElementById('sdForm').classList.add('hidden');
            document.getElementById('sdAddNewBtn').style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'none';
        } else {
            document.getElementById('sdReadonlyBanner').classList.add('hidden');
            document.getElementById('sdAddNewBtn').style.display = 'inline-block';
            if (submitBtn) submitBtn.style.display = 'inline-block';
        }

        await loadDocs();
    } catch (err) {
        document.getElementById('tripInfo').textContent = 'Error loading trip: ' + err.message;
    }
}

async function loadDocs() {
    const invoice = getInvoiceFromUrl();
    if (!invoice) return;
    try {
        const res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/documents`);
        docs = await res.json();
        renderDocs();
        await updateTotal();
    } catch (err) { console.error('Error loading docs:', err); }
}

async function updateTotal() {
    const invoice = getInvoiceFromUrl();
    if (!invoice) return;
    try {
        const res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/documents/total`);
        const data = await res.json();
        document.getElementById('sdTotalAmount').textContent = `₹ ${parseFloat(data.total).toFixed(2)}`;
    } catch (err) { console.error('Error updating total:', err); }
}

async function getNextPageNo() {
    const invoice = getInvoiceFromUrl();
    if (!invoice) return 1;
    try {
        const res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/documents/maxpage`);
        const data = await res.json();
        return (data.maxPage || 0) + 1;
    } catch { return docs.length + 1; }
}

function renderDocs() {
    const tbody = document.getElementById('sdDocList');
    tbody.innerHTML = '';
    if (docs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No supporting documents added yet.</td></tr>';
        return;
    }
    docs.forEach(doc => {
        const tr = document.createElement('tr');
        const fileLink = doc.fileName
            ? `<a href="${API_URL}/${encodeURIComponent(doc.tripInvoiceNumber)}/documents/${doc.id}/file" class="file-link" download title="Download ${esc(doc.fileName)}">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>${esc(doc.fileName)}
         </a>`
            : '—';

        let actions = '';
        const isApproverOrAdmin = currentUserRole && (currentUserRole.toLowerCase() === 'approver' || currentUserRole.toLowerCase() === 'admin');
        if (isReadOnly) {
            actions = '<span style="color:#999;font-size:12px;">—</span>';
        } else if (isApproverOrAdmin) {
            actions = `<div class="doc-actions">
           <button type="button" class="btn btn-approve btn-sm" onclick="approveTrip()">Approve</button>
           <button type="button" class="btn btn-reject btn-sm" onclick="rejectTrip()">Reject</button>
         </div>`;
        } else {
            actions = `<div class="doc-actions">
           <button type="button" class="btn btn-edit btn-sm" onclick="editDoc(${doc.id})">Edit</button>
           <button type="button" class="btn btn-delete btn-sm" onclick="deleteDoc(${doc.id})">Delete</button>
         </div>`;
        }

        tr.innerHTML = `
      <td class="cell-mono">${doc.pageNo}</td>
      <td>${formatDateOnly(doc.docDate)}</td>
      <td>${esc(doc.description)}</td>
      <td class="cell-mono">${esc(doc.billId)}</td>
      <td>${esc(doc.category)}</td>
      <td class="text-right">₹ ${parseFloat(doc.billAmount).toFixed(2)}</td>
      <td>${fileLink}</td>
      <td>${actions}</td>
    `;
        tbody.appendChild(tr);
    });
}

async function showForm(doc) {
    document.getElementById('sdFormError').hidden = true;
    document.getElementById('sdForm').classList.remove('hidden');

    if (doc) {
        document.getElementById('sdFormTitle').textContent = 'Edit Document';
        document.getElementById('sdEditId').value = doc.id;
        document.getElementById('sdDate').value = doc.docDate;
        document.getElementById('sdDescription').value = doc.description;
        document.getElementById('sdBillId').value = doc.billId;
        document.getElementById('sdCategory').value = doc.category;
        document.getElementById('sdBillAmount').value = doc.billAmount;
        document.getElementById('sdPageNo').value = doc.pageNo;
        document.getElementById('sdSaveBtn').textContent = 'Update Document';
    } else {
        document.getElementById('sdFormTitle').textContent = 'Add New Document';
        document.getElementById('sdEditId').value = '';
        document.getElementById('sdDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('sdDescription').value = '';
        document.getElementById('sdBillId').value = '';
        document.getElementById('sdCategory').value = '';
        document.getElementById('sdBillAmount').value = '';
        document.getElementById('sdFile').value = '';
        document.getElementById('sdSaveBtn').textContent = 'Add Document';
        const nextPage = await getNextPageNo();
        document.getElementById('sdPageNo').value = nextPage;
    }
}

function hideForm() {
    document.getElementById('sdForm').classList.add('hidden');
    document.getElementById('sdFormError').hidden = true;
}

function validateForm() {
    const date = document.getElementById('sdDate').value.trim();
    const desc = document.getElementById('sdDescription').value.trim();
    const billId = document.getElementById('sdBillId').value.trim();
    const category = document.getElementById('sdCategory').value;
    const amount = document.getElementById('sdBillAmount').value;
    if (!date || !desc || !billId || !category || !amount) {
        document.getElementById('sdFormError').textContent = 'Please fill in all required fields.';
        document.getElementById('sdFormError').hidden = false;
        return false;
    }
    return true;
}

async function saveDoc() {
    if (!validateForm()) return;
    if (isReadOnly) { alert('Cannot modify documents for an approved trip.'); return; }
    const invoice = getInvoiceFromUrl();
    const editId = document.getElementById('sdEditId').value;
    const formData = new FormData();
    formData.append('docDate', document.getElementById('sdDate').value);
    formData.append('description', document.getElementById('sdDescription').value);
    formData.append('billId', document.getElementById('sdBillId').value);
    formData.append('category', document.getElementById('sdCategory').value);
    formData.append('billAmount', document.getElementById('sdBillAmount').value);
    formData.append('pageNo', document.getElementById('sdPageNo').value);
    const fileInput = document.getElementById('sdFile');
    if (fileInput && fileInput.files.length > 0) {
        formData.append('file', fileInput.files[0]);
    }
    try {
        let res;
        if (editId) {
            res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/documents/${editId}`, { method: 'PUT', body: formData });
        } else {
            res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/documents`, { method: 'POST', body: formData });
        }
        if (res.ok) {
            hideForm();
            await loadDocs();
        } else {
            const errData = await res.json().catch(() => ({}));
            document.getElementById('sdFormError').textContent = errData.error || 'Failed to save document.';
            document.getElementById('sdFormError').hidden = false;
        }
    } catch (err) {
        document.getElementById('sdFormError').textContent = 'Network error: ' + err.message;
        document.getElementById('sdFormError').hidden = false;
    }
}

async function editDoc(id) {
    const doc = docs.find(d => d.id === id);
    if (doc) await showForm(doc);
}

async function deleteDoc(id) {
    if (isReadOnly) { alert('Cannot modify documents for an approved trip.'); return; }
    if (!confirm('Are you sure you want to delete this document entry?')) return;
    const invoice = getInvoiceFromUrl();
    try {
        const res = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/documents/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadDocs();
        } else {
            const errData = await res.json().catch(() => ({}));
            alert(errData.error || 'Failed to delete document.');
        }
    } catch (err) { alert('Error: ' + err.message); }
}

async function approveTrip() {
    const invoice = getInvoiceFromUrl();
    if (!confirm('Are you sure you want to approve this trip?')) return;
    try {
        const response = await apiFetch(`${API_URL}/${encodeURIComponent(invoice)}/approve`, { method: 'POST' });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
            alert('Trip approved successfully!');
            window.location.reload();
        } else {
            alert(result.error || 'Failed to approve trip.');
        }
    } catch (error) { alert('Error approving trip.'); }
}

async function rejectTrip() {
    const invoice = getInvoiceFromUrl();
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
            window.location.reload();
        } else {
            alert(result.error || 'Failed to reject trip.');
        }
    } catch (error) { alert('Error rejecting trip.'); }
}

async function submitTripForApproval() {
    const invoice = getInvoiceFromUrl();
    if (!invoice) return;
    if (!confirm('Are you sure you want to submit this trip for approval? This will lock the record and notify the approver.')) {
        return;
    }
    try {
        const response = await apiFetch(`/api/trips/${encodeURIComponent(invoice)}/submit-approval`, { method: 'POST' });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
            alert('Trip successfully submitted for approval. Record has been freed.');
            window.location.href = '/';
        } else {
            alert(result.error || 'Failed to submit trip for approval.');
        }
    } catch (error) {
        alert('Error submitting trip for approval.');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await initSession())) return;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { }
        window.location.href = '/login.html';
    });
    document.getElementById('sdSaveBtn').addEventListener('click', saveDoc);
    document.getElementById('sdCancelBtn').addEventListener('click', hideForm);
    document.getElementById('sdAddNewBtn').addEventListener('click', () => showForm(null));
    const submitBtn = document.getElementById('sdSubmitApprovalBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitTripForApproval);
    }
    await loadTrip();
});