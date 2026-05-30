(function () {
    'use strict';

    let currentUser = null;
    let editingUsername = null;
    let editingCustomerId = null;

    function esc(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return '—';
        }
    }

    // ===== Session Init =====
    async function initSession() {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
            if (!res.ok) {
                window.location.href = '/login.html';
                return false;
            }
            const data = await res.json();
            currentUser = data;

            // Only admin can access this page
            if ((data.role || '').toLowerCase() !== 'admin') {
                if (data.role === 'approver') {
                    window.location.href = '/approver.html';
                } else {
                    window.location.href = '/';
                }
                return false;
            }

            document.getElementById('navUser').textContent = data.username + '/' + data.role;
            return true;
        } catch (err) {
            window.location.href = '/login.html';
            return false;
        }
    }

    // ===== Tab Navigation =====
    function showSection(name) {
        document.getElementById('sectionUsers').classList.add('hidden');
        document.getElementById('sectionCustomers').classList.add('hidden');
        document.getElementById('tabUsers').classList.remove('active');
        document.getElementById('tabCustomers').classList.remove('active');

        if (name === 'users') {
            document.getElementById('sectionUsers').classList.remove('hidden');
            document.getElementById('tabUsers').classList.add('active');
            loadUsers();
        } else if (name === 'customers') {
            document.getElementById('sectionCustomers').classList.remove('hidden');
            document.getElementById('tabCustomers').classList.add('active');
            loadCustomers();
        }
    }

    // ===== Form visibility helpers =====
    function showUserForm() {
        document.getElementById('userForm').classList.remove('hidden');
    }

    function hideUserForm() {
        document.getElementById('userForm').classList.add('hidden');
    }

    function showCustomerForm() {
        document.getElementById('customerForm').classList.remove('hidden');
    }

    function hideCustomerForm() {
        document.getElementById('customerForm').classList.add('hidden');
    }

    // ===== USER ADMINISTRATION =====
    async function loadUsers() {
        try {
            const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
            if (res.status === 401) { window.location.href = '/login.html'; return; }
            if (res.status === 403) { document.getElementById('userList').innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">Access denied</td></tr>'; return; }
            const users = await res.json();
            renderUsers(users);
        } catch (err) {
            console.error('Error loading users:', err);
        }
    }

    function renderUsers(users) {
        const tbody = document.getElementById('userList');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="table-empty">No users found.</td></tr>';
            return;
        }
        let html = '';
        users.forEach(function (u) {
            html += '<tr>';
            html += '<td>' + esc(u.username) + '</td>';
            html += '<td>' + esc(u.role) + '</td>';
            html += '<td class="doc-actions">';
            html += '<button class="btn-edit-sm" onclick="adminEditUser(\'' + esc(u.username) + '\')">Edit</button> ';
            html += '<button class="btn-delete-sm" onclick="adminDeleteUser(\'' + esc(u.username) + '\')">Delete</button>';
            html += '</td></tr>';
        });
        tbody.innerHTML = html;
    }

    window.adminEditUser = function (username) {
        editingUsername = username;
        document.getElementById('userFormTitle').textContent = 'Edit User — ' + username;
        document.getElementById('userSaveBtn').textContent = 'Update User';
        document.getElementById('userUsername').value = username;
        document.getElementById('userUsername').readOnly = true;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').placeholder = 'Leave blank to keep current';
        document.getElementById('userCancelBtn').style.display = 'inline-block';
        document.getElementById('userFormError').hidden = true;
        document.getElementById('userFormSuccess').hidden = true;
        showUserForm();
    };

    window.adminDeleteUser = async function (username) {
        if (!confirm('Are you sure you want to delete user "' + username + '"?')) return;
        try {
            const res = await fetch('/api/admin/users/' + encodeURIComponent(username), {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                document.getElementById('userFormSuccess').textContent = 'User deleted successfully.';
                document.getElementById('userFormSuccess').hidden = false;
                loadUsers();
            } else {
                alert(data.error || 'Failed to delete user.');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    function resetUserForm() {
        editingUsername = null;
        document.getElementById('userFormTitle').textContent = 'Add New User';
        document.getElementById('userSaveBtn').textContent = 'Add User';
        document.getElementById('userUsername').value = '';
        document.getElementById('userUsername').readOnly = false;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').placeholder = 'Enter password';
        document.getElementById('userCancelBtn').style.display = 'none';
        document.getElementById('userFormError').hidden = true;
        document.getElementById('userFormSuccess').hidden = true;
    }

    async function saveUser() {
        const username = document.getElementById('userUsername').value.trim();
        const password = document.getElementById('userPassword').value;
        const userRole = document.getElementById('userRole').value;
        const errEl = document.getElementById('userFormError');
        const successEl = document.getElementById('userFormSuccess');
        errEl.hidden = true;
        successEl.hidden = true;

        if (!username) { errEl.textContent = 'Username is required.'; errEl.hidden = false; return; }
        if (!editingUsername && !password) { errEl.textContent = 'Password is required for new users.'; errEl.hidden = false; return; }
        if (!userRole) { errEl.textContent = 'Role is required.'; errEl.hidden = false; return; }

        const body = { username: username, userRole: userRole };
        if (password) body.password = password;

        try {
            let url = '/api/admin/users';
            let method = 'POST';
            if (editingUsername) {
                url += '/' + encodeURIComponent(editingUsername);
                method = 'PUT';
            }
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                successEl.textContent = editingUsername ? 'User updated successfully.' : 'User added successfully.';
                successEl.hidden = false;
                resetUserForm();
                loadUsers();
            } else {
                errEl.textContent = data.error || 'Failed to save user.';
                errEl.hidden = false;
            }
        } catch (err) {
            errEl.textContent = 'Error: ' + err.message;
            errEl.hidden = false;
        }
    }

    // ===== CUSTOMER MANAGEMENT =====
    async function loadCustomers() {
        try {
            const res = await fetch('/api/customers', { credentials: 'same-origin' });
            if (res.status === 401) { window.location.href = '/login.html'; return; }
            const customers = await res.json();
            renderCustomers(customers);
        } catch (err) {
            console.error('Error loading customers:', err);
        }
    }

    function renderCustomers(customers) {
        const tbody = document.getElementById('customerList');
        if (!customers || customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No customers found.</td></tr>';
            return;
        }
        let html = '';
        customers.forEach(function (c) {
            html += '<tr>';
            html += '<td>' + esc(c.id) + '</td>';
            html += '<td>' + esc(c.customer_name) + '</td>';
            html += '<td>' + esc(c.customer_location) + '</td>';
            html += '<td>' + esc(c.created_by || '—') + '</td>';
            html += '<td>' + fmtDate(c.created_date) + '</td>';
            html += '<td class="doc-actions">';
            html += '<button class="btn-edit-sm" onclick="adminEditCustomer(' + c.id + ')">Edit</button> ';
            html += '<button class="btn-delete-sm" onclick="adminDeleteCustomer(' + c.id + ')">Delete</button>';
            html += '</td></tr>';
        });
        tbody.innerHTML = html;
    }

    window.adminEditCustomer = function (id) {
        editingCustomerId = id;
        // Fetch current data
        fetch('/api/customers', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (customers) {
                var c = customers.find(function (x) { return x.id === id; });
                if (!c) return;
                document.getElementById('customerFormTitle').textContent = 'Edit Customer — ' + c.customer_name;
                document.getElementById('customerSaveBtn').textContent = 'Update Customer';
                document.getElementById('customerName').value = c.customer_name;
                document.getElementById('customerLocation').value = c.customer_location;
                document.getElementById('customerCancelBtn').style.display = 'inline-block';
                document.getElementById('customerFormError').hidden = true;
                document.getElementById('customerFormSuccess').hidden = true;
            });
    };

    window.adminDeleteCustomer = async function (id) {
        if (!confirm('Are you sure you want to delete this customer?')) return;
        try {
            const res = await fetch('/api/customers/' + id, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                document.getElementById('customerFormSuccess').textContent = 'Customer deleted successfully.';
                document.getElementById('customerFormSuccess').hidden = false;
                loadCustomers();
            } else {
                alert(data.error || 'Failed to delete customer.');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    function resetCustomerForm() {
        editingCustomerId = null;
        document.getElementById('customerFormTitle').textContent = 'Add New Customer';
        document.getElementById('customerSaveBtn').textContent = 'Add Customer';
        document.getElementById('customerName').value = '';
        document.getElementById('customerLocation').value = '';
        document.getElementById('customerCancelBtn').style.display = 'none';
        document.getElementById('customerFormError').hidden = true;
        document.getElementById('customerFormSuccess').hidden = true;
    }

    async function saveCustomer() {
        const customer_name = document.getElementById('customerName').value.trim();
        const customer_location = document.getElementById('customerLocation').value.trim();
        const errEl = document.getElementById('customerFormError');
        const successEl = document.getElementById('customerFormSuccess');
        errEl.hidden = true;
        successEl.hidden = true;

        if (!customer_name) { errEl.textContent = 'Customer name is required.'; errEl.hidden = false; return; }
        if (!customer_location) { errEl.textContent = 'Customer location is required.'; errEl.hidden = false; return; }

        try {
            let url = '/api/customers';
            let method = 'POST';
            if (editingCustomerId) {
                url += '/' + editingCustomerId;
                method = 'PUT';
            }
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ customer_name: customer_name, customer_location: customer_location })
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                successEl.textContent = editingCustomerId ? 'Customer updated successfully.' : 'Customer added successfully.';
                successEl.hidden = false;
                resetCustomerForm();
                loadCustomers();
            } else {
                errEl.textContent = data.error || 'Failed to save customer.';
                errEl.hidden = false;
            }
        } catch (err) {
            errEl.textContent = 'Error: ' + err.message;
            errEl.hidden = false;
        }
    }

    // ===== DELETE ALL =====
    async function deleteAllUsers() {
        if (!confirm('Are you sure you want to delete ALL users (except yourself)? This cannot be undone.')) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                document.getElementById('userFormSuccess').textContent = 'All users deleted (' + (data.count || 0) + ' removed).';
                document.getElementById('userFormSuccess').hidden = false;
                loadUsers();
            } else {
                alert(data.error || 'Failed to delete all users.');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    async function deleteAllCustomers() {
        if (!confirm('Are you sure you want to delete ALL customers? This cannot be undone.')) return;
        try {
            const res = await fetch('/api/customers', {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                document.getElementById('customerFormSuccess').textContent = 'All customers deleted (' + (data.count || 0) + ' removed).';
                document.getElementById('customerFormSuccess').hidden = false;
                loadCustomers();
            } else {
                alert(data.error || 'Failed to delete all customers.');
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    // ===== DOM Ready =====
    document.addEventListener('DOMContentLoaded', async function () {
        if (!(await initSession())) return;

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', async function () {
            try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { }
            window.location.href = '/login.html';
        });

        // Tab switching
        document.getElementById('tabUsers').addEventListener('click', function () { showSection('users'); });
        document.getElementById('tabCustomers').addEventListener('click', function () { showSection('customers'); });

        // User form
        document.getElementById('addUserBtn').addEventListener('click', function () { resetUserForm(); showUserForm(); });
        document.getElementById('userSaveBtn').addEventListener('click', saveUser);
        document.getElementById('userCancelBtn').addEventListener('click', function () { resetUserForm(); hideUserForm(); });

        // Show Password toggle
        document.getElementById('showPassword').addEventListener('change', function () {
            const passField = document.getElementById('userPassword');
            if (this.checked) {
                passField.type = 'text';
            } else {
                passField.type = 'password';
            }
        });

        // Customer form
        document.getElementById('customerSaveBtn').addEventListener('click', saveCustomer);
        document.getElementById('customerCancelBtn').addEventListener('click', resetCustomerForm);

        // Delete All buttons
        document.getElementById('deleteAllUsersBtn').addEventListener('click', deleteAllUsers);
        document.getElementById('deleteAllCustomersBtn').addEventListener('click', deleteAllCustomers);

        // Load users by default
        loadUsers();
    });

})();