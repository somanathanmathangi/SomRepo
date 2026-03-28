const API_URL = '/api/products';

// DOM Elements
const productsTableBody = document.getElementById('productTableBody');
const addBtn = document.getElementById('addBtn');
const productModal = document.getElementById('productModal');
const productForm = document.getElementById('productForm');
const cancelBtn = document.getElementById('cancelBtn');
const modalTitle = document.getElementById('modalTitle');
const searchInput = document.getElementById('searchInput');

// Form Fields
const idInput = document.getElementById('productId');
const nameInput = document.getElementById('name');
const descInput = document.getElementById('description');
const priceInput = document.getElementById('price');
const quantityInput = document.getElementById('quantity');

// Excel Search Elements
const navDashboard = document.getElementById('navDashboard');
const navExcelSearch = document.getElementById('navExcelSearch');
const dashboardView = document.getElementById('dashboardView');
const excelSearchView = document.getElementById('excelSearchView');
const excelSearchForm = document.getElementById('excelSearchForm');
const excelResultMsg = document.getElementById('excelResultMsg');
const excelResultsContainer = document.getElementById('excelResultsContainer');
const excelResultsBody = document.getElementById('excelResultsBody');
let products = [];

// Initialize
document.addEventListener('DOMContentLoaded', fetchProducts);

// Fetch Products from API
async function fetchProducts() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch data');
        products = await response.json();
        renderProducts(products);
        updateDashboardStats();
    } catch (error) {
        showToast('Error loading products: ' + error.message, 'error');
    }
}

// Render Products to Table
function renderProducts(data) {
    productsTableBody.innerHTML = '';
    
    if(data.length === 0) {
        productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-secondary);">No products found in inventory.</td></tr>`;
        return;
    }

    data.forEach(product => {
        const priceFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(product.price);
        const statusHTML = product.quantity < 5 
            ? `<span class="status-badge low-stock">Low Stock</span>`
            : `<span class="status-badge">In Stock</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${product.id}</td>
            <td>
                <strong>${product.name}</strong>
                <div class="product-desc">${product.description || 'No description'}</div>
            </td>
            <td>${priceFormatted}</td>
            <td>${product.quantity} units</td>
            <td>${statusHTML}</td>
            <td class="action-btns">
                <button class="icon-btn edit" onclick="openEditModal(${product.id})" title="Edit">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="icon-btn delete" onclick="deleteProduct(${product.id})" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        productsTableBody.appendChild(tr);
    });
}

// Update Stats
function updateDashboardStats() {
    const totalCount = products.length;
    let totalVal = 0;
    let lowStock = 0;

    products.forEach(p => {
        totalVal += p.price * p.quantity;
        if(p.quantity < 5) lowStock++;
    });

    document.getElementById('totalProductsStat').innerText = totalCount;
    document.getElementById('totalValueStat').innerText = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalVal);
    document.getElementById('lowStockStat').innerText = lowStock;
}

// Search functionality
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(term) || 
        (p.description && p.description.toLowerCase().includes(term))
    );
    renderProducts(filtered);
});

// Modal Operations
addBtn.addEventListener('click', () => {
    productForm.reset();
    idInput.value = '';
    modalTitle.innerText = 'Add New Product';
    productModal.classList.add('show');
});

cancelBtn.addEventListener('click', () => {
    productModal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === productModal) {
        productModal.classList.remove('show');
    }
});

// Edit Product
window.openEditModal = (id) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    idInput.value = product.id;
    nameInput.value = product.name;
    descInput.value = product.description || '';
    priceInput.value = product.price;
    quantityInput.value = product.quantity;

    modalTitle.innerText = 'Edit Product';
    productModal.classList.add('show');
};

// Form Save (Add or Update)
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productData = {
        name: nameInput.value,
        description: descInput.value,
        price: parseFloat(priceInput.value),
        quantity: parseInt(quantityInput.value)
    };

    const id = idInput.value;
    const isEdit = id !== '';

    try {
        const url = isEdit ? `${API_URL}/${id}` : API_URL;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });

        if (!response.ok) throw new Error('Failed to save product');

        productModal.classList.remove('show');
        showToast(`Product successfully ${isEdit ? 'updated' : 'added'}!`);
        fetchProducts(); // Refresh data

    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Delete Product
window.deleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete product');
        
        showToast('Product successfully deleted');
        fetchProducts();

    } catch (error) {
        showToast(error.message, 'error');
    }
};

// Toast functionality
let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    
    if(type === 'error') {
        toast.classList.add('error');
    } else {
        toast.classList.remove('error');
    }

    toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Navigation Logic
navDashboard.addEventListener('click', () => {
    navDashboard.classList.add('active');
    navExcelSearch.classList.remove('active');
    dashboardView.style.display = 'block';
    excelSearchView.style.display = 'none';
});

navExcelSearch.addEventListener('click', () => {
    navExcelSearch.classList.add('active');
    navDashboard.classList.remove('active');
    excelSearchView.style.display = 'block';
    dashboardView.style.display = 'none';
});

// Excel Search Logic
excelSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('excelFile').files[0];
    const queryInput = document.getElementById('excelQuery').value;

    if (!fileInput) return;

    const btn = document.getElementById('excelSearchBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('file', fileInput);
        formData.append('query', queryInput);

        const response = await fetch('/api/excel/search', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to search Excel file');

        excelResultMsg.innerText = '';
        const matches = data.matches || [];

        if (matches.length === 0) {
            excelResultsContainer.style.display = 'none';
            excelResultMsg.innerText = 'Value not present in this excel file';
            excelResultMsg.style.color = 'var(--text-secondary)';
        } else {
            excelResultMsg.innerText = `Found ${matches.length} matching row(s)`;
            excelResultMsg.style.color = 'var(--success-color)';
            renderExcelResults(matches);
        }
    } catch (error) {
        excelResultsContainer.style.display = 'none';
        excelResultMsg.innerText = error.message;
        excelResultMsg.style.color = 'var(--danger-color)';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

function renderExcelResults(rows) {
    excelResultsBody.innerHTML = '';
    
    // Create header from the first matched row if we want, or generic columns.
    // For simplicity, we just output rows. We will make the first array element act as column layout sizes.
    rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
            const td = document.createElement('td');
            td.innerText = cell;
            tr.appendChild(td);
        });
        excelResultsBody.appendChild(tr);
    });
    
    excelResultsContainer.style.display = 'block';
}
