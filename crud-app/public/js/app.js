const API_URL = '/api/trips';

// DOM Elements
const tripList = document.getElementById('tripList');
const invoiceDateInput = document.getElementById('invoiceDate');
const invoiceNoInput = document.getElementById('invoiceNo');
const travellingPersonInput = document.getElementById('travellingPerson');
const travelDateInput = document.getElementById('travelDate');
const tripIdInput = document.getElementById('tripId');
const addBtn = document.getElementById('addBtn');
const updateBtn = document.getElementById('updateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formTitle = document.getElementById('formTitle');
const searchInput = document.getElementById('searchInput');

// Tab Buttons
const tabShowAll = document.getElementById('tabShowAll');
const tabRecord = document.getElementById('tabRecord');
const tabSearch = document.getElementById('tabSearch');

// Sections
const sectionShowAll = document.getElementById('sectionShowAll');
const sectionRecord = document.getElementById('sectionRecord');
const sectionSearch = document.getElementById('sectionSearch');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchTrips();
    setupNavigation();
});

function setupNavigation() {
    tabShowAll.addEventListener('click', () => showSection('showAll'));
    tabRecord.addEventListener('click', () => showSection('record'));
    tabSearch.addEventListener('click', () => showSection('search'));
}

function showSection(sectionName) {
    // Hide all sections
    sectionShowAll.classList.add('hidden');
    sectionRecord.classList.add('hidden');
    sectionSearch.classList.add('hidden');
    
    // Remove active class from all tabs
    tabShowAll.classList.remove('active');
    tabRecord.classList.remove('active');
    tabSearch.classList.remove('active');

    // Show selected section
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

// CRUD Functions
async function fetchTrips() {
    try {
        const response = await fetch(API_URL);
        const trips = await response.json();
        renderTrips(trips);
    } catch (error) {
        console.error('Error fetching trips:', error);
    }
}

async function searchTrips() {
    const keyword = searchInput.value.trim();
    if (!keyword) {
        fetchTrips();
        return;
    }
    try {
        const response = await fetch(`${API_URL}/search?keyword=${encodeURIComponent(keyword)}`);
        const results = await response.json();
        renderTrips(results);
        // Show results in the table section
        sectionShowAll.classList.remove('hidden');
    } catch (error) {
        console.error('Error searching:', error);
    }
}

async function createTrip() {
    const data = getFormData();
    if (!validateData(data)) return;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            resetForm();
            showSection('showAll');
        }
    } catch (error) {
        console.error('Error creating trip:', error);
    }
}

async function updateTrip() {
    const id = tripIdInput.value;
    const data = getFormData();
    if (!validateData(data)) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            resetForm();
            showSection('showAll');
        }
    } catch (error) {
        console.error('Error updating trip:', error);
    }
}

async function deleteTrip(id) {
    if (!confirm('Are you sure you want to delete this trip record?')) return;
    try {
        const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (response.ok) {
            fetchTrips();
        }
    } catch (error) {
        console.error('Error deleting trip:', error);
    }
}

// UI Helpers
function renderTrips(data) {
    tripList.innerHTML = '';
    if (data.length === 0) {
        tripList.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #8d949e; padding: 30px;">No trip records found.</td></tr>';
        return;
    }
    data.forEach(trip => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-family: monospace; font-weight: bold; color: #1877f2;">${trip.tripCode}</td>
            <td>${trip.invoiceDate}</td>
            <td>${trip.invoiceNo}</td>
            <td>${trip.travellingPerson}</td>
            <td>${trip.travelDate}</td>
            <td class="actions">
                <button class="btn btn-edit">Edit</button>
                <button class="btn btn-delete">Delete</button>
            </td>
        `;
        
        tr.querySelector('.btn-edit').addEventListener('click', () => editTrip(trip));
        tr.querySelector('.btn-delete').addEventListener('click', () => deleteTrip(trip.id));
        
        tripList.appendChild(tr);
    });
}

function editTrip(trip) {
    tripIdInput.value = trip.id;
    invoiceDateInput.value = trip.invoiceDate;
    invoiceNoInput.value = trip.invoiceNo;
    travellingPersonInput.value = trip.travellingPerson;
    travelDateInput.value = trip.travelDate;

    formTitle.innerText = `Update Trip ${trip.tripCode}`;
    addBtn.style.display = 'none';
    updateBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    showSection('record');
}

function resetForm() {
    tripIdInput.value = '';
    invoiceDateInput.value = '';
    invoiceNoInput.value = '';
    travellingPersonInput.value = '';
    travelDateInput.value = '';

    formTitle.innerText = 'Record New Trip';
    addBtn.style.display = 'inline-block';
    updateBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

function getFormData() {
    return {
        invoiceDate: invoiceDateInput.value.trim(),
        invoiceNo: invoiceNoInput.value.trim(),
        travellingPerson: travellingPersonInput.value.trim(),
        travelDate: travelDateInput.value.trim()
    };
}

function validateData(data) {
    if (!data.invoiceDate || !data.invoiceNo || !data.travellingPerson || !data.travelDate) {
        alert('Please fill all 4 fields!');
        return false;
    }
    return true;
}
